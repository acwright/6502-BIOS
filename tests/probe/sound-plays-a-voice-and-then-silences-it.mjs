// README § Sound: "`SOUND <voice>, <freq>, <dur>` — Play a tone on voice 1–3 at
// `freq` Hz for `dur` centiseconds, then silence".
//
// Voices are numbered from 1 here, and from 0 at the `SidPlayNote` slot
// ($A033) this wraps. That is deliberate rather than an accident: `SOUND` is
// modelled on Commodore BASIC V3.5, whose `SOUND voice#, frequency, duration`
// takes voice# 1-3, and the Kernal slot is an assembly-language API where 0-2
// indexes the chip's own three register blocks. The README used to say 0-2 for
// both and was corrected.
//
// Four claims in the sentence, and each is asserted separately:
//
//   the *named* voice     — a voice's registers are seven bytes apart, so an
//                           off-by-one in the voice select is a whole block
//   at `freq`             — the frequency registers are written, and a higher
//                           note gives a higher divisor
//   then silence          — the same voice's gate is cleared afterwards
//   and only that voice   — no other voice's frequency is touched
//
// What is deliberately *not* asserted is the ADSR envelope the ROM picks, or
// how many writes it takes. The README promises a tone, not a particular
// attack. Pinning those would make every envelope tweak a test failure, which
// is how a suite teaches people to stop running it.

import { recordWrites } from '../lib/writes.mjs'

export const name = 'SOUND plays the named voice at a frequency and then silences it'

// BIOS.inc: three voices, seven registers each, from $9800.
const SID_BASE = 0x9800
const SID_END = 0x981c
const VOICE_STRIDE = 7
const FREQ_LO = 0
const FREQ_HI = 1
const CTRL = 4

const GATE = 0x01 // SID_CTRL_GATE — the bit that starts and stops the note

// SOUND's voice 1 is the chip's first register block.
const voiceBase = (voice) => SID_BASE + (voice - 1) * VOICE_STRIDE

// Play one note and collect writes until this voice's gate has gone on and then
// off again — which is the whole of what the README promises, start to finish.
async function play(m, voice, frequency) {
  const control = voiceBase(voice) + CTRL
  let gated = false
  return recordWrites(m, {
    start: SID_BASE,
    end: SID_END,
    max: 24,
    settle: /^OK/,
    until: (writes) => {
      const last = writes.at(-1)
      if (!last || last.address !== control) return false
      if ((last.value & GATE) !== 0) gated = true
      return gated && (last.value & GATE) === 0
    },
    // One centisecond, so the note's duration costs the suite nothing. The
    // silence still has to arrive, which is the point.
    body: () => m.serialWrite(`SOUND ${voice},${frequency},1\r`),
  })
}

export async function run(m) {
  for (const voice of [1, 2, 3]) {
    const base = voiceBase(voice)
    const writes = await play(m, voice, 440)

    const lo = writes.find((w) => w.address === base + FREQ_LO)
    const hi = writes.find((w) => w.address === base + FREQ_HI)
    m.assert(lo && hi, `SOUND ${voice},440,1 never set voice ${voice}'s frequency registers`)

    const gateOn = writes.find((w) => w.address === base + CTRL && (w.value & GATE) !== 0)
    m.assert(gateOn, `SOUND ${voice},440,1 never gated voice ${voice} on`)

    const gateOff = writes.findLast((w) => w.address === base + CTRL && (w.value & GATE) === 0)
    m.assert(gateOff, `SOUND ${voice},440,1 never silenced voice ${voice} again`)

    // No other voice's pitch was disturbed. Silencing the others is fine — the
    // Kernal's silence routine gates all three — but changing what they would
    // play is not.
    for (const other of [1, 2, 3].filter((v) => v !== voice)) {
      const otherBase = voiceBase(other)
      const stray = writes.find(
        (w) => w.address === otherBase + FREQ_LO || w.address === otherBase + FREQ_HI,
      )
      m.assert(
        !stray,
        `SOUND ${voice},440,1 also wrote voice ${other}'s frequency register ` +
          `$${stray?.address.toString(16).toUpperCase()}`,
      )
    }
  }

  // A higher note is a bigger divisor on this chip, so the two frequencies must
  // not come out the same — which is what a SOUND that ignored its argument, or
  // clamped it, would do.
  const low = await play(m, 1, 110)
  const high = await play(m, 1, 1760)
  const pitch = (writes) => {
    const lo = writes.find((w) => w.address === SID_BASE + FREQ_LO)?.value ?? 0
    const hi = writes.find((w) => w.address === SID_BASE + FREQ_HI)?.value ?? 0
    return lo | (hi << 8)
  }
  m.assert(
    pitch(high) > pitch(low),
    `1760 Hz gave divisor ${pitch(high)} and 110 Hz gave ${pitch(low)} — SOUND is ` +
      'not using its frequency argument',
  )
}
