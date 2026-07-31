// JOY reads a VIA port that cannot be observed any other way, and needs the
// emulator to hold a stick position while BASIC looks at it.
export const name = 'JOY(1) and JOY(2) return the documented R-L-D-U-Y-X-B-A bitmask'

// The DB9 is wired P7 RIGHT, P6 LEFT, P5 DOWN, P4 UP, P3 Y, P2 X, P1 B,
// P0 A/FIRE — the README's R-L-D-U-Y-X-B-A. Each line is pulled up through 1K
// and grounded by its switch, so the port is active low and JOY returns it
// raw: a held button reads 0 and an untouched stick reads $FF.
const BIT = { right: 0x80, left: 0x40, down: 0x20, up: 0x10, y: 0x08, x: 0x04, b: 0x02, a: 0x01 }
const held = (...names) => 0xFF & ~names.reduce((mask, n) => mask | BIT[n], 0)

// Side `a` is the stick on VIA port A, which ReadJoystick2Impl reads, so it is
// BASIC's JOY(2). Side `b` is port B and JOY(1). The crossover is worth stating
// because getting it backwards looks exactly like a dead port.
const PORT = { 1: 'b', 2: 'a' }

async function joyValue(m, port) {
  const out = await m.send(`PRINT JOY(${port})\r`, /^OK/)
  const match = /^\s*(\d+)\s*$/m.exec(out.output)
  if (!match) throw new Error(`no JOY(${port}) value in: ${JSON.stringify(out.output)}`)
  return Number(match[1])
}

export async function run(m) {
  m.assertByte(await joyValue(m, 1), 0xFF, 'JOY(1) at rest')
  m.assertByte(await joyValue(m, 2), 0xFF, 'JOY(2) at rest')

  // One direction and one button, so a swapped nibble or a reversed bit order
  // shows up as a wrong number rather than as an accidental match.
  await m.joystick(PORT[1], ['up', 'b'])
  m.assertByte(await joyValue(m, 1), held('up', 'b'), 'JOY(1) with up and B held')
  m.assertByte(await joyValue(m, 2), 0xFF, 'JOY(2) while only its neighbour is held')

  // Every line at once: catches a mask that is right in one nibble only.
  await m.joystick(PORT[1], [])
  await m.joystick(PORT[2], ['right', 'left', 'down', 'up', 'y', 'x', 'b', 'a'])
  m.assertByte(await joyValue(m, 2), 0x00, 'JOY(2) with everything held')
  m.assertByte(await joyValue(m, 1), 0xFF, 'JOY(1) after being released')

  // Each line on its own, which is the assertion that actually pins the order:
  // a rotated or mirrored mapping passes the combined cases above and fails
  // here on the first button whose bit moved.
  await m.joystick(PORT[2], [])
  for (const name of Object.keys(BIT)) {
    await m.joystick(PORT[1], [name])
    m.assertByte(await joyValue(m, 1), held(name), `JOY(1) with only ${name} held`)
  }
}
