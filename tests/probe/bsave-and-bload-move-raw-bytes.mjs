// BSAVE and BLOAD are the raw-bytes half of the storage commands: no program
// text, no chain, an address the caller picks. Written and read back through
// memory, because the console cannot see either end of this.
export const name = 'BSAVE writes bytes from an address and BLOAD puts them at another'

// README: "BSAVE <addr>,<len>,"name" — Save len bytes from address addr to a
//          named file on the current disk"
//         "BLOAD <addr>,"name" — Load a file's raw bytes from the current disk
//          to address addr"
//         "load/save raw binary data to/from any memory address"

const FROM = 0x6000
const TO = 0x7000
const LEN = 300

// Not a sector multiple, deliberately: a file is its byte count, and the sector
// it is rounded up into on the card is the filesystem's business.
const PATTERN = Array.from({ length: LEN }, (_, i) => (i * 7 + 0x21) & 0xff)

export async function run(m) {
  await m.write(FROM, PATTERN)
  await m.send(`BSAVE ${FROM},${LEN},"RAW.BIN"\r`, /^OK/)

  // The listing carries the length the command was given, not the sector it
  // occupies — 300, never 512.
  const { output } = await m.send('DIR\r', /^OK/)
  m.assertMatch(output, /^RAW     \.BIN 300$/m, 'the directory line')

  // Somewhere else entirely, so a BLOAD that ignored its address argument and
  // used the file's own would be caught rather than compared against itself.
  await m.fillMem(TO, LEN, 0x00)
  await m.send(`BLOAD ${TO},"RAW.BIN"\r`, /^OK/)
  m.assertBytes(await m.read(TO, LEN), PATTERN, 'the bytes BLOAD put back')

  // The source is untouched: this is a copy, not a move.
  m.assertBytes(await m.read(FROM, LEN), PATTERN, 'the bytes BSAVE read')
}
