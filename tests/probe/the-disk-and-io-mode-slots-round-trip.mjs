// Four slots that are a getter and a setter over one byte of Kernal state, plus
// the one that prints it. A cartridge uses these to find out what the machine
// was doing before it took over, and to put it back.
//
//   $A087  FsSetDisk    "A = 0-255 -> CF_DISK ($030F)"
//   $A08A  FsGetDisk    "A <- CF_DISK"
//   $A08D  FsPrintDisk  "Print `DISK n` + CRLF via Chrout"
//   $A00F  SetIOMode    "A=0 (video) or 1 (serial)"
//   $A012  GetIOMode    "-> A"
//
// Each pair is asserted against the documented RAM address as well as against
// its own getter, because a getter that reads back whatever the setter stashed
// somewhere private would satisfy the round trip and still not be the variable
// the README tells a cartridge to read.

import { stripCR } from '../lib/machine.mjs'

export const name = 'the disk-bank and IO-mode slots round-trip through their documented variables'

const SetIOMode = 0xa00f
const GetIOMode = 0xa012
const FsSetDisk = 0xa087
const FsGetDisk = 0xa08a
const FsPrintDisk = 0xa08d

const IO_MODE = 0x0306
const CF_DISK = 0x030f

export async function run(m) {
  // Disk bank. 0 is the boot value, 255 is the top of the documented range, and
  // 32 is the first bank whose base LBA does not fit in 16 bits — the one a
  // truncating setter would get wrong.
  for (const disk of [1, 32, 255, 0]) {
    await m.call6502(FsSetDisk, { A: disk })
    m.assertByte(await m.peek(CF_DISK), disk, `CF_DISK after FsSetDisk ${disk}`)
    m.assertByte((await m.call6502(FsGetDisk)).A, disk, `FsGetDisk after FsSetDisk ${disk}`)
  }

  await m.call6502(FsSetDisk, { A: 7 })
  const { cursor } = await m.serialRead(0)
  await m.call6502(FsPrintDisk)
  m.assertEqual(
    stripCR((await m.serialRead(cursor)).data ?? ''),
    'DISK 7\n',
    'FsPrintDisk uses the current bank and ends the line',
  )

  // IO mode. Setting video on a machine with no video card routes the console
  // at a card that is not there — which is exactly why this is a Tier 3 case
  // and not a console one, and why it does not matter: the snapshot restore
  // after the case is the cleanup.
  for (const mode of [0, 1, 0, 1]) {
    await m.call6502(SetIOMode, { A: mode })
    m.assertByte(await m.peek(IO_MODE), mode, `IO_MODE after SetIOMode ${mode}`)
    m.assertByte((await m.call6502(GetIOMode)).A, mode, `GetIOMode after SetIOMode ${mode}`)
  }
}
