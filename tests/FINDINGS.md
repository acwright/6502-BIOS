# Findings

What the test suite has found and not yet resolved. Every `xfail:` marker in a
case points at a heading here, because an `xfail` with nowhere to point is a
bug parked and forgotten — which is the failure mode the marker exists to
prevent.

Triage follows PLAN.md §10.1: a **BIOS bug** is fixed in the ROM and the test
stays as written; a **doc bug** means the code was right and the README is
corrected instead.

A finding leaves this file when it is fixed, and gains a pinned regression case
under PLAN.md §6.12 on the way out.

---

## CONT cannot resume inside a FOR loop

- **Bucket:** undecided — the README does not say either way
- **Found by:** writing `tests/console/ctrl-c-breaks-and-cont-resumes.txt`
- **Phase:** 2
- **Status:** open, no test written

Breaking inside a `FOR` loop and typing `CONT` resumes at the right line and
then fails on the `NEXT`:

```basic
10 FOR I = 1 TO 5
20 IF I = 3 THEN STOP
30 NEXT I
RUN
BREAK IN 20
CONT
?NEXT WITHOUT FOR ERROR IN 30
```

It is not the Ctrl+C path — `STOP` does the same, which is what rules out the
break handler and points at the resume. `FOR` frames live on the 6502 hardware
stack, and the return to the prompt resets the stack pointer, so by the time
`CONT` restores `TXTPTR` and `CURLIN` the frame is gone. `GOSUB` frames live in
the same place and will have the same problem.

**Why this is not filed as a bug yet.** The README promises only that `CONT`
continues after a break; it says nothing about loop context, and the same
limitation is inherent to where msbasic keeps its frames. Fixing it means
saving and restoring the live part of page 1 across the break — real work, and
space this ROM does not obviously have. The alternative is to document the
limitation, which costs nothing and is honest.

Wanted before writing a case: a decision on which of those two. A case asserting
the resume works would be asserting a feature nobody has agreed to build.

## WAI and STP are decoded but not implemented

- **Bucket:** emulator bug
- **Found by:** double-checking the emulator after changing `.setcpu` to
  `W65C02` — not by a failing case
- **Phase:** 3
- **Status:** **open, unfixed, and blocking nothing.** No BIOS test is `xfail`
  for it, because the BIOS does not use either instruction. Recorded so that it
  is a known quantity before anything starts to.

The BIOS now targets the WDC 65C02S and can emit `WAI` and `STP`. The emulator
decodes both correctly — `$CB` and `$DB`, one byte each, and
`src/tests/W65C02S.test.ts` pins the opcode table — but neither *executes*.
Both handlers set `cyclesRem = 0xFF` and return, which is a 255-cycle no-op:

```ts
private STP(): number {
  this.cyclesRem = 0xFF // Set a large cycle count to effectively halt
  return 0
}
```

Confirmed by running them rather than by reading the source:

| Probe | Real W65C02S | Emulator today |
|---|---|---|
| `STP` then `LDA #$42` | never reached without a reset | runs it; `A = $42` |
| `WAI` then `LDA #$42`, no interrupt ever asserted | waits forever | runs it; `A = $42` |
| Cycles for one `WAI` | — | 255 ticks spent, **3** counted |

So `STP` does not stop and `WAI` does not wait; both resume on their own after
255 cycles. The third row is a separate accounting bug in the same two lines:
`cyclesRem` is set directly without a matching `this.cycles +=`, so the counter
the harness meters emulated time with under-reports by 252 per instruction.

**Why it is not fixed here.** A correct implementation needs a halted/waiting
state on the CPU, which is not a two-line change: `step()` loops
`do { tick() } while (cyclesRem > 0)` and would hang outright on a stopped CPU,
the state has to join `getState`/`setState` or snapshots restore a running CPU
over a halted one, and `WAI` has to interact with `irqLine`/`nmi` including the
case where `I` is set and the interrupt is not serviced. That is a design
decision about the emulator, not a defect blocking this suite.

