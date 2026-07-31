// The README's jump table is the published API document — it is where someone
// writing a cartridge reads the addresses from. So it is held to the same pin
// the ROM is.
//
// This is the pair that catches the realistic accident: a slot is added,
// removed or reordered in Kernal.asm and the README is updated in the same
// change, because updating the docs with the code is good practice. Every
// ROM-against-docs check then agrees, and the API has moved anyway. Only a
// third copy that nobody edits out of politeness notices.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PINNED } from './the-jump-table-addresses-are-pinned.mjs'

export const name = 'the README documents every jump slot, at the address it is pinned to'

const HERE = dirname(fileURLToPath(import.meta.url))
const README = join(HERE, '../../README.md')

// | `$A000` | `Chrout` | Output one character (routed by `IO_MODE`) |
const ROW = /^\| `\$(A0[0-9A-F]{2})` \| `(\w+)` \|/gm

export async function run(m) {
  const documented = new Map()
  for (const [, address, label] of readFileSync(README, 'utf8').matchAll(ROW)) {
    documented.set(`$${address}`, label)
  }

  m.assertEqual(
    documented.size,
    Object.keys(PINNED).length,
    'the number of slots the README documents',
  )

  for (const [slot, label] of Object.entries(PINNED)) {
    m.assert(documented.has(slot), `${slot} (${label}) is not in the README's jump table`)
    m.assertEqual(documented.get(slot), label, `the README's entry for ${slot}`)
  }
}
