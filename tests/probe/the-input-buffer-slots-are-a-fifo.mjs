// The three input-buffer slots, which are how a cartridge feeds the keyboard
// queue and how it finds out whether anything is waiting.
//
//   $A006  WriteBuffer  "Push byte into the input buffer"
//   $A009  ReadBuffer   "Pop byte from the input buffer"
//   $A00C  BufferSize   "Return number of bytes waiting in buffer"
//
// Push and pop, and a count that agrees with both. The order is the assertion
// that matters: README § Keyboard calls this a ring buffer that `Chrin` reads
// from, so it is a queue, and a stack would make every word the user typed come
// back reversed.
//
// Nothing here can run at a live prompt — BASIC's input loop would eat the
// bytes as fast as they were pushed. `call6502` pauses the machine and runs
// only the stub it plants, so between two calls nothing else executes, which is
// what makes the queue observable at all.

export const name = 'WriteBuffer, ReadBuffer and BufferSize are a FIFO'

const WriteBuffer = 0xa006
const ReadBuffer = 0xa009
const BufferSize = 0xa00c

const size = async (m) => (await m.call6502(BufferSize)).A

export async function run(m) {
  // The prompt has consumed everything it was sent, but say so rather than
  // assume it: a stray byte here would shift every assertion below by one.
  m.assertByte(await size(m), 0, 'the buffer at a settled prompt')

  const word = [...Buffer.from('HELLO', 'latin1')]
  for (const [i, byte] of word.entries()) {
    await m.call6502(WriteBuffer, { A: byte })
    m.assertByte(await size(m), i + 1, `the count after pushing byte ${i}`)
  }

  for (const [i, byte] of word.entries()) {
    m.assertByte((await m.call6502(ReadBuffer)).A, byte, `byte ${i} back out of the queue`)
    m.assertByte(await size(m), word.length - i - 1, `the count after popping byte ${i}`)
  }

  m.assertByte(await size(m), 0, 'the buffer once it has been drained')
}
