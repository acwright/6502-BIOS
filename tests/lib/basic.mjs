// Tier 1 — self-asserting BASIC source.
//
// A case is a program that prints PASS or FAIL and nothing else. It is
// reviewable in a diff, editable by hand, and runnable by a human at a real
// prompt, which is why it is the format most cases should use.
//
// Directive lines start with `#` and are stripped before the program is typed:
//
//   # name:   what the case is called in the report (default: the filename)
//   # xfail:  why this is a known BIOS bug — requires `# issue:` too
//   # issue:  where the bug is tracked
//   # profile: which machine profile to run on (default: serial)
//   # selftest: must-fail — this case proves the harness can report a failure

import { AssertionError } from './assert.mjs'
import { DEFAULT_TIMEOUT_MS } from './machine.mjs'

export function parseBasic(text, defaults = {}) {
  const meta = { ...defaults, directives: {} }
  const lines = []

  // Directives are lowercase `# key: value` lines in the header block, before
  // the first program line. Everything else beginning with `#` is a comment —
  // which is what lets a case quote the README line it is testing.
  let inHeader = true
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (/^\s*#/.test(line)) {
      const directive = /^\s*#\s*([a-z][a-z-]*)\s*:\s*(.*)$/.exec(line)
      if (directive && inHeader) meta.directives[directive[1]] = directive[2].trim()
      continue
    }
    if (line.trim() === '') continue
    inHeader = false
    lines.push(line.trim())
  }

  return { meta, lines }
}

// Type a program in, RUN it, and read the verdict.
//
// A stored program line prints nothing back, so each line waits for its own
// echo rather than for OK — waiting for the wrong thing here waits out the
// whole timeout on every single line. The echo is matched in full and
// unanchored: a fresh cursor can land part-way through the previous command's
// output, so anchoring the match to a line start is not reliable.
export async function runBasicCase(m, lines, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  for (const line of lines) {
    await m.send(line + '\r', escapeRegex(line), { timeoutMs })
  }

  const { output } = await m.send('RUN\r', '^OK', { timeoutMs })
  return verdictOf(output)
}

// A case prints one verdict line and nothing else. Two of them means the
// program took a path it should not have — a case that prints PASS and then
// falls into its own FAIL branch is failing, not passing, so the count matters
// as much as the word.
export function verdictOf(output) {
  const verdicts = output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l === 'PASS' || l === 'FAIL' || l.startsWith('FAIL '))

  if (verdicts.length === 0) {
    throw new AssertionError(
      'the program said neither PASS nor FAIL. Console said:\n' +
        output.split('\n').map((l) => '    ' + l).join('\n'),
    )
  }
  const failure = verdicts.find((v) => v !== 'PASS')
  if (failure) return { ok: false, message: failure, output }
  if (verdicts.length > 1) {
    return { ok: false, message: `printed PASS ${verdicts.length} times`, output }
  }
  return { ok: true, output }
}

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
