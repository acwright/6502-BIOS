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
| `nvram` | `--headless --nvram fixtures/nvram.bin` | §6.10 (added in phase 5) |

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
- **The splash and menu print on a serial console too** — plain text through
  `Chrout`, left aligned, since a terminal has no width to centre on
  (`tests/probe/splash-prints-on-a-serial-console.mjs`). Found in phase 1 as a
  BIOS bug and fixed after phase 6, once the rendering was decided. It cost one
  `cli`, moved: reading the ACIA status register clears a pending receive
  interrupt, and the transmit loop reads it per character, so printing before
  interrupts were enabled swallowed ESC at the menu.
- `HW_PRESENT` (`$030D`) = `$7F` on the serial profile, `$FF` on the video
  profile. Each bit asserted individually against the README's table.
- `IO_MODE` (`$0306`) = 1 (serial) with no video card, 0 (video) with one.
- `BOOT_VECTOR` (`$035B`) is zeroed by `KernalInit`; setting it non-zero and
  resetting jumps there instead of showing the splash. **Not reachable the way
  that sentence describes**, and the case says why: `Reset` calls `KernalInit`,
  which zeroes the vector, and then reads it. The only window a cartridge can
  write it in is the one instruction between the two — `jsr Beep` — which is
  where `the-boot-vector-takes-over-from-the-boot-menu.mjs` breaks and writes
  it. Setting it from the prompt and resetting would assert something no
  cartridge could do.
- Cold boot leaves `CF_DISK` (`$030F`) at 0.

**What §6.1 handed on.** Everything above is covered. ENTER, a stray key and
the timeout all produce
identical console output, so the three cases assert emulated *cycles* — which
is also what makes them prove each other: if the count were constant, the
"waited" and "did not wait" cases could not both pass.

### 6.2 Kernal jump table — ~8 cases, Tier 3

The `$A000–$A096` slots are published API. One case disassembles all 51 slots and
asserts each is a 3-byte `JMP` — this catches a slot being inserted or dropped,
which silently breaks every cartridge ever built against the ROM. A second case
pins the address of each named entry against a table checked into the repo.

Plus behavioural cases for the slots reachable without hardware: `PrintDecU16`,
`PrintStr`, `PrintCRLF`, `KernalVersion`, `FsGetDisk`/`FsSetDisk`,
`GetIOMode`/`SetIOMode`, `BufferSize`/`WriteBuffer`/`ReadBuffer`.

**The table is 85 slots, not 51.** Found while writing the shape case. The 51
published entries are followed by 34 reserved slots that all jump to a bare
`rts`, and with one pad byte they fill `$A000–$A0FF` exactly. That padding is
the mechanism behind "entries remain stable across BIOS versions" — a new entry
point appends into it instead of pushing the table into the Kernal behind it —
so it is asserted as carefully as the published half, including that a reserved
slot returns cleanly, which is what a cartridge built against a later BIOS gets
when it calls one. The README documents it now.

**`jumptable.json` is checked in, not generated**, unlike every other fixture in
§7. A pin computed from the thing it pins asserts nothing. Three witnesses —
the ROM's symbols, the fixture, and the README's table — because each pair
catches a different mistake, and the README pair catches the realistic one: a
slot moves in `Kernal.asm` and the docs are updated in the same change, which is
good practice and hides the break from every other check.

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

- **Control flow** — `END`, `STOP`+`CONT` (Tier 2, `BREAK IN nnnn`, and
  resuming inside a `FOR` loop or a subroutine — fixed after phase 6), `GOTO`,
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

**What §6.7 hands to later phases.** The list above is covered, plus the Monitor
`L`/`S` round-trip and the populated directory that §6.3 handed here. What is
not:

