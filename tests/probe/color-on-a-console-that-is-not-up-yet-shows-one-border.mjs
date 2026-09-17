// 6502-BIOS#2: `COLOR fg,bg,border` as the console's *first* use showed the old
// border before the one it was given.
//
// The Text console comes up the first time something is drawn, not in
// KernalInit, and that bring-up is InitVideo followed by a clear. InitVideo
// writes register 7 with the display off — and a blanked PICOVDP shows that
// register's low nibble over the whole screen, for as long as the font load
// takes (SPEC §7: up to a frame) — from the Kernal's own idea of the border. It
// used to take it from VID_PEN, which COLOR had not stored yet, so the screen
// showed the *old* pen's background and then settled on border 12.
//
// VID_MODE ($0393) is the ROM's record of whether the console has been brought
// up: $00 is what KernalInit leaves, and the first Chrout, VideoClear,
// VideoSetCursor or VideoSetColor consumes it. Putting it back to $00 is how
// this case reaches that state — by the time anything can be typed the boot
// header has used the console, and so has the echo of the line being typed. The
// POKE runs after that echo and in the same statement as the COLOR, so COLOR
// really is the caller that finds the console down, exactly as a cartridge that
// sets its colours before it prints does.
//
// The assertion is not "register 7 is written once". The bring-up writes it too,
// and it is right that it does — the screen is blank at that moment and has to
// be *some* colour. It is that every value register 7 is given on the way is the
// border that was asked for, and that the clear the bring-up does uses the pen
// that was asked for. color-writes-register-7-once is the same claim for a
// console already up.

import { awaitScreen, render } from '../lib/video.mjs'
import { vram, ATTRIBUTES, NAME_TABLE_SIZE, VID_MODE } from '../lib/cells.mjs'
import { valueWritten } from '../lib/writes.mjs'

export const name = 'COLOR on a console that is not up yet shows only the border it was given'
export const profile = 'video'

const VC_REG = 0x9c01
const SELECT_COLOR = 0x80 | 0x07
const STEP = 200000
const LIMIT = 4000
const CPS = 400

// COLOR 2,5,12 on a console that has not been brought up: register 7 must never
// hold anything but fg 2 over border 12, and the clear must use pen 2 over 5.
const PEN = 0x25
const COLOUR = 0x2c
const LINE = `POKE ${VID_MODE},0:COLOR 2,5,12:PRINT CHR$(64);`

const hex = (n) => `$${n.toString(16).toUpperCase().padStart(2, '0')}`
const list = (values) => `[${values.map(hex).join(', ')}]`

// Type LINE, run it with every command write on port A caught, and hand back the
// data byte of each register 7 write in the order the machine made them.
//
// The line goes in without its Enter and the watchpoint is armed only after the
// echo has settled: a machine stopped on a watchpoint makes no keystrokes, so
// typing a whole line with one armed never returns. Commands are pairs — a data
// byte, then $80 | register — and the Kernal only ever writes them whole, so the
// case checks nothing is written at the idle prompt first and the pairs line up
// from the first write.
async function registerSevenWrites(m) {
  await m.start()
  await m.type(LINE, CPS)
  await awaitScreen(m, (screen) => screen.join('').includes(LINE), `the echo of ${LINE}`)
  await m.clearBreaks()
  await m.watch(VC_REG, 'write')
  try {
    const idle = await m.waitFor({ cycles: STEP, stopped: true, run: 'turbo', timeoutMs: 30000 })
    m.assert(
      idle.stop?.kind !== 'watchpoint',
      'something wrote port A at the idle prompt, so the command pairs cannot be lined up',
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
        m.assert(bytes.length < LIMIT, `more than ${LIMIT} command writes, and still going`)
        continue
      }
      // A whole step with no command written: the statement is over if the
      // marker is on the screen. The bring-up clears the screen, so the only
      // thing left on it is the marker the line ends with.
      await m.pause()
      const screen = await m.screenText()
      if (screen.some((line) => line.includes('@') && !line.includes('CHR$'))) break
      if (++quiet === 24) m.fail(`${LINE} never printed its marker:\n${render(screen)}`)
    }

    m.assert(bytes.length % 2 === 0, `${bytes.length} command writes, an odd number`)
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
  const colour = await registerSevenWrites(m)
  m.assert(colour.length > 0, 'COLOR 2,5,12 never wrote register 7')
  m.assert(
    colour.every((value) => value === COLOUR),
    'COLOR 2,5,12 on a console that was not up yet showed a colour other than ' +
      `${hex(COLOUR)} on the way: ${list(colour)}`,
  )

  // The other half of the same reordering: the clear the bring-up does fills the
  // attributes from VID_PEN, so the pen has to be stored before it runs too.
  // Otherwise the screen comes up in the old pen under the new border.
  const attributes = await vram(m, ATTRIBUTES, NAME_TABLE_SIZE)
  const wrong = attributes.findIndex((byte) => byte !== PEN)
  m.assert(
    wrong < 0,
    `cell ${wrong} holds attribute ${hex(attributes[wrong] ?? 0)} after the console came up ` +
      `on COLOR 2,5,12, not ${hex(PEN)}`,
  )

  // And the console is up: VID_MODE says Text console intact, as the POKE's $00
  // did not survive the bring-up.
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE after the bring-up')
}
