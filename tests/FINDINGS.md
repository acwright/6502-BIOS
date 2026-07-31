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

### SOUND and VOL folded an out-of-range argument into a legal one

- **Bucket:** BIOS bug — code wrong, docs right (plus a separate doc fix, below)
- **Found by:** `tests/console/sound-and-vol-reject-values-out-of-range.txt`
- **Phase:** 5 (found and fixed)

`VOL 16` set the volume to **zero**. `SidSetVolume` masks its argument to four
bits and `BasCmdVol` did not check the range first, so the one value a user is
most likely to try past the documented maximum was silently read as the
minimum. `VOL 255` gave 15. Neither said anything.

`SOUND` had the same shape: `BasCmdSound` decrements the voice to index
`SidPlayNote`'s 0-based blocks, and `SidPlayNote` treats anything that is not 1
or 2 as voice 0. So `SOUND 0` (which is what a reader of the old README typed),
`SOUND 4` and `SOUND 255` all played the first voice without complaint.

Both raise `?ILLEGAL QUANTITY ERROR` now, which is what `NVRAM` already did for
its address and what the rest of this BASIC does with a documented range. The
voice test is one unsigned compare after the decrement: voice 0 underflows to
`$FF`, so `cpx #3 / bcs` catches both ends at once.

The eleven bytes came from somewhere. `Gse:` — an msbasic error trampoline that
was defined and never called from anywhere in the ROM — paid three of them, and
VOL and SOUND share one `jmp IqErr` rather than carrying one each.

### SOUND's voices are numbered from 1, and the README said 0

- **Bucket:** doc bug — code right, docs wrong
- **Found by:** the same case, while deciding what "out of range" meant
- **Phase:** 5

The README's command table said "voice 0–2" and `BasCmdSound`'s own comment
said `X = voice (1..3)`. They cannot both be right, and the code's numbering is
the deliberate one: `SOUND` is modelled on Commodore BASIC V3.5, whose
`SOUND voice#, frequency control, duration` takes voice# 1-3 (verified against
the Plus/4 Encyclopedia, not from memory). The README now says 1–3.

Worth being explicit about the thing that looks like an inconsistency and is
not: BASIC's `SOUND` counts voices from 1 and the `SidPlayNote` Kernal slot
($A033) counts the same three from 0. That is the split between a user-facing
statement following its model and an assembly API indexing the chip's register
blocks. Both are documented, and `tests/probe/sound-plays-a-voice-and-then-
silences-it.mjs` and `tests/probe/the-sid-kernal-slots-play-and-silence.mjs`
sit next to each other holding the two conventions apart.

### The Monitor's S wrote the wrong length, and off the end of the disk

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/monitor-saves-and-loads-a-range.txt` and
  `tests/console/monitor-lists-a-populated-directory.txt`
- **Phase:** 4 (found and fixed)

`S "M" 1000 1010` reported `SAVED 16 BYTES` on an empty disk and
`SAVED 15 BYTES` on a disk that already held a 15-byte file. The length it
wrote was the length of some *other* file.

`FsCalcNextSec` reads every directory entry's size into `FS_FILE_SIZE` while
scanning for the highest used sector, so it comes back holding the last used
entry's size. `FsSaveFileAddrImpl` saves and restores it across that call;
`MonCmdSave`, which carries its own copy of the same save logic, did not. On an
empty disk the scan touches no entry and the omission is invisible — which is
why every earlier test of `S` passed, and why the case that caught it only did
so because the cases before it had left files on the card. The case now saves
two files itself rather than depending on that.

The second defect was in the same block: `MonCmdSave` had no disk-full guard,
so a save with no room left wrote past its disk's region and over the next
disk's directory sector. The pre-fix ROM, asked for 16 bytes on the fixture's
full disk 2, reported `SAVED 4096 BYTES` — the wrong length from the first bug
— and destroyed disk 3's directory with it. The README promises the filesystem
prevents exactly this; `FsSaveFileAddrImpl` implements it and the Monitor's
copy did not. It has the same guard now, reporting `I/O ERROR`.

Both are the duplicate's fault rather than either bug's. The Monitor keeps its
own copy of the load and save paths so it can report `FILE NOT FOUND` and
`DIRECTORY FULL` where the Kernal returns a bare carry, and the price is that
every fix to the Kernal's copy has to be made twice. It was worth 32 bytes to
fix in place this time; a third divergence would be worth merging them and
finding somewhere else to keep the messages.

### FORMAT could not be typed, because FOR matched first

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/format-asks-before-erasing.txt`
- **Phase:** 4 (found and fixed)

