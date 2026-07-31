# BIOS Test Suite — Plan

A regression suite for `BIOS.bin`, run against the A.C. Wright 6502 emulator
(v2.4.0+) in headless mode. The goal is that every Monitor command and every
BASIC keyword has at least one executable assertion behind it, and that a
`make test` failure is the normal way a BIOS regression is discovered.

> **This is now a two-repository release.** The suite has found bugs in
> `6502-EMULATOR` as well as in the ROM, and the emulator bundles the ROM that
> every user runs by default. `6502-BIOS` v1.4 and the emulator's patch release
> go out together, in that order, and neither ships alone. **§10.7 is the
> procedure** — read it before touching either project's release process, and
> before cutting an emulator release to unblock a test.

---

## 1. Objectives

**Primary** — the two things the suite exists for:

1. **Every Monitor command works as documented.** All 17 dispatch entries
   (`X R M D > F T H C G J ; L S @ N #`), their argument forms, their default
   forms, and their error paths.
2. **Every BASIC keyword works as documented.** All 54 statements and 31
   functions in `KeywordTbl`, their operators, precedence, and the 17 error
   messages in `ErrorMessages`.

**Secondary**, because they are cheap once the harness exists:

3. Boot and hardware probe (`HW_PRESENT`, console auto-detect, boot menu).
4. Kernal jump table — the `$A000` slots are a published API and must not move.
5. Graceful degradation — every "NO DEVICE" / "I/O ERROR" path in the README's
   degradation table.
6. Storage round-trips on CompactFlash, including the multi-disk banking.
7. Pinned regressions — one case per historical bug fix, so it cannot come back.

**Explicit non-goals.** The suite does not test the emulator, does not test real
hardware timing, and does not attempt cycle-exact assertions (the BIOS makes no
cycle guarantees). Serial XModem `LOAD`/`SAVE` with no filename is out of scope
for the first pass — see §11.

---

## 2. What the harness gives us

All of the following was verified against `BIOS.bin` at `00db899` before this
plan was written. These are facts, not assumptions.

| Capability | How | Verified |
|---|---|---|
| Boot our ROM, not the bundled one | `6502 run --headless --rom BIOS.bin` | `PRINT 6*7` → ` 42` in 449,280 cycles |
| Console as a byte stream | `--headless` finds no video, routes to serial | stdin/stdout are the terminal |
| Video console + screen scraping | `--console video`, `dbg screen text`, `dbg input type` | 40×24 text read back correctly |
| Monitor entry | `printf '\x1b'` at the splash | `6502 MONITOR v1.1` / `BRK AT $A487` |
| CompactFlash with no image file | CF is present by default; `HW_PRESENT` = `$7F` | `SAVE"T"` → `DIR` → `NEW` → `LOAD"T"` → `RUN` round-trips |
| Simulated missing hardware | `dbg mem write 0x030D <mask>` | clearing bit 3 makes `DIR` print `?NO DEVICE ERROR` |
| Fast per-case isolation | `dbg state save` / `state load` (52 KB) | restores exactly, including `HW_PRESENT` edits |
| Symbolic breakpoints | `cl65 -g -Wl --dbgfile,BIOS.dbg` | 2,114 symbols; `break BasCmdMem` resolves to `$EA99` |
| Write-only register asserts | `dbg break 0x9818 --watch write` | `VOL 9` stops the machine with `A=$09` |
| Determinism | `--rtc 2026-01-01T00:00:00` | the RTC is the only host-clock reader left |

Two constraints found while verifying, which shape the design:

- **SID and VIA registers read back as `$00`** through `mem --space cpu`. Sound
  and GPIO cannot be asserted by reading registers; they need **write
  watchpoints**. This works and is the design for §6.9.
- **`cl65 -Ln` produces an empty label file** — VICE labels only carry exported
  symbols, and the BIOS exports none. The `.dbg` file is the path that works, and
  it produces a **byte-identical binary**, so debug symbols cost nothing.

---

## 3. Build changes

Two additions to the `Makefile`. Neither changes `BIOS.bin`.

```make
# Adds BIOS.dbg (~1 MB, gitignored) alongside the existing outputs.
build: $(TARGET).asm
	cl65 -g -t none -C $(CONFIG).cfg -l $(TARGET).lst \
	     -Wl --dbgfile,$(TARGET).dbg -o $(TARGET).bin $(TARGET).asm

test: build
	tests/run.mjs

test-one: build
	tests/run.mjs --filter "$(T)"
```

Add `BIOS.dbg` to `.gitignore` (it is a build artifact roughly 30× the size of
the ROM).

Verified: `cl65 -g … --dbgfile` and the current recipe produce the same 32 KB
binary, byte for byte. Debug info lives entirely in the side file.

---

## 4. Harness architecture

### 4.1 Runner: Node, one connection

The emulator's own examples use bash with one `6502 dbg` process per call. That
is right for a five-case demo and wrong here: each `dbg` invocation is a fresh
Node process (~100 ms), and this suite will make several thousand calls. A single
persistent WebSocket brings that to ~1 ms per call.

`tests/run.mjs` — zero dependencies, Node ≥22 for the built-in `WebSocket`:

- Spawns `6502 run --headless --debug --quiet --rom BIOS.bin --symbols BIOS.dbg
  --rtc 2026-01-01T00:00:00 --timeout 600s`, plus `--cf` when a case asks for it.
- Polls `~/.6502/session.json` for host/port/token, then opens one WebSocket.
- Boots once, waits for the `OK` prompt, saves `ready.state` in memory (not to
  disk — `state.save` returns the snapshot as JSON).
- Runs every case from that snapshot.
- Reports TAP-ish output plus a summary; exits non-zero on any failure.