**A trap for whoever does fix it.** `src/tests/CPU.test.ts` currently asserts
the stub — `expect(cpu.pc).toBe(0x8001)` under a comment reading "STP executes
and consumes cycles (instruction completes)". Those tests encode the bug and
will resist a correct implementation, exactly the failure mode PLAN.md §10.4
warns about. They have to be rewritten as part of the fix, not made to pass.

## BRK pushed the return address one byte too high

- **Bucket:** emulator bug
- **Found by:** `tests/console/monitor-go-and-jsr.txt`
- **Phase:** 3
- **Status:** fixed in the `6502-EMULATOR` working tree, uncommitted until phase
  8 per PLAN.md §10.7; the case stays `xfail` until that ships

A `BRK` planted at `$1000` and run with `G 1000` reported `BRK AT $1001` and a
saved `PC` of `$1003`. A 6502 pushes the address of the `BRK` plus two — `$1002`
— so that `RTI` resumes past the one-byte signature that follows the opcode.

Confirmed at the CPU rather than inferred: stepping a single `BRK` at `$1000`
with the debug interface and reading `$01FD..$01FF` back gave `P`, then `$03`,
then `$10`. The pushed value was `$1003`.

`CPU.ts` declares `BRK` with the `IMM` addressing mode, which already advances
the PC past the signature byte, and `BRK()` then called `incPC()` again. This is
the same flaw the widely-copied olc6502 reference carries, so it most likely
arrived with the lineage rather than being introduced here.

The extra increment is removed from `BRK()` rather than changing the table
entry. `IMM` is the right mode for `BRK` — it is genuinely two bytes wide, which
is what the disassembler's opcode table and its CPU cross-check test both
assume, and switching the mode to `IMP` broke that agreement.

**Consequences beyond the Monitor.** Every `BRK`-based return address was one
byte late, so `G` after a break would have resumed one byte past where it should
and executed a wrong instruction. The BIOS's own `BRK AT` display was correct
all along and only looked wrong because the value it adjusts was.

The emulator's `BRK` test asserted the vector jump and the `I` flag but never
what was pushed, which is why this survived. It now asserts the pushed address,
the `B` flag in the pushed status, and the stack pointer.

## JOY reads $FF regardless of the stick

- **Bucket:** emulator bug, plus a BIOS doc/degradation fix (done)
- **Found by:** `tests/probe/joy-returns-the-button-bitmask.mjs`
- **Phase:** 2
- **Status:** cause found and fixed in the emulator working tree; the case stays
  `xfail` until that ships, because the released 2.4.0 still fails it

`JOY(1)` and `JOY(2)` returned 255 whatever was held through `input.joystick`.
The BIOS was not at fault: `ReadJoystick1Impl` reads `GPIO_PORTB` raw and
`ReadJoystick2Impl` reads Port A, which is correct.

**Two emulator faults, both in `6502-EMULATOR`:**

1. **Port A was never driven.** `Machine.ts` built both attachments with
   `new JoystickAttachment(false, 100)`. That first argument is *which port the
   attachment sits on*, so the Port A instance took `readPortA`'s "not mine"
   branch and returned `0xFF` forever — `JOY(2)` could never see an input. The
   attachment's own unit tests pass `true` for a Port A instance, so this was a
   wiring slip in `Machine.ts` alone.

2. **The bits were numbered for a different controller.** The emulator had
   `UP=0x01 DOWN=0x02 LEFT=0x04 RIGHT=0x08 A=0x10 B=0x20 SELECT=0x40
   START=0x80`. The schematic wires the DB9 `P7` RIGHT, `P6` LEFT, `P5` DOWN,
   `P4` UP, `P3` Y, `P2` X, `P1` B, `P0` A/FIRE — the README's R-L-D-U-Y-X-B-A,
   exactly. The constants were renumbered to match and `SELECT`/`START` renamed
   to `X`/`Y`, since that is what this controller has.

One crossover worth remembering, because getting it backwards looks exactly like
a dead port: `input.joystick` side `a` is VIA port A, which the BIOS reads as
**`JOY(2)`**; side `b` is port B and `JOY(1)`.

