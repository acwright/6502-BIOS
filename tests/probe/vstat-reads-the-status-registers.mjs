// VDP-PLAN §7: VSTAT(n) is status register n. STAT4 is the PICOVDP's
// identification byte, 172 ($AC); STAT5 and STAT6 are what VdpInfo reports.

import { typeLine, awaitScreen, render } from '../lib/video.mjs'
import { VDP_FW, VDP_CAPS } from '../lib/vdp.mjs'

export const name = 'VSTAT(4) is 172, and VSTAT(5) and VSTAT(6) are the firmware and capabilities'
export const profile = 'video'

export async function run(m) {
  const fw = await m.peek(VDP_FW)
  const caps = await m.peek(VDP_CAPS)
  await typeLine(m, 'PRINT "STAT"; VSTAT(4); VSTAT(5); VSTAT(6)')
  const screen = await awaitScreen(m, (s) => s.some((l) => l.startsWith('STAT ')), 'the answer')
  const line = screen.find((l) => l.startsWith('STAT '))
  m.assertEqual(line.trim(), `STAT 172 ${fw} ${caps}`, `VSTAT(4); VSTAT(5); VSTAT(6):\n${render(screen)}`)
  m.assertByte((await m.videoRegisters())[0x0f], 0, 'STATSEL_A after VSTAT')
}
