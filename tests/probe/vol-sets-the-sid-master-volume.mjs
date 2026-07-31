// README § Sound: "`VOL <n>` — Set SID master volume (0–15)".
//
// The SID's volume lives in the low nibble of $9818 and the register reads back
// as $00, so the write on the bus is the only evidence it ever happened.

import { recordWrites, assertWrites } from '../lib/writes.mjs'

export const name = 'VOL writes the volume to the SID master register'

const SID_MODE_VOL = 0x9818

export async function run(m) {
  // The ends of the documented range and one in the middle. 0 matters on its
  // own: "silence" is a value like any other, and a routine that skipped a
  // zero write would leave the machine loud.
  for (const volume of [9, 0, 15]) {
    const writes = await recordWrites(m, {
      start: SID_MODE_VOL,
      expect: 1,
      settle: /^OK/,
      body: () => m.serialWrite(`VOL ${volume}\r`),
    })
    assertWrites(m, writes, [[SID_MODE_VOL, volume]], `VOL ${volume}`)
  }
}