- The CF-absent rows — `LOAD`/`SAVE`/`DIR`/`DEL`/`BLOAD`/`BSAVE`/`FORMAT` →
  `NO DEVICE`, Monitor `L`/`S`/`@` → `I/O ERROR` — belong to §6.11 and phase 6,
  because the way to reach them is clearing the CF bit in `HW_PRESENT`. There is
  no card-absent state to run on otherwise: the emulator always fits one.
- XModem `LOAD`/`SAVE` with no filename stays out of scope — see §11.
- `DISK 255` is asserted at the bus rather than on the card
  (`tests/probe/the-top-disk-bank-addresses-the-right-sector.mjs`). A card that
  reached bank 255 would be a 256 MB fixture built and read on every run, for
  one assertion about arithmetic that a write watchpoint makes directly.

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
  40-column screen. The serial side is its own case, added after phase 6 when
  the rendering was decided — see §6.1.

**What §6.8 handed on.** `tests/lib/video.mjs` is the driver: there is no serial
stream on this profile, so every wait is a bounded advance of emulated time with
a look at the screen between steps. Two rules in it are load-bearing, and both
first appeared as a screen with one row printed twice — which looks exactly like
a scroll bug and comes and goes with host scheduling. **Read with the machine
paused**, because a scroll copies the name table a row at a time and a read
taken mid-copy is a torn frame. And **require two identical frames**, because a
predicate like "the last row has been printed" is satisfied while the CRLF after
it, the scroll that causes, and the prompt are all still to come.

Where a claim has an invisible half — `CLS`'s cursor reset, one scroll on its
own, a control code — it is asserted through the Kernal slot rather than the
statement, because `call6502` stops the machine the instant the routine returns
and BASIC's prompt has not yet moved everything.

`COLOR` needs one more trick: echoing a keystroke latches a VRAM address, which
is a write to the register under the watchpoint, so typing the statement stops
the machine on the echo of its own first character with the key delivery still
in flight. It is run from a program spinning on `WAIT` against a byte of free
RAM, armed, and then released with a poke.

**`LOCATE` and `COLOR` used to reject nothing** — `LOCATE 24,0` pointed the
cursor past the end of the name table and later output overwrote earlier lines
at an offset, and `COLOR 16,16` was black on black. Both were the `VOL 16`
shape and both are fixed; see §6.10's note for where the room came from.
`COLOR` came out smaller, because the `and #$0F` that made an out-of-range
background fit has nothing left to do.

### 6.9 Sound and GPIO — ~10 cases, Tier 3

SID and VIA registers read back as `$00`, so these use write watchpoints — the
approach is verified (`VOL 9` stops on a write to `$9818` with `A=$09`).

`tests/lib/writes.mjs` is where that lives, and two things in it are
load-bearing. The value is attributed by **decoding the instruction that wrote
it**, because `STX` and `STY` set these registers as often as `STA` does and the
`A` at the stop is then the wrong byte. And **nothing in it resumes the
machine** — in turbo the first write has already stopped the machine before a
host-side resume could be issued, so that resume steps straight past the write
the case cares about and it vanishes from the trace. `body` gets the machine
running; the recorder never touches it.

- `VOL n` writes `n` to `$9818`; `VOL 16` → `ILLEGAL QUANTITY`.
- `SOUND v,f,d` writes the frequency registers for the named voice, and silences
  it afterwards. One case per voice, asserting the correct register block.
  **Voices are 1–3 here and 0–2 at the `SidPlayNote` slot** — deliberate, not a
  slip: the statement follows Commodore BASIC V3.5, whose `SOUND` takes voice#
  1–3, and the Kernal slot is an assembly API indexing the chip's own three
  register blocks. The README used to say 0–2 for both.
- `Beep` (`$A030`) writes voice 1.
- `SidSilence` (`$A036`) **gates off** all three control registers rather than
  zeroing them. Zeroing the frequency stops the oscillator dead and leaves the
  envelope decaying a DC offset — an audible thump at the end of every note —
  which is why the ROM leaves the pitch alone, with a comment saying so. "Stop
  all voices" is the promise and gate off is how a SID keeps it, so that is what
  the case asserts.
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

