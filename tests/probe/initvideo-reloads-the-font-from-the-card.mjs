// VDP-PLAN §5 Phase 8: the ROM carries no character set. `InitVideo` ($A015)
// has the card load its built-in font into the pattern table at $0800 through
// `FONT`, and waits for the load, so a program that overwrote the glyphs — a
// graphics mode, or VPOKEs — gets legible text back from that one call.
//
// All 2048 bytes, against the fixture rather than against what the card held
// at reset: a reload that stopped short, or a card whose font was wrong from
// the start, both fail here. Three routes back to text: `InitVideo` itself,
// `SCREEN 0` in a running program, and the prompt after a program that ended
// in `SCREEN 2`, whose layout clears $0000-$1FFF and with it the font.

import { cp437Font, FONT_SIZE, PATTERN_TABLE } from '../lib/font.mjs'
import { typeProgram, typeLine, awaitScreen } from '../lib/video.mjs'
import { VID_MODE } from '../lib/cells.mjs'
import { AssertionError } from '../lib/assert.mjs'

export const name = 'InitVideo, SCREEN 0 and the prompt reload the font from the card, and palette row 0'
export const profile = 'video'

const InitVideo = 0xa015
const PALETTE_ROW_0 = 0xfc00 // in VRAM, PALBASE = $3F
const JUNK = 0x5a

async function wreck(m) {
  await m.fillMem(PATTERN_TABLE, FONT_SIZE, JUNK, 'vram')
  const wrecked = await m.read(PATTERN_TABLE, FONT_SIZE, 'vram')
  m.assert(wrecked.every((b) => b === JUNK), 'the pattern table could not be overwritten, so a reload proves nothing')
}

// A program sets VID_MODE = $01 last thing in InitVideo, after the load has
// been waited for, so that is the moment to look.
async function awaitTextConsole(m, what) {
  for (let step = 0; step < 24; step++) {
    await m.waitFor({ cycles: 500000, run: 'turbo', timeoutMs: 30000 })
    await m.pause()
    if ((await m.peek(VID_MODE)) === 0x01 && (await m.videoInfo()).mode.vmode === 1) return
  }
  throw new AssertionError(`the Text console never came back ${what}`)
}

export async function run(m) {
  const font = cp437Font()

  // Right at boot: the header brought the console up. Established first, so
  // the reloads below are not the only thing that ever worked.
  m.assertBytes(await m.read(PATTERN_TABLE, FONT_SIZE, 'vram'), font, 'the pattern table at boot')

  // InitVideo, with palette row 0 wrecked too.
  await wreck(m)
  const paletteAtBoot = await m.read(PALETTE_ROW_0, 32, 'vram')
  await m.fillMem(PALETTE_ROW_0, 32, 0x0f, 'vram')
  await m.call6502(InitVideo)
  m.assertBytes(await m.read(PATTERN_TABLE, FONT_SIZE, 'vram'), font, 'the pattern table after InitVideo')
  m.assertBytes(await m.read(PALETTE_ROW_0, 32, 'vram'), paletteAtBoot, 'palette row 0 after InitVideo')
  const lines = await m.screenText()
  m.assert(
    lines.some((line) => line.startsWith('OK')),
    `InitVideo left the screen unreadable:\n${lines.map((l) => `    |${l}|`).join('\n')}`,
  )

  // SCREEN 0 in a running program.
  await typeProgram(m, ['10 SCREEN 2 : SCREEN 0', '20 GOTO 20'])
  await wreck(m)
  await typeLine(m, 'RUN')
  await awaitTextConsole(m, 'after SCREEN 0')
  m.assertBytes(await m.read(PATTERN_TABLE, FONT_SIZE, 'vram'), font, 'the pattern table after SCREEN 0')

  // The prompt after a program left the card in Graphics mode.
  await m.call6502(0xa006, { A: 0x03 }) // Ctrl+C
  await awaitScreen(m, (s) => s.some((l) => l.startsWith('BREAK IN 20')), 'the break out of the loop')
  await typeProgram(m, ['10 SCREEN 2', '20 END'])
  await typeLine(m, 'RUN')
  await awaitScreen(m, (s) => s.at(-1).startsWith('OK') || s.some((l, i) => i > 0 && l.startsWith('OK')), 'OK after RUN')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE at the prompt')
  m.assertBytes(await m.read(PATTERN_TABLE, FONT_SIZE, 'vram'), font, 'the pattern table at the prompt after SCREEN 2')
}
