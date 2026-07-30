// Self-check — a tier 3 assertion that is false is reported as a failure.
//
// The third of the three verdict paths. Tier 3 cases pass by returning, so a
// runner bug that swallowed an exception would turn the whole tier green.

export const name = 'self-check — a failed tier 3 assertion is reported as a failure'
export const selftest = 'must-fail'

export async function run(m) {
  const hw = await m.peek(0x030d)
  m.assertByte(hw, hw ^ 0xff, 'HW_PRESENT (deliberately impossible)')
}