**What §6.10 handed on.** The `nvram` profile boots against
`fixtures/nvram.bin`, and that is a different assertion from every other NVRAM
case rather than a more convenient one: writing what you read back proves the
path works and proves nothing about the address decode, since a routine that
latched the wrong address consistently writes the wrong byte, reads the wrong
byte, and agrees with itself. The fixture is a permutation, so reading the wrong
address is always visible, and the one byte that genuinely holds zero is what
tells a real zero from the absent card that also "returns 0".

**`SETTIME 24,61,61` was accepted, and fixing it meant finding room first.**
`BASIC` occupied `$C000–$EDFE` of a `$C000–$EDFF` area — one byte free. The
space came from a 40-byte tail that an error, a `STOP` and a Ctrl+C break each
carried their own copy of, now `BasStopAtLine`/`BasStopDirect`: **75 bytes**.
Thirteen range checks across six statements cost 24 of them, because the range
travels with the fetch — `GetComByteLim` is a byte *shorter* per site than the
`jsr ChkCom / jsr GetByt` it replaces. 52 bytes free now, and
`tests/FINDINGS.md` lists the next four candidates with sizes.

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

**What §6.11 found.** Every row is covered, and two of them were not true when
they were first run — see `tests/FINDINGS.md`. The video and SID rows raised
`?NO DEVICE` instead of skipping, so `CLS` at the top of a program stopped it
dead on the serial-only machine most people run; and nothing below BASIC ever
read `HW_PRESENT`, so the Monitor's `L` called an absent card's contents a
missing file and `@` printed what a blank disk prints. Both are fixed, with the
guard moved down to the Kernal routine in each case, so a cartridge calling the
slot gets the same treatment as the statement.

Two rows cannot be reached with the `hw:` directive, and their cases say so:
clearing the **serial** bit stops the IRQ handler filling the input buffer from
the ACIA, so nothing can be typed afterwards, and clearing **everything**
includes it. Those cases type their program first and let it take the cards away
from itself with a `POKE 781`. Output is not gated on the probe, so the verdict
still comes back.

Where a row's promise is that *nothing happens* — the SID and video writes,
`Chrin`'s flow control — the console cannot see it, so it is asserted on the bus
and **the claim is made twice**: with the bit set the routine writes and the
watchpoint catches it, with the bit clear it does not. Without the first half,
"nothing was written" is also what a watchpoint on the wrong address reports.

### 6.12 Pinned regressions — ~8 cases

One case per bug fixed in recent history, named for its commit so the link is
obvious. From the current log:

- `eed5f37` — zero-page clobber in `POKE`, `WAIT`, `COLOR`, `MID$`, `DEF FN`;
  and `LEN`/`VAL`. Each gets a case that fails on the pre-fix ROM. **Four of
  them did not, until phase 6 checked**: `POKE`, `WAIT`, `COLOR` and `DEF FN`
  were built from literals, and every one of those defects was a value parked in
  zero page across an *expression* — a numeric constant never goes near the
  pairs that get trampled. They carry the form that breaks now (`POKE 4097,D`,
  `WAIT` with a `PEEK` for its mask, `COLOR 7,PEEK(4096)`, `FN S(Y)`), and fail
  against `eed5f37~1`. The three older pins were checked the same way and
  already had teeth.
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
- **Every statement with a documented range folded an out-of-range argument
  into a legal one** — `tests/console/sound-and-vol-reject-values-out-of-range.txt`,
  `tests/console/settime-and-setdate-reject-impossible-values.txt` and
  `tests/probe/locate-and-color-reject-values-off-the-screen.mjs`. Found and
  fixed in phase 5. On the pre-fix ROM `VOL 16` sets the volume to *zero*,
  `SOUND 0` plays voice 1, `SETTIME 24,61,61` is accepted and `TIME` then prints
  `24:61:61`, and `LOCATE 24,0` points the cursor past the end of the name table
  and scrambles the screen. None of them said anything.
