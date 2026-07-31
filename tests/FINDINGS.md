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

---

## Resolved

### Typing a long line could wedge the serial input path

- **Bucket:** BIOS bug — code wrong, and it would wedge real hardware
- **Found by:** phase 7's CI, by being slower than a laptop
- **Phase:** 7 (found and fixed)
- **Pinned by:** `tests/probe/a-byte-arriving-while-chrout-echoes-is-not-lost.mjs`

CI failed `LEFT$, RIGHT$ and MID$` with its line echoed only as far as
`100 IF RIG`, then sixty seconds of nothing. Under load a laptop reproduced it
on a different case and at a different character each time — always part way
through a long program line.

**It was a wedge, not slowness.** Caught in the act, driving the case line by
line, stalled 64 characters into line 60:

```
SC_STATUS=$58   IRQ=0 TDRE=1 RDRF=1 OVR=0
SC_CMD=$09      READ_PTR=$78 WRITE_PTR=$78     (buffer empty)
PC=$c154        I=0                            (interrupts enabled)
after 100,000,000 more cycles: still 64/76 characters
```

A byte held in the receive register, its interrupt already cleared, an empty
input buffer, and a hundred million cycles of no progress.

**The mechanism** is the one PLAN.md §6.1 recorded from phase 1, seen from the
other side. Reading the 6551's status register clears a pending receive
interrupt, and `SerialChroutImpl` read it once per character while waiting for
TDRE. A byte arriving in that window lost its interrupt before `Irq` could see
it; nobody read `SC_DATA`; and because the receive register stayed full the ACIA
would not deliver anything after it. Nothing broke the cycle. A real 6551 clears
the flag on a status read the same way, so this wedged hardware too — anything
sending faster than the ROM echoes, such as pasting into a terminal.

**The fix** is that the transmit wait loop now collects such a byte itself:
`BIT #SC_STATUS_RDRF` on the status it just read, and if one is waiting,
`LDA SC_DATA` into `WriteBuffer`. Three details that shaped it:

- **XModem is excluded.** It turns the receiver interrupt off and polls the chip
  directly, sending its NAK/ACK through `SerialChrout` and then reading the
  reply itself. Draining unconditionally would have stolen the first byte of
  every incoming block. The loop checks `SC_CMD` for `SC_CMD_RXIRQ_OFF` and
  leaves the receiver alone when it is somebody else's — which is also exactly
  where the bug cannot occur, there being no interrupt to lose.
- **`X` is preserved.** `WriteBuffer` uses it, and `Chrout` promises not to.
- **Interrupts are held off** across the read and the buffer write, because
  `WriteBuffer`'s `ldx`/`sta`/`inc` of `WRITE_PTR` is not atomic against `Irq`
  doing the same thing for a keyboard byte.

**Proved both ways** per PLAN.md §10.3. The pinned case builds the interleaving
rather than waiting for it — `SEI`, a delay long enough for the ACIA to deliver,
`JSR SerialChrout`, `CLI` — so it fails deterministically on the pre-fix ROM
with `RDRF=1` and an empty buffer, and passes on the fixed one. And the original
symptom: 300 attempts under load with no stall, where the pre-fix ROM wedged on
attempt 2.

### A wait pattern that a prefix of the answer satisfied

- **Bucket:** suite bug — the ROM was right and the case was wrong
- **Found by:** phase 7's CI, on its first run
- **Phase:** 7 (found and fixed)

`the clock card reads back the NVRAM image it was booted with` failed on CI and
passed everywhere else. It asked for `NVRAM(0)`, waited for `/^ \d+$/`, and then
asserted the value was ` 91` — against a console that said ` 9`.

The wait was satisfied by half of its own answer. `^ \d+$` matches ` 9` as
readily as ` 91`, so a host slow enough to read the console between the two
digits stops there and hands the assertion a number that was still being
printed. A fast host never lands in that window, which is why this was invisible
until CI ran it on two shared cores.

Both NVRAM cases now wait for the `OK` that closes the response and assert
against what came back, which cannot be satisfied early. The general rule is in
`tests/README.md`: **a wait pattern must not be satisfiable by a prefix of the
answer.** Nothing was loosened to fix it — the assertion is the same exact ` 91`
it always was.

### CONT could not resume inside a FOR loop

- **Bucket:** BIOS bug — code wrong, docs silent, and Microsoft 6502 BASIC does
  it the other way
- **Found by:** writing `tests/console/ctrl-c-breaks-and-cont-resumes.txt`
- **Phase:** 2 (found), decided and fixed 2026-07-31

Breaking inside a `FOR` loop and typing `CONT` resumed at the right line and
then failed on the `NEXT`:

```basic
10 FOR I = 1 TO 5
20 IF I = 3 THEN STOP
30 NEXT I
RUN
BREAK IN 20
CONT
?NEXT WITHOUT FOR ERROR IN 30
```

Not the break handler — `STOP` did the same — but the return to the prompt. The
`FOR` frame lives on the 6502 hardware stack, and every path back to `READY`
reset the stack pointer to `$FF`, so by the time `CONT` restored `TXTPTR` and
`CURLIN` the frame was gone. `GOSUB` frames live in the same place and had the
same problem.

**Decided: it should work, because that is what this interpreter is a copy of.**
Microsoft 6502 BASIC resets the stack in `STKINI`, which is reached from `CLR`,
`RUN` and `NEW` — never from `STOP`, `END` or a break. Stopping to look at a
variable and carrying on is the reason `CONT` exists, and the place a program
most needs looking at is the loop that is going wrong.

