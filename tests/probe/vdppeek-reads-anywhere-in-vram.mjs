// VDP-PLAN §6, $A0BD: `VdpPeek` reads one byte from any of the 64 KB — the
// address command prefetches it, as SPEC §4 says — and leaves `VBANK` at 0.

import { vdpCall, VdpPeek } from '../lib/vdp.mjs'

export const name = 'VdpPeek reads a byte from every VRAM bank and leaves VBANK at 0'
export const profile = 'video'

const VBANK = 0x08

export async function run(m) {
  const addresses = [0x3ffe, 0x4000, 0x9abc, 0xffff]
  for (const [i, address] of addresses.entries()) {
    await m.write(address, [0x3c + i], 'vram')
  }
  for (const [i, address] of addresses.entries()) {
    const where = `$${address.toString(16).toUpperCase()}`
    const r = await vdpCall(m, VdpPeek, { A: 0xee, X: address & 0xff, Y: address >> 8 })
    m.assert(!r.carry, `carry set peeking ${where}`)
    m.assertByte(r.A, 0x3c + i, `the byte at ${where}`)
    m.assertByte((await m.videoRegisters())[VBANK], 0, `VBANK after peeking ${where}`)
  }
}
