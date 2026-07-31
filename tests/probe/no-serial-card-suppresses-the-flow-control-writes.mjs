// README: "Serial absent — IRQ handler skips serial status polling; Chrin flow
// control writes are suppressed; XModem LOAD/SAVE return an error".
//
// The middle clause. Every character Chrin hands back is followed by a write to
// the ACIA's command register — RTS low while the input buffer has room, high
// when it is nearly full — which is the BIOS asserting flow control on a device
// that, on a machine with no serial card, is not there. The write is invisible
// from the console: Chrin returns the same character either way.
//
// The character is put into the input buffer through the WriteBuffer slot rather
// than typed, which is what makes this measurable at all — with the serial bit
// clear the IRQ handler no longer fills that buffer from the ACIA, so there is
// no other way to give Chrin something to read.
//
// As with the video row, the claim is made twice. With the bit set the write
// goes out and the watchpoint sees it; with the bit clear it does not. Without
// the first half, "no write" would also be what a watchpoint on the wrong
// address reports.
export const name = 'with no serial card, Chrin reads a character without touching the ACIA'

const HW_PRESENT = 0x030d
const HW_SC = 0x10

// BIOS.inc: the R65C51's command register.
const SC_CMD = 0x9002

// The published slots, from the pinned jump table.
const CHRIN = 0xa003
const WRITE_BUFFER = 0xa006

const CHARACTER = 0x41 // 'A'

// Feed Chrin a character and report how the call stopped: on its own return
// breakpoint means it touched no register, on the watchpoint means it did.
async function chrinStop(m) {
  await m.clearBreaks()
  await m.call6502(WRITE_BUFFER, { A: CHARACTER })

  await m.watch(SC_CMD, 'write')
  const before = await m.regs()
  const returnTo = await m.plantCall(CHRIN)
  const result = await m.runTo(returnTo)
  await m.clearBreaks()
  const { PC, SP, P, A, X, Y } = before
  await m.setRegs({ PC, SP, P, A, X, Y })
  return result
}

export async function run(m) {
  const present = await m.peek(HW_PRESENT)
  m.assert((present & HW_SC) !== 0, 'this profile was supposed to have a serial card')

  m.assertEqual(
    (await chrinStop(m)).stop?.kind,
    'watchpoint',
    'Chrin with the serial card fitted: it should set the ACIA command register',
  )

  await m.write(HW_PRESENT, [present & ~HW_SC])
  const quiet = await chrinStop(m)
  m.assertEqual(
    quiet.stop?.kind,
    'breakpoint',
    'Chrin with no serial card: it should return without touching the ACIA',
  )

  // And it still did its job: the character comes back, with carry set to say
  // there was one. Suppressing the flow control is not the same as suppressing
  // the read, and a guard that returned early would pass the assertion above.
  m.assertByte(quiet.registers.A, CHARACTER, 'the character Chrin returned with no serial card')
  m.assert(
    (quiet.registers.P & 0x01) !== 0,
    'Chrin returned with carry clear — it reported no character was waiting',
  )
}