- **`PRINT HEX()` rejected values above 32767** —
  `tests/console/hex-in-print-and-in-an-expression.txt`. Found and fixed in
  phase 2; the pre-fix ROM raises `?ILLEGAL QUANTITY` for `$8000` upwards.
- **A missing screen or speaker stopped the program** —
  `tests/console/no-video-card-the-screen-statements-do-nothing.txt`,
  `no-sid-card-the-sound-statements-stay-quiet.txt`, and the two bus probes
  beside them. Found and fixed in phase 6; on the pre-fix ROM `CLS` and `VOL 9`
  raise `?NO DEVICE ERROR` and `SidPlayNote` writes a chip that is not there.
- **An absent CF card read as an empty one** —
  `tests/console/no-cf-card-the-monitor-reports-io-error.txt`. Found and fixed
  in phase 6; on the pre-fix ROM the Monitor's `L` reports `FILE NOT FOUND` and
  `@` prints a header with no entries, which is what a blank disk prints.
- **`CONT` could not resume inside a `FOR` loop or a subroutine** —
  `tests/console/cont-resumes-inside-a-loop-and-a-subroutine.txt`. Found in
  phase 2, decided and fixed after phase 6: Microsoft 6502 BASIC resets the
  stack in `CLR`/`RUN`/`NEW` and never on a break, so the frames survive. On the
  pre-fix ROM the resume raises `?NEXT WITHOUT FOR`, and `CONT` after an error
  or a `NEW` resumes into a program that is no longer there.

**Every future bug fix adds a case here.** The rule that makes this section worth
having: a fix is not finished until a test fails without it.

---

## 7. Fixtures

`tests/fixtures/`, all generated by `tests/fixtures/build.mjs` rather than
checked in as binaries, so a diff can review them:

- `test.img` — a CF image with a known directory across disks 0, 1, 2 and 3.
  Built in phase 4. Disk 0 carries the files, disk 1 proves a bank is its own
  namespace, disk 2 is full to its last sector, and disk 3 is where a file
  spilling out of disk 2 would land. Not disk 255, as first planned: that means
  a 256 MB image on every run to assert one piece of arithmetic, which
  `the-top-disk-bank-addresses-the-right-sector.mjs` asserts at the CF address
  registers instead.
- `sample.prg` — the `10 SYS 2060` + machine code image for §6.7. Built in
  phase 4, and written into `test.img` as well as standing alone.
- `opcodes.bin` — a blob exercising every 65C02 addressing mode, for `D`.
- `nvram.bin` — 256 known bytes. Built in phase 5: a permutation, so every
  address holds a different value and none holds its own. Exactly one byte is 0,
  which a permutation cannot avoid and which is worth having — an absent clock
  card also reads as 0, so that address is the case that tells the two apart.
- `jumptable.json` — the pinned `$A000` slot addresses for §6.2. **The one
  fixture that is checked in rather than generated**, for the reason under §6.2:
  a pin computed from the ROM it pins asserts nothing. It is JSON, so a diff
  reviews it as well as it reviews this file.

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
    boot.mjs            # drive the boot menu from a reset, and count cycles
    video.mjs           # drive and read a machine whose console is the screen
    writes.mjs          # record what went out to a write-only register block
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

7. **The serial console never showed the boot splash or menu — fixed.** Found in
   phase 1, decided 2026-07-30, fixed after phase 6 once the rendering was
   settled: the same two lines as plain text through `Chrout`, left aligned,
   because a terminal's width is the user's to choose. It was not emulator-side
   — `--headless` assumes nothing about the console being silent before the
   BASIC banner. `tests/probe/splash-prints-on-a-serial-console.mjs`, and
   `tests/FINDINGS.md` for the `cli` that had to move with it.
