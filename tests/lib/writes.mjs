// Recording what the machine wrote to a block of hardware registers.
//
// SID and VIA registers read back as $00 through `mem.read`, and the TMS9918's
// register file is write-only on the real chip. So the sound, GPIO and colour
// cases cannot assert on state — the only evidence a register was ever set is
// the write itself, caught on the bus.
//
// A range watchpoint stops the machine on every write in the block. The stop
// reports *where*, and the CPU's registers at that moment carry *what* — but
// which register carried it depends on the instruction, and `STX`/`STY` are as
// common as `STA` in this ROM's register-setting code. So each write is
// attributed by decoding the instruction that made it.
//
// The machine stops with the write already done and `PC` on the instruction
// after it, which is what makes that decoding possible: every store to an I/O
// register is three bytes wide (absolute — I/O lives at $8000 and up, so the
// zero-page forms cannot reach it), so the instruction that just ran begins at
// `PC - 3`. Stores leave the registers alone, so the value is still there to
// read.

import { AssertionError } from './assert.mjs'
import { toWaitPattern } from './machine.mjs'

const STORE_WIDTH = 3

// Absolute stores, by opcode. The value written comes from the named register,
// or is a literal zero for STZ.
const STORES = new Map([
  [0x8d, { register: 'A', indexedBy: null }], // STA abs
  [0x8e, { register: 'X', indexedBy: null }], // STX abs
  [0x8c, { register: 'Y', indexedBy: null }], // STY abs
  [0x9c, { register: null, indexedBy: null }], // STZ abs
  [0x9d, { register: 'A', indexedBy: 'X' }], // STA abs,X
  [0x99, { register: 'A', indexedBy: 'Y' }], // STA abs,Y
  [0x9e, { register: null, indexedBy: 'X' }], // STZ abs,X
])

const hex = (n, width = 4) => `$${n.toString(16).toUpperCase().padStart(width, '0')}`

// Work out what value landed at `address`, from the instruction that put it
// there. Throws rather than guessing: an unrecognised store means the
// attribution is wrong, and a wrong value is worse than no value.
async function valueWritten(m, registers, address) {
  const start = (registers.PC - STORE_WIDTH) & 0xffff
  const [opcode, lo, hi] = await m.read(start, STORE_WIDTH)
  const store = STORES.get(opcode)
  if (!store) {
    throw new AssertionError(
      `the write to ${hex(address)} did not come from an absolute store: ` +
        `${hex(start)} is opcode ${hex(opcode, 2)}. tests/lib/writes.mjs needs to ` +
        'learn this instruction',
    )
  }
  const effective = ((lo | (hi << 8)) + (store.indexedBy ? registers[store.indexedBy] : 0)) & 0xffff
  if (effective !== address) {
    throw new AssertionError(
      `the instruction at ${hex(start)} writes ${hex(effective)}, but the machine ` +
        `stopped on a write to ${hex(address)} — the store was not three bytes back`,
    )
  }
  return store.register === null ? 0x00 : registers[store.register]
}

