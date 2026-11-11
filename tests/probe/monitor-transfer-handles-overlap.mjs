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

// Send a T and wait for the prompt after its own echoed line. A bare /^\. /
// can be met by the previous command's prompt, which may still be arriving
// when the cursor is taken, so the copy would be read before it ran.
const transfer = (m, args) =>
  m.send(`T ${args}\r`, new RegExp(`T ${args}[\\r\\n]+(?:[^\\r\\n]*[\\r\\n]+)*?\\. `))

export async function run(m) {
  // Disjoint: the plain case, and the baseline the overlapping ones follow.
  await seed(m)
  await transfer(m, '1000 100F 1200')
  m.assertBytes(await m.read(0x1200, 16), PATTERN.slice(0, 16), 'disjoint copy')

  // Forward overlap — destination above the source, halfway into it. A naive
  // ascending copy overwrites source bytes before reading them, smearing the
  // first eight across the whole block.
  await seed(m)
  await transfer(m, '1000 100F 1008')
  m.assertBytes(await m.read(0x1008, 16), PATTERN.slice(0, 16), 'forward-overlapping copy')

  // Backward overlap — destination below the source. The mirror image, and the
  // one a descending copy gets wrong.
  await seed(m)
  await transfer(m, '1008 1017 1000')
  m.assertBytes(await m.read(0x1000, 16), PATTERN.slice(8, 24), 'backward-overlapping copy')
}
