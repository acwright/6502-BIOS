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