// Run `body` with every write to `start..end` recorded, and hand back the trace
// in the order the machine made it.
//
// Say when to stop collecting with either `expect` — a count, for a routine
// whose whole output is known — or `until`, a predicate over the trace so far,
// for one that runs until something has happened. `until` is what a case wants
// when the assertion is "and then it went quiet": the number of writes on the
// way there is an implementation detail, and pinning it would make every ADSR
// tweak a test failure.
//
// Pass `settle` — a pattern the console prints when the machine is done, `^OK`
// for a BASIC statement — to record more than once in a case. Collecting stops
// the machine mid-routine, and the writes it had not made yet are still coming;
// without letting it run to the end first, the next recording opens on the tail
// of the last one. Waiting for the prompt is what draws the line between them.
//
// Where collecting ends is otherwise not tidied up. Every case begins by
// restoring a snapshot, so there is no such thing as leaving this machine in a
// bad state for the next one.
export async function recordWrites(
  m,
  { start, end = start, expect, until, max = 32, body, settle, timeoutMs = 20000 },
) {
  if (expect == null && until == null) {
    throw new AssertionError('recordWrites needs either `expect` or `until`')
  }
  const enough = until ?? ((writes) => writes.length >= expect)
  const limit = expect ?? max

  await m.clearBreaks()
  await m.watch(start, 'write', { end })
  // Where the console stands before anything is sent, so `settle` waits for the
  // prompt this recording produces rather than matching one already in the
  // stream.
  const { cursor } = await m.serialRead(0)
  try {
    // `body` must leave the machine **running**. Nothing here resumes it, and
    // that is the load-bearing detail: in turbo the machine covers the whole
    // statement between two host calls, so a resume issued after `body` would
    // land *after* the first write had already stopped the machine and would
    // step straight past it. The first write would silently vanish from the
    // trace, which is exactly the one a case cares about.
    //
    // A console `body` needs nothing — the machine is already running, from the
    // snapshot restore or from the last recording's `settle`. A `plantCall`
    // body leaves the machine paused and has to start it itself.
    await body()

    const writes = []
    for (let i = 0; i < limit && !enough(writes); i++) {
      // `stopped` alone for the first: the machine is running and may already
      // have hit it, and passing `run` would resume past a stop that already
      // happened. `run` for the rest means "continue, and tell me when it
      // stops again".
      const wait = { stopped: true, timeoutMs }
      const result = await m.waitFor(i === 0 ? wait : { ...wait, run: 'turbo' })
      if (!result.matched) {
        throw new AssertionError(
          `the machine stopped writing to ${hex(start)}-${hex(end)} after ${i} ` +
            `write${i === 1 ? '' : 's'}, before it had done what this case waits for:\n` +
            writes.map((w) => `    ${hex(w.address)} <- ${hex(w.value, 2)}`).join('\n'),
        )
      }
      if (result.stop?.kind !== 'watchpoint') {
        throw new AssertionError(
          `the machine stopped on ${JSON.stringify(result.stop)} rather than a write ` +
            `to ${hex(start)}-${hex(end)}`,
        )
      }
      const registers = await m.regs()
      const address = result.stop.address
      writes.push({ address, value: await valueWritten(m, registers, address) })
    }
    return writes
  } finally {
    await m.clearBreaks()
    // Let the routine finish somewhere nothing is watching, so its remaining
    // writes do not turn up at the head of the next recording.
    if (settle) await m.expectFrom(cursor, settle, { timeoutMs, required: false })
    else await m.start()
  }
}

// The opposite assertion, for the degradation rows: run `body` and require that
// nothing at all was written to the block before the console came back to
// `settle`.
//
// It is the same watchpoint, read the other way round. A write stops the
// machine, so the prompt never arrives and the wait ends unmatched with the
// stop that caused it — which is why the failure can name the address and the
// value rather than only reporting a timeout. "The statement returned quietly"
// and "the statement returned quietly *and touched nothing*" are different
// claims, and on a machine whose registers read back as $00 the second one can
// only be made here.
export async function expectNoWrites(
  m,
  { start, end = start, body, settle = /^OK/, what = 'the statement', timeoutMs = 20000 },
) {
  await m.clearBreaks()
  await m.watch(start, 'write', { end })
  const { cursor } = await m.serialRead(0)
  try {
    await body()
    const pattern = settle instanceof RegExp ? settle.source : String(settle)
    const result = await m.waitFor({
      serial: toWaitPattern(pattern),
      since: cursor,
      run: 'turbo',
      timeoutMs,
    })
    if (result.matched) return
    if (result.stop?.kind === 'watchpoint') {
      const address = result.stop.address
      const value = await valueWritten(m, await m.regs(), address)
      throw new AssertionError(
        `${what} wrote ${hex(value, 2)} to ${hex(address)} on a machine where that ` +
          'card is not fitted',
      )
    }
    throw new AssertionError(
      `${what} never came back to /${pattern}/: ${JSON.stringify(result.stop ?? 'still running')}`,
    )
  } finally {
    await m.clearBreaks()
    await m.start()
  }
}

// Assert a trace against an expected `[address, value]` list, in order. Reports
// the whole trace on failure, because "write 5 was wrong" is not diagnosable
// without seeing writes 1 to 4.
export function assertWrites(m, writes, expected, what = 'the register writes') {
  const render = (list) =>
    list.map(([address, value]) => `    ${hex(address)} <- ${hex(value, 2)}`).join('\n')
  const actual = writes.map((w) => [w.address, w.value])
  const same =
    actual.length === expected.length &&
    actual.every(([a, v], i) => a === expected[i][0] && v === expected[i][1])
  if (!same) {
    m.fail(`${what}:\n  expected\n${render(expected)}\n  got\n${render(actual)}`)
  }
}
