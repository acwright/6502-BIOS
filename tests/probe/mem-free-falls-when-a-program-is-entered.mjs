// The number in MEM's output, not just its shape. A program line has to cost
// free bytes: MEM reports MEMSIZ - VARTAB, and VARTAB moves up with the text.
// A MEM that reported a constant would still satisfy a regex checking only the
// shape, which is why this one does arithmetic on two readings instead.
export const name = 'MEM free bytes fall by the size of a program line'

const freeBytes = (text) => {
  const m = /(\d+)/.exec(text)
  if (!m) throw new Error(`no free-byte figure in MEM output: ${JSON.stringify(text)}`)
  return Number(m[1])
}

export async function run(m) {
  const before = freeBytes((await m.send('MEM\r', /^OK/)).output)
  // Gated on the echo, not on OK: a stored program line prints nothing back.
  await m.send('10 REM 0123456789\r', /REM/)
  const after = freeBytes((await m.send('MEM\r', /^OK/)).output)

  m.assert(after < before, `MEM did not fall: ${before} -> ${after}`)
  // `10 REM 0123456789` is 4 bytes of link and line-number header, one token,
  // and the comment text. Exact accounting belongs to the tokenizer's own
  // cases; the point here is that the cost is real and in the right ballpark.
  const cost = before - after
  m.assert(cost >= 10 && cost <= 32, `implausible cost for one line: ${cost} bytes`)
}
