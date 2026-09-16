// The whole point of NVRAM is that it is not RAM.
//
// README § Real-Time Clock: "256 bytes of battery-backed NVRAM". Battery-backed
// means it outlives the power, so it certainly has to outlive a reset — and
// nothing else in this machine does. Every other byte a program can write is
// cleared, re-probed or re-initialised by `KernalInit`, so this is the one
// place a program can leave something for its next run.
//
// A reset also runs the RTC probe, which reads NVRAM back to decide whether the
// card is there. That is what makes this worth a case rather than an
// assumption: the probe touches the same bytes the program just wrote, and a
// probe that wrote a test pattern without restoring it would destroy exactly
// what the user was keeping.

import { coldBoot, BASIC_READY } from '../lib/boot.mjs'
import {
  NvRead, NvWrite, NV_ID, NV_VALID, NV_SLOT_DATA, SRC, DEST, payloadFor, callNv, lo, hi,
} from '../lib/nvslots.mjs'

export const name = 'NVRAM and a save slot survive a reset, and the probe that runs across it'

// A save slot clear of every address in PATTERN, so the two cannot mask each
// other: slot 9 is NVRAM $90-$9F.
const SLOT = 9
const OWNER = 0x6d

// Chosen to look nothing like the values a probe or an uninitialised card would
// leave: not 0, not $FF, not the address.
const PATTERN = [
  [0x00, 0xa5],
  [0x01, 0x5a],
  [0x7f, 0x3c],
  [0xfe, 0xc3],
  [0xff, 0x69],
]

export async function run(m) {
  for (const [address, value] of PATTERN) {
    await m.send(`NVRAM ${address}, ${value}\r`, /^OK/)
  }

  // Read back through the clock card's own space rather than through BASIC, so
  // the assertion is about the chip and not about the function that reads it.
  for (const [address, value] of PATTERN) {
    m.assertByte(await m.peek(address, 'nvram'), value, `NVRAM $${address.toString(16)} before the reset`)
  }

  // And a save slot, which is what a game actually leaves for its next run.
  await m.write(SRC, payloadFor(SLOT))
  await m.write(NV_ID, OWNER)
  m.assertEqual((await callNv(m, NvWrite, { X: SLOT, A: lo(SRC), Y: hi(SRC) })).carry, false, 'NvWrite before the reset')

  // Through `coldBoot`, which anchors its wait to where the console stood
  // before the reset. Waiting for a bare `OK` would match the one this case's
  // own last write produced, and the `PRINT` below would then be typed into the
  // boot menu — which swallows it, a character at a time.
  await coldBoot(m, { expect: BASIC_READY })

  for (const [address, value] of PATTERN) {
    m.assertByte(
      await m.peek(address, 'nvram'),
      value,
      `NVRAM $${address.toString(16)} after the reset — the bytes did not survive`,
    )
  }

  await m.fillMem(DEST, NV_SLOT_DATA, 0)
  const r = await callNv(m, NvRead, { X: SLOT, A: lo(DEST), Y: hi(DEST) })
  m.assertEqual(r.carry, false, `NvRead of slot ${SLOT} after the reset: carry`)
  m.assertByte(r.A, NV_VALID, `NvRead of slot ${SLOT} after the reset: status`)
  m.assertByte(r.Y, OWNER, `NvRead of slot ${SLOT} after the reset: owner ID`)
  m.assertBytes(await m.read(DEST, NV_SLOT_DATA), payloadFor(SLOT), `the save in slot ${SLOT} after the reset`)

  // And BASIC reads the same thing the chip holds, which is the half a direct
  // memory read cannot check.
  // `OK` rather than the digits: a digit-run pattern is satisfied by a prefix
  // of the number, so a slow enough host stops the wait half way through it.
  const { output } = await m.send('PRINT NVRAM(127)\r', '^OK')
  m.assertMatch(output, /^ 60$/m, 'NVRAM(127) after the reset')
}
