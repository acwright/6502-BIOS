// The three SID slots a cartridge calls, through their published addresses.
//
//   $A030  Beep          "Play a short beep tone" — README § Sound adds that it
//                        is "~475 Hz ... on voice 1"
//   $A033  SidPlayNote   "A=voice (0-2), X=freqLo, Y=freqHi"
//   $A036  SidSilence    "Silence all SID voices"
//
// Note the numbering, and that it is not the same as BASIC's `SOUND`: this is
// the chip's own indexing, 0-2 across three register blocks, and the README
// documents it that way. BASIC's statement is 1-3 after Commodore BASIC V3.5.
// The two cases sit next to each other so the difference is on the record.
//
// `SidSilence` is asserted as "gate off", not "registers zeroed". Zeroing the
// frequency stops the oscillator dead and leaves the envelope decaying a DC
// offset — an audible thump at the end of every note — which is why the ROM
// gates off and leaves the pitch alone, with a comment saying so. "Stop all
// voices" is the promise, and gate off is how a SID keeps it.

import { recordWrites } from '../lib/writes.mjs'

export const name = 'Beep, SidPlayNote and SidSilence drive the SID through their jump slots'

const Beep = 0xa030
const SidPlayNote = 0xa033
const SidSilence = 0xa036

const SID_BASE = 0x9800
const SID_END = 0x981c
const SID_MODE_VOL = 0x9818
const VOICE_STRIDE = 7
const FREQ_LO = 0
const FREQ_HI = 1
const CTRL = 4

const GATE = 0x01

const voiceBase = (voice) => SID_BASE + voice * VOICE_STRIDE

export async function run(m) {
  // SidPlayNote — the voice named in A, the pitch handed over in X and Y
  // verbatim, since the caller has already done the arithmetic.
  for (const voice of [0, 1, 2]) {
    const base = voiceBase(voice)
    const writes = await recordWrites(m, {
      start: SID_BASE,
      end: SID_END,
      max: 12,
      until: (w) => w.some((x) => x.address === base + CTRL && (x.value & GATE) !== 0),
      body: async () => {
        await m.plantCall(SidPlayNote, { A: voice, X: 0x34, Y: 0x12 })
        await m.start()
      },
    })

    const lo = writes.find((w) => w.address === base + FREQ_LO)
    const hi = writes.find((w) => w.address === base + FREQ_HI)
    m.assert(lo, `SidPlayNote voice ${voice} never wrote its frequency low byte`)
    m.assert(hi, `SidPlayNote voice ${voice} never wrote its frequency high byte`)
    m.assertByte(lo.value, 0x34, `voice ${voice}'s frequency low byte`)
    m.assertByte(hi.value, 0x12, `voice ${voice}'s frequency high byte`)

    const gate = writes.findLast((w) => w.address === base + CTRL)
    m.assert(gate, `SidPlayNote voice ${voice} never touched its control register`)
    m.assert(
      (gate.value & GATE) !== 0,
      `SidPlayNote voice ${voice} left the gate bit clear in ` +
        `$${gate.value.toString(16).toUpperCase()} — the note never starts`,
    )
  }

  // SidSilence — every voice, and nothing but the control registers.
  const silence = await recordWrites(m, {
    start: SID_BASE,
    end: SID_END,
    expect: 3,
    body: async () => {
      await m.plantCall(SidSilence)
      await m.start()
    },
  })
  for (const [index, write] of silence.entries()) {
    const expected = voiceBase(index) + CTRL
    m.assertWord(write.address, expected, `SidSilence's write ${index}`)
    m.assert(
      (write.value & GATE) === 0,
      `SidSilence left voice ${index}'s gate bit set in ` +
        `$${write.value.toString(16).toUpperCase()}`,
    )
  }

  // Beep — the first voice, gated on and then off again. The routine holds the
  // tone in a delay loop and silences it itself, so both edges are inside the
  // one call.
  const beep = await recordWrites(m, {
    start: SID_BASE,
    end: SID_END,
    max: 16,
    until: (w) => w.filter((x) => x.address === voiceBase(0) + CTRL).length >= 2,
    body: async () => {
      await m.plantCall(Beep)
      await m.start()
    },
  })
  const control = beep.filter((w) => w.address === voiceBase(0) + CTRL)
  m.assert(
    (control[0].value & GATE) !== 0,
    'Beep never gated voice 0 on — there is no tone',
  )
  m.assert(
    (control.at(-1).value & GATE) === 0,
    'Beep left voice 0 gated on — the tone never stops',
  )
  m.assert(
    beep.some((w) => w.address === voiceBase(0) + FREQ_HI && w.value !== 0),
    'Beep never set a pitch on voice 0',
  )

  // Nothing here should have disturbed the master volume, which is the user's
  // setting and not a playback routine's to change. The watchpoint covers it,
  // so a write would be in one of these traces.
  m.assert(
    ![...silence, ...beep].some((w) => w.address === SID_MODE_VOL),
    'playing a note or silencing the chip also changed the master volume',
  )
}
