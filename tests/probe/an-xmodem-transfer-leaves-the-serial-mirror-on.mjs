// XModem owns the line while it runs: XModemLoad and XModemSave save IO_MODE in
// XFER_IO_SAVE, make serial the console, and put the saved byte back at the
// end. The whole byte, so a transfer started with the mirror on (IO_MODE $02)
// must end with it still on, and the OK after it must reach the line.
//
// A BLOAD typed over serial on a video console with the mirror on: one block
// sent, acknowledged, and the bytes where BLOAD put them. The host end is plain
// checksum XModem, as bsave-and-bload-round-trip-over-xmodem speaks it.

export const name = 'an XModem transfer started with the serial mirror on leaves it on'
export const profile = 'video'

const SOH = 0x01
const EOT = 0x04
const ACK = 0x06
const NAK = 0x15
const BLOCK = 128

const IO_MODE = 0x0306
const DEST = 0x5000

const STEP = 100000
const STEPS = 200

const bytesOf = (text) => Array.from(text, (c) => c.charCodeAt(0))
const sendBytes = (m, bytes) =>
  m.call('serial.write', { data: Buffer.from(bytes).toString('base64'), encoding: 'base64' })

// Advance emulated time until the stream from `cursor` holds `count` bytes.
async function collect(m, cursor, count, what) {
  for (let step = 0; step < STEPS; step++) {
    const { data } = await m.serialRead(cursor)
    if (data.length >= count) return bytesOf(data).slice(0, count)
    await m.waitFor({ cycles: STEP, run: 'turbo', timeoutMs: 30000 })
  }
  const { data } = await m.serialRead(cursor)
  m.fail(`${what}: expected ${count} bytes, the line carried ${data.length}: ${JSON.stringify(data)}`)
}

export async function run(m) {
  await m.pause()
  await m.write(IO_MODE, [0x02])

  const payload = Array.from({ length: BLOCK }, (_, i) => (i * 29 + 3) & 0xff)
  const checksum = payload.reduce((a, b) => (a + b) & 0xff, 0)

  // The echo of the line comes over the mirror, then XModem's own message.
  let { cursor } = await m.send(`BLOAD ${DEST}\r`)
  await m.expectFrom(cursor, 'XMODEM RX READY')
  const { data } = await m.serialRead(cursor)
  cursor += data.indexOf('XMODEM RX READY\r\n') + 'XMODEM RX READY\r\n'.length

  m.assertBytes(await collect(m, cursor, 1, 'the NAK that starts the transfer'), [NAK], 'BLOAD asks for the first block')
  cursor += 1
  await sendBytes(m, [SOH, 1, 0xfe, ...payload, checksum])
  m.assertBytes(await collect(m, cursor, 1, 'the answer to the block'), [ACK], 'BLOAD acknowledges the block')
  cursor += 1
  await sendBytes(m, [EOT])
  m.assertBytes(await collect(m, cursor, 1, 'the answer to EOT'), [ACK], 'BLOAD acknowledges the end')
  cursor += 1

  const { output } = await m.expectFrom(cursor, /^OK$/)
  m.assert(!/ERROR/.test(output), `BLOAD reported an error:\n${output}`)
  m.assertByte(await m.peek(IO_MODE), 0x02, 'IO_MODE after the transfer')
  m.assertBytes(await m.read(DEST, BLOCK), payload, 'the block BLOAD received')
}
