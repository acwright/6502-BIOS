// SerialMirror writes its byte as soon as the transmit register is free and
// returns without waiting for it to go, so the line's time overlaps whatever
// the program does next. That can leave a byte in the register, and on the
// R6551 a second write overwrites the first (ACIA.ts, from the bench in
// 2026-09). SerialChrout used to write first and wait afterwards, which was
// safe only while every writer waited afterwards. It now waits for the
// register before it writes as well.
//
// The emulator has no baud timing: a byte goes the tick after it is written,
// unless the transmitter is off. So the case holds one in the register with
// CTS high, starts SerialChrout with the next byte, as XModem's first NAK or a
// program calling SerialChrout itself would, and lets CTS go while it waits.
// Both bytes must arrive, in order; before the fix only the second did.

export const name = 'SerialChrout waits for a byte the mirror left in the register'
export const profile = 'video-cts'

const Chrout = 0xa000
const SerialChrout = 0xa051
const IO_MODE = 0x0306

export async function run(m) {
  await m.pause()
  await m.write(IO_MODE, [0x02])
  const { cursor } = await m.serialRead(0, 0)

  await m.call('serial.lines', { cts: false })
  await m.call6502(Chrout, { A: 0x58 }) // X: written, and held in the register

  const before = await m.regs()
  const returnTo = await m.plantCall(SerialChrout, { A: 0x59 }) // Y
  await m.runCycles(5000) // SerialChrout is waiting now, one side of its write or the other
  await m.call('serial.lines', { cts: true })
  const back = await m.runTo(returnTo)
  m.assertEqual(back.stop?.kind, 'breakpoint', 'SerialChrout returned once CTS came back')
  const { PC, SP, P, A, X, Y } = before // back to the prompt, as call6502 leaves it
  await m.setRegs({ PC, SP, P, A, X, Y })

  m.assertEqual(await m.settle(cursor), 'XY', 'what the line carried')
}
