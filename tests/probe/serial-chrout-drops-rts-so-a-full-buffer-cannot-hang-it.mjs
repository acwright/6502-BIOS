// BUGS.md 15, proved on a real R6551 on 2026-09-17: command register TIC 00
// raises RTS *and* turns the transmitter off. The BIOS raises RTS when the
// input buffer fills, and BASIC echoes every character it reads through Chrout,
// so before the fix the echo could never finish — SerialChrout spun on a TDRE
// that cannot set while the transmitter is off, the buffer never drained, RTS
// never fell, and the board was dead to CR and Ctrl-C alike.
//
// So SerialChrout drops RTS ($09) for the byte and lets ScRts put it back once
// the byte has gone. Three claims: the call returns at all with the buffer
// standing full and RTS up; the pin is back up afterwards, because nothing has
// read the buffer down; and the character did reach the ACIA, with RTS down at
// the moment it did.
//
// The first claim is the whole bug. Against an emulator that models the chip,
// the old ROM never comes back from this call.
export const name = 'SerialChrout sends with the buffer full, because it drops RTS for the byte'
export const profile = 'serial'

// BIOS.inc
const READ_PTR = 0x00
const INPUT_BUFFER = 0x0200
const SC_DATA = 0x9000
const SC_CMD = 0x9002

const SerialChrout = 0xa051

const RTS_HIGH = 0x01 // SC_CMD_RTS_HIGH: TIC 00, transmitter off
const RTS_LOW = 0x09 // SC_CMD_RTS_LOW

const CHARACTER = 0x5a // 'Z'

// Stand the machine where the bench found it: $C4 bytes unread, over the $C0
// mark, and Irq's RTS_HIGH already in the command register.
async function full(m) {
  await m.pause()
  await m.fillMem(INPUT_BUFFER, 0x100, 0x01)
  await m.write(READ_PTR, [0x00, 0xc4])
  await m.write(SC_CMD, [RTS_HIGH])
}

export async function run(m) {
  await full(m)
  const returned = await m.call6502(SerialChrout, { A: CHARACTER })
  m.assertByte(returned.A, CHARACTER, 'the character SerialChrout hands back')
  m.assertByte(await m.peek(SC_CMD), RTS_HIGH, 'the command register once the byte has gone')

  // The same call again, stopped on the write itself.
  await full(m)
  const before = await m.regs()
  await m.watch(SC_DATA, 'write')
  const returnTo = await m.plantCall(SerialChrout, { A: CHARACTER })
  const hit = await m.runTo(returnTo)
  await m.clearBreaks()

  m.assertEqual(hit.stop?.kind, 'watchpoint', 'SerialChrout should write the byte to the ACIA')
  m.assertByte(await m.peek(SC_CMD), RTS_LOW, 'the command register while the byte is going out')

  const { PC, SP, P, A, X, Y } = before
  await m.setRegs({ PC, SP, P, A, X, Y })
}