**Machine profiles.** Some suites need a different machine. The runner keeps a
small pool, starting each on demand and reusing it:

| Profile | Flags | Used by |
|---|---|---|
| `serial` (default) | `--headless` | almost everything |
| `video` | `--headless --console video` | §6.8 |
| `cf` | `--headless --cf fixtures/test.img` | §6.7 fixtures |
| `nvram` | `--headless --nvram fixtures/nvram.bin` | §6.10 |

Each profile gets its own `--debug-port` and each client its own `--port`, since
only one instance owns the lock file.

### 4.2 The isolation rule

Every case starts with `state.load(ready)` followed by `exec.run`. This is the
load-bearing rule of the whole design:

- A boot costs ~5.36 M emulated cycles; a restore costs about a millisecond.
- It is *exact*. Program text, the variable table, the string heap, VRAM, the
  clock and the CF card's dirty sectors all go back. One case cannot leak into
  the next, which for a suite this size is the difference between trustworthy and
  not.

Cases that deliberately alter machine-wide state — `FORMAT`, `DISK n`,
`SETTIME`, `POKE` into Kernal variables, `HW_PRESENT` masking — need no cleanup
code at all, because the restore is the cleanup.

### 4.3 Never sleep

Every wait is a bounded blocking call: `wait.for` with `serial`, `stopped`,
`cycles` or `expression`, and a timeout. A `sleep` anywhere in this suite is a
bug.

The one subtlety, and it cost time during verification: **`wait.for` defaults
`since` to the last write's cursor**. Waiting for output that was printed before
the write — the boot banner, say — needs an explicit `since: 0`. The runner's
`send(text, pattern)` helper uses the cursor `serial.write` returns, which is the
correct behaviour for the 95% case; a separate `expectFrom(cursor, pattern)`
covers the rest.

---

## 5. Test case formats

Three tiers, in increasing order of power and decreasing order of how many cases
should use them. Prefer the highest tier that can express the assertion.

### Tier 1 — Self-asserting BASIC source (`tests/basic/*.bas`)

The bulk of §6.4–§6.6. A program that prints `PASS` or `FAIL` and nothing else.
Reviewable in a diff, editable by hand, runnable by a human at a real prompt.

```basic
10 A = 6 * 7
20 IF A = 42 THEN PRINT "PASS" : END
30 PRINT "FAIL ";A
```

Typed in line by line, each line gated on the echo of its first word — a stored
program line prints nothing back, so waiting for `OK` after `10 PRINT…` waits out
the timeout. Then `RUN`, wait for `OK`, and the verdict is the `PASS`/`FAIL` line.

Convention: a failing case prints the actual value after `FAIL`, so a failure
report says what went wrong without a re-run.

### Tier 2 — Console transcripts (`tests/console/*.txt`)

For anything Tier 1 cannot express: the Monitor (which has no way to assert on
itself), error messages, prompts, `LIST` output, immediate-mode behaviour.

A case is a sequence of send/expect pairs. Expectations are regexes matched
against console output with `\r` stripped:

```
# tests/console/monitor-fill-hunt.txt
mode: monitor
> F 1000 100F AA
> M 1000 1007
~ ^1000  AA AA AA AA AA AA AA AA
> H 0800 1FFF AA AA AA AA
~ ^1000
```

`mode:` selects the entry path — `basic` (the default) or `monitor` (restore from
a second snapshot taken at the `.` prompt).

### Tier 3 — Probe cases (`tests/probe/*.mjs`)

For assertions the console cannot make: memory contents, register state,
watchpoint hits, screen text, VRAM, jump-table addresses. A small module
exporting `async function run(m)` where `m` is the machine client.

```js
export const name = 'VOL writes the SID master volume register'
export const profile = 'serial'
export async function run(m) {
  await m.watch(0x9818, 'write')
  await m.send('VOL 9\r')
  const stop = await m.waitStopped()
  m.assertEqual(stop.kind, 'watchpoint')
  m.assertEqual((await m.regs()).A, 0x09)
}
```

---

## 6. Suite inventory

Roughly 260 cases. The counts are targets, not quotas — the coverage checklist
below each heading is what actually has to be satisfied.

### 6.1 Boot and hardware probe — ~12 cases, Tier 3

- Splash text and version string match `KernalVersion` (`$A07B`).
- ENTER at the splash boots BASIC; timeout (no key for ~5 s) also boots BASIC.
- ESC boots the Monitor. **Note the real behaviour:** `@BootMonitor` executes a
  `brk`, so the Monitor prints its banner *and* `BRK AT $xxxx` plus registers —
  not the bare banner the README describes. The test encodes the real behaviour;
  the README line is a doc fix to file separately.
