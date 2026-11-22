// XModem owns the line while it runs: XModemLoad and XModemSave save IO_MODE in
// XFER_IO_SAVE, make serial the console, and put the saved byte back at the
// end. The whole byte, so a transfer started with the mirror on (IO_MODE $02)
// must end with it still on, and the OK after it must reach the line.
//
// A SAVE with no filename, typed over serial on a video console with the mirror
// on: this case is the receiving end, plain checksum XModem, and takes blocks
// until EOT. 1.x's BLOAD needs a filename, so SAVE is the transfer here.

export const name = 'an XModem transfer started with the serial mirror on leaves it on'
export const profile = 'video'

const SOH = 0x01
const EOT = 0x04
const ACK = 0x06
const NAK = 0x15
const BLOCK = 128

const IO_MODE = 0x0306

const STEP = 100000
const STEPS = 200

const bytesOf = (text) => Array.from(text, (c) => c.charCodeAt(0))
const sendBytes = (m, bytes) =>
  m.call('serial.write', { data: Buffer.from(bytes).toString('base64'), encoding: 'base64' })

// Advance emulated time until the stream from `cursor` holds `count` bytes.
// `resend`, if given, is called again while nothing at all has arrived:
// XModemSave drains the line before it listens, and a NAK that lands during
// the drain is lost.
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

export async function run(m) {
  await m.send('10 PRINT "SAVED"\r')
  await m.pause()
  await m.write(IO_MODE, [0x02])

  // The echo of the line comes over the mirror, then XModem's own message.
  let { cursor } = await m.send('SAVE\r')
  await m.expectFrom(cursor, 'XMODEM TX READY')
  const { data } = await m.serialRead(cursor)
  cursor += data.indexOf('XMODEM TX READY\r\n') + 'XMODEM TX READY\r\n'.length

  const nak = () => sendBytes(m, [NAK])
  await nak()
  let blocks = 0
  for (;;) {
    const [first] = await collect(m, cursor, 1, `block ${blocks + 1} or EOT`, blocks ? null : nak)
    if (first === EOT) {
      cursor += 1
      await sendBytes(m, [ACK])
      break
    }
    m.assertByte(first, SOH, `the first byte of block ${blocks + 1}`)
    const block = await collect(m, cursor, BLOCK + 4, `block ${blocks + 1}`)
    const sum = block.slice(3, 3 + BLOCK).reduce((a, b) => (a + b) & 0xff, 0)
    m.assertByte(block[BLOCK + 3], sum, `block ${blocks + 1}'s checksum`)
    cursor += BLOCK + 4
    blocks += 1
    await sendBytes(m, [ACK])
  }
  m.assert(blocks > 0, 'SAVE sent no blocks')

  const { output } = await m.expectFrom(cursor, /^OK$/)
  m.assert(!/ERROR/.test(output), `SAVE reported an error:\n${output}`)
  m.assertByte(await m.peek(IO_MODE), 0x02, 'IO_MODE after the transfer')
}
