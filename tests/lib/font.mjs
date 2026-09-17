// The PICOVDP's built-in font $00, pinned independently of the card.
//
// fixtures/cp437-font.hex is v1.6's Chars.asm as that ROM built it —
// `git show v1.6:BIOS.bin | dd bs=1 skip=14336 count=2048 | xxd -p -c 16` —
// the bytes SPEC §7 says the card holds, with the SHA-256 it makes normative.
// Comparing VRAM against this rather than against the card's own reset-time copy
// is what stops a case passing on a card whose font is wrong everywhere.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export const FONT_SIZE = 0x0800 // 256 glyphs of 8 rows
export const PATTERN_TABLE = 0x0800 // in VRAM, L0PAT = $01
export const FONT_SHA256 = 'b2adc19efd10870196bad05d84eae51500599935c80f13d608a4f62278260577'
export const REG_FONT = 0x30
export const REG_L0PAT = 0x12

export function cp437Font() {
  const hex = readFileSync(join(HERE, '../fixtures/cp437-font.hex'), 'utf8').replace(/\s+/g, '')
  const bytes = Buffer.from(hex, 'hex')
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== FONT_SIZE || digest !== FONT_SHA256) {
    throw new Error(`fixtures/cp437-font.hex is not SPEC §7's font: ${bytes.length} bytes, SHA-256 ${digest}`)
  }
  return bytes
}