- A non-menu key at the splash is swallowed and the countdown continues.
- **Serial splash — currently a known bug, not yet a case.** `Splash`
  (Kernal.asm:2920) is video-only: a serial-only machine shows nothing for the
  whole boot menu window, so a serial user is never told ESC is an option even
  though it works. See `tests/FINDINGS.md#the-splash-and-boot-menu-are-never-shown-on-a-serial-console`
  for the decision (BIOS bug — serial should get the same two lines as plain
  text via `Chrout`, not the video's centred rendering) and what's still open
  (exact rendering, whether the emulator's headless boot detection assumes a
  silent console before `OK`). **Do not write this case until that fix is
  scheduled** — the rendering isn't decided yet, so there's nothing to assert.
- `HW_PRESENT` (`$030D`) = `$7F` on the serial profile, `$FF` on the video
  profile. Each bit asserted individually against the README's table.
- `IO_MODE` (`$0306`) = 1 (serial) with no video card, 0 (video) with one.
- `BOOT_VECTOR` (`$035B`) is zeroed by `KernalInit`; setting it non-zero and
  resetting jumps there instead of showing the splash.
- Cold boot leaves `CF_DISK` (`$030F`) at 0.

### 6.2 Kernal jump table — ~8 cases, Tier 3

The `$A000–$A096` slots are published API. One case disassembles all 51 slots and
asserts each is a 3-byte `JMP` — this catches a slot being inserted or dropped,
which silently breaks every cartridge ever built against the ROM. A second case
pins the address of each named entry against a table checked into the repo.

Plus behavioural cases for the slots reachable without hardware: `PrintDecU16`,
`PrintStr`, `PrintCRLF`, `KernalVersion`, `FsGetDisk`/`FsSetDisk`,
`GetIOMode`/`SetIOMode`, `BufferSize`/`WriteBuffer`/`ReadBuffer`.

### 6.3 Monitor commands — ~55 cases, Tier 2 (Tier 3 for `G`/`J`)

The user's first concern, so this is the most systematic section. Every command
gets: the documented form, the bare/default form where one exists, a boundary
case, and a malformed-input case.

| Cmd | Cases |
|---|---|
| `M` | dump with two addresses; bare `M` continues from last; hex *and* ASCII columns correct; 8 bytes/line; dump across a page boundary; dump of ROM |
| `D` | disassemble a known ROM region against expected text; 20-line default; all addressing modes (a fixture blob exercising each); 65C02-only opcodes (`BRA`, `PHX`, `STZ`, `TRB`, `BBR0`, `RMB0`); undocumented byte renders without crashing |
| `R` | register display format `PC=xxxx A=xx X=xx Y=xx SP=xx NV-BDIZC`; flag letters track `P` |
| `>` | single byte; multiple bytes; verified by reading back with `M`; write to a ZP address |
| `F` | fill a range, verify with `mem.read`; 1-byte range; reversed range (addr2 < addr1) does not run away |
| `T` | non-overlapping copy; forward-overlapping copy; backward-overlapping copy (this is the one that breaks) |
| `H` | pattern found — prints the address; pattern absent — prints nothing; multi-byte pattern; multiple hits |
| `C` | identical regions print nothing; one differing byte prints its address; several differences |
| `G` | `G addr` runs code planted by `>`; registers are restored from the saved set via `RTI`; a planted `BRK` returns to the Monitor with the right `BRK AT` |
| `J` | `J addr` calls a planted `RTS` and returns with a register display; nested `JSR` depth |
| `;` | set `PC`; set `A`; set several out of order; verify with `R` and by `G`ing |
| `L` | `L "file"` from CF at the default `$0800`; `L "file" addr` at a chosen address; missing file → error; CF absent → `I/O ERROR` |
| `S` | `S "file" addr addr` then `@` shows it and `L` reads it back byte-identical; CF absent → `I/O ERROR` |
| `@` | prints `DISK n` header; lists entries; empty directory; 16-entry full directory |
| `N` | `N $FF` → `$00FF +255 %0000000011111111` (verified); `N +255`; `N %11111111`; `N $0` and `N $FFFF` |
| `#` | `#` alone reports current disk; `# 05` selects it; `@` then reflects the new disk; `# FF` boundary |
| `X` | returns to BASIC with the program intact — this is the `.prg` hand-off path in the README |

Also: an unknown command character is rejected without hanging; a blank line
re-prompts; the `.` prompt is exactly `. `.

**What §6.3 hands to later phases.** Everything above is covered except three
things, all of which need something a later phase builds:

- `L` and `S` round-trips, and a populated or full directory, need phase 4's CF
  fixtures. The blank-card cases — an empty `@` listing and `L`'s
  `FILE NOT FOUND` — are done, since the emulator always attaches a card.
- The CF-absent row (`L`/`S`/`@` → `I/O ERROR`) is **not** reachable by
  detaching anything: the emulator's `Machine` always fits a blank 32 MB
  `Storage`, so there is no card-absent state to run on. It is reached the way
  §6.11 reaches every other degradation row — clear the CF bit in `HW_PRESENT`
  at `$030D` — and so it belongs to phase 6, not here.
- `D`'s output is pinned against a planted fixture rather than a ROM region,
  with one ROM case asserting only the jump table's `JMP` stride. Disassembling
  real ROM text would re-pin the ROM's contents into a test about the
  disassembler, and would break on any unrelated Kernal edit.

### 6.4 BASIC statements — ~70 cases, Tier 1 unless noted

Every one of the 54 entries in `KeywordTbl` from `$80 END` to `$B5 MEM`.

- **Control flow** — `END`, `STOP`+`CONT` (Tier 2, `BREAK IN nnnn`), `GOTO`,
  `GOSUB`/`RETURN` incl. deep nesting and exhaustion → `OUT OF MEMORY` (done in
  phase 1),
  `ON…GOTO`, `ON…GOSUB`, out-of-range `ON` index falls through, `IF/THEN`,
  `IF/THEN/ELSE`, `THEN linenum` shorthand, `FOR/NEXT`, `STEP`, negative `STEP`,
  a loop whose body never runs, 8-level nesting and the 9th → `OUT OF MEMORY`,
  `NEXT` with a variable list, `NEXT` without `FOR` → error.
- **Data** — `LET` explicit and implied, `DATA`/`READ`/`RESTORE`, string `DATA`,
  `READ` past the end → `OUT OF DATA`, `DIM` numeric and string, index `0` and
  index `size` both valid, `size+1` → `BAD SUBSCRIPT`, re-`DIM` → `REDIM'D
  ARRAY`, undimensioned array access, `CLR` clears variables but keeps the
  program, `NEW` erases both.
- **I/O** — `PRINT` with `;`, with `,` (14-column zones), trailing `;`, bare
  `PRINT`, the leading-space sign convention, `TAB(n)`, `SPC(n)`, `TAB` to a
  column already passed. `INPUT` (Tier 2) numeric, string, multi-variable, with a
  prompt, `?REDO FROM START` on bad numeric input, `?EXTRA IGNORED`.
- **Program** — `LIST` detokenizes every keyword (one case per token range —
  this is the cheapest way to catch a keyword table/token desync), `RUN`,
  `RUN linenum`, `REM` swallows the rest of the line incl. a `:`.
- **Memory & system** — `POKE`/`PEEK` round-trip, `POKE` boundary values,
  `SYS addr` calling a poked `RTS` and returning, `BANK n`, `MEM` output format,
  `DEF FN`/`FN`, `DEF FN` referring to another function, `BRK` (Tier 2 — enters
  the Monitor, `X` returns).
- **Timing** — `PAUSE n` (Tier 3, assert elapsed cycles are in a sane band),
  `WAIT addr,mask` satisfied immediately, and satisfied by a watchpoint-driven
  poke.

### 6.5 BASIC functions, operators, precedence — ~55 cases, Tier 1

- **Numeric** — `ABS`, `SGN` (all three results), `INT` (including negatives —
  floor, not truncate), `SQR`, `SQR(-1)` → error, `EXP`, `LOG`, `LOG(0)` → error,
  `SIN`/`COS`/`TAN`/`ATN` against known values, `MIN`, `MAX`.
  Float comparisons use an epsilon, since the format is 6 significant digits.
- **`RND`** — `RND(1)` in `[0,1)`, `RND(0)` repeats the last value, `RND(-1)`
  reseeds deterministically. Pin the first three values from a fixed seed so a
  change to the generator is visible.
- **Strings** — `LEN`, `VAL` (numeric, non-numeric → 0, leading spaces, partial
  parse), `ASC`, `CHR$`, `STR$`, `LEFT$`, `RIGHT$`, `MID$` with and without the
  length argument, boundary indices, concatenation, a string that would exceed
  the limit → `STRING TOO LONG`, string comparison operators.
- **System** — `FRE`, `POS`, `PEEK`, `HEX` in `PRINT` (`$xxxx`) and in an
  expression (unchanged), `INKEY` returning 0 with no key and the code with one
  (Tier 3, via `input.key`), `JOY(1)`/`JOY(2)` (Tier 3, via `input.joystick`),
  `NVRAM(addr)`.
- **Operators and precedence** — one case per row of the README's precedence
  table, plus the interactions: `^` right-associativity, unary minus against `^`,
  `NOT`/`AND`/`OR` as bitwise operations on integer parts, relational results
  being exactly `-1`/`0`, parenthesised override, and a deeply nested expression
  → `FORMULA TOO COMPLEX`.

### 6.6 BASIC errors — ~20 cases, Tier 2

One case per string in `ErrorMessages`, each triggered by its minimal cause,
asserting the exact text and that BASIC returns to `OK` rather than wedging:

`SYNTAX`, `OVERFLOW`, `OUT OF MEMORY`, `UNDEF'D STATEMENT`, `BAD SUBSCRIPT`,
`REDIM'D ARRAY`, `DIVISION BY ZERO`, `ILLEGAL DIRECT`, `TYPE MISMATCH`,
`STRING TOO LONG`, `FORMULA TOO COMPLEX`, `ILLEGAL QUANTITY`,
`RETURN WITHOUT GOSUB`, `NEXT WITHOUT FOR`, `OUT OF DATA`, `NO DEVICE`,
`CAN'T CONTINUE`.

Plus: an error inside a running program reports `IN nnnn`; an error in immediate
mode does not; Ctrl+C breaks a running program and `CONT` resumes it.

### 6.7 Storage — ~30 cases, Tier 2 + Tier 3

CF is present on the default headless profile with a synthesized blank card, so
most of this needs no fixture. Verified: `SAVE"T"` / `DIR` / `NEW` / `LOAD"T"` /
`RUN` round-trips and `DIR` reports `T       .    13`.

- `SAVE`/`LOAD` round-trip, program byte-identical afterwards (Tier 3 compares
  `$0800..end` before and after).
- `LOAD` of a missing file; `SAVE` over an existing name; a 17th file into a
  full 16-entry directory.
- `DIR` header, columns, empty directory.
- `DEL` removes an entry; `DEL` of a missing file.
- `BLOAD`/`BSAVE` at a chosen address; `BSAVE` of a length that would run past
  the disk's region; `BLOAD` of a `.bas` file as raw data at `$8000` (the README
  explicitly promises this works).
