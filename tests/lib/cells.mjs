// The console's cells as VRAM holds them: a name byte per cell in the 960 bytes
// at $0000, and the attribute (fg<<4 | bg) for the same cell $0400 further on.
// Physical order — the Kernal scrolls by moving the display origin, so a cell's
// place in the table is not its place on the screen. `screen.text` is for that.

export const NAME_TABLE_SIZE = 960
export const ATTRIBUTES = 0x0400

// BIOS.inc
export const VID_PEN = 0x0391
export const VID_TOP = 0x0392
export const VID_MODE = 0x0393

// Registers, SPEC §5.
export const REG_VMODE = 0x0d
export const REG_L0SCRY = 0x14

export async function vram(m, address, length) {
  return m.read(address, length, 'vram')
}

// The one cell holding `code`, by its index in the name table. More than one is
// a broken case, not a lucky one: the assertion would be about whichever came
// first.
export function findCell(m, names, code, what) {
  const cells = []
  names.forEach((byte, i) => byte === code && cells.push(i))
  m.assertEqual(cells.length, 1, `cells holding $${code.toString(16).toUpperCase()} ${what}`)
  return cells[0]
}
