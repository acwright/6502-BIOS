// The shape of the published API, independent of what is behind it.
//
// README § Kernal Jump Table: "All public Kernal entry points are accessed
// through stable 3-byte `jmp` slots", and § What Cartridges Can Rely On: "all
// entries remain stable across BIOS versions". Everything here follows from
// those two sentences. A cartridge built against $A048 calls that address
// because the slots before it were three bytes wide; insert a slot, drop one,
// or let a routine fall through without its `jmp` and every address after it
// shifts. Nothing in the ROM would notice — the build succeeds and BASIC and
// the Monitor keep working, because they call the labels — and every cartridge
// ever shipped breaks.
//
// The table is 85 slots, not 51. The 51 published ones are followed by 34
// reserved slots that all jump to a bare `rts`, and one pad byte, filling
// $A000-$A0FF exactly. That padding is not decoration: it is the mechanism that
// makes "stable across BIOS versions" true, because a new entry point appends
// into reserved space instead of pushing the table into the Kernal behind it.
// So it is asserted as carefully as the published half — including that calling
// a reserved slot returns cleanly, which is what happens when a cartridge built
// against a later BIOS runs on this one.
//
// Which routine sits at which published slot is the-jump-table-addresses-
// are-pinned's job. This case does not care about names.

export const name = 'the jump table is 85 three-byte JMP slots filling exactly one page'

const TABLE_START = 0xa000
const TABLE_END = 0xa100 // exclusive
const SLOT_SIZE = 3
const PUBLISHED = 51 // $A000..$A096 — the README's table
const RESERVED = 34 // $A099..$A0FE — `jmp UnimplementedStub`
const SLOTS = PUBLISHED + RESERVED

const hex = (n) => `$${n.toString(16).toUpperCase().padStart(4, '0')}`

export async function run(m) {
  const last = TABLE_START + SLOTS * SLOT_SIZE
  m.assertWord(last, TABLE_END - 1, 'the slots plus one pad byte fill the page')

  const instructions = await m.disasmRange(TABLE_START, last - 1)
  m.assertEqual(
    instructions.length,
    SLOTS,
    `the jump table decoded as ${instructions.length} instructions across ` +
      `${SLOTS * SLOT_SIZE} bytes — a slot is the wrong width, so every slot ` +
      'after it has moved',
  )

  const targets = []
  for (const [index, instruction] of instructions.entries()) {
    const expected = TABLE_START + index * SLOT_SIZE
    const where = `slot ${index} (${hex(expected)})`
    m.assertWord(instruction.address, expected, `${where}: address`)
    m.assertEqual(instruction.name, 'JMP', `${where}: opcode`)
    // Absolute, not indirect. An indirect JMP is also three bytes and also a
    // jump, but it reads its target from RAM — a vector, not a fixed entry
    // point, and not what the README promises.
    m.assertEqual(instruction.mode, 'ABS', `${where}: addressing mode`)
    m.assertEqual(instruction.bytes.length, SLOT_SIZE, `${where}: width`)

    // Read the target out of the instruction's own bytes rather than its
    // rendered operand text.
    const [, lo, hi] = instruction.bytes
    const target = lo | (hi << 8)
    targets.push(target)
    m.assert(
      target >= 0xa100 && target < 0xb800,
      `${where} jumps to ${hex(target)}, outside the Kernal routines at $A100-$B7FF`,
    )
  }

  // Every reserved slot goes to the same stub. One that did not would be an
  // entry point somebody added without documenting or pinning it.
  const stub = targets[PUBLISHED]
  for (let index = PUBLISHED; index < SLOTS; index++) {
    m.assertWord(
      targets[index],
      stub,
      `reserved slot ${index} (${hex(TABLE_START + index * SLOT_SIZE)}) does not ` +
        'go to the same stub as the rest. If it is a real entry point now, it ' +
        'belongs in tests/fixtures/jumptable.json and the README',
    )
  }

  // And that stub returns rather than crashing — which is the case of a
  // cartridge built against a later BIOS calling a slot this ROM has not
  // filled in yet.
  await m.call6502(TABLE_START + PUBLISHED * SLOT_SIZE)

  // A published slot must never point at it. This is the one that would go
  // unnoticed: the table keeps its shape, the addresses all still resolve, and
  // a documented routine has quietly become a no-op.
  for (let index = 0; index < PUBLISHED; index++) {
    m.assert(
      targets[index] !== stub,
      `published slot ${index} (${hex(TABLE_START + index * SLOT_SIZE)}) points at ` +
        'the unimplemented stub — a documented entry point that does nothing',
    )
  }
}