- `DISK n` selects a bank; files on disk 0 are invisible from disk 1; `DISK 255`;
  a file on disk *n* cannot spill into *n+1*.
- `FORMAT` prompts `ERASE DISK n? (Y/N)`, `N` aborts, `Y` empties the directory.
- **`.prg` survival** — the regression pinned by `73273b6`. Build a fixture
  `.prg` (a `10 SYS 2060` line with machine code behind it), `LOAD` it, assign a
  variable, `RUN` it, and assert the machine code is still intact. Same via the
  Monitor's `L` at the default address followed by `X`.
- `MEM` accounts for a loaded `.prg` in full.

### 6.8 Video — ~15 cases, Tier 3 on the `video` profile

`dbg screen text` returns the name table decoded through CP437; verified working.

- `CLS` clears and homes the cursor.
- `LOCATE r,c` then `PRINT` puts text at the right cell; row 23 / column 39
  boundaries; out-of-range values.
- `COLOR fg,bg` — assert the TMS9918 colour register, not the screen.
- Scrolling: printing past row 23 scrolls up by one and the top line is gone.
- Control codes through `Chrout` — CR, LF, backspace.
- **Character set restore** — the regression pinned by `3194337`. Call
  `InitVideo` (`$A015`) and assert the pattern table at VRAM `$0800` matches the
  CP437 data at ROM `$B800`, in full.
