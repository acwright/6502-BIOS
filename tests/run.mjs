#!/usr/bin/env node
//
// The BIOS regression suite.
//
//   tests/run.mjs                      run everything
//   tests/run.mjs --filter mid         run cases whose id matches /mid/
//   tests/run.mjs --rom /tmp/old.bin   run against a different ROM
//   tests/run.mjs --list               print the cases and stop
//
// One emulator per machine profile, one WebSocket per emulator, one boot per
// run. Every case starts by restoring the snapshot taken at the prompt, which
// is exact and costs about a millisecond against 5.36 million cycles to boot —
// so no case can leak into the next, and cases that deliberately wreck the
// machine need no cleanup code at all.
//
// See PLAN.md for what the suite is meant to cover.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Machine, EMULATOR, stripCR } from './lib/machine.mjs'
import { AssertionError } from './lib/assert.mjs'
import { parseBasic, runBasicCase } from './lib/basic.mjs'
import { parseConsole, runConsoleCase, MODES } from './lib/console.mjs'
import { buildFixtures, buildNvram } from './fixtures/build.mjs'

const TESTS = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(TESTS)

const RTC = '2026-01-01T00:00:00'
const CASE_TIMEOUT_MS = 20000

// Machine profiles. Adding one is a table entry: the runner starts it on demand
// and reuses it.
//
// The default profile has a card too — the emulator always fits one — but a
// blank one, which is the right machine for everything that writes what it
// reads back. `cf` is for the cases that need a card somebody else wrote.
const PROFILES = {
  serial: { console: 'serial', args: [] },
  video: { console: 'video', args: ['--console', 'video'] },
  cf: { console: 'serial', args: [], fixtures: true },
  nvram: { console: 'serial', args: [], nvram: true },
}

const DIRECTIVES = new Set(['name', 'profile', 'mode', 'hw', 'xfail', 'issue', 'selftest', 'final', 'timeout'])

// The hardware the probe found, as the ROM records it. A case says which cards
// to take away — `hw: -cf` — and the runner clears those bits after the
// snapshot is restored and before the case runs. The emulator always fits every
// card, so this mask is the only way to reach a machine that does not; the next
// case's restore puts it back, so nothing needs cleaning up.
const HW_PRESENT = 0x030d
const HW_BITS = {
  'ram-l': 0x01, 'ram-h': 0x02, rtc: 0x04, cf: 0x08,
  serial: 0x10, gpio: 0x20, sid: 0x40, video: 0x80,
}

function parseHw(spec) {
  let mask = 0
  for (const word of spec.trim().split(/[\s,]+/).filter(Boolean)) {
    if (!word.startsWith('-')) {
      throw new AssertionError(`\`hw:\` takes cards to remove, each written \`-name\`, not ${JSON.stringify(word)}`)
    }
    const name = word.slice(1).toLowerCase()
    if (name === 'all') { mask = 0xff; continue }
    if (!(name in HW_BITS)) {
      throw new AssertionError(`unknown card ${JSON.stringify(name)} — one of ${Object.keys(HW_BITS).join(', ')}, or all`)
    }
    mask |= HW_BITS[name]
  }
  if (!mask) throw new AssertionError('`hw:` names no cards')
  return mask
}

// ---------------------------------------------------------------------------
// Arguments