`FORMAT` raised `?SYNTAX ERROR`. The statement was implemented, dispatched and
documented; it simply could not be reached from a keyboard.

`BasMatchKeyword` walked `KeywordTbl` and returned the first keyword that
matched, and `FOR` ($81) sits 83 entries ahead of `FORMAT` ($D4). So `FORMAT`
crunched to `FOR` followed by the variable `MAT`, and `LIST` printed it back as
`FORMAT` — tokens are detokenized without spaces, so the listing looked
correct. Reading `$0800` is what settled it: `81 4D 41 54`.

It takes the longest match now, so the result no longer depends on the table's
order. Reordering the table was not an option: a token's value *is* its index,
and three dispatch tables are indexed by it.

Scanning to the end of the table for every keyword turned out to cost real
time — enough that the crunch of one line no longer finished before the next
arrived, and the input buffer dropped characters mid-line. So the scan stops
early unless the input continues with a letter or `$`, the only characters a
keyword is made of: nothing longer can match, and there is no reason to look.
Ordinary typing, where a keyword is followed by a space or a bracket, costs
exactly what it did before. `FORJ=1TO3` is the case that pays, and
`tests/basic/for-still-crunches-as-for.bas` holds both forms of `FOR` to it.

`FOR`/`FORMAT` is the only such pair in the table today. The point of fixing it
in the matcher rather than in the table is that the next one costs nothing.

### R's PC display did not round-trip with ;

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/monitor-registers-and-semicolon.txt`
- **Phase:** 3 (found and fixed)

`; PC 1234` followed by `R` displayed `PC=1232`, and `G` then ran from `$1234`.
Setting a register and reading it back gave a different number.

`MonShowRegs` printed `BRK_PC - 2`, to name the `BRK` instruction rather than
the address after it, while `;` and `G` both treat the field literally. The
display and the two commands that use it disagreed about what it meant.

It prints the saved PC as it stands now. The break location is not lost —
`MonBrkEntry` prints `BRK AT $` with its own adjustment, which is where that
information belongs — and what `R` reports is where `G` will resume, which is
what the saved register actually is. The subtraction was also eight bytes.

Worth being explicit that this changes a familiar display: after a break, `R`
now shows the resume address rather than the `BRK`'s own address, so it reads
two higher than the `BRK AT` line above it. That is the honest reading of "the
saved registers", and it is the only one that lets `;` round-trip.

### F with a reversed range overwrote all of memory

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/monitor-fill.txt`
- **Phase:** 3 (found and fixed)

`F 1207 1200 EE` — a fill whose start is above its end — wrote `$EE` over the
entire address space. The console filled with `î` as the fill marched through
the ROM's own workspace, and the machine did not come back.

`MonCmdFill`'s loop stops only on `MON_ADDR == MON_END`. With the start above
the end that equality is never reached on the way up: the address walks to
`$FFFF`, wraps to `$0000`, and comes round again to meet `MON_END` from below,
by which point it has overwritten everything including the monitor running it.

It now compares the two before the first store and returns without writing when
the start is above the end. Equal addresses still fill one byte, which is the
case the check has to be careful not to swallow.

The suite caught this only because the case was written from the plan's
"reversed range (addr2 < addr1) does not run away", ahead of knowing whether the
ROM handled it. A case written by observing the ROM would have hung and been
quietly rewritten to something friendlier.

### Bare M restarted from $0000 instead of continuing

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/monitor-dump-continues-and-spans-pages.txt`
- **Phase:** 3 (found and fixed)

The README says bare `M` "continues from last address". It dumped from `$0000`
every time.

`MonCmdM` was written for this — its no-address branch is commented "use current
MON_ADDR" — but `MonParseHex4` opens with `stz MON_ADDR` / `stz MON_ADDR+1`, so
it zeroes the address before discovering there are no digits to parse. The
continuation address was destroyed by the attempt to read one.

`MonCmdM` now copies `MON_ADDR` into `MON_TMP` before parsing, and its
no-address branch goes to `@StartOnly`, which already restores from `MON_TMP` for
the one-address form. Eight bytes, and no change to `MonParseHex4` — other
callers pass an address and are unaffected by its zeroing.

### NEXT without a FOR ran off a garbage stack frame

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/error-control-flow.txt`
- **Phase:** 2 (found and fixed)

