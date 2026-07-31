// Which routine sits at which slot, pinned against a table checked into the
// repo rather than derived from the ROM.
//
// `tests/fixtures/jumptable.json` is not generated. That is the whole point of
// it: a pin computed from the thing it pins asserts nothing. It is the third
// witness to the published API, alongside the ROM's own symbols and the
// README's table, and the only reason for it to change is a deliberate decision
// to change the API — at which point changing it is the decision being recorded.
//
// Three-way, because each pair catches a different mistake:
//
//   ROM  vs fixture   a routine moved to another slot
//   README vs fixture  the docs and the code were changed together, which is
//                      the plausible way an API moves without anyone noticing
//
// The README half lives in the-readme-documents-every-jump-slot; this case is
// the ROM half.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'every jump slot still holds the routine it was published with'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PINNED = JSON.parse(readFileSync(join(HERE, '../fixtures/jumptable.json'), 'utf8'))

export async function run(m) {
  // A ROM handed to --rom from an older build has no symbols, and this case is
  // entirely about names. Say so rather than passing silently.
  const { symbols } = await m.info()
  m.assert(symbols > 0, 'no symbols loaded — this case needs the ROM\'s .dbg file')

  for (const [slot, label] of Object.entries(PINNED)) {
    const address = Number.parseInt(slot.slice(1), 16)
    let resolved
    try {
      resolved = await m.resolve(label)
    } catch {
      m.fail(
        `${label} is published at ${slot} and no longer exists in the ROM. ` +
          'Removing a slot breaks every cartridge built against the table',
      )
    }
    m.assertWord(
      resolved,
      address,
      `${label} is published at ${slot} and the ROM now has it at ` +
        `$${resolved.toString(16).toUpperCase().padStart(4, '0')}`,
    )
  }
}