**Polarity, decided.** The ports are active low — each line pulled up through 1K
and grounded by its switch — and `JOY` returns the port raw, so a held button is
a `0` bit and an untouched stick reads `$FF`. That stays as it is: it costs
nothing and matches what a machine-code caller reading the port sees. What was
wrong was the README's degradation row promising `JOY()` returns 0 with no VIA,
which under active low means *everything held*. `FnJoy`'s absent path returns
`$FF` now, and the README says the polarity outright rather than leaving it to
be inferred. Pinned by `tests/probe/joy-without-a-via-reads-released.mjs`.

**To close this out:** both emulator fixes are applied but deliberately
**uncommitted** in the `6502-EMULATOR` working tree, and stay that way until
phase 8 — PLAN.md §10.7. They ship in the same release as BIOS v1.4, because the
emulator also bundles the ROM, and cutting an emulator release mid-build-out just
to unblock this one case is what would pull the two histories apart.

The bitmask case passes against a build of that working tree —
`SIXTY502="node …/out/cli/index.js" make test` — and fails against the released
2.4.0, which is why the marker is still here. Once the emulator release is out,
delete the `xfail` and commit; that changes no ROM and needs no version bump. An
`xfail` that passes is reported red, so the first run against the new emulator
will demand it.

## The splash and boot menu are never shown on a serial console

- **Bucket:** BIOS bug — code wrong, docs right
- **Decided:** 2026-07-30
- **Found by:** writing `tests/probe/splash-renders-on-video.mjs`
- **Phase:** 1 (found) / not yet scheduled (fix)
- **Status:** decided, not implemented — do not work this until a phase picks
  it up explicitly

README step 8 says the splash is "displayed on the active console", and step 9
describes the ENTER/ESC menu that follows. On a serial-only machine neither
appears: `Splash` (Kernal.asm:2920) tests `HW_VID` and returns immediately if
there is no video card. The menu itself *is* running — ESC at the right moment
does enter the Monitor, and the ~5 s timeout does auto-boot BASIC — but a serial
user sees five seconds of nothing and is never told ESC is an option.

**Decision:** the serial console should show the splash and boot menu too. It
diverges from the video rendering rather than duplicating it: video centres the
title and menu on a 40-column screen (`VideoSetCursor` to row/col, per
`Splash` in Kernal.asm), which has no serial equivalent. Serial output should be
the same two lines as plain text through `Chrout`, presumably at cursor home
(i.e. right after boot, before anything else has been printed) rather than
reproducing the centring math. `Splash` needs a serial-only branch, or a
console-agnostic text path shared with the video one — implementation is open.

**Possibly touches the emulator.** It isn't established what `--headless`
(serial profile) currently assumes about what the BIOS prints before the `OK`
banner, or whether `wait.for {serial}` / the examples' boot detection depend on
the console being silent until BASIC starts. Check the emulator side — probably
`6502-EMULATOR/docs/AGENTS.md` and the `run --headless` boot-detection path —
before assuming this is BIOS-only.

No test written yet, and none should be until this is scheduled: a case would
need to assert the exact serial rendering, which isn't decided (plain two lines?
with CRLF between? menu on the same write or a separate one?).

---

## Resolved

### SETTIME and SETDATE accepted values that are not a time

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/settime-and-setdate-reject-impossible-values.txt`
- **Phase:** 5
- **Phase:** 5 (found), 5 (fixed once the space was found)

`SETTIME 24,61,61` is accepted, and `TIME` then prints `24:61:61`.
`SETDATE 20,26,13,32` is accepted, and `DATE` prints `2026-13-32`.

Neither statement checks anything. `BasCmdSettime` and `BasCmdSetdate` take
whatever `GetByt` returns and hand it to `RtcWriteTime`/`RtcWriteDate`, which
convert binary to BCD and store it. So `61` becomes `$61` in a register whose
two nibbles mean "six tens and one unit" — not an unusual value for a DS1511Y,
an out-of-spec one. On the emulator it reads straight back; on the real part
the behaviour is undefined.

The README does not give ranges for either statement, but it does say `TIME`
prints `HH:MM:SS`, and `24:61:61` is not that. The ranges the case asserts are
the chip's own: hours 0-23, minutes and seconds 0-59, month 1-12, day 1-31.

Day-of-month against the month — rejecting 31 April — is deliberately *not*
asserted, and not implemented. It needs a table and a leap-year rule for one
wrong day a year, and the DS1511Y does not enforce it either.

Months and days count from 1, so those two need a floor as well as a ceiling;
the other five are a single unsigned compare each.

### LOCATE and COLOR accepted values off the screen

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/probe/locate-and-color-reject-values-off-the-screen.mjs`
- **Phase:** 5
- **Phase:** 5 (found), 5 (fixed once the space was found)