- The splash renders correctly on video — done in phase 1
  (`tests/probe/splash-renders-on-video.mjs`), centred title and menu on the
  40-column screen. The serial side is a separate, currently-unfixed case: see
  §6.1's note and `tests/FINDINGS.md`.

### 6.9 Sound and GPIO — ~10 cases, Tier 3

SID and VIA registers read back as `$00`, so these use write watchpoints — the
approach is verified (`VOL 9` stops on a write to `$9818` with `A=$09`).

- `VOL n` writes `n` to `$9818`; `VOL 16` → `ILLEGAL QUANTITY`.
- `SOUND v,f,d` writes the frequency registers for the named voice, and silences
  it afterwards. One case per voice, asserting the correct register block.
- `Beep` (`$A030`) writes voice 1.
- `SidSilence` (`$A036`) zeroes all three control registers.
- `JOY(1)`/`JOY(2)` return the documented R-L-D-U-Y-X-B-A bitmask, driven by
  `input.joystick`.

### 6.10 Clock and NVRAM — ~12 cases, Tier 2 + Tier 3

`--rtc 2026-01-01T00:00:00` makes this deterministic.

- `TIME` prints `HH:MM:SS`, `DATE` prints `CCYY-MM-DD`, both matching `--rtc`.
- `SETTIME`/`SETDATE` then read back; BCD conversion at the digit boundaries
  (09→10, 59→00); an invalid hour/month.
- `NVRAM a,v` writes and `NVRAM(a)` reads; address 0 and 255; address 256 →
  `ILLEGAL QUANTITY`.
- NVRAM survives a warm reset.

### 6.11 Graceful degradation — ~18 cases, Tier 2

Every row of the README's degradation table. `HW_PRESENT` is patched with
`mem.write` at `$030D` before the case runs — verified: clearing bit 3 makes
`DIR` print `?NO DEVICE ERROR`. The snapshot restore puts it back.

| Cleared bit | Must produce |
|---|---|
| CF (`$08`) | `LOAD`/`SAVE`/`DIR`/`DEL`/`BLOAD`/`BSAVE`/`FORMAT` → `NO DEVICE`; Monitor `L`/`S`/`@` → `I/O ERROR`; no hang |
| Serial (`$10`) | no hang in the IRQ handler; XModem paths return an error |
| VIA (`$20`) | `JOY()` → `$FF`, not 0 — the ports are active low and idle high, so "no VIA" has to read as *nothing pressed*, which is what phase 2 fixed and `JOY reads $FF, not 0, when no VIA is fitted` pins; `PAUSE` still takes roughly the right time via the software fallback |
| SID (`$40`) | `SOUND`, `VOL`, `Beep` return silently, no error |
| Video (`$80`) | `CLS`, `LOCATE`, `COLOR` consume their arguments and do nothing |
| RTC (`$04`) | `TIME`/`DATE`/`SETTIME`/`SETDATE`/`NVRAM` write → `NO DEVICE`; `NVRAM()` read → 0 |
| All (`$00`) | the machine still reaches a usable state on the console it has |

### 6.12 Pinned regressions — ~8 cases

One case per bug fixed in recent history, named for its commit so the link is
obvious. From the current log:

- `eed5f37` — zero-page clobber in `POKE`, `WAIT`, `COLOR`, `MID$`, `DEF FN`;
  and `LEN`/`VAL`. Each gets a case that fails on the pre-fix ROM.
- `73273b6` — a `.prg` survives `LOAD`/`SAVE` (see §6.7).
- `3194337` — `InitVideo` restores the character set (see §6.8).
- **ELSE on a false condition** — `tests/basic/if-then-else.bas` and
  `if-else-linenum.bas`. Found by phase 1, fixed in phase 1. Both fail on the
  pre-fix ROM with `?SYNTAX ERROR`.
- **GOSUB stack overrun** — `tests/console/gosub-too-deep-raises-out-of-memory.txt`.
  Found by phase 1, fixed in phase 1; the pre-fix ROM crashes into the Monitor
  instead. `tests/basic/gosub-nests-deeply.bas` holds the documented floor of 20
  levels alongside it.
- **String DATA read as zero-page garbage** — `tests/basic/data-string-literals.bas`.
  Found and fixed in phase 2. `tests/console/input-reads-numbers-and-strings.txt`
  guards the INPUT side of the routine the fix merged them into.
- **`RUN linenum` ran one statement and stopped** —
  `tests/console/run-from-a-line-number.txt`. Found and fixed in phase 2.
- **String comparison and `VAL` leaked temp descriptors** —
  `tests/basic/string-concat-and-compare.bas` and `val-parses-what-it-can.bas`,
  with `len-asc-chr-str.bas` catching it from a third direction. Found and fixed
  in phase 2; the pre-fix ROM raises `?FORMULA TOO COMPLEX` on all three.
- **`^` associativity and its precedence against unary minus** —
  `tests/basic/power-associativity-and-unary-minus.bas`. Found and fixed in
  phase 2; the pre-fix ROM gives 64 for `2^3^2` and 4 for `-2^2`.
- **`RND(0)` did not repeat the last value** —
  `tests/basic/rnd-range-repeat-and-reseed.bas`. Found and fixed in phase 2.
