// The PICOVDP Kernal entries ($A0B1-$A0D5), for the probes that call them.
//
// Every entry reports "no card" or "bad argument" in carry, so a call's
// registers are handed back with the flag broken out.

export const VdpInfo = 0xa0b1
export const VdpWriteReg = 0xa0b4
export const VdpSetMode = 0xa0b7
export const VdpPoke = 0xa0ba
export const VdpPeek = 0xa0bd
export const VdpSetPalette = 0xa0c0
export const WaitVBlank = 0xa0c3
export const VdpLoadFile = 0xa0c6
export const VdpLoadFont = 0xa0c9
export const VdpSprite = 0xa0cc
export const VdpSetScroll = 0xa0cf
export const VdpLayer = 0xa0d2
export const VdpStatus = 0xa0d5

// BIOS.inc
export const VDP_FW = 0x0394
export const VDP_CAPS = 0x0395
export const VDP_L0CTRL_SHADOW = 0x0396
export const VDP_L1CTRL_SHADOW = 0x0397
export const VDP_P0 = 0x0398

export async function vdpCall(m, address, regs = {}, options = {}) {
  const r = await m.call6502(address, { ...regs, ...options })
  return { ...r, carry: (r.P & 0x01) !== 0 }
}
