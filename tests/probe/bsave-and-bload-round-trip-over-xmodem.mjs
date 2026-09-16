// VDP-PLAN §5 Phase 4: with no filename, `BSAVE addr,len` sends over XModem and
// `BLOAD addr` receives, through the Kernal's `XModemSave`/`XModemLoad` — the
// Monitor's `S` and `L` without a name, now in BASIC.
//
// The host end of both transfers is this case: plain checksum XModem, 128-byte
// blocks padded with SUB ($1A), as the Kernal speaks it. The console stream is
// the serial line, so what the machine sends is read back from it byte for
// byte (the emulator hands output over one character per byte), and what it
// receives goes in with `serial.write`'s base64 encoding.

export const name = 'BSAVE and BLOAD with no filename move raw bytes over XModem'

const SOH = 0x01
const EOT = 0x04
const ACK = 0x06
const NAK = 0x15
const SUB = 0x1a
const BLOCK = 128

const SOURCE = 0x4000
const SENT = 200 // two blocks, the second padded
const DEST = 0x5000
const RECEIVED = 300 // three blocks, the third padded
const XFER_REMAIN = 0x0317

const STEP = 100000
const STEPS = 200

const bytesOf = (text) => Array.from(text, (c) => c.charCodeAt(0))
const sendBytes = (m, bytes) =>
  m.call('serial.write', { data: Buffer.from(bytes).toString('base64'), encoding: 'base64' })

// Advance emulated time until the stream from `cursor` holds `count` bytes, and
// return them. `resend`, if given, is called again while nothing at all has
// arrived: XModemSave drains the line before it listens, and a NAK that lands
// during the drain is lost.
async function collect(m, cursor, count, what, resend) {
  for (let step = 0; step < STEPS; step++) {
    const { data } = await m.serialRead(cursor)
    if (data.length >= count) return bytesOf(data).slice(0, count)
    if (resend && data.length === 0 && step > 0 && step % 15 === 0) await resend()
    await m.waitFor({ cycles: STEP, run: 'turbo', timeoutMs: 30000 })
  }
  const { data } = await m.serialRead(cursor)
  m.fail(`${what}: expected ${count} bytes, the line carried ${data.length}: ${JSON.stringify(data)}`)
}

// The cursor just past `text` in the stream, once it has been printed.
async function after(m, cursor, text) {
  const result = await m.expectFrom(cursor, text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const { data } = await m.serialRead(cursor)
  return cursor + data.indexOf(text) + text.length
}

function blocks(bytes) {
  const out = []
  for (let n = 0; n * BLOCK < bytes.length; n++) {
    const data = bytes.slice(n * BLOCK, (n + 1) * BLOCK)
    while (data.length < BLOCK) data.push(SUB)
    const number = (n + 1) & 0xff
    const checksum = data.reduce((a, b) => (a + b) & 0xff, 0)
    out.push([SOH, number, number ^ 0xff, ...data, checksum])
  }
  return out
}

export async function run(m) {
  // ---- BSAVE: the machine sends, this case receives ----------------------
  const source = Array.from({ length: SENT }, (_, i) => (i * 13 + 5) & 0xff)
  await m.write(SOURCE, source)

  let { cursor } = await m.send(`BSAVE ${SOURCE},${SENT}\r`)
  cursor = await after(m, cursor, 'XMODEM TX READY\r\n')

  const nak = () => sendBytes(m, [NAK])
  await nak()
  const received = []
  for (const block of blocks(source)) {
    const got = await collect(m, cursor, BLOCK + 4, `block ${block[1]} from BSAVE`, received.length ? null : nak)
    m.assertBytes(got, block, `block ${block[1]} as BSAVE sent it`)
    received.push(...got.slice(3, 3 + BLOCK))
    cursor += BLOCK + 4
    await sendBytes(m, [ACK])
  }
  m.assertBytes((await collect(m, cursor, 1, 'the EOT after the last block')), [EOT], 'the end of the transfer')
  cursor += 1
  await sendBytes(m, [ACK])
  await m.expectFrom(cursor, /^OK$/)
  m.assertBytes(received.slice(0, SENT), source, 'the bytes BSAVE sent')

  // ---- BLOAD: this case sends, the machine receives ----------------------
  const payload = Array.from({ length: RECEIVED }, (_, i) => (i * 29 + 3) & 0xff)
  const padded = blocks(payload).flatMap((b) => b.slice(3, 3 + BLOCK))
  await m.fillMem(DEST, padded.length + 16, 0xee)

  ;({ cursor } = await m.send(`BLOAD ${DEST}\r`))
  cursor = await after(m, cursor, 'XMODEM RX READY\r\n')
  m.assertBytes(await collect(m, cursor, 1, 'the NAK that starts BLOAD\'s transfer'), [NAK], 'BLOAD asks for the first block')
  cursor += 1
  for (const block of blocks(payload)) {
    await sendBytes(m, block)
    m.assertBytes(await collect(m, cursor, 1, `the answer to block ${block[1]}`), [ACK], `BLOAD acknowledges block ${block[1]}`)
    cursor += 1
  }
  await sendBytes(m, [EOT])
  m.assertBytes(await collect(m, cursor, 1, 'the answer to EOT'), [ACK], 'BLOAD acknowledges the end')
  cursor += 1
  const { output } = await m.expectFrom(cursor, /^OK$/)
  m.assert(!/ERROR/.test(output), `BLOAD reported an error:\n${output}`)

  m.assertBytes(await m.read(DEST, padded.length), padded, 'the bytes BLOAD received, padding and all')
  m.assertBytes(await m.read(DEST + padded.length, 16), new Array(16).fill(0xee), 'the bytes past the last block')
  m.assertWord(await m.peekWord(XFER_REMAIN), padded.length, 'XFER_REMAIN, the bytes received')
}
