// README: "Video absent — CLS, LOCATE, COLOR silently skip (arguments are still
// consumed); VideoClear, VideoSetCursor and VideoSetColor skip with them".
//
// The bus half of the video row, and the exact counterpart of the SID one: from
// the prompt, a statement that skipped and a statement that wrote a card nobody
// fitted look the same — no output either way. On a real machine those writes
// land on whatever else decodes $9C00.
//
// Each claim is made twice, because "nothing was written" is only worth
// something if a write would have been seen. HW_PRESENT is the only thing the
// ROM consults, so setting the video bit on this cardless machine sends the
// routine down its normal path and the watchpoint catches it; clearing it again
// is the assertion. The pair also says which of the two the guard is: with the
// bit set the code still runs, so nothing here is passing because the profile
// happens to be quiet.

import { expectNoWrites } from '../lib/writes.mjs'

export const name = 'with no video card, nothing is written to the VDP'

// BIOS.inc: the TMS9918 is two addresses, data and register.
const VC_DATA = 0x9c00
const VC_REG = 0x9c01

const HW_PRESENT = 0x030d
const HW_VID = 0x80

// BIOS.inc: the cursor column, row and the VRAM address they work out to.
const VID_CURSOR_X = 0x0307

// The published slots, from the pinned jump table.
const VIDEO_CLEAR = 0xa018
const VIDEO_SET_CURSOR = 0xa01e
const VIDEO_SET_COLOR = 0xa027

const statement = (m, text) =>
  expectNoWrites(m, {
    start: VC_DATA,
    end: VC_REG,
    what: `${text.trim()} with no video fitted`,
    body: () => m.serialWrite(`${text}\r`),
  })

// Call a slot with the watchpoint armed and report how it stopped: on the
// return breakpoint means it touched nothing, on the watchpoint means it did.
async function slotStop(m, address, { A = 0, X = 0, Y = 0 } = {}) {
  await m.clearBreaks()
  await m.watch(VC_DATA, 'write', { end: VC_REG })
  const before = await m.regs()
  const returnTo = await m.plantCall(address, { A, X, Y })
  const result = await m.runTo(returnTo)
  await m.clearBreaks()
  const { PC, SP, P, A: a, X: x, Y: y } = before
  await m.setRegs({ PC, SP, P, A: a, X: x, Y: y })
  return result.stop?.kind
}

export async function run(m) {
  const present = await m.peek(HW_PRESENT)
  m.assert((present & HW_VID) === 0, 'this profile was supposed to have no video card')

  const slots = [
    [VIDEO_CLEAR, 'VideoClear ($A018)', {}],
    [VIDEO_SET_COLOR, 'VideoSetColor ($A027)', { A: 0x1f }],
  ]

  // With the bit set, each slot drives the chip — the control that says the
  // watchpoint is watching something.
  await m.write(HW_PRESENT, [present | HW_VID])
  for (const [address, label, regs] of slots) {
    m.assertEqual(
      await slotStop(m, address, regs),
      'watchpoint',
      `${label} with the video bit set: it should write the VDP`,
    )
  }

  // With it clear, none of them does, and neither does the statement above it.
  await m.write(HW_PRESENT, [present & ~HW_VID])
  for (const [address, label, regs] of slots) {
    m.assertEqual(
      await slotStop(m, address, regs),
      'breakpoint',
      `${label} with no video fitted: it should return without writing`,
    )
  }

  await statement(m, 'CLS')
  await statement(m, 'LOCATE 5,5')
  await statement(m, 'COLOR 1,0')

  // VideoSetCursor is the odd one out: it touches no register at all, only the
  // three RAM bytes that say where the next character goes. So its half of the
  // promise is asserted where it lives — the cursor does not move on a machine
  // with no screen for it to move on, and does move when the bit says there is
  // one, which is the same pair made in memory instead of on the bus.
  const cursor = () => m.read(VID_CURSOR_X, 4)

  await m.write(HW_PRESENT, [present | HW_VID])
  await m.call6502(VIDEO_SET_CURSOR, { X: 7, Y: 3 })
  const moved = await cursor()
  m.assertBytes(moved.subarray(0, 2), [7, 3], 'the cursor with the video bit set')

  await m.write(HW_PRESENT, [present & ~HW_VID])
  await m.call6502(VIDEO_SET_CURSOR, { X: 20, Y: 20 })
  m.assertBytes(await cursor(), moved, 'the cursor with no video fitted')
}