`NEXT` with no matching `FOR` printed `?SYNTAX ERROR IN 0` instead of
`?NEXT WITHOUT FOR ERROR` — the wrong message, and an `IN 0` that cannot be
right in immediate mode, where there is no line to name.

`GtForPnt` reports "no frame found" by ending its search paths with `lda #0`,
which **sets** Z. `BasCmdNext` tested `beq` for *found*. So a search that found
nothing was read as success: `NEXT` did `txs` onto whatever offset the walk had
left in X, read a frame out of unrelated stack bytes, and eventually died on the
garbage — with `CURLIN` picked up from the same rubbish, hence `IN 0`.

`BasCmdFor` already carried a comment observing that `GtForPnt`'s Z flag cannot
distinguish the two cases, and worked around it by skipping its prior-frame pop
entirely. `BasCmdReturn` escapes because it re-tests the returned tag against
`TOK_GOSUB` itself rather than trusting the flag.

`GtForPnt` now reports found in carry — `sec` on the found path, `clc` on both
not-found paths — and `BasCmdNext` branches on that. Two bytes. `BasCmdFor`'s
branch was switched to carry as well so it is at least honest about which case
it is in; its behaviour is unchanged, since skipping the pop is deliberate.

### PRINT HEX() rejected the top half of the address map

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/hex-in-print-and-in-an-expression.txt`
- **Phase:** 2 (found and fixed)

`PRINT HEX(65535)` raised `?ILLEGAL QUANTITY`, and so did `PRINT HEX(32768)`.

The PRINT-context HEX branch converted with `AyInt`, msbasic's *signed* 16-bit
conversion, which rejects anything from 32768 up. A four-digit `$xxxx` format
covers 0..65535 by construction, and the addresses anyone reaches for HEX to
print — `$8000`, the RAM bank window the README documents — are precisely the
ones in the rejected half. `FacToU16` is the unsigned conversion, already used
by `PEEK`, and it leaves its result in the same `FAC+3`/`FAC+4` that
`PrintHex16` reads. Same instruction size.

Not a bug, and asserted as such: inside `PRINT`, `HEX` is a formatting
directive parsed by the PRINT statement itself, like `TAB` and `SPC`. It takes
its own parenthesised argument and is not an operand, so `PRINT HEX(16) + 0` is
a syntax error. The identity half of the README's sentence is reached by using
`HEX` outside `PRINT`. The first draft of the case got this wrong and asserted
` 16`; the ROM was right.

### POS always returned 0

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/basic/pos-reports-the-print-column.bas`
- **Phase:** 2 (found and fixed)

The README documents `POS(x)` as the current print column. `FnPos` returned a
hardcoded 0, with a comment saying the column was "not yet maintained".

It is maintained: `BAS_POSX` is updated by `PrintCh` on every character and
reset on CR, and both `TAB` and the comma print zones already read it — those
work, which is what makes the stub easy to miss. `POS` reads it now. One byte.

Spotted while reading `FnRnd`'s neighbours rather than by a failing test, which
is worth noting: nothing in §6.5's inventory would have caught a documented
function quietly returning a constant if the case for it had been written to
match the ROM instead of the README.

