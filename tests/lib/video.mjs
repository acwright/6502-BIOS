// Driving a machine whose only console is a screen.
//
// The `video` profile has no serial port to write to and nothing to read back,
// so the send/expect loop the rest of the suite is built on does not exist
// here. Input goes in through the keyboard matrix and output comes back as the
// decoded name table, and neither has a cursor or a stream position — there is
// only "what is on the screen now".
//
// That makes the completion condition the interesting part. `wait.for {serial}`
// blocks until the machine has said something; there is no equivalent, so every
// wait here is a bounded advance of *emulated* time with a look at the screen
// between steps. Bounded and emulated, so it is still deterministic and still
// never a host sleep — but the condition has to be supplied by the case, since
// only the case knows what the screen is supposed to end up saying.

import { AssertionError } from './assert.mjs'

export const COLUMNS = 40
export const ROWS = 24

// BIOS.inc — the Kernal's own idea of where the cursor is, which is RAM and so
// readable directly. Better than inferring it from the screen: a cursor that
// moved without anything being drawn is invisible on a name table.
export const VID_CURSOR_X = 0x0307
export const VID_CURSOR_Y = 0x0308

// The keyboard has no flow control, so `input.type` paces keystrokes in
// emulated cycles. 400 is fast enough that a line costs a fraction of the wait
// below and slow enough that every make/break pair lands between two BIOS
// scans — verified up to this rate; 20, the emulator's default, works too and
// costs fifty times the emulated time.
const CPS = 400

// One step of the look-and-wait loop. A BASIC line at this typing rate is a few
// tens of thousands of cycles; half a million per step means the common case
// finishes in one.
const STEP_CYCLES = 500000
const STEPS = 24

export async function screen(m) {
  return m.screenText()
}

export async function cursor(m) {
  return { column: await m.peek(VID_CURSOR_X), row: await m.peek(VID_CURSOR_Y) }
}

// Type a line, Enter included. Does not wait for anything — pair it with
// `awaitScreen`, which is where the case says what it is waiting for.
export async function typeLine(m, text) {
  await m.start()
  return m.type(`${text}\r`, CPS)
}

// Advance emulated time in bounded steps until the screen satisfies `predicate`,
// and hand back the screen that did. `what` is what the case was waiting for,
// and it is required: the failure message is the whole diagnostic here, since a
// screen that never arrived leaves nothing else to look at.
// Every read is taken with the machine **paused**, and that is not tidiness. A
// scroll copies the name table a row at a time, and a read taken while one is
// in flight returns a torn frame — in practice a screen with one row appearing
// twice, which looks exactly like a scroll bug and comes and goes with how the
// host was scheduled. Pausing first is what makes a frame a frame.
//
// The machine is left paused on the way out. `typeLine` resumes it, and a case
// that wants to read memory alongside the screen — the cursor variables, say —
// gets a consistent view of both for free.
// The predicate has to hold on **two consecutive** frames, which is the other
// half of the same problem. A predicate like "row 24 has been printed" is
// satisfied the moment that row appears — while the CRLF after it, the scroll
// that CRLF causes, and the prompt that follows are all still to come. The
// frame is coherent and it is not the final one, so a case reading it sees a
// screen part-way through moving. Requiring the screen to stop changing is what
// makes "the statement has finished" observable without knowing what the last
// thing it draws will be.
export async function awaitScreen(m, predicate, what) {
  let lines = null
  let previous = null
  for (let step = 0; step < STEPS; step++) {
    await m.waitFor({ cycles: STEP_CYCLES, run: 'turbo', timeoutMs: 30000 })
    await m.pause()
    lines = await m.screenText()
    const frame = lines.join('\n')
    if (frame === previous && predicate(lines)) return lines
    previous = frame
  }
  throw new AssertionError(
    `the screen never settled ${what}, in ${STEPS * STEP_CYCLES} cycles. It reads:\n` +
      render(lines),
  )
}

// Type a line and wait for the screen to say something about it.
export async function run(m, text, predicate, what) {
  await typeLine(m, text)
  return awaitScreen(m, predicate, what)
}

// Type a line whose only effect is off-screen — CLS's cursor reset, a LOCATE, a
// COLOR — by following it with a marker that *is* visible, and waiting for
// that. Without a marker there is nothing to wait for and the case would be
// asserting against a screen the machine had not finished drawing.
export async function runQuietly(m, text, marker = '.') {
  await typeLine(m, `${text} : PRINT "${marker}";`)
  return awaitScreen(
    m,
    (lines) => lines.some((line) => line.includes(marker)),
    `showed the marker ${JSON.stringify(marker)} after ${JSON.stringify(text)}`,
  )
}

// The screen with its row numbers and its trailing spaces visible, for a
// failure message. A 40x24 grid of mostly blanks is unreadable otherwise.
export function render(lines) {
  if (!lines) return '    (never read)'
  return lines
    .map((line, row) => `    ${String(row).padStart(2)} |${line}|`)
    .join('\n')
}

// The cell-level assertion the LOCATE and scrolling cases are made of.
export function assertAt(m, lines, row, column, text, what = 'the screen') {
  const line = lines[row]
  if (line === undefined) {
    m.fail(`${what}: row ${row} is off a ${lines.length}-row screen`)
  }
  const found = line.slice(column, column + text.length)
  if (found !== text) {
    m.fail(
      `${what}: expected ${JSON.stringify(text)} at row ${row}, column ${column}, ` +
        `found ${JSON.stringify(found)}. The screen reads:\n${render(lines)}`,
    )
  }
}

export function assertBlank(m, lines, what = 'the screen') {
  const dirty = lines.findIndex((line) => line.trim() !== '')
  if (dirty >= 0) {
    m.fail(`${what}: row ${dirty} is not blank. The screen reads:\n${render(lines)}`)
  }
}