- **`POS` always returned 0** — `tests/basic/pos-reports-the-print-column.bas`.
  Found and fixed in phase 2.
- **`NEXT` without a `FOR` ran off a garbage stack frame** —
  `tests/console/error-control-flow.txt`. Found and fixed in phase 2; the
  pre-fix ROM prints `?SYNTAX ERROR IN 0`.
- **`F` with a reversed range overwrote all of memory** —
  `tests/console/monitor-fill.txt`. Found and fixed in phase 3; the pre-fix
  ROM wraps through `$FFFF` and never returns.
- **`R`'s PC display did not round-trip with `;`** —
  `tests/console/monitor-registers-and-semicolon.txt`. Found and fixed in
  phase 3; the pre-fix ROM shows `PC=1232` after `; PC 1234`.
- **Bare `M` restarted from `$0000`** —
  `tests/console/monitor-dump-continues-and-spans-pages.txt`. Found and fixed
  in phase 3.
- **`JOY()` reported everything held with no VIA fitted** —
  `tests/probe/joy-without-a-via-reads-released.mjs`. Found and fixed in
  phase 2; the ports are active low, so the pre-fix 0 meant every direction
  and button pressed.
- **The Monitor's `S` wrote another file's length, and past the end of the
  disk** — `tests/console/monitor-saves-and-loads-a-range.txt` and
  `tests/console/monitor-lists-a-populated-directory.txt`. Found and fixed in
  phase 4; on the pre-fix ROM the first reports `SAVED 4 BYTES` for a 16-byte
  range and the second overwrites the next disk's directory.
- **`FORMAT` was unreachable because `FOR` matched first** —
  `tests/console/format-asks-before-erasing.txt`, with
  `tests/basic/for-still-crunches-as-for.bas` guarding the tokenizer change
  from the other side. Found and fixed in phase 4; the pre-fix ROM raises
  `?SYNTAX ERROR`.
- **`PRINT HEX()` rejected values above 32767** —
  `tests/console/hex-in-print-and-in-an-expression.txt`. Found and fixed in
  phase 2; the pre-fix ROM raises `?ILLEGAL QUANTITY` for `$8000` upwards.

**Every future bug fix adds a case here.** The rule that makes this section worth
having: a fix is not finished until a test fails without it.

---

## 7. Fixtures

`tests/fixtures/`, all generated by `tests/fixtures/build.mjs` rather than
checked in as binaries, so a diff can review them:

- `test.img` — a CF image with a known directory across disks 0, 1 and 255.
- `sample.prg` — the `10 SYS 2060` + machine code image for §6.7.
- `opcodes.bin` — a blob exercising every 65C02 addressing mode, for `D`.
- `nvram.bin` — 256 known bytes.
- `jumptable.json` — the pinned `$A000` slot addresses for §6.2.

---

## 8. Repository layout

```
tests/
  run.mjs               # runner: spawn, connect, boot, dispatch, report
  lib/
    machine.mjs         # JSON-RPC client over one WebSocket
    assert.mjs          # assertEqual, assertMatch, assertFloat(eps)
    basic.mjs           # type a .bas in, RUN it, read the verdict
    console.mjs         # the Tier 2 send/expect transcript format
  basic/*.bas           # Tier 1
  console/*.txt         # Tier 2
  probe/*.mjs           # Tier 3
  fixtures/
    build.mjs
```

`tests/*.bin` is already gitignored; widen it to `tests/fixtures/*.img`,
`*.prg`, `*.bin`.

---

## 9. Phasing

Each phase ends with something runnable, and each is independently useful.

| Phase | Deliverable | Rough size |
|---|---|---|
| **1. Harness** | `run.mjs`, the three tier drivers, `make test`, the Makefile `-g` change, the `xfail` mechanism (§10.2) and `--rom` (§10.3). Prove it with §6.4's first ten cases, the splash/`KernalVersion` case from §6.1, *and one deliberately failing case* — a suite that cannot fail is not testing anything. | ~500 lines |
| **2. BASIC core** | §6.4, §6.5, §6.6 — statements, functions, errors. The largest single block and the one that pays back first. | ~145 cases |
| **3. Monitor** | §6.3 in full, plus the `console` transcript format and the monitor snapshot. | ~55 cases |
| **4. Storage** | §6.7 and the CF fixtures. | ~30 cases |
| **5. Hardware** | §6.1, §6.2, §6.8, §6.9, §6.10 — boot, jump table, video, sound, clock. Adds the `video` and `nvram` profiles. | ~57 cases |
| **6. Degradation and pins** | §6.11, §6.12, and the rule that every future fix adds a case. | ~26 cases |
| **7. CI** | GitHub Actions: install cc65, `make`, `make test`. Needs the emulator available to the runner — see §11. | — |
| **8. Release** | **Two repositories, one release.** Bump both BIOS version sites, update the README, tag **v1.4**; then bundle that ROM into the emulator alongside the emulator fixes this build-out found, and cut its patch release. Neither ships alone — see §10.7. | — |

Phases 2–6 are independent of each other once phase 1 lands.

---

## 10. What to do when the suite finds a BIOS bug

The build-out will find bugs — that is the point of it. The risk is the quiet
failure mode: writing a test that codifies whatever the ROM currently does, so
the suite goes green over a real defect and the defect becomes permanent.

**The rule: a test asserts the behaviour we believe is correct. Never the
observed behaviour, when we know the observed behaviour is wrong.** An assertion
is never loosened to accommodate a bug — no regex that matches either the right
answer or the wrong one, no tolerance widened until it passes.

### 10.1 Triage

