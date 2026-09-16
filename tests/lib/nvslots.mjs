// The NVRAM save slots, as a cartridge author sees them from the README.
//
// Everything here is written from the published format rather than read out of
// the ROM: the checksum below is the README's definition, so a case that checks
// a slot the Kernal wrote against it is checking the ROM against the document.

export const NvStat = 0xa09f
export const NvRead = 0xa0a2
export const NvWrite = 0xa0a5
export const NvErase = 0xa0a8
export const NvFind = 0xa0ab
export const NvFormat = 0xa0ae
export const RtcReadNVRAM = 0xa066

export const NV_ID = 0x0390
export const NV_SLOTS = 16
export const NV_SLOT_SIZE = 16
export const NV_SLOT_DATA = 14
export const NV_CK_SEED = 0xa6

export const NV_EMPTY = 0
export const NV_VALID = 1
export const NV_BAD = 2

export const RTC_CTRL_B = 0x880f
export const RTC_RAM_ADDR = 0x8810
export const TE = 0x80
export const BME = 0x20

export const FLAG_C = 0x01
export const FLAG_I = 0x04
export const FLAG_D = 0x08

// Buffers for the calls to copy from and into. Clear of the call stub at $7F00,
// and of the string heap, which is empty at a fresh prompt.
export const SRC = 0x7e00
export const DEST = 0x7e40

// README § NVRAM Save Slots: seeded $A6, then rotate left and EOR each of the
// owner ID and the 14 payload bytes.
export function checksum(id, payload) {
  let ck = NV_CK_SEED
  for (const b of [id, ...payload]) {
    ck = (((ck << 1) | (ck >> 7)) & 0xff) ^ b
  }
  return ck
}

// The 16 bytes of a slot holding `payload` for owner `id`.
export function slotBytes(id, payload) {
  if (payload.length !== NV_SLOT_DATA) throw new Error(`a payload is ${NV_SLOT_DATA} bytes`)
  return [id, checksum(id, payload), ...payload]
}

// A payload unlike any other slot's, so a copy from the wrong slot shows.
export function payloadFor(slot) {
  return Array.from({ length: NV_SLOT_DATA }, (_, i) => (slot * 29 + i * 37 + 0x11) & 0xff)
}

// Every NVRAM byte different from its neighbours and from any payload above, so
// a stray write anywhere in the 256 is visible.
export const BACKGROUND = Array.from({ length: 256 }, (_, i) => (i * 101 + 0x5b) & 0xff)

export const hex = (n, width = 2) => `$${n.toString(16).toUpperCase().padStart(width, '0')}`

// JSR into a slot with P set as the caller would have it, and hand back the
// registers with the carry broken out. The machine is paused before P is set,
// or the running interpreter would overwrite it before the stub ran; and P is
// put back afterwards, since call6502 restores the registers it found, which
// here include the flags this call chose.
export async function callNv(m, address, { A = 0, X = 0, Y = 0, P = null } = {}) {
  let saved = null
  if (P != null) {
    await m.pause()
    saved = await m.regs()
    await m.setRegs({ P })
  }
  const registers = await m.call6502(address, { A, X, Y })
  if (saved) await m.setRegs({ P: saved.P })
  return { ...registers, carry: (registers.P & FLAG_C) !== 0 }
}

export const lo = (address) => address & 0xff
export const hi = (address) => (address >> 8) & 0xff