**How, without msbasic's leak.** msbasic gets away with leaving the stack alone
because its `STOP` key is only polled between statements, where the depth is
exactly the program's frames. This BIOS also polls inside `WAIT`, so a break can
arrive part-way through a statement. So the statement loop records the stack
pointer it starts each statement at (`BAS_STKBASE`, `$0375`), and a break winds
back to *that* rather than to an empty stack: the loop's frames survive, the
half-finished statement's do not. The READY loop re-anchors to the same byte
before every direct-mode line, so a direct `FOR` with no `NEXT` cannot pile up
either — which is a leak msbasic does have.

**The rule that came out of it: the stack reset and `CAN'T CONTINUE` are the
same event.** An error can strike anywhere, including mid-expression, so it has
no boundary to wind back to and keeps resetting the stack — and it now clears
the saved `CONT` position with it, instead of leaving a pointer that would
resume onto a frame that is no longer there. `CLR` resets the stack the way
msbasic's `STKINI` does, popping its return address across the reset, and `NEW`
falls into `CLR` as msbasic's `SCRTCH` does, so erasing the program erases the
promise to resume into it. `RUN` ends in a jump into the statement loop rather
than an `RTS`, because the return address it was dispatched with is one of the
things `CLR` just threw away.

### The splash and boot menu were never shown on a serial console

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** writing `tests/probe/splash-renders-on-video.mjs`
- **Phase:** 1 (found), decided 2026-07-30, fixed 2026-07-31

README step 8 says the splash is "displayed on the active console", and step 9
describes the ENTER/ESC menu that follows. On a serial-only machine neither
appeared: `Splash` tested `HW_VID` and returned immediately with no video card.
The menu itself *was* running — ESC at the right moment did enter the Monitor,
and the ~5 s timeout did auto-boot BASIC — but the user was never told there was
a choice to make, and that is the console most machines built from this BIOS
actually have.

**The serial rendering is plain text, left aligned.** The video path centres
both lines by placing the cursor, and a terminal has no width to centre on — it
is whatever the user chose. So the same two strings go out through `Chrout` with
a CRLF after each, and `tests/probe/splash-prints-on-a-serial-console.mjs`
anchors its match to the line start, so the video path's eight spaces cannot
quietly turn up on a console that cannot promise a width.

**It was not emulator-side after all.** Nothing in `--headless` assumes the
console is silent before the BASIC banner: the input gate is an explicit
`inputAfter` regex the caller supplies, and the `.prg` preload watches BASIC's
zero-page pointers rather than its output.

**What it cost: one `cli`, moved.** With the splash printing, ESC at the boot
menu stopped working. Reading the ACIA's status register clears a pending
receive interrupt — that is the 6551 datasheet, and the emulator implements it —
and the transmit loop reads that register for every character it sends. So a key
pressed while the splash printed sat in the receive register with nothing left
to tell the handler it was there, and the menu never saw it. Interrupts are now
enabled *before* anything is printed rather than after, so the keystroke is in
the input buffer by the time the menu asks. That is a real-hardware bug, not an
emulator artifact, and it would have bitten any output added to the boot path.

### ?NO DEVICE stopped a program for a screen or a speaker it did not need

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/no-video-card-the-screen-statements-do-nothing.txt`
  and `no-sid-card-the-sound-statements-stay-quiet.txt`
- **Phase:** 6 (found and fixed)

The README's degradation table says `CLS`, `LOCATE`, `COLOR`, `VOL` and `SOUND`
skip silently when the card behind them is not fitted, and that `Beep`,
`SidPlayNote` and `SidSilence` do the same at the Kernal slot. All five
statements raised `?NO DEVICE ERROR` instead — `CLS` at the top of a program was
enough to stop it dead on the serial-only machine the default profile is — and
the Kernal routines wrote the chip whatever the probe had found.

**Where the guard belongs.** It moved from the statement to the routine each one
ends in, which is what makes the promise true for a cartridge calling the slot
directly as well. The arguments are parsed and range-checked either way, so
`LOCATE 24,0` and `VOL 16` are still `ILLEGAL QUANTITY` on a machine with
neither card: a program is wrong or right everywhere, not only where it was
written.

**Why these rows are silent and the storage rows are not.** A screen and a
speaker have nothing to hand back, so there is nothing an error could tell the
program that silence does not. `LOAD` and `TIME` do have an answer to return and
cannot, which is why they keep `?NO DEVICE`.

`BIT` rather than `LDA`/`AND` for the guards: video is bit 7 of `HW_PRESENT` and
SID is bit 6, so `N` and `V` carry both without disturbing `A`, which is where
these routines take their argument. BASIC came out 25 bytes smaller.

### Nothing below BASIC ever asked whether a CF card was fitted

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/no-cf-card-the-monitor-reports-io-error.txt`
- **Phase:** 6 (found and fixed)

The README says the storage stack is guarded at every level — Kernal, BASIC and
Monitor — and only BASIC's statements ever read `HW_PRESENT`. On a machine with
an empty slot the Monitor's `L` reported `FILE NOT FOUND`, which sends the user
looking for a filename rather than for the card, and `@` printed nothing at all:
exactly what a blank disk prints. The two states were indistinguishable from the
console.

The guard went into `StWaitReady`, which every read, write and directory listing
passes through first, so one check covers the stack instead of each command
carrying its own — and a machine with no card stops spending a 65536-iteration
timeout per sector to reach the same answer. `StInit` calls the unguarded entry
beneath it, since `HW_CF` is what the probe exists to set.

`@` then had to report the carry it was discarding. The five bytes came from the
four `jsr MonPrintIOErr` / `rts` pairs, which are tail calls, and from that
routine's private copy of the Kernal's `PrintStr` loop. The `MONITOR` segment had
two bytes free and has seven now; the same loop is open-coded at six more sites
there if the next fix needs room.

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