The README documents `LOCATE <row>, <col>` as "row 0–23, column 0–39" and
`COLOR <fg>, <bg>` as "0–15 each". Neither is checked, and the two failures are
different in kind.

**`LOCATE` corrupts the screen.** `LOCATE 24,0` computes a VRAM address past
the end of the 960-byte name table, and everything printed afterwards lands
outside the screen or wraps back into the middle of it. Observed: after
`LOCATE 24,0 : PRINT "P";` the next lines of console output overwrote earlier
ones at an offset — a screen reading `OKCATE 24,0 : PRINT "P";` where the
prompt and an echo had been drawn over each other. The machine is still
running; it just cannot be read.

**`COLOR` goes quiet.** `COLOR 16,16` shifts the foreground left four and masks
the background to four bits, so both become 0 — black on black, a blank screen,
for what the user typed as one past the brightest. That is the same shape as
`VOL 16` setting the volume to silence, which this phase fixed.

Both raise `?ILLEGAL QUANTITY ERROR` now, through the same `GetByteLim` the
clock statements use. The case also holds a second line, which the fix satisfies
for free: a rejected `LOCATE` leaves the cursor where it was, because the range
is checked as the argument is fetched and nothing has moved yet.

`COLOR` came out a net two bytes *smaller*. Its background nibble was being
masked with `and #$0F` to make an out-of-range value fit; with the range
enforced there is nothing left to mask.

### The BASIC segment was full

- **Bucket:** neither — a constraint, not a defect
- **Found by:** paying for the `VOL`/`SOUND` range checks in phase 5
- **Phase:** 5 (found and resolved)

`BASIC` occupied `$C000-$EDFE` in a `$C000-$EDFF` memory area. **One byte
free**, against about 1.6 KB spare in `KERNAL` and two bytes in `MONITOR`. That
blocked eleven range checks across four statements, and would have blocked
every BASIC fix the remaining phases found.

**Where the space came from: one duplicated tail.** An error, a `STOP` and a
Ctrl+C break all end the same way — print `" IN nnnn"` if a program is running,
mark direct mode, jump to the REPL — and all three carried their own 40-byte
copy of it, with a fourth path carrying the last eleven bytes on its own. One
routine with two entry points (`BasStopAtLine` for the callers that may have a
line to name, `BasStopDirect` for the one that knows it does not) gave back
**75 bytes**. Entered with a `jmp` rather than a `jsr`, which is what it always
was: none of them come back, and every caller has reset the stack pointer
before it gets there.

**What it was spent on.** The thirteen range checks cost 24 of the 75, and less
than they look, because the fetch and the check were merged rather than stacked:
`GetComByteLim` — a comma, then a byte with a range — is a byte *shorter* per
site than the `jsr ChkCom / jsr GetByt` pair it replaces. `NVRAM` and `WAIT`
took the unchecked `GetComByt` and got shorter too.

**52 bytes free** at the end of it. Candidates found and not taken, if the next
one is needed:

| Duplication | Sites | Rough saving |
|---|---|---|
| `EvalMul`'s `@mul` and `@div` — identical but for the routine called | 2 | ~30 |
| `LEFT$`/`RIGHT$` argument parsing and clamp, identical to the divergence | 2 | ~30 |
| `ChkOpn/FrmEvl/ChkStr/ChkCom/PushFac` — the string-function preamble | 3 | ~20 |
| `LinGet`'s x10 multiply, open-coded twice | 2 | ~15 |

A caution for whoever goes after them: a source-level scan for repeated
instruction sequences will surface the `VT_` variable-table harness around
`BASIC.asm:4823` as a large duplication. It is inside `.if 0` and costs nothing.