Every discrepancy between the README and the ROM lands in exactly one bucket
before any test is written:

| Bucket | Test asserts | README | `BIOS.bin` | Version |
|---|---|---|---|---|
| **BIOS bug** — code wrong, docs right | correct behaviour → fails today | unchanged | fixed | → v1.4 |
| **Doc bug** — code right, docs wrong | actual behaviour | corrected | unchanged | stays v1.3 |
| **Undecided** — needs a call | correct behaviour, marked `xfail` | unchanged | unchanged | stays v1.3 |

§6.1's ESC-at-boot case is a worked example of the middle row: the code's `brk`
is deliberate and useful (you get the register display), the README sentence is
simply stale. Test the code, fix the sentence, no version change.

### 10.2 `xfail` — the mechanism that stops a bug going quiet

Part of the phase 1 harness, built before it is needed. A case can be marked:

```
xfail: MID$ with a length of 0 returns the whole string, not ""
issue: #NN
```

Three properties make it trustworthy:

- **The reason and the issue link are required.** An `xfail` with no explanation
  is a suite error, not a skip.
- **An `xfail` that passes is a failure.** "Unexpected pass" is reported red, so a
  drive-by fix cannot leave a stale marker behind and quietly re-open the hole.
- **The summary leads with the count.** `248 passed, 0 failed, 7 known-failing` is
  an honest report. `248 passed` while seven bugs sit unfixed is not — so the
  count is never collapsed into the pass line or hidden behind a flag.

`xfail` is a parking space for a decision, not a resting place. Anything still
marked at the end of a phase gets raised explicitly rather than carried forward.

### 10.3 Prove the test has teeth

A test written *after* a fix, or alongside one, has never been observed to fail —
so it is unproven. Before a fix is committed, run the new case against the
pre-fix ROM and watch it fail:

```sh
git stash && make && cp BIOS.bin /tmp/BIOS-pre.bin && git stash pop && make
tests/run.mjs --rom /tmp/BIOS-pre.bin --filter "<the case>"    # must FAIL
tests/run.mjs --filter "<the case>"                            # must PASS
```

The runner takes `--rom` for exactly this. It is also how §6.12's existing pins
get validated: each of those cases must fail against the ROM built from the
commit before its fix.

### 10.4 Order of work within a phase

1. Write the phase's tests against the README, not against the ROM.
2. Run them. Triage every failure per §10.1 — a failing test is a finding, not a
   test bug, until shown otherwise.
3. Fix the BIOS bugs, **committing each one as it goes green** (§10.6). Each
   commit carries its fix, its pin from §6.12, and its doc change together.
4. Fix the README where the code was right.
5. Phase is done when nothing is red and every `xfail` has been raised.

Writing the tests before looking at the ROM's actual output is what keeps step 2
honest. Reading the output first makes it very easy to write an assertion that
describes it.

### 10.6 Commit as the work happens

**Commit at each green point, when it goes green.** A fix and its pin are one
commit, made as soon as the suite passes with them — not batched up and sorted
out later.

This is a rule about *when*, not about how many. Many small commits are wanted.
What is not wanted is arriving at a large working tree with several fixes in it
and then reconstructing the history — reverting the tree, replaying each change,
committing between. That produces a tidy log, but the tree it replays is not the
tree that was tested, every intermediate state has to be rebuilt from memory, and
the reviewer is reading a story written after the fact. If the log needs to show
one commit per fix, the way to get it is to make them one at a time.

A commit is ready when `make test` is green and the fix, its pinned case, and any
README change are all in it. That is a cheap bar to clear several times an hour,
which is the point: it means there is never a reason to rewind.

### 10.5 Version and release policy

**Bump the version if and only if `BIOS.bin` changes.** The version is a claim
about the ROM's behaviour, and a test suite is not part of the ROM.

- **No BIOS fixes** → commit the suite on `main` and stop. No tag, no bump,
  stays v1.3. A test suite is not a release.
- **Any BIOS fix** → v1.4 once the build-out is complete, not one tag per fix.
  Seven phases with a tag each is noise; one release whose notes list everything
  the suite found is a genuinely useful artifact — and it is the honest framing,
  since the fixes and the suite that found them are one piece of work.
  **v1.4 is already certain**: phase 2 alone fixed nine defects.
- **Urgent exception** — a fix serious enough to want on hardware before the
  build-out finishes gets its own release immediately. Don't sit on a real defect
  waiting for phase 7. That exception releases *both* projects early, per §10.7;
  it does not license shipping a BIOS the emulator does not carry.

Bumping the version means **two** edits that must stay in step:

- `BIOS.inc:119-120` — `BIOS_VERSION_MAJOR` / `BIOS_VERSION_MINOR`, which is what
  `KernalVersion` (`$A07B`) reports.
- `Kernal.asm:2946` — the hardcoded `"-- 6502 BIOS v1.3 --"` splash string.

These can drift, and §6.1's case asserting the splash text against
`KernalVersion` exists precisely to catch it. Write that case early in phase 1
rather than waiting for phase 5 — it is the one test that guards the release
process itself.

`BASIC.asm:8620` (`6502 BASIC V2.0`) and `Monitor.asm:2476` (`6502 MONITOR v1.1`)
version their own components and move on their own schedule; they are not tied to
the BIOS version.

### 10.7 This is a two-repository release

The build-out stopped being a BIOS-only exercise the moment it found a bug on the
other side of the fence. **`6502-BIOS` and `6502-EMULATOR` now ship together, as
one release, and neither goes out alone.**

Two dependencies point in opposite directions, which is what makes this a single
release rather than two:

