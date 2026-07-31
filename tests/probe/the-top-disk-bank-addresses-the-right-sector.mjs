// Disk banking is 24-bit arithmetic done in 8-bit pieces: the base LBA of disk
// n is n * 2048, which passes 65535 at disk 32 and reaches 522,240 at disk 255.
// Every bank above 31 therefore depends on the carry into LBA bits 16-23, and
// nothing about a low-numbered bank exercises it.
//
// The card the suite runs on is 32 MB, so the top banks cannot be read or
// written — but the address the BIOS *puts on the bus* is the thing under test,
// and that is visible whatever the card does with it. Each LBA register is
// watched, and the value the ROM writes is read out of A at the stop.
export const name = 'the top disk bank puts the right 24-bit LBA on the bus'

// README: "The card is divided into up to 256 disk banks of 1 MB each (2048
//          sectors x 512 bytes), giving a maximum usable capacity of 256 MB"
//         "the directory lives at the first sector (LBA n x 2048)"

// BIOS.inc: the CF card's ATA registers, IO 4.
const ST_LBA_0 = 0x8c03
const ST_LBA_1 = 0x8c04
const ST_LBA_2 = 0x8c05
const ST_LBA_3 = 0x8c06

// StSetupLba's LBA3: bits 24-27 of the address, plus the "LBA mode, master
// drive" bits that are always set.
const LBA3_MASTER = 0xe0

async function lbaFor(m, disk) {
  await m.send(`DISK ${disk}\r`, /^OK/)
  await m.clearBreaks()
  for (const address of [ST_LBA_0, ST_LBA_1, ST_LBA_2, ST_LBA_3]) {
    await m.watch(address, 'write')
  }

  // DIR reads the directory, which is sector 0 of the selected bank — so the
  // LBA that goes out is the bank's base address and nothing else.
  await m.serialWrite('DIR\r')

  const bytes = []
  for (let i = 0; i < 4; i++) {
    // `stopped` alone for the first one, because the machine is running and may
    // already have hit it; `run` for the rest, which means "continue, and tell
    // me when it stops again". Passing `run` on the first would resume past a
    // stop that had already happened, and asking for the rest without it would
    // return the same stop four times.
    const wait = { stopped: true, timeoutMs: 20000 }
    const result = await m.waitFor(i === 0 ? wait : { ...wait, run: 'turbo' })
    if (!result.matched) throw new Error(`the machine never wrote LBA byte ${i}`)
    m.assertEqual(result.stop?.kind, 'watchpoint', `stop ${i}`)
    bytes.push((await m.regs()).A)
  }
  await m.clearBreaks()
  return bytes
}

export async function run(m) {
  // Disk 255: 255 * 2048 = 522240 = $07F800.
  const top = await lbaFor(m, 255)
  m.assertByte(top[0], 0x00, 'LBA bits 0-7 for disk 255')
  m.assertByte(top[1], 0xf8, 'LBA bits 8-15 for disk 255')
  m.assertByte(top[2], 0x07, 'LBA bits 16-23 for disk 255')
  m.assertByte(top[3], LBA3_MASTER, 'LBA bits 24-27 for disk 255')

  // Disk 32 is the first bank whose base does not fit in 16 bits — 65536
  // exactly, so the byte that has to carry is the one that is otherwise never
  // written with anything but zero.
  const first = await lbaFor(m, 32)
  m.assertByte(first[0], 0x00, 'LBA bits 0-7 for disk 32')
  m.assertByte(first[1], 0x00, 'LBA bits 8-15 for disk 32')
  m.assertByte(first[2], 0x01, 'LBA bits 16-23 for disk 32')
  m.assertByte(first[3], LBA3_MASTER, 'LBA bits 24-27 for disk 32')
}
