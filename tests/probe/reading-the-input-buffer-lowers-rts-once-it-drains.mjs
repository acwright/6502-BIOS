// FINDINGS.md, "A paste at 19,200 baud overruns the input buffer": Irq raises
// RTS once the input buffer holds $F0 bytes, and only a read can lower it again.
// On the 6551, command register bits 3-2 of 00 are RTS high ("stop sending"),
// so $01 holds a flow-controlled terminal and $09 lets it go.
//
// Chrin used to be the only reader that wrote the register back, and BASIC's
// line input never calls Chrin: it reads through the ReadBuffer slot. A paste
// that filled the buffer left RTS high for good, and a terminal doing RTS/CTS
// stopped sending until reset. The hysteresis now lives in ReadBuffer, so every
// reader gets it: high while $B0 or more bytes are unread, low below that.
//
// Three claims. The slot itself, at the edges of the threshold. The same slot
// leaves the register alone while XModem has the receiver interrupt off, since
// XModem sets its own value there and drains the buffer mid-transfer. And the
// path the bug was on: BASIC's prompt reading a full buffer down to empty.
export const name = 'reading the input buffer lowers RTS once fewer than $B0 bytes are left'

// BIOS.inc
const READ_PTR = 0x00
const WRITE_PTR = 0x01
const INPUT_BUFFER = 0x0200
const SC_CMD = 0x9002

const ReadBuffer = 0xa009

const RTS_HIGH = 0x01 // what Irq writes at $F0
const RTS_LOW = 0x09 // InitSC's value, and ReadBuffer's below $B0
const XMODEM = 0x0b // receiver interrupt off, RTS low

// Stand the buffer at `count` unread bytes with RTS already raised, as Irq
// leaves it mid-paste. The bytes are $01, a control code BASIC's line input
// discards without echoing, so the prompt can drain them quickly.
async function fill(m, count, command = RTS_HIGH) {
  await m.pause()
  await m.fillMem(INPUT_BUFFER, 0x100, 0x01)
  await m.write(READ_PTR, [0x00, count])
  await m.write(SC_CMD, [command])
}

const cmd = (m) => m.peek(SC_CMD)

export async function run(m) {
  // The slot. $B2 unread: two reads leave $B1 then $B0, both still "mostly
  // full"; the third leaves $AF and lets the terminal go.
  await fill(m, 0xb2)
  await m.write(INPUT_BUFFER, [0x41, 0x42, 0x43])
  const expected = [
    [0x41, RTS_HIGH, 'with $B1 bytes left'],
    [0x42, RTS_HIGH, 'with $B0 bytes left'],
    [0x43, RTS_LOW, 'with $AF bytes left'],
  ]
  for (const [byte, command, left] of expected) {
    const { A } = await m.call6502(ReadBuffer)
    m.assertByte(A, byte, `the byte ReadBuffer returned ${left}`)
    m.assertByte(await cmd(m), command, `the ACIA command register after a read ${left}`)
  }

  // XModem's value survives a read, even one that drains the buffer.
  await fill(m, 0x01, XMODEM)
  await m.call6502(ReadBuffer)
  m.assertByte(await cmd(m), XMODEM, 'the command register after XModem drains the buffer')

  // BASIC's prompt. Before the fix this is the path that left RTS high.
  await fill(m, 0xf0)
  for (let i = 0; i < 20 && (await m.peek(READ_PTR)) !== (await m.peek(WRITE_PTR)); i++) {
    await m.waitFor({ cycles: 100000, run: 'turbo', timeoutMs: 60000 })
  }
  await m.pause()
  m.assertByte(await m.peek(READ_PTR), await m.peek(WRITE_PTR), 'the prompt read the buffer empty')
  m.assertByte(await cmd(m), RTS_LOW, 'the command register once the prompt drained the buffer')
}