### `^` associated the wrong way and lost to unary minus

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/basic/power-associativity-and-unary-minus.bas`
- **Phase:** 2 (found and fixed)

`2^3^2` gave 64 and `-2^2` gave 4. Both should be the other reading: 512 and -4.

**Associativity.** `EvalPow` evaluated its right-hand side by calling
`EvalUnary`, one level below, which makes a chain of `^` reduce left to right.
The level's own heading in the source said `(right-associative)` and a comment
underneath admitted the implementation was not, calling it an acceptable
simplification. It evaluates the RHS at its own level now, so the RHS takes the
rest of the chain. `EvalUnary` still runs first inside the recursion, so a term
is always consumed and the depth is bounded by the length of the chain.

**Unary minus.** The README's precedence table puts Power above Unary, but
`EvalUnary`'s negate path evaluated its operand by recursing into itself, which
binds the sign to the atom before `^` is looked at. It evaluates the operand at
the power level now. This had never actually run before: the case asserting it
sat on the line after the associativity assertion, which was failing first.

Both fixes are a single changed jump target apiece and cost nothing in space.

`2^3^2` is compared against a tolerance, not for equality: `^` goes through
exp/log, so the ROM gives 512.000002. That is the six-digit format working as
designed, and 64 and 512 are far enough apart that no tolerance this small
could confuse the two associativities.

### RND(0) returned neither the last value nor a varying one

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/basic/rnd-range-repeat-and-reseed.bas`
- **Phase:** 2 (found and fixed)

The README says `RND(0)` "repeats last value", which is Applesoft's behaviour.
`Rnd` is msbasic's routine verbatim, and its zero path builds a value out of a
free-running entropy source instead — the Commodore behaviour. So `RND(0)`
returned something unrelated to the previous result, and, since nothing in this
machine keeps `ENTROPY` moving, the same unrelated value every time. Neither
documented behaviour, and not useful as either.

Every path through `Rnd` ends by storing its result at `RNDSEED`, so the last
value was already there to hand back. The zero path now loads it and returns.
That is about 12 bytes smaller than the entropy block it replaces.

### String comparison and VAL leaked temp descriptors

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/basic/string-concat-and-compare.bas`,
  `tests/basic/val-parses-what-it-can.bas`, `tests/basic/len-asc-chr-str.bas`
- **Phase:** 2 (found and fixed)

The third string comparison in a program raised `?FORMULA TOO COMPLEX`, and so
did the fourth `VAL` of a literal. The temp string descriptor stack holds three
entries; both routines pushed one per call and never popped it, so any program
doing real string work died after a couple of statements.

Two independent causes, both leaving a slot behind:

**`RelOpsStr`** frees both operands and had the order right, but freeing goes by
the descriptor's *own address* in `FAC+3`/`FAC+4`, and the ARG path copied only
the length and pointer (`ARG`..`ARG+2`) into `FAC`. `FreFac` was left looking at
the right operand's slot, already popped, so `FreTms` never matched `LASTPT` and
the left operand's temp stayed. `PushFac`/`PullArg` already carry those two
bytes through as `ARG+3`/`ARG+4` — they just weren't being copied back.

**`FnVal`** frees its argument on the empty-string path and not on the parsing
path. The free cannot simply be appended after the parse: `FAC+3`/`FAC+4` are
mantissa bytes of the number `Fin` has just produced, and writing the descriptor
address back over them corrupts the result — `VAL("123")` returned `123.000839`
when tried that way. It is freed before parsing instead, which is what msbasic's
`VAL` does. Releasing the heap only marks it reusable, and nothing allocates
between there and `Fin`, so the characters are still intact to parse.

### RUN linenum branched and then stopped

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/console/run-from-a-line-number.txt`
- **Phase:** 2 (found and fixed)

`RUN 20` cleared variables, printed nothing at all, and returned to `OK`.

Bare `RUN` ends by zeroing `CURLIN` to leave direct mode. `RUN linenum` took a
different path — `BasCmdClr` then `BasCmdGoto` — and `BasCmdGoto` only moves
`TXTPTR`. With `CURLIN+1` still `$FF`, `BasNewstt` treated the branch target as
an immediate-mode statement and returned to the READY loop after it, so exactly
one statement ran unless it happened to print.

Fixed by zeroing `CURLIN` on that path too, after the branch rather than before
it, so an undefined target still reports `?UNDEF'D STATEMENT ERROR` without a
spurious `IN 0`.

### READ put garbage in every string DATA item

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/basic/data-string-literals.bas`
- **Phase:** 2 (found and fixed)

`DATA "ONE"` read back as a single garbage character and `DATA TWO` read back
empty. Numeric `DATA` was unaffected, which is why it survived this long.

`StrLt2` takes the source address of the string in `(A,Y)`. `BasCmdRead`'s
string branch never set it — it called `StrLt2` with whatever the preceding
`sta CHARAC` / `sta ENDCHR` had left behind, so the descriptor pointed at `$0022`
(quoted, `A` = `"`) or `$002C` (unquoted, `A` = `,`) and the "string" was
whatever sat in zero page. It also never advanced the data pointer past the item
it had consumed.

