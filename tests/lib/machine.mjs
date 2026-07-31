// A JSON-RPC client for one running emulator, over one WebSocket.
//
// The emulator's own examples spawn `6502 dbg` per call, which is a fresh Node
// process every time (~100 ms). This suite makes several thousand calls, so it
// holds a single connection instead and pays ~1 ms.
//
// See 6502-EMULATOR/docs/DEBUG-PROTOCOL.md for the method reference.

import { spawn } from 'node:child_process'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { assertions, AssertionError } from './assert.mjs'

// The emulator command. Overridable so CI can run it out of a checkout —
// `SIXTY502="node .../out/cli/index.js"` — exactly as examples/lib.sh does.
export const EMULATOR = process.env.SIXTY502 || '6502'

const CONNECT_ATTEMPTS = 200
const CONNECT_INTERVAL_MS = 50

// How long a single wait may block before it is called a wedged machine.
//
// This is the one number in the suite measured in *host* time rather than the
// machine's own cadence, and it is a safety net rather than an assertion —
// nothing is judged by how long it took, only by whether it arrived. So it is
// set for the slowest host that has to run it, not the fastest: two shared
// cores under CI load execute turbo far slower than a laptop does, and at 20
// seconds a case that types a 76-character line was failing there while
// completing perfectly given the time. A case that needs longer still says so
// with a `timeout:` directive; a genuinely wedged one costs a minute.
export const DEFAULT_TIMEOUT_MS = 60000

// Where call6502() plants its stub: high RAM, below the top of BASIC's string
// space and well clear of anything live at the prompt.
const SCRATCH = 0x7f00

const hexWord = (n) => `$${n.toString(16).toUpperCase().padStart(4, '0')}`

export class RpcError extends Error {
  constructor(method, error) {
    super(`${method}: ${error.message} (${error.code})`)
    this.name = 'RpcError'
    this.code = error.code
    this.data = error.data
  }
}

export class Machine {
  #ws = null
  #proc = null
  #pending = new Map()
  #nextId = 1
  #log = []
  #closed = false

