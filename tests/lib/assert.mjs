// Assertions for the BIOS test suite.
//
// Every failure carries enough detail to diagnose without a re-run, because a
// suite that reports "assertion failed" makes you run it again to learn anything.

export class AssertionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AssertionError'
  }
}

const hex = (n, width = 2) =>
  typeof n === 'number' ? `$${n.toString(16).toUpperCase().padStart(width, '0')}` : String(n)

export function fail(message) {
  throw new AssertionError(message)
}

export function assert(condition, message = 'assertion failed') {
  if (!condition) fail(message)
}

export function assertEqual(actual, expected, what = 'value') {
  if (actual !== expected) {
    fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

export function assertByte(actual, expected, what = 'byte') {
  if (actual !== expected) {
    fail(`${what}: expected ${hex(expected)}, got ${hex(actual)}`)
  }
}

export function assertWord(actual, expected, what = 'word') {
  if (actual !== expected) {
    fail(`${what}: expected ${hex(expected, 4)}, got ${hex(actual, 4)}`)
  }
}

// Six significant digits is all the BIOS's float format carries, so a
// comparison against a double-precision constant needs room.
export function assertFloat(actual, expected, epsilon = 1e-5, what = 'value') {
  const a = typeof actual === 'string' ? Number(actual.trim()) : actual
  if (!Number.isFinite(a)) fail(`${what}: ${JSON.stringify(actual)} is not a number`)
  const tolerance = Math.abs(epsilon * (Math.abs(expected) > 1 ? expected : 1))
  if (Math.abs(a - expected) > Math.abs(tolerance)) {
    fail(`${what}: expected ${expected} ±${tolerance}, got ${a}`)
  }
}

export function assertMatch(text, pattern, what = 'output') {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'm')
  if (!re.test(text)) {
    fail(`${what}: expected /${re.source}/ in:\n${indent(text)}`)
  }
}

export function assertNoMatch(text, pattern, what = 'output') {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'm')
  if (re.test(text)) {
    fail(`${what}: expected no /${re.source}/, but found it in:\n${indent(text)}`)
  }
}

export function assertBytes(actual, expected, what = 'bytes') {
  const a = Array.from(actual)
  const e = Array.from(expected)
  if (a.length !== e.length) {
    fail(`${what}: expected ${e.length} bytes, got ${a.length}`)
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== e[i]) {
      fail(`${what}: byte ${i} (offset ${hex(i, 4)}): expected ${hex(e[i])}, got ${hex(a[i])}`)
    }
  }
}

export function indent(text, prefix = '    ') {
  return String(text)
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
}

export const assertions = {
  fail,
  assert,
  assertEqual,
  assertByte,
  assertWord,
  assertFloat,
  assertMatch,
  assertNoMatch,
  assertBytes,
}
