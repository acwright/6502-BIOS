// FINDINGS.md, "A paste at 19,200 baud overruns the input buffer": Irq raises
// RTS once the input buffer fills, and only a read can lower it again. On the
// 6551, command register bits 3-2 of 00 are RTS high ("stop sending"), so $01
// holds a flow-controlled terminal and $09 lets it go.
//
// Chrin used to be the only reader that wrote the register back, and BASIC's
// line input never calls Chrin: it reads through the ReadBuffer slot. A paste
// that filled the buffer left RTS high for good, and a terminal doing RTS/CTS
// stopped sending until reset. The decision now lives in one routine, ScRts,
// which every reader reaches through ReadBuffer: RTS up at $C0 unread bytes,
// down below $80, and left alone between the two.
//
// The marks moved down from $F0/$B0 when SerialChrout started dropping RTS
// around each byte it sends (see the Chrout probe next door): every one of those
// releases lets a byte or two in at 19,200 baud, so the buffer needs more room
// above the high mark than $10 bytes.
//
// Four claims. Both edges of the band, and the band itself, through the slot.
// The same slot leaves the register alone while XModem has the receiver
// interrupt off, since XModem sets its own value there and drains the buffer
// mid-transfer. And the path the bug was on: BASIC's prompt reading a full
// buffer down to empty.
export const name = 'reading the input buffer lowers RTS once fewer than $80 bytes are left'

// BIOS.inc
const READ_PTR = 0x00
const WRITE_PTR = 0x01
const INPUT_BUFFER = 0x0200
const SC_CMD = 0x9002

const ReadBuffer = 0xa009

const RTS_HIGH = 0x01 // SC_CMD_RTS_HIGH, what ScRts writes at $C0 unread bytes
const RTS_LOW = 0x09 // SC_CMD_RTS_LOW: InitSC's value, and ScRts's below $80
const XMODEM = 0x0b // SC_CMD_XMODEM: receiver interrupt off, RTS low

// Stand the buffer at `count` unread bytes with the command register at
// `command`, as Irq leaves it mid-paste. The bytes are $01, a control code
// BASIC's line input discards without echoing, so the prompt can drain them
// quickly.
async function fill(m, count, command = RTS_HIGH) {
  await m.pause()
  await m.fillMem(INPUT_BUFFER, 0x100, 0x01)
  await m.write(READ_PTR, [0x00, count])
  await m.write(SC_CMD, [command])
}

const cmd = (m) => m.peek(SC_CMD)

// Read `bytes.length` characters out of the buffer, checking each one and the
// command register it left behind.
async function reads(m, expected) {
  for (const [byte, command, left] of expected) {
    const { A } = await m.call6502(ReadBuffer)
    m.assertByte(A, byte, `the byte ReadBuffer returned ${left}`)
    m.assertByte(await cmd(m), command, `the ACIA command register after a read ${left}`)
  }
}

export async function run(m) {
  // The low mark. $82 unread: two reads leave $81 then $80, both still "mostly
  // full"; the third leaves $7F and lets the terminal go.
  await fill(m, 0x82)
  await m.write(INPUT_BUFFER, [0x41, 0x42, 0x43])
  await reads(m, [
    [0x41, RTS_HIGH, 'with $81 bytes left'],
    [0x42, RTS_HIGH, 'with $80 bytes left'],
    [0x43, RTS_LOW, 'with $7F bytes left'],
  ])

  // The high mark, through the same routine: a read that leaves $C0 unread is
  // still a buffer that should stop the terminal, and one byte less is not.
  await fill(m, 0xc0, RTS_LOW)
  await m.write(INPUT_BUFFER, [0x44])
  await reads(m, [[0x44, RTS_LOW, 'with $BF bytes left and RTS already down']])
  await fill(m, 0xc1, RTS_LOW)
  await m.write(INPUT_BUFFER, [0x45])
  await reads(m, [[0x45, RTS_HIGH, 'with $C0 bytes left']])

  // And the band between them is hysteresis, not a threshold: a read inside it
  // leaves the pin where it found it, whichever way round that is.
  await fill(m, 0xa0, RTS_LOW)
  await reads(m, [[0x01, RTS_LOW, 'inside the band with RTS down']])
  await fill(m, 0xa0, RTS_HIGH)
  await reads(m, [[0x01, RTS_HIGH, 'inside the band with RTS up']])

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
