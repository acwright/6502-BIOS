// The regression pinned by 3194337, and the promise the jump table makes about
// it: `InitVideo` ($A015) "Initialise TMS9918 video chip — writes the mode
// registers **and** reloads the character set into the pattern table at
// $0800".
//
// The "and" is the whole entry. A program that uses the video chip for graphics
// overwrites the pattern table, and without the reload there is no way back to
// text — the machine keeps running and every glyph on screen is whatever the
// program left there, which looks like a dead machine and is not one. The
// README's memory map names `$B800–$BFFF` as the CP437 data this restores from,
// so the assertion is that VRAM $0800 comes back byte for byte equal to it.
//
// All 2048 bytes, not a sample. A reload that stopped at 256 bytes would give
// back the digits and the capitals and leave everything above `$20`-plus-a-page
// as noise — which is exactly the shape of bug a spot check invites.

export const name = 'InitVideo reloads the whole character set into the pattern table'
export const profile = 'video'

const InitVideo = 0xa015

const PATTERN_TABLE = 0x0800 // in VRAM
const CHARSET_ROM = 0xb800 // in the CPU's map
const CHARSET_SIZE = 0x0800 // 2 KB — 256 glyphs of 8 rows

// `mem.read {space:'rom'}` is offset from $8000, since that is where the ROM
// image starts.
const CHARSET_IN_ROM_IMAGE = CHARSET_ROM - 0x8000

export async function run(m) {
  const expected = await m.read(CHARSET_IN_ROM_IMAGE, CHARSET_SIZE, 'rom')

  // It is already right at boot — KernalInit calls InitVideo — so establish
  // that first. Otherwise a case that only checked after the restore would pass
  // against a machine whose character set was never loaded in the first place
  // and whose "restore" was the only thing that ever worked.
  m.assertBytes(
    await m.read(PATTERN_TABLE, CHARSET_SIZE, 'vram'),
    expected,
    'the pattern table at boot',
  )

  // Now wreck it, the way a graphics program does.
  await m.fillMem(PATTERN_TABLE, CHARSET_SIZE, 0x5a, 'vram')
  const wrecked = await m.read(PATTERN_TABLE, CHARSET_SIZE, 'vram')
  m.assert(
    wrecked.every((byte) => byte === 0x5a),
    'the pattern table could not be overwritten, so the restore below proves nothing',
  )

  await m.call6502(InitVideo)

  m.assertBytes(
    await m.read(PATTERN_TABLE, CHARSET_SIZE, 'vram'),
    expected,
    'the pattern table after InitVideo',
  )

  // And the screen still reads as text afterwards, which is the user-facing
  // half: the name table is untouched by the reload, so what was on screen is
  // still on screen and still legible.
  const lines = await m.screenText()
  m.assert(
    lines.some((line) => line.startsWith('OK')),
    `InitVideo left the screen unreadable:\n${lines.map((l) => `    |${l}|`).join('\n')}`,
  )
}