  constructor({ proc, ws, port, token, profile }) {
    this.#proc = proc
    this.#ws = ws
    this.port = port
    this.token = token
    this.profile = profile
    ws.addEventListener('message', (event) => this.#onMessage(event.data))
    ws.addEventListener('close', () => this.#onClose())
  }

  // ---- lifecycle ---------------------------------------------------------

  static async launch({ profile = 'serial', rom, symbols, cf, nvram, rtc, args = [], timeout = '600s' } = {}) {
    const port = await freePort()
    const token = randomBytes(32).toString('hex')

    const flags = [
      'run',
      '--headless',
      '--debug',
      '--quiet',
      '--debug-port', String(port),
      '--debug-token', token,
      '--timeout', timeout,
    ]
    if (rom) flags.push('--rom', rom)
    if (symbols) flags.push('--symbols', symbols)
    if (cf) flags.push('--cf', cf)
    if (nvram) flags.push('--nvram', nvram)
    if (rtc) flags.push('--rtc', rtc)
    flags.push(...args)

    // SIXTY502 may be "node /path/to/cli.js", so split it.
    const [command, ...prefix] = EMULATOR.split(/\s+/)
    const proc = spawn(command, [...prefix, ...flags], { stdio: ['ignore', 'pipe', 'pipe'] })

    const output = []
    proc.stdout.on('data', (d) => output.push(String(d)))
    proc.stderr.on('data', (d) => output.push(String(d)))
    proc.on('error', (err) => {
      output.push(
        err.code === 'ENOENT'
          ? `no emulator at ${JSON.stringify(command)} — install the 6502 app's CLI, ` +
            'or point $SIXTY502 at a checkout\n'
          : `spawn failed: ${err.message}\n`,
      )
    })

    const ws = await connect(port, token, proc, output)
    return new Machine({ proc, ws, port, token, profile })
  }

  async close() {
    if (this.#closed) return
    this.#closed = true
    try {
      await this.call('session.shutdown')
    } catch {
      // The host is winding down; a dropped socket here is expected.
    }
    try {
      this.#ws.close()
    } catch {}
    if (this.#proc && this.#proc.exitCode === null) {
      this.#proc.kill()
    }
  }

  // ---- transport ---------------------------------------------------------

  #onMessage(raw) {
    let message
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    for (const item of Array.isArray(message) ? message : [message]) {
      if (item.id != null && this.#pending.has(item.id)) {
        const { resolve, reject, method } = this.#pending.get(item.id)
        this.#pending.delete(item.id)
        if (item.error) reject(new RpcError(method, item.error))
        else resolve(item.result)
      } else if (item.method === 'log') {
        this.#log.push(item.params?.message ?? '')
      }
    }
  }

  #onClose() {
    for (const [id, { reject, method }] of this.#pending) {
      this.#pending.delete(id)
      reject(new Error(`${method}: connection closed`))
    }
  }

  call(method, params) {
    if (this.#closed) return Promise.reject(new Error(`${method}: machine is closed`))
    const id = this.#nextId++
    const payload = { jsonrpc: '2.0', id, method }
    if (params !== undefined) payload.params = params
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method })
      this.#ws.send(JSON.stringify(payload))
    })
  }

  // ---- session and execution --------------------------------------------

  info() {
    return this.call('session.info')
  }

  reset(cold = true) {
    return this.call('session.reset', { cold })
  }

  start(mode = 'turbo') {
    return this.call('exec.run', { mode })
  }

  pause() {
    return this.call('exec.pause')
  }

  step(kind = 'instruction', count = 1) {
    return this.call('exec.step', { kind, count })
  }

  runCycles(cycles) {
    return this.call('exec.runCycles', { cycles })
  }

  runTo(address, timeoutMs = 10000) {
    return this.call('exec.runTo', { address, timeoutMs })
  }

  async cycles() {
    return (await this.call('exec.state')).cycles
  }

  // ---- registers and memory ---------------------------------------------

  regs() {
    return this.call('reg.get')
  }

  setRegs(values) {
    return this.call('reg.set', values)
  }

  async read(address, length = 1, space = 'cpu') {
    const result = await this.call('mem.read', { space, address, length })
    return Buffer.from(result.data, 'base64')
  }

  async peek(address, space = 'cpu') {
    return (await this.read(address, 1, space))[0]
  }

  async peekWord(address, space = 'cpu') {
    const bytes = await this.read(address, 2, space)
    return bytes[0] | (bytes[1] << 8)
  }

  write(address, data, space = 'cpu') {
    const bytes = typeof data === 'number' ? [data] : Array.from(data)
    return this.call('mem.write', { space, address, data: bytes })
  }

  fillMem(address, length, value, space = 'cpu') {
    return this.call('mem.fill', { space, address, length, value })
  }

  searchMem(pattern, options = {}) {
    return this.call('mem.search', { pattern, ...options })
  }

  // Both hand back the instruction array rather than the envelope around it —
  // there is nothing else in the reply, and every caller wants to iterate.
  async disasm(address, count = 8) {
    return (await this.call('disasm.at', { address, count })).instructions
  }

  async disasmRange(start, end) {
    return (await this.call('disasm.range', { start, end })).instructions
  }

  // ---- symbols -----------------------------------------------------------

  async resolve(name) {
    return (await this.call('sym.resolve', { name })).address
  }

  lookup(address) {
    return this.call('sym.lookup', { address })
  }

  // ---- breakpoints -------------------------------------------------------

  breakAt(address, options = {}) {
    return this.call('bp.set', { address, ...options })
  }

  watch(address, kind = 'write', options = {}) {
    return this.call('bp.set', { address, kind, ...options })
  }

  clearBreaks(id) {
    return this.call('bp.clear', id == null ? undefined : { id })
  }

  // ---- state -------------------------------------------------------------

  async saveState() {
    return (await this.call('state.save')).state
  }

  loadState(state) {
    return this.call('state.load', { state })
  }

  // ---- console -----------------------------------------------------------

  // Returns the cursor the console stood at when the write went out. Pass it
  // back as `since` and "wait for the reply to what I just sent" is correct
  // with no bookkeeping.
  async serialWrite(text) {
    return this.call('serial.write', { data: text })
  }

  async serialRead(since = 0, max) {
    const result = await this.call('serial.read', max == null ? { since } : { since, max })
    return result
  }

  waitFor(params) {
    return this.call('wait.for', params)
  }

  // Send text, then block until `pattern` appears in what came back. The
  // returned output has CRs stripped: the console sends CRLF, as a real serial
  // terminal does, and a pattern anchored with $ will not match otherwise.
  async send(text, pattern, { timeoutMs = DEFAULT_TIMEOUT_MS, run = 'turbo', required = true } = {}) {
    const { cursor } = await this.serialWrite(text)
    if (pattern == null) return { cursor, output: '' }
    return this.expectFrom(cursor, pattern, { timeoutMs, run, required, sent: text })
  }

  async expectFrom(cursor, pattern, { timeoutMs = DEFAULT_TIMEOUT_MS, run = 'turbo', required = true, sent } = {}) {
    const source = pattern instanceof RegExp ? pattern.source : String(pattern)
    const result = await this.waitFor({ serial: toWaitPattern(source), since: cursor, run, timeoutMs })
    const output = stripCR(result.output ?? '')
    if (!result.matched && required) {
      const context = sent ? ` after sending ${JSON.stringify(sent)}` : ''
      throw new AssertionError(
        `timed out after ${timeoutMs} ms waiting for /${source}/${context}. Console said:\n` +
          output.split('\n').map((l) => '    ' + l).join('\n'),
      )
    }
    return { cursor, output, matched: result.matched }
  }

  // Advance the machine a bounded amount of *emulated* time and hand back
  // everything the console printed. This is how a negative assertion ("prints
  // nothing") is made without a host-side sleep.
  async settle(cursor, cycles = 200000) {
    await this.waitFor({ cycles, run: 'turbo', timeoutMs: DEFAULT_TIMEOUT_MS })
    const result = await this.serialRead(cursor)
    return stripCR(result.data ?? '')
  }

  // ---- calling into the ROM ----------------------------------------------

  // JSR into a Kernal entry and hand back the registers it returned.
  //
  // The stub is planted in RAM the machine is not using at the prompt; the case
  // restores a snapshot afterwards regardless, so nothing here needs cleaning
  // up. Going through the $A000 slot rather than the implementation is the
  // point — it exercises the published jump as well as the routine.
  async call6502(address, { A = 0, X = 0, Y = 0, scratch = SCRATCH, timeoutMs = 5000 } = {}) {
    // What the machine was doing before the stub took the CPU over. Putting it
    // back is what lets a case call into the ROM and then carry on driving the
    // console: without it the PC is left parked on the stub's trailing NOP, and
    // the next thing that resumes the machine runs it and falls into whatever
    // bytes happen to follow — which surfaces, confusingly, as an unrelated
    // `BRK AT $7Fxx` several assertions later.
    const before = await this.regs()
    const returnTo = await this.plantCall(address, { A, X, Y, scratch })
    const result = await this.runTo(returnTo, timeoutMs)
    if (result.stop?.kind !== 'breakpoint') {
      throw new AssertionError(
        `call to ${hexWord(address)} did not return: stopped on ${JSON.stringify(result.stop)}`,
      )
    }
    const { PC, SP, P, A: a, X: x, Y: y } = before
    await this.setRegs({ PC, SP, P, A: a, X: x, Y: y })
    return result.registers
  }

  // Plant the same stub and point the CPU at it, but do not run — hand back the
  // address the routine returns to and leave the machine paused.
  //
  // This is what a case needs when it wants to watch a Kernal routine *while*
  // it runs: `call6502` finishes by running to a breakpoint, and an armed
  // watchpoint stops the machine first, so the call would report that it never
  // returned. Splitting the two lets the caller decide what stops it.
  async plantCall(address, { A = 0, X = 0, Y = 0, scratch = SCRATCH } = {}) {
    await this.pause()
    await this.write(scratch, [0x20, address & 0xff, (address >> 8) & 0xff, 0xea])
    await this.setRegs({ PC: scratch, A, X, Y })
    return scratch + 3
  }

  // ---- video and HID -----------------------------------------------------

  async screenText() {
    return (await this.call('screen.text')).lines
  }

  screenHash() {
    return this.call('screen.hash')
  }

  key(code, down = true) {
    return this.call('input.key', { code, down })
  }

  type(text, cps) {
    return this.call('input.type', cps == null ? { text } : { text, cps })
  }

  joystick(side, buttons) {
    return this.call('input.joystick', { side, buttons })
  }
}

