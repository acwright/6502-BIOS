// Flow control has two halves. `Irq` raises RTS — writes $01 to the ACIA's
// command register — once the input buffer holds $F0 bytes, and something has
// to lower it again once the buffer has room. 1.6 first shipped with that second
// half in `Chrin` alone, but BASIC reads its line input, INKEY and the break
// check through `ReadBuffer`, which never touched the register. So a paste of
// more than about 240 bytes into BASIC left RTS high for good, and a terminal
// honouring RTS/CTS stopped sending.
//
// Every reader goes through `ReadBuffer`, so that is where RTS is lowered. The
// decision itself lives in `ScRts`, the one routine that writes the command
// register: RTS up at $C0 unread bytes, down below $80, left alone between the
// two. The marks moved down from $F0/$B0 when `SerialChrout` started dropping
// RTS around each byte it sends — TIC 00 turns the transmitter off as well as
// raising the pin, so a full buffer used to deadlock the board (BUGS.md 15) —
// because every one of those releases lets a byte or two in at 19,200 baud.
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
const INPUT_BUFFER = 0x0200
const SC_CMD = 0x9002

const READ_BUFFER = 0xa009 // the published slot

const RTS_HIGH = 0x01 // SC_CMD_RTS_HIGH: what ScRts writes at $C0 unread bytes
const RTS_LOW = 0x09 // SC_CMD_RTS_LOW: InitSC's value, and ScRts's below $80
const XMODEM = 0x0b // SC_CMD_XMODEM: what XModemLoad writes, receiver interrupt off

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
    await readWith(m, { unread: 0x80, cmd: RTS_HIGH }),
    RTS_LOW,
    'RTS after a read that leaves $7F bytes, just under the low mark',
  )
  m.assertByte(
    await readWith(m, { unread: 0x81, cmd: RTS_HIGH }),
    RTS_HIGH,
    'RTS after a read that still leaves $80 bytes — it should stay raised',
  )
  m.assertByte(
    await readWith(m, { unread: 0xc1, cmd: RTS_LOW }),
    RTS_HIGH,
    'RTS after a read that still leaves $C0 bytes — the high mark raises it',
  )
  m.assertByte(
    await readWith(m, { unread: 0xc0, cmd: RTS_LOW }),
    RTS_LOW,
    'RTS after a read that leaves $BF bytes, inside the band — it stays down',
  )
  m.assertByte(
    await readWith(m, { unread: 0xa0, cmd: RTS_HIGH }),
    RTS_HIGH,
    'RTS after a read inside the band with the pin up — it stays up',
  )
  m.assertByte(
    await readWith(m, { unread: 0x10, cmd: XMODEM }),
    XMODEM,
    'the command register while XModem owns the receiver',
  )

  // And from the prompt, the way the bug was found: stand the buffer full with
  // RTS raised, as Irq leaves it mid-paste, and let BASIC's own reads drain it.
  // The filler is $01, a control code the line input discards without echoing.
  //
  // It has to be a full buffer rather than a bare write of RTS_HIGH to an empty
  // one. A terminal honouring RTS sends nothing while the pin is up, and with an
  // empty buffer there is nothing for a reader to lower it on — the machine
  // would sit there, which is the far end behaving and not a ROM bug.
  await m.pause()
  await m.fillMem(INPUT_BUFFER, 0x100, 0x01)
  await m.write(READ_PTR, [0x00, 0xf0])
  await m.write(SC_CMD, [RTS_HIGH])
  for (let i = 0; i < 20 && (await m.peek(READ_PTR)) !== (await m.peek(WRITE_PTR)); i++) {
    await m.waitFor({ cycles: 100000, run: 'turbo', timeoutMs: 60000 })
  }
  await m.pause()
  m.assertByte(await m.peek(READ_PTR), await m.peek(WRITE_PTR), 'the prompt read the buffer empty')
  m.assertByte(await m.peek(SC_CMD), RTS_LOW, 'RTS once BASIC has drained the buffer')

  // And the console is still there afterwards.
  const { output } = await m.send('PRINT 12345+1\r', '^OK')
  m.assertMatch(output, /^ 12346$/m, 'the typed line ran')
}
