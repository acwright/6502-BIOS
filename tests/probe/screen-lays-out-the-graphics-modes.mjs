// VDP-PLAN §7 and decision 2: SCREEN 1, 2 and 3 select Compact, Graphics and
// Full (VMODE 2-4), all with one layout that fits Full's tables; SCREEN 0 is
// the Text console again.
//
// A program switches and then loops, so the card can be looked at in the mode
// before the prompt takes it back. VRAM's four tables at $0000-$1FFF start out
// full of a sentinel, since "cleared" means nothing on a table that was already
// zero, and the sprite table after them must end up as 64 sprites at Y = 240.

import { typeProgram, typeLine, awaitVmode, awaitScreen, ctrlC } from '../lib/video.mjs'
import { VID_MODE } from '../lib/cells.mjs'
import { VDP_L0CTRL_SHADOW, VDP_L1CTRL_SHADOW } from '../lib/vdp.mjs'

export const name = 'SCREEN 1-3 select Compact, Graphics and Full with one layout, and SCREEN 0 the Text console'
export const profile = 'video'

// SPEC §5 register, value
const LAYOUT = {
  0x01: 0x40, // MODE1: display on
  0x10: 0x00, // L0NAME  $0000
  0x11: 0x02, // L0ATTR  $0800
  0x12: 0x08, // L0PAT   $4000
  0x13: 0x00, // L0SCRX
  0x14: 0x00, // L0SCRY
  0x15: 0x32, // L0CTRL  4bpp, per cell, on, opaque
  0x18: 0x04, // L1NAME  $1000
  0x19: 0x06, // L1ATTR  $1800
  0x1a: 0x10, // L1PAT   $8000
  0x1b: 0x00, // L1SCRX
  0x1c: 0x00, // L1SCRY
  0x1d: 0x02, // L1CTRL  4bpp, per cell, off
  0x20: 0x40, // SPRATTR $2000
  0x21: 0x18, // SPRPAT  $C000
  0x22: 64, //   SPRCOUNT
  0x23: 0x23, // SPRCTRL on, collisions, no $D0 terminator, 4bpp
}
const GEOMETRY = { 2: 'compact', 3: 'graphics', 4: 'full' }
const TABLES = 0x2000
const SENTINEL = 0xa5

export async function run(m) {
  for (const n of [1, 2, 3]) {
    const vmode = n + 1
    await typeProgram(m, [`10 SCREEN ${n}`, '20 GOTO 20'])
    // Typed blind from here: the screen is about to be gone anyway.
    await m.fillMem(0, TABLES + 256, SENTINEL, 'vram')
    // Scrolled layers going in, so the zeroed scroll is the layout's doing.
    await m.call('video.setRegister', { register: 0x13, value: 7 })
    await m.call('video.setRegister', { register: 0x1c, value: 9 })
    await typeLine(m, 'RUN')
    await awaitVmode(m, vmode, `after SCREEN ${n}`)

    const what = `SCREEN ${n}`
    const info = await m.videoInfo()
    m.assertEqual(info.mode.geometry, GEOMETRY[vmode], `${what}: the geometry`)
    m.assert(info.displayEnabled, `${what}: the display is off`)
    const registers = await m.videoRegisters()
    for (const [register, value] of Object.entries(LAYOUT)) {
      m.assertByte(registers[register], value, `${what}: register $${Number(register).toString(16).toUpperCase()}`)
    }
    m.assertByte(await m.peek(VID_MODE), vmode, `${what}: VID_MODE`)
    m.assertByte(await m.peek(VDP_L0CTRL_SHADOW), 0x32, `${what}: the L0CTRL shadow`)
    m.assertByte(await m.peek(VDP_L1CTRL_SHADOW), 0x02, `${what}: the L1CTRL shadow`)
    const tables = await m.read(0, TABLES, 'vram')
    const dirty = tables.findIndex((b) => b !== 0)
    m.assertEqual(dirty, -1, `${what}: the first byte of $0000-$1FFF not cleared`)
    const sprites = Array.from({ length: 64 }, () => [240, 0, 0, 0]).flat()
    m.assertBytes(await m.read(TABLES, 256, 'vram'), sprites, `${what}: the sprite table`)

    await ctrlC(m)
    await awaitScreen(m, (s) => s.some((l) => l.startsWith('BREAK IN 20')), `the break out of ${what}`)
  }

  // SCREEN 0 in a program: the Text console, without waiting for the prompt.
  await typeProgram(m, ['10 SCREEN 3 : SCREEN 0', '20 GOTO 20'])
  await typeLine(m, 'RUN')
  await awaitVmode(m, 1, 'after SCREEN 0')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'SCREEN 0: VID_MODE')
  const registers = await m.videoRegisters()
  m.assertByte(registers[0x11], 0x01, 'SCREEN 0: L0ATTR')
  m.assertByte(registers[0x12], 0x01, 'SCREEN 0: L0PAT')
  m.assertByte(await m.peek(VDP_L0CTRL_SHADOW), 0x30, 'SCREEN 0: the L0CTRL shadow')
  m.assertEqual((await m.read(0, 960, 'vram')).filter((b) => b !== 0x20).length, 0, 'SCREEN 0: the name table is not blank')
}
