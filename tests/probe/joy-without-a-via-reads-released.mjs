// The degradation path for JOY, ahead of the rest of §6.11, because it is what
// the polarity decision changed and a fix is not finished until a test fails
// without it.
//
// The joystick ports are active low, so JOY returns the port raw and a held
// button is a 0 bit. That makes 0 the worst possible answer for a machine with
// no VIA fitted: it reports every direction and button held at once. $FF is
// what an untouched stick reads, and so what a missing one should report.
export const name = 'JOY reads $FF, not 0, when no VIA is fitted'

const HW_PRESENT = 0x030d
const HW_GPIO = 0x20

async function joyValue(m, port) {
  const out = await m.send(`PRINT JOY(${port})\r`, /^OK/)
  const match = /^\s*(\d+)\s*$/m.exec(out.output)
  if (!match) throw new Error(`no JOY(${port}) value in: ${JSON.stringify(out.output)}`)
  return Number(match[1])
}

export async function run(m) {
  const present = await m.peek(HW_PRESENT)
  m.assert((present & HW_GPIO) !== 0, `expected the VIA present to start with, HW_PRESENT=$${present.toString(16)}`)

  // Clear the GPIO bit. No cleanup needed: the next case restores the snapshot.
  await m.write(HW_PRESENT, [present & ~HW_GPIO])

  m.assertByte(await joyValue(m, 1), 0xFF, 'JOY(1) with no VIA')
  m.assertByte(await joyValue(m, 2), 0xFF, 'JOY(2) with no VIA')

  // And it is the absent path being taken, not the port happening to float
  // high: with the VIA back, the value comes from hardware again.
  await m.write(HW_PRESENT, [present])
  m.assertByte(await joyValue(m, 1), 0xFF, 'JOY(1) with the VIA restored and nothing held')
}
