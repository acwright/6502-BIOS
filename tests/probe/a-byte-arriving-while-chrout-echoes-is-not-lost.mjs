// A byte that arrives while the ROM is echoing must still reach the input
// buffer. This pins the wedge phase 7's CI found — see tests/FINDINGS.md.
//
// Reading the 6551's status register clears a pending receive interrupt, and
// `SerialChroutImpl` reads that register once per transmitted character while
// it waits for TDRE. A byte that lands in that window has its interrupt taken
// away from it: `Irq` finds `SC_STATUS_IRQ` clear and skips, nobody ever reads
// `SC_DATA`, and because the receive register stays full the ACIA will not
// deliver anything after it either. The console stops accepting input for good.
//
// Reproducing that by typing needs a loaded host and several attempts, which is
// no basis for a regression case. So the interleaving is built rather than
// waited for, by a short program planted in RAM:
//
//   SEI                  hold the interrupt off, so the byte stays pending
//   <delay>              long enough for the ACIA to deliver it
//   JSR SerialChrout     the status read that clears its interrupt
//   CLI                  let the machine service anything still pending
//   <delay>              and give it time to
//
// After that the byte is either in the input buffer, or it is stuck in the
// receive register with nothing left that will ever collect it.

import { AssertionError } from '../lib/assert.mjs'

export const name = 'a byte arriving while Chrout echoes still reaches the input buffer'
export const profile = 'serial'

const SC_STATUS = 0x9001
const READ_PTR = 0x00
const WRITE_PTR = 0x01
const INPUT_BUFFER = 0x0200
const STATUS_RDRF = 0x08

const STUB = 0x7f00
const SENT = 0x5a // 'Z'

// Assembled by hand; `SerialChrout` is the $A051 jump slot, so the published
// entry point is what gets exercised rather than the implementation behind it.
const PROGRAM = [
  0x78, //             SEI
  0xa2, 0xff, //       LDX #$FF
  0xca, //        (a)  DEX
  0xd0, 0xfd, //       BNE (a)
  0xa9, 0x2a, //       LDA #'*'
  0x20, 0x51, 0xa0, // JSR SerialChrout
  0x58, //             CLI
  0xa2, 0xff, //       LDX #$FF
  0xca, //        (b)  DEX
  0xd0, 0xfd, //       BNE (b)
  0x80, 0xfe, //       BRA * — park here; the case reads memory, not the PC
]

export async function run(m) {
  await m.pause()
  await m.write(STUB, PROGRAM)
  await m.setRegs({ PC: STUB })

  const readBefore = await m.peek(READ_PTR)
  const writeBefore = await m.peek(WRITE_PTR)

  // Queue the byte before resuming, so the ACIA hands it over during the first
  // delay — while the interrupt is masked and cannot be serviced yet.
  await m.serialWrite(String.fromCharCode(SENT))
  await m.waitFor({ cycles: 2_000_000, run: 'turbo', timeoutMs: 20000 })

  const pending = ((await m.peek(WRITE_PTR)) - (await m.peek(READ_PTR))) & 0xff
  const held = ((await m.peek(WRITE_PTR)) - writeBefore) & 0xff
  const status = await m.peek(SC_STATUS)

  if (held === 0) {
    throw new AssertionError(
      'the byte that arrived while Chrout was echoing never reached the input buffer — ' +
        `WRITE_PTR is still $${writeBefore.toString(16).padStart(2, '0')}, ` +
        `SC_STATUS=$${status.toString(16).padStart(2, '0')} ` +
        `(RDRF=${(status & STATUS_RDRF) >> 3}). Its interrupt was cleared by the transmit ` +
        'poll and nothing will collect it: the console is wedged (tests/FINDINGS.md).',
    )
  }

  m.assertEqual(held, 1, 'exactly one byte was buffered')
  m.assertByte(
    await m.peek(INPUT_BUFFER + ((writeBefore + 0) & 0xff)),
    SENT,
    'the byte that arrived during the echo',
  )
  m.assertEqual(pending > 0, true, 'the byte is waiting to be read, not already consumed')
  m.assertEqual(readBefore, readBefore, 'read pointer baseline')
}
