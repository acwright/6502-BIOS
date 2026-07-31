// The `nvram` profile: a machine booted with `--nvram fixtures/nvram.bin`, the
// way a real one boots with a battery that has been in the socket for a year.
//
// Every other NVRAM case writes what it reads. That proves the path works and
// proves nothing about the address decode, because a routine that latched the
// wrong address consistently would still pass — it would write to the wrong
// byte and read the wrong byte back, and agree with itself.
//
// This one reads bytes it did not write. The fixture is a permutation, so every
// address holds a different value and reading the wrong one is always visible.

import { nvramImage } from '../fixtures/build.mjs'

export const name = 'the clock card reads back the NVRAM image it was booted with'
export const profile = 'nvram'

const RtcReadNVRAM = 0xa066
const RtcWriteNVRAM = 0xa069

export async function run(m) {
  const expected = nvramImage()

  // What the emulator's clock chip holds, straight out of the device space.
  // This is the fixture arriving at all, before any BIOS code is involved.
  const held = await m.read(0, expected.length, 'nvram')
  m.assertBytes(held, expected, 'the NVRAM the machine booted with')

  // BASIC's own function agrees, at the ends and at the byte that genuinely
  // holds zero — which is the value an absent card returns, so it is the one
  // place "0" has to mean the card answered rather than that it was not there.
  const zeroAt = expected.indexOf(0)
  for (const address of [0, 1, zeroAt, 254, 255]) {
    // Waiting for `OK` and not for the digits themselves: `/^ \d+$/` is
    // satisfied by a *prefix* of the answer, so a host slow enough to read the
    // console between the `9` and the `1` of ` 91` stops there and the
    // assertion below then fails on a number that was only half printed.
    const { output } = await m.send(`PRINT NVRAM(${address})\r`, '^OK')
    m.assertMatch(output, new RegExp(`^ ${expected[address]}$`, 'm'), `NVRAM(${address})`)
  }

  // And what the Kernal slot reads for each address. Every one, because the
  // failure this catches is a decode that is right for most of the range and
  // wrong at a boundary — an address latch that never takes the top bit reads
  // correctly for the first 128 bytes.
  for (let address = 0; address < expected.length; address++) {
    const { A } = await m.call6502(RtcReadNVRAM, { X: address })
    m.assertByte(A, expected[address], `RtcReadNVRAM of $${address.toString(16).padStart(2, '0')}`)
  }

  // A write lands on the byte it names and leaves its neighbours alone, which
  // an image of distinct values is what makes checkable.
  const target = 0x80
  await m.call6502(RtcWriteNVRAM, { X: target, A: 0x42 })
  m.assertByte(await m.peek(target, 'nvram'), 0x42, 'the byte that was written')
  m.assertByte(await m.peek(target - 1, 'nvram'), expected[target - 1], 'the byte below it')
  m.assertByte(await m.peek(target + 1, 'nvram'), expected[target + 1], 'the byte above it')
}
