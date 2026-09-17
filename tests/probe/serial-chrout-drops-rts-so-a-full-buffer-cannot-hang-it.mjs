// BUGS.md 15, proved on a real R6551 on 2026-09-17: command register TIC 00
// raises RTS *and* turns the transmitter off. The BIOS raises RTS when the
// input buffer fills, and BASIC echoes every character it reads through Chrout,
// so before the fix the echo could never finish — SerialChrout spun on a TDRE
// that cannot set while the transmitter is off, the buffer never drained, RTS
// never fell, and the board was dead to CR and Ctrl-C alike.
//
// SerialChrout therefore drops RTS ($09) for the byte and lets ScRts put it
// back once the byte has gone. The bench then showed the cost of doing that
// unconditionally: every release lets the far end push another byte in, a paste
// arrives at least as fast as BASIC swallows it, and from line 460 of a 60-line
// paste the buffer stood full for good and dropped 2-3 characters a line.
//
// So above the high mark the console goes quiet instead (BUGS.md 15, option B):
// the byte is dropped, RTS stays up, the far end really stops, and the buffer
// drains. Echo the reader never sees, rather than input the program never gets.
//
// Four claims: the call returns at all with the buffer standing full (the
// original bug — against an emulator that models the chip, the old ROM never
// comes back from it); with the buffer over the mark nothing reaches the ACIA
// and RTS is left up; below the mark the byte goes out with RTS down; and
// XModem, which owns the line, still sends whatever the buffer holds.
export const name = 'SerialChrout goes quiet above the high mark, and sends below it'

// BIOS.inc
const READ_PTR = 0x00
const INPUT_BUFFER = 0x0200
const SC_DATA = 0x9000
const SC_CMD = 0x9002

const SerialChrout = 0xa051

const RTS_HIGH = 0x01 // SC_CMD_RTS_HIGH: TIC 00, transmitter off
const RTS_LOW = 0x09 // SC_CMD_RTS_LOW
const XMODEM = 0x0b // SC_CMD_XMODEM: receiver interrupt off, RTS low

const CHARACTER = 0x5a // 'Z'

// Stand the machine where the bench found it: `unread` bytes in the buffer and
// `command` in the register, as Irq leaves it mid-paste.
async function stand(m, unread, command) {
  await m.pause()
  await m.fillMem(INPUT_BUFFER, 0x100, 0x01)
  await m.write(READ_PTR, [0x00, unread])
  await m.write(SC_CMD, [command])
}

// Call SerialChrout with a watchpoint on the ACIA's data register, and say
// whether the byte reached it. Leaves the registers as it found them.
async function sends(m, note) {
  const before = await m.regs()
  await m.watch(SC_DATA, 'write')
  const returnTo = await m.plantCall(SerialChrout, { A: CHARACTER })
  const hit = await m.runTo(returnTo)
  await m.clearBreaks()
  const { PC, SP, P, A, X, Y } = before
  await m.setRegs({ PC, SP, P, A, X, Y })
  return hit.stop?.kind === 'watchpoint'
}

export async function run(m) {
  // $C4 unread, over the $C0 mark, RTS already up: the call must return, and it
  // must leave the line alone.
  await stand(m, 0xc4, RTS_HIGH)
  const returned = await m.call6502(SerialChrout, { A: CHARACTER })
  m.assertByte(returned.A, CHARACTER, 'the character SerialChrout hands back')
  m.assertByte(await m.peek(SC_CMD), RTS_HIGH, 'the command register after a dropped byte')

  await stand(m, 0xc4, RTS_HIGH)
  m.assertEqual(await sends(m, 'over the mark'), false, 'a byte over the high mark should not reach the ACIA')

  // One byte below the mark, the console is its normal self.
  await stand(m, 0xbf, RTS_HIGH)
  m.assertEqual(await sends(m, 'under the mark'), true, 'a byte under the high mark should reach the ACIA')
  await stand(m, 0xbf, RTS_HIGH)
  await m.call6502(SerialChrout, { A: CHARACTER })
  m.assertByte(await m.peek(SC_CMD), RTS_LOW, 'the command register once a byte has gone')

  // XModem owns the line: its bytes go out whatever the buffer holds, and its
  // command register is left exactly as it set it.
  await stand(m, 0xc4, XMODEM)
  m.assertEqual(await sends(m, 'during XModem'), true, "XModem's byte should reach the ACIA")
  await stand(m, 0xc4, XMODEM)
  await m.call6502(SerialChrout, { A: CHARACTER })
  m.assertByte(await m.peek(SC_CMD), XMODEM, "the command register after XModem's byte")
}