function parseArgv(argv) {
  const options = { filter: null, rom: null, symbols: null, list: false, verbose: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--filter': case '-f': options.filter = argv[++i]; break
      case '--rom': options.rom = argv[++i]; break
      case '--symbols': options.symbols = argv[++i]; break
      case '--list': case '-l': options.list = true; break
      case '--verbose': case '-v': options.verbose = true; break
      case '--help': case '-h': options.help = true; break
      default:
        if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`)
        options.filter = arg
    }
  }
  return options
}

const USAGE = `Usage: tests/run.mjs [options] [filter]

  -f, --filter <pattern>  Only run cases whose id matches this regex
      --rom <file>        ROM under test (default: BIOS.bin)
      --symbols <file>    Symbol file (default: the ROM's sibling .dbg)
  -l, --list              List the cases and exit
  -v, --verbose           Print console output for every case, not just failures
  -h, --help              This

The emulator is \`6502\` on PATH; $SIXTY502 overrides it, as it does for the
emulator's own examples — so local and CI differ by one variable.`

// ---------------------------------------------------------------------------
// Discovery

function discover() {
  const cases = []
  cases.push(...discoverDir('basic', '.bas', loadBasicCase))
  cases.push(...discoverDir('console', '.txt', loadConsoleCase))
  cases.push(...discoverDir('probe', '.mjs', loadProbeCase))
  return cases
}

function discoverDir(dir, extension, load) {
  const path = join(TESTS, dir)
  if (!existsSync(path)) return []
  return readdirSync(path)
    .filter((file) => file.endsWith(extension))
    .sort()
    .map((file) => {
      const id = `${dir}/${basename(file, extension)}`
      try {
        return load(id, join(path, file))
      } catch (error) {
        return { id, file: join(path, file), error }
      }
    })
}

function metaOf(id, file, directives) {
  for (const key of Object.keys(directives)) {
    if (!DIRECTIVES.has(key)) {
      throw new AssertionError(`unknown directive ${JSON.stringify(key)}`)
    }
  }
  const meta = {
    id,
    file,
    name: directives.name || id,
    profile: directives.profile || 'serial',
    mode: directives.mode || 'basic',
    hwClear: directives.hw ? parseHw(directives.hw) : 0,
    xfail: directives.xfail || null,
    issue: directives.issue || null,
    selftest: directives.selftest || null,
    final: directives.final || null,
    timeoutMs: directives.timeout ? Number(directives.timeout) : CASE_TIMEOUT_MS,
  }
  validate(meta)
  return meta
}

// An xfail with no explanation is a suite error, not a skip — otherwise a bug
// can be parked here and quietly forgotten, which is the failure mode the whole
// mechanism exists to prevent.
function validate(meta) {
  if (meta.xfail && !meta.issue) {
    throw new AssertionError('`xfail:` requires an `issue:` saying where the bug is tracked')
  }
  if (meta.issue && !meta.xfail) {
    throw new AssertionError('`issue:` without an `xfail:` reason')
  }
  if (meta.selftest && meta.selftest !== 'must-fail') {
    throw new AssertionError(`unknown selftest ${JSON.stringify(meta.selftest)}`)
  }
  if (meta.selftest && meta.xfail) {
    throw new AssertionError('a case cannot be both a selftest and an xfail')
  }
  if (!PROFILES[meta.profile]) {
    throw new AssertionError(`unknown profile ${JSON.stringify(meta.profile)}`)
  }
  if (!MODES[meta.mode]) {
    throw new AssertionError(`unknown mode ${JSON.stringify(meta.mode)}`)
  }
}

function loadBasicCase(id, file) {
  const { meta: parsed, lines } = parseBasic(readFileSync(file, 'utf8'))
  const meta = metaOf(id, file, parsed.directives)
  meta.tier = 1
  meta.needsConsole = true
  meta.run = (m) => runBasicCase(m, lines, { timeoutMs: meta.timeoutMs })
  return meta
}

function loadConsoleCase(id, file) {
  const { meta: parsed, steps } = parseConsole(readFileSync(file, 'utf8'))
  const meta = metaOf(id, file, parsed.directives)
  meta.tier = 2
  meta.needsConsole = true
  meta.run = async (m) => {
    await runConsoleCase(m, steps, { mode: meta.mode, final: meta.final, timeoutMs: meta.timeoutMs })
    return { ok: true }
  }
  return meta
}

function loadProbeCase(id, file) {
  // Loaded eagerly so a broken module is a suite error at discovery, not a
  // surprise halfway through a run.
  const module = probeModules.get(file)
  const meta = metaOf(id, file, {
    name: module.name,
    profile: module.profile,
    mode: module.mode,
    hw: module.hw,
    xfail: module.xfail,
    issue: module.issue,
    selftest: module.selftest,
  })
  meta.tier = 3
  // Tiers 1 and 2 are console transcripts by construction. A tier 3 case picks
  // its own profile and knows what that profile can do.
  meta.needsConsole = false
  if (typeof module.run !== 'function') {
    throw new AssertionError('a probe case must export `async function run(m)`')
  }
  meta.run = async (m) => {
    await module.run(m)
    return { ok: true }
  }
  return meta
}

const probeModules = new Map()

async function preloadProbes() {
  const path = join(TESTS, 'probe')
  if (!existsSync(path)) return
  for (const file of readdirSync(path).filter((f) => f.endsWith('.mjs'))) {
    const full = join(path, file)
    probeModules.set(full, await import(pathToFileURL(full)))
  }
}

// ---------------------------------------------------------------------------
// The machine pool

class Pool {
  #machines = new Map()
  #failures = new Map()

  constructor({ rom, symbols }) {
    this.rom = rom
    this.symbols = symbols
  }

  async get(name) {
    if (this.#machines.has(name)) return this.#machines.get(name)
    // A profile that would not start is not going to start on the next case
    // either, so report the same failure rather than spawning again per case.
    if (this.#failures.has(name)) throw this.#failures.get(name)

    const spec = PROFILES[name]
    try {
      // Built here rather than by the Makefile: a fixture that is generated on
      // the way to the machine that uses it cannot go stale, and a run that
      // needs no card never writes one.
      const cf = spec.fixtures ? buildFixtures().imagePath : undefined
      const nvram = spec.nvram ? buildNvram().path : undefined
      const machine = await Machine.launch({
        profile: name,
        rom: this.rom,
        symbols: this.symbols,
        rtc: RTC,
        cf,
        nvram,
        args: spec.args,
      })
      const entry = { name, spec, machine, ready: null, monitor: null }
      entry.ready = await boot(machine, spec)
      this.#machines.set(name, entry)
      return entry
    } catch (error) {
      this.#failures.set(name, error)
      throw error
    }
  }

  async closeAll() {
    for (const { machine } of this.#machines.values()) {
      await machine.close()
    }
    this.#machines.clear()
  }
}

async function boot(m, spec) {
  if (spec.console === 'serial') {
    const result = await m.waitFor({ serial: 'OK', since: 0, run: 'turbo', timeoutMs: 60000 })
    if (!result.matched) throw new Error('the machine never reached the BASIC prompt')
  } else {
    // No serial console to wait on: advance emulated time in bounded steps and
    // watch the screen instead. Deterministic, and still never a host sleep.
    let reached = false
    for (let i = 0; i < 20 && !reached; i++) {
      await m.waitFor({ cycles: 1000000, run: 'turbo', timeoutMs: 30000 })
      reached = (await m.screenText()).some((line) => line.startsWith('OK'))
    }
    if (!reached) throw new Error('the machine never reached the BASIC prompt on screen')
  }
  return m.saveState()
}

// A second snapshot, taken at the Monitor's `.` prompt by the path a user takes:
// ESC at the boot menu. Built on first use, because most runs never need it.
async function monitorSnapshot(entry) {
  if (entry.monitor) return entry.monitor
  const m = entry.machine
  await m.reset(true)
  await m.start()
  await m.send('\x1b', 'MONITOR', { timeoutMs: 60000 })
  entry.monitor = await m.saveState()
  return entry.monitor
}

// ---------------------------------------------------------------------------
// Running

async function runCase(pool, testCase) {
  const started = Date.now()
  const record = { id: testCase.id, name: testCase.name ?? testCase.id, ms: 0 }

  if (testCase.error) {
    return { ...record, kind: 'error', message: testCase.error.message }
  }

  let entry
  try {
    entry = await pool.get(testCase.profile)
  } catch (error) {
    return { ...record, kind: 'error', message: error.message, ms: Date.now() - started }
  }

  if (testCase.needsConsole && entry.spec.console !== 'serial') {
    return {
      ...record,
      kind: 'error',
      message: `a tier ${testCase.tier} case needs the serial console, but profile ` +
        `${JSON.stringify(testCase.profile)} has none`,
      ms: Date.now() - started,
    }
  }

  const m = entry.machine
  let outcome
  try {
    const snapshot = testCase.mode === 'monitor' ? await monitorSnapshot(entry) : entry.ready
    await m.loadState(snapshot)
    if (testCase.hwClear) {
      await m.write(HW_PRESENT, [(await m.peek(HW_PRESENT)) & ~testCase.hwClear])
    }
    await m.start()
    const result = await testCase.run(m)
    outcome = result?.ok === false
      ? { failed: true, message: result.message ?? 'the case reported a failure', output: result.output }
      : { failed: false, output: result?.output }
  } catch (error) {
    if (!(error instanceof AssertionError)) {
      // A crash is a failure like any other, but say which kind it was.
      outcome = { failed: true, message: `${error.name}: ${error.message}`, crash: true }
    } else {
      outcome = { failed: true, message: error.message }
    }
  }

  record.ms = Date.now() - started
  record.message = outcome.message
  record.output = outcome.output

  if (testCase.selftest === 'must-fail') {
    record.kind = outcome.failed ? 'selfcheck' : 'selfcheck-broken'
  } else if (testCase.xfail) {
    record.kind = outcome.failed ? 'xfail' : 'xpass'
    record.xfail = testCase.xfail
    record.issue = testCase.issue
  } else {
    record.kind = outcome.failed ? 'fail' : 'pass'
  }
  return record
}

// ---------------------------------------------------------------------------
// Reporting

const colour = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, text) => (colour ? `\x1b[${code}m${text}\x1b[0m` : text)
const green = (t) => paint('32', t)
const red = (t) => paint('31', t)
const yellow = (t) => paint('33', t)
const dim = (t) => paint('2', t)

const BAD = new Set(['fail', 'xpass', 'selfcheck-broken', 'error'])

function report(record, index, options) {
  const number = String(index).padStart(3)
  const time = dim(`${record.ms} ms`)
  switch (record.kind) {
    case 'pass':
      console.log(`${green('ok')} ${number} ${record.name} ${time}`)
      break
    case 'xfail':
      console.log(`${yellow('ok')} ${number} ${record.name} ${yellow(`# xfail: ${record.xfail} (${record.issue})`)}`)
      break
    case 'selfcheck':
      console.log(`${green('ok')} ${number} ${record.name} ${dim('# self-check: failed as intended')}`)
      break
    case 'xpass':
      console.log(`${red('not ok')} ${number} ${record.name} ${red('# XPASS — marked xfail but passed')}`)
      console.log(dim(`      the marker is stale: ${record.xfail} (${record.issue})`))
      break
    case 'selfcheck-broken':
      console.log(`${red('not ok')} ${number} ${record.name} ${red('# this case must fail, and it passed — the harness is not detecting failures')}`)
      break
    case 'error':
      console.log(`${red('not ok')} ${number} ${record.name} ${red('# suite error')}`)
      console.log(indent(record.message))
      break
    default:
      console.log(`${red('not ok')} ${number} ${record.name} ${time}`)
      console.log(indent(record.message ?? 'no message'))
  }
  if (options.verbose && record.output) {
    console.log(dim(indent(stripCR(record.output))))
  }
}

function indent(text) {
  return String(text).split('\n').map((line) => '      ' + line).join('\n')
}

function summarise(records) {
  const count = (kind) => records.filter((r) => r.kind === kind).length
  const passed = count('pass')
  const failed = count('fail')
  const known = count('xfail')
  const parts = [
    `${passed} passed`,
    `${failed ? red(`${failed} failed`) : '0 failed'}`,
  ]
  // Never collapsed into the pass line and never hidden behind a flag: "248
  // passed" while seven bugs sit unfixed is not an honest report.
  if (known) parts.push(yellow(`${known} known-failing`))
  const xpass = count('xpass')
  const broken = count('selfcheck-broken')
  const errors = count('error')
  if (xpass) parts.push(red(`${xpass} unexpectedly passing`))
  if (broken) parts.push(red(`${broken} self-check broken`))
  if (errors) parts.push(red(`${errors} suite error${errors === 1 ? '' : 's'}`))
  const selfchecks = count('selfcheck')
  if (selfchecks) parts.push(dim(`${selfchecks} self-check`))
  return parts.join(', ')
}

// ---------------------------------------------------------------------------

async function main() {
  let options
  try {
    options = parseArgv(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    console.error(USAGE)
    process.exit(1)
  }
  if (options.help) {
    console.log(USAGE)
    return 0
  }

  const rom = options.rom ?? join(REPO, 'BIOS.bin')
  if (!existsSync(rom)) {
    console.error(`no ROM at ${rom} — run \`make\` first`)
    return 1
  }
  const symbols = options.symbols ?? rom.replace(/\.bin$/, '.dbg')
  const symbolFile = existsSync(symbols) ? symbols : null

  await preloadProbes()
  let cases = discover()
  if (options.filter) {
    const pattern = new RegExp(options.filter, 'i')
    cases = cases.filter((c) => pattern.test(c.id) || pattern.test(c.name ?? ''))
  }

  if (options.list) {
    for (const c of cases) console.log(`${c.id}${c.error ? '  (suite error)' : ''}`)
    return 0
  }
  if (cases.length === 0) {
    console.error(options.filter ? `no cases match /${options.filter}/` : 'no cases found')
    return 1
  }

  console.log(dim(`${EMULATOR} · ${rom}${symbolFile ? ` · ${basename(symbolFile)}` : ' · no symbols'}`))
  console.log()

  const pool = new Pool({ rom, symbols: symbolFile })
  const records = []
  const started = Date.now()
  try {
    for (const testCase of cases) {
      const record = await runCase(pool, testCase)
      records.push(record)
      report(record, records.length, options)
    }
  } finally {
    await pool.closeAll()
  }

  console.log()
  console.log(`${summarise(records)} ${dim(`in ${((Date.now() - started) / 1000).toFixed(1)}s`)}`)

  return records.some((r) => BAD.has(r.kind)) ? 1 : 0
}

process.exitCode = await main()
