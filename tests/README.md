# The BIOS test suite

```sh
make test                      # build BIOS.bin and run everything
make test-one T=gosub          # just the cases matching /gosub/
tests/run.mjs --help
```

Needs Node ≥ 22 and the A.C. Wright 6502 emulator (v2.4.0+) as `6502` on PATH.
`SIXTY502` overrides that — `SIXTY502="node …/out/cli/index.js" make test` runs
against an emulator checkout, which is how CI will do it.

PLAN.md is the map: what the suite is for, what it covers, and what to do when it
finds a BIOS bug. FINDINGS.md is what it has found and not yet resolved.

## How a run works

One emulator per machine profile, one WebSocket per emulator, one boot per run.
Every case starts by restoring the snapshot taken at the `OK` prompt — exact, and
about a millisecond against the 5.36 million cycles a boot costs. Nothing leaks
between cases, so a case that wedges the machine into the Monitor needs no
cleanup code at all.

Nothing sleeps. Every wait is a bounded blocking call on the machine's own
execution cadence, so a run lands identically however fast the host is.

## Fixtures

Every profile has a CompactFlash card — the emulator always fits one — but the
default profile's is blank, which is the right machine for anything that writes
what it reads back. The `cf` profile gets a card somebody else wrote:
`fixtures/build.mjs` describes it, and the runner builds it on the way to the
machine that uses it, so it can never be stale. Nothing is checked in; the
image and the `.prg` on it are gitignored build output.

A Tier 3 case imports `describeFixtures()` and asserts against the bytes and
sizes it returns rather than repeating them, since the fixture is the source of
truth for what is on the card.

## Writing a case

Three tiers. Prefer the highest one that can express the assertion.

### Tier 1 — `basic/*.bas`

A program that prints `PASS` or `FAIL` and nothing else. Most cases should be
these: reviewable in a diff, and runnable by hand at a real prompt.

```basic
# name: GOTO jumps unconditionally
10 GOTO 40
20 PRINT "FAIL FELL THROUGH"
30 END
40 PRINT "PASS"
```

A failing case prints the actual value after `FAIL`, so a failure report says
what went wrong without a re-run. Exactly one verdict line: a program that prints
`PASS` and then falls into its own `FAIL` branch is failing.

### Tier 2 — `console/*.txt`

For what Tier 1 cannot express — the Monitor, error messages, prompts, `LIST`,
immediate mode. Headers, then send/expect lines:

```
name: the Monitor fills a range and dumps it back
mode: monitor

> F 1000 100F AA
> M 1000 100F
~ ^\.:1000 AA AA AA AA AA AA AA AA
! ^\.:1010
```

| | |
|---|---|
| `> text` | type `text` and a CR, then wait for its echo |
| `< text` | send raw bytes (`\r` `\n` `\t` `\e` `\xNN`), waiting for nothing |
| `~ regex` | expect a match in what came back since the last send |
| `! regex` | expect no match, after letting the machine settle |
| `#` | a comment |

Expectations are regexes over console output with `\r` stripped, and `^`/`$`
anchor to a **line**. Every transcript ends by waiting for its mode's prompt,
which is what catches a case that printed the right text and then wedged.

### Tier 3 — `probe/*.mjs`

For assertions the console cannot make: memory, registers, watchpoints, screen
text, VRAM, jump-table addresses.

```js
export const name = 'VOL writes the SID master volume register'
export const profile = 'serial'
export async function run(m) {
  await m.watch(0x9818, 'write')
  await m.send('VOL 9\r')
  m.assertEqual((await m.waitFor({ stopped: true })).stop.kind, 'watchpoint')
  m.assertByte((await m.regs()).A, 0x09)
}
```

`m` is the machine client — `lib/machine.mjs` for the method list, and the
emulator's `docs/DEBUG-PROTOCOL.md` for what sits behind it. The assertions from
`lib/assert.mjs` are on it too.

## Directives

Set as `# key: value` in a `.bas` header, `key: value` in a `.txt` header, or an
`export const` in a `.mjs`.

| | |
|---|---|
| `name` | what the case is called in the report (default: its path) |
| `profile` | `serial` (default), `video`, or `cf` |
| `mode` | `basic` (default) or `monitor` — Tier 2 |
| `hw` | cards to take away — `hw: -cf`, `hw: -sid -rtc`, `hw: -all` |
| `timeout` | per-step timeout in ms (default 20000) |
| `final` | Tier 2's closing expectation; `none` to skip it |
| `xfail` + `issue` | see below |
| `selftest` | `must-fail` — see below |

## hw — running on a machine that is missing a card

The emulator always fits every card, so a machine with an empty slot is reached
through the only thing the ROM actually consults: `HW_PRESENT` at `$030D`, the
record the boot probe left of what it found. `hw: -cf` clears the CF bit after
the snapshot is restored and before the case runs, and the next case's restore
puts it back — nothing needs cleaning up. Names are `ram-l`, `ram-h`, `rtc`,
`cf`, `serial`, `gpio`, `sid`, `video`, and `all`.

Two rows cannot be reached this way, and their cases say so in full: taking the
**serial** card away stops the IRQ handler reading the ACIA, so nothing can be
typed afterwards, and taking **everything** away includes it. Those cases type
their program first and let it clear the mask on itself with a `POKE 781` — the
output path is not gated on the probe, so the verdict still comes back.

## xfail

A case that asserts the behaviour we believe is correct, against a ROM that does
not do it yet. **Never loosen an assertion to accommodate a bug** — no regex that
matches either the right answer or the wrong one.

```
# xfail: a false IF with an ELSE branch raises ?SYNTAX ERROR instead of running it
# issue: tests/FINDINGS.md#else-on-a-false-condition-is-a-syntax-error
```

The reason and the issue are both required; an `xfail` with no explanation is a
suite error, not a skip. **An `xfail` that passes is a failure** — reported red as
`XPASS` — so a drive-by fix cannot leave a stale marker behind. And the count
leads the summary: `13 passed, 0 failed, 2 known-failing` is honest, `13 passed`
with two bugs outstanding is not.

## selftest

A case marked `selftest: must-fail` is expected to fail, and the run goes red if
it passes. There is one per tier, because each tier decides a verdict its own way
and a suite that cannot fail is not testing anything.