// The assertion vocabulary lives on the machine so a Tier 3 case reads as one
// object: `m.assertEqual(...)` beside `m.read(...)`.
Object.assign(Machine.prototype, assertions)

export function stripCR(text) {
  return String(text).replace(/\r/g, '')
}

// `wait.for {serial}` matches its regex against the raw console stream, with no
// multiline flag — so `^` means "start of everything received since the cursor"
// and the CRs a real serial terminal sends sit between the text and every `$`.
// Test patterns want line anchors, so translate them:
//
//   ^   ->  (?:^|\n)        a line start, given \r\n endings
//   $   ->  (?:\r|\n|$)     a line end, CR and all
//
// `^` inside a character class and either anchor after a backslash are left
// alone, because there they are not anchors.
export function toWaitPattern(source) {
  let out = ''
  let inClass = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      out += ch + (source[i + 1] ?? '')
      i++
    } else if (inClass) {
      out += ch
      if (ch === ']') inClass = false
    } else if (ch === '[') {
      out += ch
      inClass = true
    } else if (ch === '^') {
      out += '(?:^|\\n)'
    } else if (ch === '$') {
      out += '(?:\\r|\\n|$)'
    } else {
      out += ch
    }
  }
  return out
}

// The same pattern for a JS regex over CR-stripped text, which is how negative
// assertions ("prints nothing") are checked once the machine has settled.
export function toLineRegex(source) {
  return new RegExp(source, 'm')
}

async function connect(port, token, proc, output) {
  // Host-side process startup, not machine synchronisation — the only place in
  // the suite where waiting on the wall clock is the right answer.
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
    if (proc.exitCode !== null) {
      throw new Error(`emulator exited with code ${proc.exitCode}:\n${output.join('')}`)
    }
    try {
      return await openSocket(port, token)
    } catch {
      await new Promise((r) => setTimeout(r, CONNECT_INTERVAL_MS))
    }
  }
  throw new Error(
    `the emulator never answered on port ${port} after ` +
      `${(CONNECT_ATTEMPTS * CONNECT_INTERVAL_MS) / 1000}s. Its output:\n${output.join('')}`,
  )
}

function openSocket(port, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`)
    const onOpen = () => {
      ws.removeEventListener('error', onError)
      resolve(ws)
    }
    const onError = (event) => {
      ws.removeEventListener('open', onOpen)
      reject(new Error(event.message || 'connect failed'))
    }
    ws.addEventListener('open', onOpen, { once: true })
    ws.addEventListener('error', onError, { once: true })
  })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}