- **The emulator carries the ROM.** `assets/roms/BIOS.bin` in `6502-EMULATOR` is
  the ROM every user gets when they run the app without `--rom`. Its history —
  `Bundle BIOS v1.3 …`, `Bundle BIOS v1.2 …` — shows it re-bundled for each BIOS
  release, and an emulator shipping a v1.3 ROM after v1.4 exists hands every user
  the bugs this suite just fixed.
- **The BIOS suite depends on the emulator.** Phase 2 found two faults in
  `6502-EMULATOR`'s joystick support (see `tests/FINDINGS.md`), and
  `tests/probe/joy-returns-the-button-bitmask.mjs` cannot pass until they ship.
  Later phases will lean on the emulator harder — §6.8's video probes, §6.9's
  write watchpoints, §6.10's `--nvram` profile — so more of these are likely.

**Order of operations at phase 8.** Each step has to be finished before the next
starts, because each one's artifact is the next one's input:

1. Finish phases 3–7. The emulator changes stay **uncommitted in their working
   tree** until then, deliberately: they are part of this release, not a separate
   drive-by, and holding them keeps the two projects' histories aligned.
2. Bump the two BIOS version sites, update the README, `make test` green, tag
   **v1.4** in `6502-BIOS`.
3. Copy that `BIOS.bin` to `6502-EMULATOR/assets/roms/BIOS.bin`, and commit it in
   the same change as the emulator's own fixes. One commit, so a bisect never
   lands on an emulator carrying a ROM it was not tested against.
4. Release the emulator (a patch bump — its fixes are bugfixes).
5. **Then** delete the `xfail` from the joystick case in `6502-BIOS` and commit.
   This lands after both releases and changes no ROM, so it needs no version
   bump. An `xfail` that passes is reported red, so the first `make test` against
   the new emulator will demand this anyway.

**Release notes span both.** The BIOS tag lists what the suite found in the ROM;
the emulator release lists what it found in the emulator *and* names the BIOS
version it now bundles. A reader of either should be able to tell that the two
went out together.

**Anything the suite finds in the emulator from here follows the same rule**: fix
it in the emulator working tree, record it in `tests/FINDINGS.md` like any other
finding, mark the blocked case `xfail` pointing at that heading, and let it ride
to phase 8. Do not cut an emulator release mid-build-out to unblock a test — that
is how the two histories drift apart.

---

## 11. Open questions and risks

1. **How does CI get an emulator?** The CLI ships inside the app and runs under
   Electron's Node. Options, in the order I'd try them: (a) check out
   `6502-EMULATOR` in the workflow and run `node out/cli/index.js` after
   `npm ci && npm run build:cli` — the emulator's own CI already does this;
   (b) publish the CLI as a small npm package; (c) skip CI and keep the suite
   local-only. **(a) is the recommendation** and needs nothing new from the
   emulator. The runner should take `SIXTY502` as an env var override, as the
   emulator's `examples/lib.sh` does, so local and CI differ by one variable.

   §10.7 strengthens the case for (a): building the emulator from source in CI
   means the suite tests against the emulator fixes *before* they are released,
   which is the only way a case blocked on an emulator bug can go green without
   waiting for a release. Pin the checkout to a ref rather than tracking its
   `main`, or an unrelated emulator change can turn this repo's CI red.

2. **XModem `LOAD`/`SAVE` with no filename.** Testing these means driving both
   ends of the protocol over the same serial console the test harness is using.
   Deferred out of the first pass. If it matters, the approach is a Tier 3 case
   that speaks XModem on the raw `serial.read`/`serial.write` byte stream with the
   console output ignored — feasible, but a project of its own.

3. **The `.dbg` file's line attribution looks wrong.** `sym lookup 0xA000`
   returns `Chrout` correctly but reports `file="Monitor.asm", line=2489`, where
   `Chrout` lives in `Kernal.asm`. Symbol *names and addresses* are correct, which
   is all the suite needs; file/line is not to be trusted for now. Worth a note to
   the emulator project.

4. **README/behaviour mismatch on ESC at boot.** The README says ESC gives "cold
   entry, prints `MONITOR` banner"; the code does `brk`, so it prints the banner
   *and* `BRK AT $xxxx` with registers. The test encodes the code's behaviour and
   the README should be corrected — a separate, one-line change.

5. **Float assertions need an epsilon.** Six significant digits means
   `PRINT SIN(1)` will not equal a double-precision constant. `assertFloat` takes
   a tolerance; transcendental cases compare to what the BIOS actually produces,
   pinned, so the test detects *change* rather than re-deriving mathematics.

6. **Suite runtime.** ~260 cases × (1 ms restore + a few hundred thousand turbo
   cycles) should land well under a minute. If it does not, the lever is fewer
   process spawns, not fewer tests — which is why the runner holds one
   connection rather than shelling out per call.

7. **The serial console never shows the boot splash or menu — decided a BIOS
   bug, not yet fixed.** Found in phase 1 (`tests/FINDINGS.md`); intentionally
   left unfixed until a phase picks it up. `Splash` (Kernal.asm:2920) is gated on
   `HW_VID` and returns immediately without a video card, so a serial user gets
   five silent seconds at boot and no indication ESC is available, even though
   ESC does work. The fix is plain text through `Chrout` — the same two lines,
   not the video path's centred `VideoSetCursor` positioning — presumably at
   cursor home right after boot. **May also touch the emulator**: it isn't known
   whether `--headless`'s boot detection (or `wait.for {serial}` as the examples
   use it) assumes the console is silent until the BASIC banner. Check the
   emulator's own docs/behaviour before assuming this is BIOS-only. No case
   exists for this yet — write one only once the exact serial rendering is
   decided, so the assertion doesn't presume the answer.
