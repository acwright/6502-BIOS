// README § Video & Display: "`COLOR <fg>[, <bg>[, <border>]]` … The border
// follows `bg` unless `border` is given".
//
// "Unless" has to hold on the bus, not only afterwards. The PICOVDP samples its
// registers a line at a time (SPEC §3) and draws the border per line (§11), so
// a register 7 that is briefly fg<<4 | bg on the way to fg<<4 | border shows
// the background in a band of the border for as long as it lasted. COLOR used
// to do exactly that — VideoSetColor, then a second write for the border, about
// 2,900 cycles and 45 lines apart — and a loop of COLOR fg,bg,border statements
// made the border flicker every frame. color-sets-the-pen-and-the-border could
// not see it: it reads register 7 once the statement is over.
//
// So every command write on port A is caught with a watchpoint while the line
// is typed and runs. Commands are pairs, a data byte then $80 | register, and
// the Kernal only ever writes them whole; the case checks nothing is written at
// the idle prompt before it starts, so the pairs line up from the first write.

import { awaitScreen, render } from '../lib/video.mjs'
import { valueWritten } from '../lib/writes.mjs'

export const name = 'COLOR writes register 7 once, with the border it was given'
export const profile = 'video'

const VC_REG = 0x9c01
const SELECT_COLOR = 0x80 | 0x07
const AT = 0x40
const STEP = 200000
const LIMIT = 4000
const CPS = 400

const hex = (n) => `$${n.toString(16).toUpperCase().padStart(2, '0')}`
const list = (values) => `[${values.map(hex).join(', ')}]`

// Type `statement`, then a marker to wait for, and hand back the data byte of
// every register 7 write in the order the machine made them.
//
// The line goes in without its Enter, and the watchpoint is armed only after
// the echo has settled. `input.type` returns once its last key is down, in
// emulated time, and a machine stopped on a watchpoint makes none — so typing
// the whole line with the watchpoint armed never returns. The Enter alone is
// down before the first write it causes, and every key before it has echoed.
async function registerSevenWrites(m, statement) {
  const line = `${statement} : PRINT CHR$(${AT});`
  // A clear screen first, so the only @ on it afterwards is this line's.
  await m.start()
  await m.type('CLS\r', CPS)
  await awaitScreen(m, (screen) => screen.every((l) => l.trim() === '' || l.trim() === 'OK'), 'CLS')
  await m.start()
  await m.type(line, CPS)
  await awaitScreen(m, (screen) => screen.join('').includes(line), `the echo of ${line}`)
  await m.clearBreaks()
  await m.watch(VC_REG, 'write')
  try {
    const idle = await m.waitFor({ cycles: STEP, stopped: true, run: 'turbo', timeoutMs: 30000 })
    m.assert(
      idle.stop?.kind !== 'watchpoint',
      `before ${statement}: something wrote port A at the idle prompt, so the command pairs cannot be lined up`,
    )

    await m.type('\r', CPS)
    const bytes = []
    let first = true
    let quiet = 0
    for (;;) {
      // The first wait does not pass `run`: the machine is already running and
      // may have stopped on a write before this call arrives, and a `run` would
      // resume straight past it. After that, every wait resumes.
      const wait = { cycles: STEP, stopped: true, timeoutMs: 30000 }
      const result = await m.waitFor(first ? wait : { ...wait, run: 'turbo' })
      first = false
      if (result.stop?.kind === 'watchpoint') {
        bytes.push(await valueWritten(m, await m.regs(), result.stop.address))
        m.assert(bytes.length < LIMIT, `${statement}: more than ${LIMIT} command writes, and still going`)
        continue
      }
      // A whole step with no command written: the statement is over if the
      // marker is on the screen.
      await m.pause()
      const screen = await m.screenText()
      if (screen.some((l) => l.includes('@') && !l.includes('CHR$'))) break
      if (++quiet === 24) m.fail(`${statement} never printed its marker:\n${render(screen)}`)
    }

    m.assert(bytes.length % 2 === 0, `${statement}: ${bytes.length} command writes, an odd number`)
    const colour = []
    for (let i = 0; i < bytes.length; i += 2) {
      if (bytes[i + 1] === SELECT_COLOR) colour.push(bytes[i])
    }
    return colour
  } finally {
    await m.clearBreaks()
  }
}

export async function run(m) {
  const bordered = await registerSevenWrites(m, 'COLOR 2,5,12')
  m.assertEqual(list(bordered), list([0x2c]), 'COLOR 2,5,12 — the register 7 writes')

  const plain = await registerSevenWrites(m, 'COLOR 2,5')
  m.assertEqual(list(plain), list([0x25]), 'COLOR 2,5 — the register 7 writes')

  // The border from an expression, whose evaluation is where the pen used to be
  // written in between.
  await m.write(4096, [12])
  const peeked = await registerSevenWrites(m, 'COLOR 7,4,PEEK(4096)')
  m.assert(peeked.length > 0, 'COLOR 7,4,PEEK(4096) never wrote register 7')
  m.assert(
    peeked.every((value) => (value & 0x0f) === 12),
    `COLOR 7,4,PEEK(4096) — register 7 showed a border other than 12 on the way: ${list(peeked)}`,
  )
}
