// VDP-PLAN §6, $A0BA: `VdpPoke` writes one byte at any of the 64 KB, one
// address per bank here, and leaves `VBANK` at 0 for the console.

import { vdpCall, VdpPoke } from '../lib/vdp.mjs'

export const name = 'VdpPoke writes a byte in every VRAM bank and leaves VBANK at 0'
export const profile = 'video'

const VBANK = 0x08

export async function run(m) {
  const addresses = [0x2345, 0x7fff, 0xa001, 0xfffd]
  for (const [i, address] of addresses.entries()) {
    await m.write(address, [0x00, 0x00, 0x00], 'vram')
    const value = 0x81 + i
    const r = await vdpCall(m, VdpPoke, { A: value, X: address & 0xff, Y: address >> 8 })
    const where = `$${address.toString(16).toUpperCase()}`
    m.assert(!r.carry, `carry set poking ${where}`)
    m.assertBytes(await m.read(address, 3, 'vram'), [value, 0x00, 0x00], `VRAM at ${where} and the two bytes after it`)
    m.assertByte((await m.videoRegisters())[VBANK], 0, `VBANK after poking ${where}`)
  }
}
