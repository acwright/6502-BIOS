// T's overlap handling is the one Monitor command whose bug is invisible from
// the console: a copy that walks the wrong way still prints nothing and still
// leaves plausible-looking bytes behind. This reads the result back instead.
export const name = 'T copies a block, forwards and backwards over itself'
export const mode = 'monitor'

// README: "T addr addr dest — Transfer (copy) a memory block; handles
// overlapping regions".
//
// 24 bytes seeded from $1000, so both overlapping copies read and write
// entirely inside seeded memory and every assertion is against a known byte.
const SRC = 0x1000
const LEN = 24
const PATTERN = Array.from({ length: LEN }, (_, i) => 0x10 + i)

const seed = (m) => m.write(SRC, PATTERN)

export async function run(m) {
  // Disjoint: the plain case, and the baseline the overlapping ones follow.
  await seed(m)
  await m.send('T 1000 100F 1200\r', /^\. /)
  m.assertBytes(await m.read(0x1200, 16), PATTERN.slice(0, 16), 'disjoint copy')

  // Forward overlap — destination above the source, halfway into it. A naive
  // ascending copy overwrites source bytes before reading them, smearing the
  // first eight across the whole block.
  await seed(m)
  await m.send('T 1000 100F 1008\r', /^\. /)
  m.assertBytes(await m.read(0x1008, 16), PATTERN.slice(0, 16), 'forward-overlapping copy')

  // Backward overlap — destination below the source. The mirror image, and the
  // one a descending copy gets wrong.
  await seed(m)
  await m.send('T 1008 1017 1000\r', /^\. /)
  m.assertBytes(await m.read(0x1000, 16), PATTERN.slice(8, 24), 'backward-overlapping copy')
}
