// VDP-PLAN §7: every 1.x token keeps its value except $B4, and 2.0's keywords
// run $D5-$E3. A tokenized program is those bytes, so a keyword that moved
// would turn every saved program that uses it into a different one.
//
// `tests/fixtures/tokens.json` is not generated from the ROM, for the reason
// jumptable.json is not: a pin computed from the thing it pins asserts nothing.
// Three witnesses, each pair catching its own mistake:
//
//   ROM     vs fixture   a keyword added, dropped or reordered in KeywordTbl
//   fixture vs 1.6       the fixture was edited along with the ROM, which is
//                        the plausible way a 1.x token moves unnoticed
//   crunch + LIST        the table is the one the tokenizer and LIST use
//
// The 1.6 list below is v1.6's KeywordTbl, copied once and never touched again.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'the token table is pinned: 1.x tokens unmoved but $B4, 2.0 keywords at $D5-$E3'

const HERE = dirname(fileURLToPath(import.meta.url))
const PINNED = JSON.parse(readFileSync(join(HERE, '../fixtures/tokens.json'), 'utf8'))

const V16 = [
  'END', 'FOR', 'NEXT', 'DATA', 'INPUT', 'DIM', 'READ', 'LET', 'GOTO', 'RUN', 'IF', 'RESTORE',
  'GOSUB', 'RETURN', 'REM', 'STOP', 'ON', 'WAIT', 'LOAD', 'SAVE', 'DEF', 'POKE', 'PRINT', 'CONT',
  'LIST', 'CLR', 'NEW', 'TAB', 'TO', 'FN', 'SPC', 'THEN', 'NOT', 'STEP', 'AND', 'OR', 'ELSE',
  'SYS', 'DIR', 'DEL', 'CLS', 'LOCATE', 'COLOR', 'SOUND', 'VOL', 'TIME', 'DATE', 'SETTIME',
  'SETDATE', 'NVRAM', 'PAUSE', 'BANK', 'BRK', 'MEM', 'SGN', 'INT', 'ABS', 'FRE', 'POS', 'SQR',
  'RND', 'LOG', 'EXP', 'COS', 'SIN', 'TAN', 'ATN', 'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$',
  'LEFT$', 'RIGHT$', 'MID$', 'JOY', 'INKEY', 'HEX', 'MIN', 'MAX', 'DISK', 'BLOAD', 'BSAVE',
  'FORMAT',
]

const hex = (token) => `$${token.toString(16).toUpperCase()}`

export async function run(m) {
  const tokens = Object.keys(PINNED).map((k) => Number.parseInt(k.slice(1), 16))
  tokens.forEach((token, i) => m.assertByte(token, 0x80 + i, `the fixture's key #${i}: contiguous from $80`))
  m.assertEqual(hex(tokens.at(-1)), '$E3', 'the fixture\'s last token')

  // The fixture against 1.6: every token below $D5 the same keyword, but $B4.
  V16.forEach((keyword, i) => {
    const token = 0x80 + i
    if (token === 0xb4) {
      m.assertEqual(PINNED[hex(token)], 'SCREEN', 'the fixture at $B4')
    } else {
      m.assertEqual(PINNED[hex(token)], keyword, `the fixture at ${hex(token)}, against 1.6`)
    }
  })

  // The ROM against the fixture: KeywordTbl decoded, bit 7 ending each keyword.
  const { symbols } = await m.info()
  m.assert(symbols > 0, 'no symbols loaded — this case needs the ROM\'s .dbg file')
  const bytes = await m.read(await m.resolve('KeywordTbl'), 512)
  const rom = []
  let word = ''
  for (const b of bytes) {
    if (b === 0 && word === '') break
    word += String.fromCharCode(b & 0x7f)
    if (b & 0x80) {
      rom.push(word)
      word = ''
    }
  }
  const romTable = Object.fromEntries(rom.map((k, i) => [hex(0x80 + i), k]))
  m.assertEqual(JSON.stringify(romTable), JSON.stringify(PINNED), 'KeywordTbl decoded, against tokens.json')

  // And the table in use: SCREEN crunches to $B4 and LIST prints it back.
  await m.send('10 SCREEN\r', 'SCREEN')
  const { output } = await m.send('LIST\r', '^OK')
  m.assertByte(await m.peek(0x0804), 0xb4, 'the first token of line 10, after its link and line number')
  m.assertMatch(output, /^10 SCREEN$/m, 'LIST of a line holding $B4')
}
