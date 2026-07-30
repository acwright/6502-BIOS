// JOY reads a VIA port that cannot be observed any other way, and needs the
// emulator to hold a stick position while BASIC looks at it.
export const name = 'JOY(1) and JOY(2) return the documented R-L-D-U-Y-X-B-A bitmask'
export const xfail = 'JOY reads $FF whatever is held, and $FF at rest contradicts the degradation table'
export const issue = 'tests/FINDINGS.md#joy-reads-ff-regardless-of-the-stick'

// README: "JOY(1) / JOY(2) — Joystick port 1 or 2 bitmask (R-L-D-U-Y-X-B-A)".
// Bit 7 is Right, down to bit 0 for A. A set bit means held, which is the
// reading that makes the README's degradation row — "JOY() returns 0" with no
// VIA — mean "nothing pressed" rather than "everything pressed".
const BIT = { right: 0x80, left: 0x40, down: 0x20, up: 0x10, y: 0x08, x: 0x04, b: 0x02, a: 0x01 }

async function joyValue(m, port) {
  const out = await m.send(`PRINT JOY(${port})\r`, /^OK/)
  const match = /^\s*(\d+)\s*$/m.exec(out.output)
  if (!match) throw new Error(`no JOY(${port}) value in: ${JSON.stringify(out.output)}`)
  return Number(match[1])
}

export async function run(m) {
  m.assertEqual(await joyValue(m, 1), 0, 'JOY(1) at rest')
  m.assertEqual(await joyValue(m, 2), 0, 'JOY(2) at rest')

  // One direction and one button, so a swapped nibble or a reversed bit order
  // shows up as a wrong number rather than as an accidental match.
  await m.joystick('a', ['up', 'b'])
  m.assertByte(await joyValue(m, 1), BIT.up | BIT.b, 'JOY(1) with up and B held')
  m.assertEqual(await joyValue(m, 2), 0, 'JOY(2) while only port 1 is held')

  await m.joystick('a', [])
  await m.joystick('b', ['right', 'left', 'down', 'up', 'y', 'x', 'b', 'a'])
  m.assertByte(await joyValue(m, 2), 0xFF, 'JOY(2) with everything held')
  m.assertEqual(await joyValue(m, 1), 0, 'JOY(1) after being released')
}
