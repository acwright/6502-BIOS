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

## ELSE on a false condition is a syntax error

- **Bucket:** BIOS bug — code wrong, docs right
- **Found by:** `tests/basic/if-then-else.bas`
- **Phase:** 1

`IF 0 THEN B = 1 ELSE B = 2` raises `?SYNTAX ERROR` on the line. The true branch
is fine: `IF 1 THEN A = 1 ELSE A = 2` assigns 1 and carries on. So the failure is
specifically in reaching the ELSE branch when the condition is false — the
interpreter appears to skip to the end of the statement without recognising the
`ELSE` token on the way.

The README documents `IF expr THEN stmt [ELSE stmt]` with "else (if present) the
ELSE branch", so the documented behaviour is what the test asserts.

Minimal reproduction, at the prompt:

```basic
10 B = 0
20 IF 0 THEN B = 1 ELSE B = 2
30 PRINT B
RUN
?SYNTAX ERROR IN 20
```

## GOSUB nests 31 levels, not 64, and crashes past that

- **Bucket:** BIOS bug — code wrong, docs right (with a design decision attached)
- **Found by:** `tests/basic/gosub-64-deep.bas`
- **Phase:** 1

The README says "Up to 64 levels deep". Measured: 31 levels work, 32 does not.
At 32 the machine does not report an error — it drops into the Monitor with
`BRK AT $1A8F`, which is a crash, not a diagnosis.

`BasCmdGosub` (BASIC.asm:6684) pushes a 5-byte frame onto the **6502 hardware
stack**, and nothing anywhere checks the remaining depth. With the interpreter's
own `JSR` returns interleaved, page 1 is exhausted at about 8 bytes per level —
hence 31. `OUT OF MEMORY` exists in `ErrorMessages` but no GOSUB path raises it.

Two things are wrong and they are separable:

1. **The crash.** Whatever the limit is, exceeding it must raise `OUT OF MEMORY`
   and return to `OK`, not corrupt page 1. This is not a judgement call.
2. **The limit.** 64 frames is 320 bytes and cannot live in page 1 alongside the
   interpreter's own stack use, so "64" needs either a GOSUB stack somewhere
   else, or a README that says 31.

Fixing (1) is worth doing on its own even if (2) is settled by changing the
document. That decision is open — see PLAN.md §10.1's "undecided" row.

Minimal reproduction:

```basic
10 D = 0
20 GOSUB 100
30 PRINT "DEPTH";D
40 END
100 D = D + 1
110 IF D < 32 THEN GOSUB 100
120 RETURN
RUN
6502 MONITOR v1.1
BRK AT $1A8F
```

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