`BasCmdInput` had the same job and did it correctly. The two paths are now one
routine, `BasStrItem`, parameterised by the only thing they actually disagree
about: an unquoted `INPUT` item ends at `,`, an unquoted `DATA` item also ends at
`:`. Sharing it was not tidying — the fix pushed the `BASIC` segment 10 bytes
over its memory area, and folding the duplicate back out is what paid for it.

`tests/console/input-reads-numbers-and-strings.txt` was written at the same time
because the refactor moved code INPUT depends on and INPUT had no coverage. It
passes identically on the pre-fix and post-fix ROMs, which is the point of it.

### GOSUB overran the stack instead of raising OUT OF MEMORY

- **Bucket:** BIOS bug — code wrong, docs wrong (both were fixed)
- **Found by:** `tests/basic/gosub-64-deep.bas`, since replaced
- **Phase:** 1 (found and fixed)

The README said "Up to 64 levels deep". Measured: 31 worked, 32 dropped into the
Monitor with `BRK AT $1A8F` — a crash, not a diagnosis.

`BasCmdGosub` pushes a 5-byte frame onto the 6502 hardware stack and nothing
checked the remaining depth. **This is the divergence from MS BASIC** — the
hardware stack is where MS 6502 BASIC keeps GOSUB frames too, so that part was
never wrong, but every msbasic frame push is guarded by `GETSTK`, which raises
`OUT OF MEMORY` when the stack pointer has descended past a margin. The BIOS
ported the frames and not the guard.

Fixed by adding that check, specialised to GOSUB's fixed frame with msbasic's own
arithmetic (`GOSUB_STACK_MIN = $44` = 3*2 bytes of frame + GETSTK's `$3E` margin
for the interpreter's JSR nesting inside the subroutine). `BasError` already
resets the stack pointer, so the error unwinds to `OK` cleanly from any depth.

The 64 was never achievable and came from nowhere: 64 frames is 320 bytes and
page 1 holds 256. Measured after the fix: **27 levels** for a trivial subroutine
body, against 31 before it — four levels traded for not corrupting page 1. The
README now documents a floor of 20 (headroom for a body that nests expressions
or calls `FN`) rather than a ceiling, which is the number
`tests/basic/gosub-nests-deeply.bas` holds us to;
`tests/console/gosub-too-deep-raises-out-of-memory.txt` pins the error itself.

The second half of the original finding — moving the GOSUB stack off page 1 to
reach a larger documented depth — was **declined**. MS BASIC lives with the same
bound (Commodore BASIC manages about 23 levels, Applesoft about 25), so 27 is
already at parity with what the README claims comparability to.

### ELSE on a false condition was a syntax error

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/basic/if-then-else.bas`
- **Phase:** 1 (found and fixed)

`IF 0 THEN B = 1 ELSE B = 2` raised `?SYNTAX ERROR`. The true branch was fine, so
the fault was specifically in reaching ELSE on a false condition.

`BasCmdIf`'s ELSE path found the token and advanced `TXTPTR` past it correctly,
then ended with `rts` — returning to the interpreter loop with `TXTPTR` parked
mid-statement at ` B = 2`, where the loop wants `:` or end-of-line. Hence the
syntax error. The true path a few lines below dispatches with
`jmp BasExecuteStatement` instead, which is what the ELSE path needed too; it now
falls into that same tail. Sharing the tail also gives `ELSE linenum` the
implicit-GOTO shorthand that `THEN linenum` already had, which the README now
documents and `tests/basic/if-else-linenum.bas` pins.

### FOR tests its limit at NEXT — not a bug

- **Bucket:** doc bug — code right, docs incomplete
- **Phase:** 1

`FOR I = 5 TO 1 : ... : NEXT` runs its body once and leaves `I` at 6. PLAN.md
§6.4 expected "a loop whose body never runs", but testing the limit at `NEXT` is
exactly what Microsoft 6502 BASIC does, and the README claims comparability with
it. The ROM is right.

Resolved by asserting the real semantics in
`tests/basic/for-tests-limit-at-next.bas` and saying so in the README's `FOR`
row. No version change.
