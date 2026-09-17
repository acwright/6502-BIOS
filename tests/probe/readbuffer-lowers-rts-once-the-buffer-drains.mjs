// Flow control has two halves. `Irq` raises RTS — writes $01 to the ACIA's
// command register — once the input buffer holds $F0 bytes, and something has
// to lower it again once the buffer has room. 1.6 first shipped with that second
// half in `Chrin` alone, but BASIC reads its line input, INKEY and the break
// check through `ReadBuffer`, which never touched the register. So a paste of
// more than about 240 bytes into BASIC left RTS high for good, and a terminal
// honouring RTS/CTS stopped sending.
//
// Every reader goes through `ReadBuffer`, so that is where RTS is lowered: high
// while $B0 or more bytes are still unread, low below that.
//
// The buffer is set up by writing its two pointers directly rather than by
// pushing bytes, which is what lets a case start from "nearly full" without two
// hundred calls. Nothing runs between the calls — `call6502` pauses the machine
// and runs only its stub — so the IRQ handler cannot move either pointer.
//
// XModem is the exception the release has to respect. It turns the receiver
// interrupt off, writes the command register itself and drains stale bytes
// through `ReadBuffer`; writing $09 over its $0B would turn the receiver
// interrupt back on in the middle of a transfer.

export const name = 'ReadBuffer lowers RTS once the input buffer drains, and leaves XModem alone'
export const profile = 'serial'

const READ_PTR = 0x00
const WRITE_PTR = 0x01
const SC_CMD = 0x9002

const READ_BUFFER = 0xa009 // the published slot

const RTS_HIGH = 0x01 // what Irq writes when the buffer is almost full
const RTS_LOW = 0x09 // what InitSC writes
const XMODEM = 0x0b // what XModemLoad writes: receiver interrupt off

// Leave `unread` bytes waiting, with the command register at `cmd`, then read
// one through the jump slot and hand back what the register holds afterwards.
async function readWith(m, { unread, cmd }) {
  await m.pause()
  await m.write(READ_PTR, [0x00])
  await m.write(WRITE_PTR, [unread])
  await m.write(SC_CMD, [cmd])
  m.assertByte(await m.peek(SC_CMD), cmd, 'the command register before the read')
  await m.call6502(READ_BUFFER)
  return m.peek(SC_CMD)
}

export async function run(m) {
  m.assertByte(
    await readWith(m, { unread: 0x10, cmd: RTS_HIGH }),
    RTS_LOW,
    'RTS after a read that leaves $0F bytes, with RTS raised — it was never lowered',
  )
  m.assertByte(
    await readWith(m, { unread: 0xb0, cmd: RTS_HIGH }),
    RTS_LOW,
    'RTS after a read that leaves $AF bytes, just under the threshold',
  )
  m.assertByte(
    await readWith(m, { unread: 0xb1, cmd: RTS_HIGH }),
    RTS_HIGH,
    'RTS after a read that still leaves $B0 bytes — it should stay raised',
  )
  m.assertByte(
    await readWith(m, { unread: 0x10, cmd: XMODEM }),
    XMODEM,
    'the command register while XModem owns the receiver',
  )

  // And from the prompt, the way the bug was found: raise RTS as Irq would, type
  // a line, and BASIC's own reads have to lower it.
  await m.write(READ_PTR, [0x00])
  await m.write(WRITE_PTR, [0x00])
  await m.write(SC_CMD, [RTS_HIGH])
  const { output } = await m.send('PRINT 12345+1\r', '^OK')
  m.assertMatch(output, /^ 12346$/m, 'the typed line ran')
  m.assertByte(await m.peek(SC_CMD), RTS_LOW, 'RTS after BASIC has read a typed line')
}
