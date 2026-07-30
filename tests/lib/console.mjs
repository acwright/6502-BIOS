// Tier 2 — console transcripts.
//
// For everything Tier 1 cannot express: the Monitor (which has no way to assert
// on itself), error messages, prompts, LIST output, immediate-mode behaviour.
//
// A case is a header block followed by send/expect lines:
//
//   mode: monitor
//   > F 1000 100F AA
//   > M 1000 1007
//   ~ ^:1000  AA AA AA AA AA AA AA AA
//   ! RUNAWAY
//
//   #        a comment
//   key: v   a header — mode, name, profile, xfail, issue, selftest, final
//   > text   type text and a CR, then wait for the echo
//   < text   send raw bytes (\r \n \t \e \xNN), waiting for nothing
//   ~ regex  expect a match in what came back since the last send
//   ! regex  expect no match, after the machine has been let settle
//
// Expectations are regexes over console output with `\r` stripped, and `^`/`$`
// anchor to a line rather than to the whole buffer — see toWaitPattern().

import { AssertionError, assertNoMatch } from './assert.mjs'
import { toLineRegex } from './machine.mjs'
import { escapeRegex } from './basic.mjs'

export const MODES = {
  basic: { prompt: '^OK' },
  monitor: { prompt: '^\\. ' },
}

// How much emulated time a negative assertion gives the machine to be wrong in.
// Bounded emulated cycles, not a host sleep: the same wherever this runs.
const SETTLE_CYCLES = 300000

export function parseConsole(text, defaults = {}) {
  const meta = { ...defaults, directives: {} }
  const steps = []
  let inHeader = true

  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '')
    const lineNo = index + 1
    if (/^\s*#/.test(line) || line.trim() === '') return

    const command = /^([><~!])\s?(.*)$/.exec(line)
    if (command) {
      inHeader = false
      steps.push({ op: command[1], arg: command[2], lineNo })
      return
    }

    const header = /^([a-z][a-z-]*)\s*:\s*(.*)$/i.exec(line)
    if (header && inHeader) {
      meta.directives[header[1].toLowerCase()] = header[2].trim()
      return
    }

    throw new AssertionError(`line ${lineNo}: not a header or a command: ${JSON.stringify(line)}`)
  })

  return { meta, steps }
}

export async function runConsoleCase(m, steps, { mode = 'basic', final, timeoutMs = 20000 } = {}) {
  const modeSpec = MODES[mode]
  if (!modeSpec) throw new AssertionError(`unknown mode ${JSON.stringify(mode)}`)

  let cursor = (await m.serialRead(0, 0)).cursor
  let lastSent = null

  for (const step of steps) {
    try {
      switch (step.op) {
        case '>': {
          const written = await m.serialWrite(step.arg + '\r')
          cursor = written.cursor
          lastSent = step.arg
          // Wait for the line's own echo, in full and unanchored: the cursor
          // this write returned can land part-way through the previous
          // command's output, so a line-start anchor is not reliable here.
          if (step.arg.trim()) {
            await m.expectFrom(cursor, escapeRegex(step.arg), { timeoutMs, sent: step.arg })
          }
          break
        }
        case '<': {
          const data = unescape(step.arg)
          const written = await m.serialWrite(data)
          cursor = written.cursor
          lastSent = data
          break
        }
        case '~': {
          await m.expectFrom(cursor, step.arg, { timeoutMs, sent: lastSent })
          break
        }
        case '!': {
          const output = await m.settle(cursor, SETTLE_CYCLES)
          assertNoMatch(output, toLineRegex(step.arg), 'output')
          break
        }
      }
    } catch (error) {
      if (error instanceof AssertionError) {
        error.message = `line ${step.lineNo} (${step.op} ${step.arg}): ${error.message}`
      }
      throw error
    }
  }

  // Every transcript ends back at a prompt. This is not decoration: it is what
  // catches a case that produced the right text and then wedged the machine.
  const prompt = final === 'none' ? null : (final ?? modeSpec.prompt)
  if (prompt) {
    await m.expectFrom(cursor, prompt, { timeoutMs, sent: lastSent })
  }
}

export function unescape(text) {
  return text.replace(/\\(x[0-9a-fA-F]{2}|.)/g, (_, code) => {
    switch (code[0]) {
      case 'r': return '\r'
      case 'n': return '\n'
      case 't': return '\t'
      case 'e': return '\x1b'
      case '0': return '\0'
      case 'x': return String.fromCharCode(parseInt(code.slice(1), 16))
      default: return code
    }
  })
}
