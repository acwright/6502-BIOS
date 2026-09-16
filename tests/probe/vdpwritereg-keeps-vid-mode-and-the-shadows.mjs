// VDP-PLAN §6, $A0B4: `VdpWriteReg` writes a register through port A and keeps
// the Kernal's records of the ones that matter to it.
//
// - `L0CTRL` and `L1CTRL` read back as nothing, so the values go to
//   `VDP_L0CTRL_SHADOW`/`VDP_L1CTRL_SHADOW` for `VdpSetScroll` and `VdpLayer`
//   to change a bit of without losing the rest.
// - `VMODE` goes to `VID_MODE`, which is what BASIC consults to put the Text
//   console back. Compact, Graphics and Full are recorded as themselves. Text
//   or the legacy submode reached from anything else carries b7 (disturbed),
//   because a VMODE write sets a mode without the tables that go with it: only
//   `InitVideo` may say `$01`. The same mode over itself changes nothing.
// - X and Y come back as they went in, and register 128 and up is refused.

import { vdpCall, VdpWriteReg, VDP_L0CTRL_SHADOW, VDP_L1CTRL_SHADOW } from '../lib/vdp.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'VdpWriteReg writes a register and keeps VID_MODE and the LxCTRL shadows'
export const profile = 'video'

async function write(m, register, value, what) {
  const r = await vdpCall(m, VdpWriteReg, { A: value, X: register, Y: 0x5a })
  m.assert(!r.carry, `${what}: carry set`)
  m.assertByte(r.X, register, `${what}: X preserved`)
  m.assertByte(r.Y, 0x5a, `${what}: Y preserved`)
  m.assertByte((await m.videoRegisters())[register], value, `${what}: the register`)
}

export async function run(m) {
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE at the prompt')

  await write(m, 0x07, 0x4a, 'COLOR')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE after a COLOR write')

  await write(m, 0x15, 0x31, 'L0CTRL')
  m.assertByte(await m.peek(VDP_L0CTRL_SHADOW), 0x31, 'the L0CTRL shadow')
  await write(m, 0x1d, 0x1c, 'L1CTRL')
  m.assertByte(await m.peek(VDP_L1CTRL_SHADOW), 0x1c, 'the L1CTRL shadow')
  m.assertByte(await m.peek(VDP_L0CTRL_SHADOW), 0x31, 'the L0CTRL shadow after an L1CTRL write')

  await write(m, 0x0d, 0x01, 'VMODE Text over the Text console')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE: Text over Text is still intact')

  await write(m, 0x0d, 0x03, 'VMODE Graphics')
  m.assertEqual((await m.videoInfo()).mode.vmode, 3, 'the card\'s mode')
  m.assertByte(await m.peek(VID_MODE), 0x03, 'VID_MODE after Graphics')

  await write(m, 0x0d, 0x01, 'VMODE Text from Graphics')
  m.assertByte(await m.peek(VID_MODE), 0x81, 'VID_MODE after Text from Graphics: disturbed')

  await write(m, 0x0d, 0x00, 'VMODE legacy')
  m.assertByte(await m.peek(VID_MODE), 0x80, 'VID_MODE after the legacy submode from Text: disturbed')

  const before = await m.videoRegisters()
  const refused = await vdpCall(m, VdpWriteReg, { A: 0x99, X: 0x80 })
  m.assert(refused.carry, 'carry clear for register 128')
  m.assertBytes(await m.videoRegisters(), before, 'the registers after register 128 was refused')
}
