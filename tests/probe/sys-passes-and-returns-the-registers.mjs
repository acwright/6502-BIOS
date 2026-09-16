// VDP-PLAN §5 Phase 4, decision 4: `SYS addr[,a[,x[,y]]]` loads A, X and Y,
// calls with decimal mode and the interrupt mask clear, and leaves what the
// routine returns in A, X, Y and P at `BRK_A/X/Y/P` ($0313/$0314/$0315/$0310).
//
// The routine records what it was called with — the three registers and its
// own P, pushed and pulled — and returns different values with carry set, so
// every readback is distinguishable from the argument that went in.

export const name = 'SYS hands a routine A, X and Y with D and I clear, and saves what it returns'

const CODE = 0x1000
const SEEN = 0x1100
const BRK_P = 0x0310
const BRK_A = 0x0313

const P_C = 0x01
const P_Z = 0x02
const P_I = 0x04
const P_D = 0x08
const P_N = 0x80

export async function run(m) {
  await m.write(CODE, [
    0x8d, 0x00, 0x11, // STA $1100
    0x8e, 0x01, 0x11, // STX $1101
    0x8c, 0x02, 0x11, // STY $1102
    0x08, // PHP
    0x68, // PLA
    0x8d, 0x03, 0x11, // STA $1103
    0xf8, // SED   — decimal mode on the way out, which BASIC must undo
    0xa9, 0x9a, // LDA #$9A
    0xa2, 0xbc, // LDX #$BC
    0xa0, 0x80, // LDY #$80  (N set, Z clear)
    0x38, // SEC
    0x60, // RTS
  ])
  await m.fillMem(SEEN, 4, 0xee)

  await m.send('SYS 4096, 18, 52, 86\r', /^OK$/)

  m.assertBytes((await m.read(SEEN, 3)), [18, 52, 86], 'A, X and Y inside the routine')
  const inside = await m.peek(SEEN + 3)
  m.assert((inside & (P_D | P_I)) === 0, `P inside the routine has D or I set: $${inside.toString(16)}`)

  m.assertBytes(await m.read(BRK_A, 3), [0x9a, 0xbc, 0x80], 'BRK_A, BRK_X, BRK_Y after the call')
  const p = await m.peek(BRK_P)
  m.assert((p & P_C) !== 0, `BRK_P's carry: $${p.toString(16)}`)
  m.assert((p & P_N) !== 0 && (p & P_Z) === 0, `BRK_P's N and Z from LDY #$80: $${p.toString(16)}`)
  m.assert((p & P_D) !== 0, `BRK_P is P as returned, decimal mode included: $${p.toString(16)}`)

  // And BASIC is not left in decimal mode by the routine that was.
  const { output } = await m.send('PRINT 9 + 1\r', /^OK$/)
  m.assertMatch(output, /^ 10\s*$/m, 'arithmetic after a routine returned with D set')
}
