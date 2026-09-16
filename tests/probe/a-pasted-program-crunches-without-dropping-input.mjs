// VDP-PLAN §5 Phase 6 and BasMatchKeyword's comment: a line is crunched while
// the next one is arriving, and at 19,200 baud a slower crunch drops input.
// 2.0's keywords make KeywordTbl about a third longer.
//
// Two programs of twenty lines, each pasted in one write and paced by the
// emulator at the line rate: the first twenty lines of the README's
// SAVEMGR.BAS, as a user would paste them, and twenty lines of 2.0 graphics
// code. LIST gives every line back exactly, or something was dropped.
//
// Known failing, on 1.6's table as well as 2.0's: see FINDINGS.md. It stays as
// the plan wrote it, so whatever fixes the paste turns it into an XPASS.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'a 20-line program pasted at 19,200 baud crunches with nothing dropped'
export const xfail = 'crunching a line takes 100-150 characters of line time, so a paste overruns the input buffer (on the 1.6 table too)'
export const issue = 'tests/FINDINGS.md#a-paste-at-19200-baud-overruns-the-input-buffer'

const HERE = dirname(fileURLToPath(import.meta.url))

function savemgr() {
  const text = readFileSync(join(HERE, '../../README.md'), 'utf8')
  const at = text.indexOf('#### `SAVEMGR.BAS`')
  const block = /```basic\n([\s\S]*?)```/.exec(text.slice(at))
  return block[1].split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20)
}

const GRAPHICS = Array.from({ length: 20 }, (_, i) => {
  const n = 100 + i * 10
  return [
    `${n} SCREEN 2 : PALETTE ${i},15,${i % 16},0 : VSYNC`,
    `${n} FOR X = 0 TO 31 : VPOKE X + ${i * 32},X : NEXT X`,
    `${n} SPRITE ${i},X * 2,Y + ${i},${i} : SCROLL 1,X,Y`,
    `${n} IF VPEEK(${i}) <> X THEN NVSAVE 1,${i + 1},4096`,
  ][i % 4]
})

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function paste(m, lines, what) {
  await m.send('NEW\r', '^OK')
  const { cursor } = await m.serialWrite(lines.map((l) => `${l}\r`).join(''))
  // Wait for the echo of the last line, then for the prompt LIST closes with.
  await m.expectFrom(cursor, escape(lines.at(-1)))
  const { output } = await m.send('LIST\r', '^OK')
  const listed = output.split('\n').filter((l) => /^\d+ /.test(l))
  m.assertEqual(listed.join('\n'), lines.join('\n'), `LIST after pasting ${what}`)
}

export async function run(m) {
  const config = await m.call('serial.config')
  m.assertEqual(config.baudRate, 19200, 'the serial line rate')
  await paste(m, savemgr(), 'SAVEMGR.BAS')
  await paste(m, GRAPHICS, 'twenty lines of graphics statements')
}
