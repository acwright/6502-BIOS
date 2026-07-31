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

export const name = 'NVRAM survives a reset, and the probe that runs across it'

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

  // And BASIC reads the same thing the chip holds, which is the half a direct
  // memory read cannot check.
  const { output } = await m.send('PRINT NVRAM(127)\r', /^ \d+$/)
  m.assertMatch(output, /^ 60$/m, 'NVRAM(127) after the reset')
}
