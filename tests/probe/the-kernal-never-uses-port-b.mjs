// VDP-PLAN §4.3, ports: every Kernal VDP access uses port A, and nothing in the
// ROM touches $9C02/$9C03.
//
// Port B is the interrupt handler's (SPEC §4): a handler on port B cannot land
// between the two writes of a foreground command on port A, and acknowledges
// through STAT1 without clearing the STAT0 flags foreground code polls. That
// only holds if the ROM leaves port B alone, and a stray write there would
// work perfectly well in every test that reads the screen — the pair addresses
// the same VRAM and registers. So the claim is made on the bus: a write
// watchpoint on port B across a boot, a screen's worth of scrolling, CLS and
// COLOR with a border, and a call to each of the 13 VDP entries. Later VDP
// statements belong on this list as they land.

import * as vdp from '../lib/vdp.mjs'

export const name = 'the Kernal never writes port B'
export const profile = 'video'

const PORT_B = 0x9c02
const PORT_B_END = 0x9c03
const CPS = 400
const STEP = 500000

// Advance emulated time until the screen shows `until` and stops changing,
// failing the moment anything writes port B.
//
// The first wait does not pass `run`. The machine is already running in turbo,
// and it may have made the write — and stopped on it — before this call
// arrives; a `run` would resume straight past that stop and lose it, which is
// the trap tests/lib/writes.mjs describes. Every later wait follows a pause, so
// it has to resume.
async function runWatched(m, text, until, what) {
  await m.start()
  if (text) await m.type(`${text}\r`, CPS)
  let previous = null
  for (let step = 0; step < 24; step++) {
    const wait = { cycles: STEP, stopped: true, timeoutMs: 30000 }
    const result = await m.waitFor(step === 0 ? wait : { ...wait, run: 'turbo' })
    if (result.stop?.kind === 'watchpoint') {
      const regs = await m.regs()
      m.fail(
        `${what}: port B was written at $${result.stop.address.toString(16).toUpperCase()}, ` +
          `PC $${regs.PC.toString(16).toUpperCase()}`,
      )
    }
    await m.pause()
    const frame = (await m.screenText()).join('\n')
    if (frame === previous && until(frame)) return
    previous = frame
  }
  m.fail(`${what}: the screen never settled`)
}

export async function run(m) {
  await m.reset(true)
  await m.clearBreaks()
  await m.watch(PORT_B, 'write', { end: PORT_B_END })
  try {
    await runWatched(m, null, (f) => /^OK/m.test(f), 'booting to the prompt')
    await runWatched(m, 'FOR I=1 TO 30 : PRINT "LINE";I : NEXT', (f) => /^LINE 30/m.test(f), 'printing 30 lines')
    await runWatched(m, 'COLOR 6,15,4 : CLS : PRINT "DONE"', (f) => /^DONE/m.test(f), 'COLOR and CLS')

    // The entries, each called through its slot with the watchpoint armed. A
    // stop on the watchpoint instead of the return breakpoint is a port B write.
    await m.write(0x7e00, [...Buffer.from('NOPE.BIN', 'ascii'), 0])
    await m.write(0x0002, [0x00, 0x7e])
    for (const [label, address, regs] of [
      ['VdpInfo', vdp.VdpInfo, {}],
      ['VdpWriteReg', vdp.VdpWriteReg, { A: 0x44, X: 0x07 }],
      ['VdpSetMode', vdp.VdpSetMode, { A: 1 }],
      ['VdpPoke', vdp.VdpPoke, { A: 0x55, X: 0x00, Y: 0xc0 }],
      ['VdpPeek', vdp.VdpPeek, { X: 0x00, Y: 0xc0 }],
      ['VdpSetPalette', vdp.VdpSetPalette, { X: 1, A: 0x00, Y: 0x00 }],
      ['WaitVBlank', vdp.WaitVBlank, {}],
      ['VdpLoadFile', vdp.VdpLoadFile, {}],
      ['VdpLoadFont', vdp.VdpLoadFont, { A: 0 }],
      ['VdpSprite', vdp.VdpSprite, { X: 3 }],
      ['VdpSetScroll', vdp.VdpSetScroll, { X: 1, A: 8, Y: 8 }],
      ['VdpLayer', vdp.VdpLayer, { X: 1, A: 1 }],
      ['VdpStatus', vdp.VdpStatus, { X: 4 }],
    ]) {
      const returnTo = await m.plantCall(address, regs)
      const result = await m.runTo(returnTo, 20000)
      if (result.stop?.kind !== 'breakpoint') {
        m.fail(`${label}: stopped on ${JSON.stringify(result.stop)} at PC $${result.registers.PC.toString(16).toUpperCase()}`)
      }
    }
  } finally {
    await m.clearBreaks()
  }
}
