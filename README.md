6502-BIOS
=========

[![CI](https://github.com/acwright/6502-BIOS/actions/workflows/ci.yml/badge.svg)](https://github.com/acwright/6502-BIOS/actions/workflows/ci.yml)

> 📖 **Guide:** [AC6502 Documentation](https://acwright.github.io/6502-DOCS/) — the user's and programmer's guide for the whole family.
> The tutorial half of what this README specifies lives there: [BASIC](https://acwright.github.io/6502-DOCS/basic/)
> and [assembly and the Kernal API](https://acwright.github.io/6502-DOCS/assembly/).

## Overview

BIOS is the firmware ROM for the [A.C. Wright 6502](https://github.com/acwright/6502-ACE) family of computer systems. It occupies the upper 32KB of the address space (`$8000–$FFFF`) and provides everything the machine needs to go from power-on to a usable computing environment.

This is **BIOS 2.x**: the Kernal, BASIC and Wozmon for a machine whose video card is a [6502-PICOVDP](https://github.com/acwright/6502-PICOVDP). It boots straight to BASIC on a 40×24 Text-mode console with a colour for every cell, hardware scroll and the font the card holds, and BASIC and the Kernal reach the card's modes, palette, layers and sprites. There is no machine-code Monitor and no TMS9918A support; 1.x (branch `v1.x`, tag `v1.6`) is the ROM for a TMS9918A.

The CPU is a **WDC 65C02S**. That is the Rockwell instruction set — including the bit-addressed `RMB`/`SMB`/`BBR`/`BBS` — plus WDC's `WAI` and `STP`. Building the ROM therefore needs cc65's `W65C02` setting, not its narrower `65C02`; `BIOS.asm` asserts this and fails the build with a reason if it is narrowed.

### Boot Sequence

The A.C. Wright 6502 family of computer systems is a modular design where every I/O card is optional. On reset, the Kernal probes each I/O slot to discover which hardware is installed and records the results in a single bitmask byte at `HW_PRESENT` (`$030D`). Only detected hardware is initialised — missing cards are silently skipped and never cause a hang.

The probe-and-boot sequence is:

1. **Clear `HW_PRESENT`** — all bits start at zero
2. **Probe each I/O slot** — RAM (read-back), RTC (NVRAM read-back), CompactFlash (BSY/RDY with timeout), Serial (TDRE after reset), GPIO/VIA (DDR read-back), SID (active oscillator), Video (`STAT4` reads `$AC` and `STAT6` b7, the built-in font, is set — see [Video](#video))
3. **Conditionally initialise** — each subsystem is only initialised if its probe succeeded. The video card is only put back in its reset-time state (the legacy submode, unscrolled); the Text console comes up the first time something is printed
4. **Console auto-detection** — if video is present, `IO_MODE` is set to video; if only serial is present, output is routed to the serial port; if neither is found, `IO_MODE` is left unchanged (no halt — allows cartridges with their own display hardware to boot)
5. **Beep** — a short tone on the SID (skipped silently if SID absent; provides audible feedback that the system is alive)
6. **Boot vector check** — if `BOOT_VECTOR` (`$035B`) is non-zero, jump to the address stored there (cartridge or external program takes over). Otherwise continue to normal boot
7. **Console check** — verify that at least video or serial is present. If neither is found and no boot vector was set, the CPU halts (interactive boot requires a console)
8. **BASIC** — every reset is a cold BASIC start: the header prints, variables are cleared, and a program at `$0800` is kept. On video the screen is cleared and a colour "AC6502" logo is drawn above the header; a serial console gets the text alone, left aligned:

```
AC6502 BIOS v2.0
BASIC v2.0 30718 BYTES FREE
RAM RTC CF SER VIA SID VDP

OK
```

   The third line names the cards the probe found, in `HW_PRESENT`'s bit order.

#### Hardware Presence Flags

The `HW_PRESENT` byte at `$030D` can be read from user code, or from BASIC with `PEEK(781)`. Each bit corresponds to an I/O slot:

| Bit | Mask | Card |
|-----|------|------|
| 0 | `$01` | RAM card low (IO 1) |
| 1 | `$02` | RAM card high (IO 2) |
| 2 | `$04` | RTC DS1511Y (IO 3) |
| 3 | `$08` | CompactFlash (IO 4) |
| 4 | `$10` | Serial R65C51 (IO 5) |
| 5 | `$20` | GPIO/VIA 65C22 (IO 6) |
| 6 | `$40` | SID/ARMSID (IO 7) |
| 7 | `$80` | Video: a PICOVDP with the built-in font (IO 8) |

#### Graceful Degradation

All hardware-dependent operations are guarded at every level — Kernal and BASIC:

- **CompactFlash absent** — `LOAD`, `SAVE`, `DIR`, `DEL`, `BLOAD`, `BSAVE`, `FORMAT` in BASIC print `NO DEVICE`; `StWaitReady` returns an error at once when the boot probe found no card, and times out instead of hanging on a card that stops answering
- **Serial absent** — IRQ handler skips serial status polling; the RTS flow control writes that `ReadBuffer` (and so `Chrin`) makes are suppressed; XModem `LOAD`/`SAVE`/`BLOAD`/`BSAVE` return an error
- **GPIO/VIA absent** — `SysDelay` falls back to a calibrated software busy-loop; `JOY()` returns `$FF` (every line reads released, as an untouched stick does); keyboard IRQ check is skipped
- **SID absent** — `Beep`, `SOUND`, `VOL`, `SidPlayNote`, `SidSilence`, `SidSetVolume` silently return
- **Video absent** — `CLS`, `LOCATE`, `COLOR`, `SCREEN`, `VPOKE`, `VREG`, `PALETTE`, `VLOAD`, `SPRITE`, `SCROLL` and `LAYER` silently skip (arguments are still consumed); `VPEEK()` and `VSTAT()` return 0; `VSYNC` waits 2 cs; `VideoClear`, `VideoSetCursor` and `VideoSetColor` skip with them, so a cartridge calling the slot gets the same treatment; the VDP entries (`VdpInfo` through `VdpStatus`) return carry set having written nothing, and `WaitVBlank` waits 2 cs; console auto-switches to serial. An empty slot, a TMS9918A, and a PICOVDP whose firmware lacks the built-in font all count as absent

The two silent rows are silent because a screen and a speaker have nothing to report back — the statement had no answer to return, so there is nothing an error could say. The rows that move *data* (CompactFlash, RTC) raise `NO DEVICE` instead, because there the program asked for something it did not get. Either way the arguments are parsed and range-checked first: `LOCATE 24,0` and `VOL 16` are `ILLEGAL QUANTITY` on a machine with no screen and no sound card, so a program is wrong or right everywhere rather than only where it was written.
- **RTC absent** — `TIME`, `DATE`, `SETTIME`, `SETDATE`, `NVRAM` (write), `NVSAVE`, `NVLOAD` and `NVERASE` in BASIC print `NO DEVICE`; `NVRAM()` (read) and `NVSTAT()` return 0, `NVFIND()` returns -1; the save-slot routines `NvStat` through `NvFormat` set carry without touching the card

### BASIC

A full interactive floating-point BASIC interpreter is included, with a feature surface comparable to Microsoft 6502 BASIC. Programs are typed line-numbered and executed with `RUN`. Numeric variables hold 5-byte (40-bit) floating-point values; a `$` suffix makes the name a string variable. Each name can additionally be dimensioned as a 1-D array via `DIM`. Multiple statements per line are separated by `:`.

> **Variable names:** any length, letters and digits, but **only the first two characters are significant** — the usual Microsoft BASIC rule. `COUNT` and `COURSE` are the same variable (`CO`), and `PRINT COUNT` after `COUNT = 7 : COURSE = 9` prints `9`. A name may not contain a keyword: `SCORE` will not parse, because it contains `OR`. 2.0's keywords count too, so a 1.x listing whose names begin `VREG`, `LAYER`, `SCROLL`, `SCREEN`, `SPRITE`, `PALETTE`, `VSYNC`, `VLOAD`, `VPOKE`, `VPEEK`, `VSTAT` or `NV` followed by `SAVE`, `LOAD`, `ERASE`, `STAT` or `FIND` crunches differently on 2.0. A tokenized 1.x program loads unchanged, except that a 1.x `BRK` statement (token `$B4`) is now `SCREEN` with no argument, a `?SYNTAX ERROR`.

> **Numeric range:** ~±1.7 × 10³⁸, **nine significant digits** (`PRINT 1 / 3` gives ` .333333333`, `PRINT SQR(2)` gives ` 1.41421356`). Numbers print with a leading-space sign convention (positive numbers prefixed by a space, negative by `-`). Boolean expressions evaluate to `-1` (true) or `0` (false).

**Core Statements**

| Command | Syntax | Effect |
|---------|--------|--------|
| `PRINT` | `PRINT [item [sep item ...]]` | Output items to console. Items may be string or numeric expressions. `;` = no separator (trailing `;` suppresses CRLF); `,` = advance to next 14-column print zone. Bare `PRINT` prints only CRLF |
| `INPUT` | `INPUT ["prompt"{;`&#124;`,}] var [, var ...]` | Read value(s) from the user. Numeric or string vars supported. Re-prompts with `?REDO FROM START` on bad numeric input; `?EXTRA IGNORED` if too many comma-separated values |
| `LET` | `[LET] var = expr` | Assign expression to variable. `LET` keyword is optional |
| `GOTO` | `GOTO linenum` | Jump unconditionally to line `linenum` |
| `GOSUB` | `GOSUB linenum` | Push current position and jump. Nesting is bounded by the 6502 stack, which the frames share with the interpreter's own working space — at least 20 levels are available whatever the subroutine does, and about 27 for a simple one. Exceeding the space raises `OUT OF MEMORY` |
| `RETURN` | `RETURN` | Pop the GOSUB stack and resume after the calling `GOSUB` |
| `IF` | `IF expr THEN stmt [ELSE stmt]` | Execute THEN branch if `expr` non-zero, else (if present) the ELSE branch. `THEN linenum` is shorthand for `THEN GOTO linenum`, and `ELSE linenum` for `ELSE GOTO linenum` |
| `FOR` | `FOR var = init TO limit [STEP step]` | Counted loop. Default step is `1`. Nests 14 deep — see **Stack limits** below. The limit is tested at `NEXT`, as in Microsoft 6502 BASIC, so the body always runs at least once — `FOR I = 5 TO 1` runs once and leaves `I` at 6 |
| `NEXT` | `NEXT [var]` | Increment loop variable and branch back to matching `FOR` if condition holds. **One variable only** — the comma form `NEXT J, I` is not accepted and fails at runtime with `?NEXT WITHOUT FOR ERROR` at the comma |
| `REM` | `REM [text]` | Comment — rest of line is ignored |
| `END` | `END` | Stop execution and return to `OK`. Variables preserved |
| `STOP` | `STOP` | Stop and print `BREAK IN nnnn`. Resume with `CONT` |
| `CONT` | `CONT` | Continue after `STOP`, `END` or a Ctrl+C break (immediate mode only), including from inside a `FOR` loop or a subroutine — the loop and `GOSUB` frames survive the break, so `NEXT` and `RETURN` still find them. `CAN'T CONTINUE` after an error, a `NEW`, a `CLR` or a `RUN`, all of which reset the stack those frames live on |
| `ON` | `ON expr GOTO l1,l2,...` / `ON expr GOSUB l1,l2,...` | Evaluate `expr`, branch to nth target. Out-of-range index silently continues |
| `DATA` | `DATA v1,v2,...` | Inline data for `READ` (numeric or string literals). Skipped during normal execution |
| `READ` | `READ var [,var ...]` | Read next value(s) from `DATA` into variables. `OUT OF DATA` if exhausted |
| `RESTORE` | `RESTORE` | Reset `DATA` pointer to start of program |
| `LIST` | `LIST` | Print the program in detokenized form. Ctrl+C interrupts |
| `RUN` | `RUN [linenum]` | Clear variables and run the program (optionally from `linenum`) |
| `NEW` | `NEW` | Erase the program and clear variables |
| `CLR` | `CLR` | Clear variables and arrays; reset GOSUB/FOR stacks. Program is kept |
| `DIM` | `DIM var(size) [, var(size) ...]` | Dimension a 1-D array (numeric or string), valid indices `0..size`. `REDIM'D ARRAY` if already dimensioned. Only one dimension is supported |
| `DEF FN` | `DEF FN A(X) = expr` | Define a single-argument numeric user function. Call with `FN A(value)` |
| `POKE` | `POKE addr, value` | Write byte `value` to memory address `addr` |

**Storage & System**

| Command | Effect |
|---------|--------|
| `SYS <addr>[,a[,x[,y]]]` | Call a machine-code routine with `A`, `X` and `Y` set (0 if omitted), decimal mode and the interrupt mask clear; `RTS` returns to BASIC. Afterwards `PEEK(787)`, `PEEK(788)`, `PEEK(789)` and `PEEK(784)` are the `A`, `X`, `Y` and `P` it returned |
| `LOAD "name"` | Load a named file from CompactFlash to `$0800` |
| `SAVE "name"` | Save the current program to CompactFlash |
| `LOAD` (no arg) | Receive a program via XModem on the serial port |
| `SAVE` (no arg) | Transmit the current program via XModem |
| `DIR` | List current disk's directory (prints `DISK n` header) |
| `DEL "name"` | Delete a named file from the current disk |
| `DISK <n>` | Select CF disk bank `n` (0–255); resets to 0 on boot. Each disk is 1 MB (2048 sectors) — 256 disks = 256 MB total |
| `BLOAD <addr>[,"name"]` | Load a file's raw bytes from the current disk to address `addr`; with no name, receive them via XModem |
| `BSAVE <addr>,<len>[,"name"]` | Save `len` bytes from address `addr` to a named file on the current disk; with no name, send them via XModem |
| `FORMAT` | Erase the current disk's file directory (prompts `ERASE DISK n? (Y/N)`) |
| `BANK <n>` | Select 1KB RAM bank `n` at `$8000–$83FE` |
| `MEM` | Print free bytes, `HW=$xx`, and `DISK n` |

#### Program Files (`.bas` and `.prg`)

Both extensions name the same thing: the bytes of a program, ready to sit at
`$0800`. A `.prg` is one of these whose BASIC part is a single `10 SYS 2060` line
with machine code attached behind it. The extension is a label for your benefit —
nothing in the BIOS reads it, so name files whatever helps you.

What decides the behaviour is the command, not the filename:

| Command | Use it for |
|---------|------------|
| `LOAD "name"` / `SAVE "name"` | Programs. Loads at `$0800` and readies BASIC to `RUN` it |
| `BLOAD <addr>,"name"` / `BSAVE <addr>,<len>,"name"` | Raw bytes at an address you choose — data, graphics, code |

Both accept any filename, so `BLOAD 32768,"GUESS.BAS"` will happily drop a BASIC
program at `$8000` as raw data.

`LOAD` and `SAVE` round-trip a `.prg` intact, machine code included, and `MEM`
accounts for the whole thing.

Two rules for `.prg` files:

- **Don't edit the BASIC line.** Inserting or deleting a line shifts the attached
  machine code, whose addresses were fixed when it was built. `LIST`, `RUN` and
  `SAVE` are all fine. (The C64 works the same way.)
- **Load them with `LOAD`.** A Wozmon upload does not work — it has no way to
  tell BASIC how long the image is, so the machine code is lost as soon as you
  assign a variable. A loader of your own can say, through `PRG_IMAGE_END`
  (`$038E`); `ProgramEnd` in `Kernal.asm` describes the handover.

**Video & Display**

| Command | Effect |
|---------|--------|
| `CLS` | Clear the screen and reset cursor to (0, 0) |
| `LOCATE <row>, <col>` | Move cursor to row 0–23, column 0–39 |
| `COLOR <fg>[, <bg>[, <border>]]` | Set the pen for text printed next (0–15 each); `bg` defaults to the current background. The border follows `bg` unless `border` is given |
| `SCREEN <n>` | `0` the Text console (`InitVideo` + `CLS`); `1` Compact, `2` Graphics, `3` Full. `1`–`3` share one layout: layer 0 names `$0000`, attributes `$0800`, patterns `$4000` (4bpp, per-cell attributes, on); layer 1 names `$1000`, attributes `$1800`, patterns `$8000` (4bpp, off); sprite attributes `$2000`, patterns `$C000` (64 sprites, 4bpp, all at Y = 240). The tables at `$0000–$1FFF` are cleared |
| `VPOKE <addr>, <value>` | Write a byte to VRAM, `addr` 0–65535 |
| `VREG <reg>, <value>` | Write VDP register `reg` 0–127 (through `VdpWriteReg`) |
| `PALETTE <index>, <r>, <g>, <b>` | Set palette entry 0–255 (at `$FC00 + 2*index`) to `r`, `g`, `b`, 0–15 each |
| `VSYNC` | Wait for the start of the next vertical blank |
| `VLOAD "name", <addr>` | Copy a file from the current disk into VRAM at `addr`, exactly its length. `?LOAD ERROR` if it is not there |
| `SPRITE <n>, <x>, <y>, <pattern>[, <attr>]` | Place sprite 0–63 at `x` 0–511 (384–511 are −128…−1) and `y` 0–255, with `pattern` 0–255 and attributes 0–127 (default 0: b6 priority, b5–b4 flips, b3–b0 sub-palette). Writes the table at `$2000`, where `SCREEN 1`–`3` put it; a program that moves `SPRATTR` uses `VPOKE` |
| `SCROLL <layer>, <x>, <y>` | Scroll layer 0–1 to `x` 0–319, `y` 0–255 |
| `LAYER <layer>, <on>` | Hide layer 0–1 (`on` = 0) or show it |

When a program stops — `END`, `STOP`, an error, Ctrl+C, or running off its last line — and has taken the card out of the Text console with `SCREEN 1`–`3`, `VREG 13`, `SPRITE`, `SCROLL` or `LAYER`, BASIC puts the console back (`InitVideo` + `CLS`) before it prints anything. `VPOKE` and `PALETTE` do not count, so characters a program redefined in Text mode survive `END`. A direct-mode line is the same: `SCREEN 2` typed at the prompt is back to text by the next `OK`.

**Sound**

| Command | Effect |
|---------|--------|
| `SOUND <voice>, <freq>, <dur>` | Play a tone on voice 1–3 at `freq` Hz for `dur` centiseconds, then silence. Numbered from 1 as in Commodore BASIC V3.5; the `SidPlayNote` Kernal slot indexes the same three voices from 0 |
| `VOL <n>` | Set SID master volume (0–15) |

**Timing & I/O**

| Command | Effect |
|---------|--------|
| `PAUSE <n>` | Pause for `n` centiseconds (~10 ms each) |
| `WAIT <addr>, <mask>` | Spin until `(addr) AND mask` is non-zero; Ctrl+C aborts |

**Time & Date**

| Command | Effect |
|---------|--------|
| `TIME` | Print current RTC time as `HH:MM:SS` |
| `DATE` | Print current RTC date as `CCYY-MM-DD` |
| `SETTIME <hh>, <mm>, <ss>` | Set the RTC time |
| `SETDATE <cc>, <yy>, <mm>, <dd>` | Set the RTC date |
| `NVRAM <addr>, <value>` | Write a byte to RTC NVRAM at address 0–255 |
| `NVSAVE <slot>, <id>, <addr>` | Save the 14 bytes at `addr` in save slot 0–15 as owner `id` 1–255 (see [NVRAM Save Slots](#nvram-save-slots)) |
| `NVLOAD <slot>, <addr>` | Copy a valid slot's 14 bytes to `addr`; `?LOAD ERROR`, copying nothing, if the slot is free or damaged |
| `NVERASE <slot>` | Zero all 16 bytes of a save slot |

#### `SAVEMGR.BAS` — save slots from BASIC

`NVSAVE`, `NVLOAD`, `NVERASE`, `NVSTAT()` and `NVFIND()` are the save slots from BASIC. The format (see [NVRAM Save Slots](#nvram-save-slots)) is also simple enough to implement with `NVRAM` alone, which is what this program does: it lists the 16 slots. Its subroutines read, write and erase a slot the same way the Kernal does, so a save written from BASIC loads in a machine-code game, and the other way round.

```basic
10 REM SAVEMGR - LIST THE NVRAM SAVE SLOTS
20 DIM D(13)
30 FOR S = 0 TO 15
40 GOSUB 1000
50 PRINT "SLOT";S;": ";
60 IF T = 0 THEN PRINT "FREE"
70 IF T = 1 THEN PRINT "ID";I
80 IF T = 2 THEN PRINT "DAMAGED ID";I
90 NEXT S
100 END
1000 REM STATUS OF SLOT S: T = 0 FREE, 1 VALID, 2 DAMAGED; I = OWNER ID
1010 B = S * 16 : I = NVRAM(B) : T = 0
1020 IF I = 0 THEN RETURN
1030 C = 166 : V = I : GOSUB 1500
1040 FOR K = 2 TO 15 : V = NVRAM(B + K) : GOSUB 1500 : NEXT K
1050 T = 2 : IF C = NVRAM(B + 1) THEN T = 1
1060 RETURN
1500 REM CHECKSUM STEP: C = ROTATE-LEFT(C) EOR V
1510 C = C * 2 : IF C > 255 THEN C = C - 255
1520 C = (C OR V) - (C AND V)
1530 RETURN
2000 REM WRITE D(0)-D(13) TO SLOT S AS OWNER I (1-255)
2010 B = S * 16 : C = 166 : V = I : GOSUB 1500
2020 FOR K = 0 TO 13 : V = D(K) : GOSUB 1500 : NEXT K
2030 NVRAM B, I : NVRAM B + 1, C
2040 FOR K = 0 TO 13 : NVRAM B + 2 + K, D(K) : NEXT K
2050 RETURN
3000 REM READ SLOT S INTO D(0)-D(13), ONLY IF T = 1
3010 GOSUB 1000 : IF T <> 1 THEN RETURN
3020 FOR K = 0 TO 13 : D(K) = NVRAM(B + 2 + K) : NEXT K
3030 RETURN
4000 REM ERASE SLOT S
4010 B = S * 16 : FOR K = 0 TO 15 : NVRAM B + K, 0 : NEXT K
4020 RETURN
```

To save, set `S`, `I` and `D(0)`–`D(13)` and `GOSUB 2000`. To load, set `S` and `GOSUB 3000`, then check `T`. BASIC has no `XOR`, so line 1520 builds it from `OR` and `AND`, and line 1510 is the rotate: doubling a byte and subtracting 255 when it overflows moves bit 7 round to bit 0.

**Functions & Expressions**

| Function | Returns |
|----------|---------|
| `ABS(x)` | Absolute value of `x` |
| `SGN(x)` | Sign of `x`: `1`, `0`, or `-1` |
| `INT(x)` | Largest integer ≤ `x` (floor) |
| `SQR(x)` | Square root of `x` (error if negative) |
| `EXP(x)` | e raised to `x` |
| `LOG(x)` | Natural logarithm (error if `x ≤ 0`) |
| `SIN(x)` / `COS(x)` / `TAN(x)` | Trig functions, radians |
| `ATN(x)` | Arctangent, radians |
| `RND(x)` | Pseudo-random float in `[0, 1)` for `x > 0`; repeats last value for `x = 0`; reseeds for `x < 0` |
| `PEEK(addr)` | Byte value at memory address `addr` |
| `FRE(x)` | Free bytes between top of variable space and bottom of string heap (argument ignored) |
| `POS(x)` | Current print column (argument ignored) |
| `LEN(s$)` | String length |
| `VAL(s$)` | Parse `s$` as a number; returns 0 if not numeric |
| `ASC(s$)` | ASCII code of first character of `s$` |
| `CHR$(n)` | One-character string with ASCII code `n` |
| `STR$(n)` | Numeric value `n` formatted as a string |
| `LEFT$(s$,n)` / `RIGHT$(s$,n)` | First / last `n` chars of `s$` |
| `MID$(s$,start[,len])` | Substring of `s$` starting at 1-based index `start` |
| `TAB(n)` | In `PRINT`, advance cursor to column `n` (no-op if already past) |
| `SPC(n)` | In `PRINT`, emit `n` spaces |
| `INKEY` | Non-blocking key read: ASCII code or `0`. No parentheses |
| `JOY(1)` / `JOY(2)` | Joystick port 1 or 2 bitmask (R-L-D-U-Y-X-B-A). The port is **active low** — each line is pulled up and grounded by its switch — and the value is the port read raw, so a held button is a `0` bit and an untouched stick reads `$FF`. Test a direction with `IF (JOY(1) AND 16) = 0` |
| `NVRAM(addr)` | Read byte from RTC NVRAM (returns 0 if RTC absent) |
| `NVSTAT(slot)` | Save slot 0–15's state: `0` free, `1` valid, `2` damaged (0 if RTC absent). Its owner ID is `NVRAM(slot*16)` |
| `NVFIND(id)` | The lowest save slot owned by `id` (`0` finds the lowest free slot), or `-1` if there is none (or no RTC) |
| `VPEEK(addr)` | Byte at VRAM address `addr`, 0–65535 (0 if no video card) |
| `VSTAT(n)` | Status register `n`, 0–15 (0 if no video card). `VSTAT(4)` is 172 on a PICOVDP. Reading `VSTAT(0)` clears its flags, as reading `STAT0` does |
| `HEX(n)` | In `PRINT`, output `n` as `$xxxx` hex; in expressions, returns `n` unchanged |
| `MIN(a,b)` / `MAX(a,b)` | Smaller / larger of `a` and `b` |
| `var(index)` | Array element access. Array must be `DIM`-med first |

**Operators**

`+ - * /` — standard arithmetic. `^` — exponentiation. `+` between strings — concatenation. Comparisons `= <> < > <= >=` work on numbers and strings. Logical `AND`, `OR`, `NOT` operate bitwise on the integer parts of operands; relational comparisons return `-1` (true) or `0` (false).

**Operator Precedence** (high to low)

| Level | Operators |
|-------|-----------|
| Power | `^` |
| Unary | `-` (negate), `+` |
| Multiplicative | `*`, `/` |
| Additive | `+`, `-` |
| Relational | `=`, `<>`, `<`, `>`, `<=`, `>=` |
| Logical NOT | `NOT` |
| Logical AND | `AND` |
| Logical OR | `OR` |

> **Stack limits:** GOSUB and FOR/NEXT frames both live on the 6502 stack, which they share with the interpreter's own working space. At least 20 GOSUB levels are available whatever the subroutine does, and about 27 for a simple one; exceeding that raises `OUT OF MEMORY`, because `BasCmdGosub` checks the stack pointer against `GOSUB_STACK_MIN` before it pushes.
>
> **`FOR` has no such guard, and fails differently.** A `FOR` frame is 18 bytes (`TXTPTR`, `CURLIN`, the 5-byte limit, the step sign, the 5-byte step, the variable address, and the `$81` tag), so 14 of them fill page 1. `BasCmdFor` pushes without testing the stack pointer, so the 15th frame overwrites the bottom of the stack instead of raising an error — and the failure surfaces later, at the matching `NEXT`, as **`?NEXT WITHOUT FOR ERROR`**. Fourteen levels of nesting is the working ceiling at the top level of a program, and less inside a `GOSUB`, which shares the same 256 bytes.

> **Memory layout:** Programs grow up from `$0800`. Numeric/string scalar variables follow the program, then arrays, then the string heap which grows down from `$8000`. `MEM` and the cold-boot banner report `MEMSIZ - VARTAB` (free bytes for variables, arrays, and strings combined).

### Machine Code from BASIC

There is no machine-code monitor in 2.x. Machine code is loaded, run and debugged from BASIC:

- **`SYS addr[,a[,x[,y]]]`** — calls a routine with those registers (0 if omitted). What it returns in `A`, `X`, `Y` and `P` is left in `BRK_A`, `BRK_X`, `BRK_Y` and `BRK_P`: `PEEK(787)`, `PEEK(788)`, `PEEK(789)` and `PEEK(784)`.
- **`BLOAD addr[,"name"]` / `BSAVE addr,len[,"name"]`** — raw bytes to and from memory. With a filename they use the CompactFlash card; without one they transfer over XModem on the serial port, as `LOAD` and `SAVE` do. A received file ends on a 128-byte block boundary, padded with `$1A`.
- **`BRK` report** — a `BRK` instruction anywhere prints where it happened and the registers, then returns to the `OK` prompt with the program kept:

  ```
  BREAK $42 AT $0900
  A=09 X=00 Y=00 P=31 S=FD
  ```

  `$0900` is the address of the `BRK` opcode itself, `$42` the byte after it (free for a program to use as a break number), and `S` the stack pointer before the `BRK`. The registers stay in `BRK_A`/`BRK_X`/`BRK_Y`/`BRK_P`/`BRK_SP` (`$0313`/`$0314`/`$0315`/`$0310`/`$0316`), and `BRK_PCL`/`BRK_PCH` (`$0311–$0312`) hold the pushed return address, `BRK` + 2. If a program had taken the video card out of the Text console, the console is put back first. `CONT` cannot continue after a `BRK`. The report is the default handler behind `BRK_PTR` (`$0302`); a program can point `BRK_PTR` at its own, and a cartridge with no BASIC at `$C000` must.
- **Wozmon** — the original Apple I monitor is at `$FF00`. Enter it with `SYS 65280` (`SYS $FF00`); `C000R` returns to BASIC with the program kept.

### Video

The console is a [6502-PICOVDP](https://github.com/acwright/6502-PICOVDP) in its 40×24 Text mode, 6×8 cells, with a colour for every cell. The Kernal and BASIC need nothing else from the card than `SPEC.md` describes; the section numbers below are that file's.

**Detection.** The boot probe selects `STAT4` and looks for `$AC`, records `STAT5` (firmware version) in `VDP_FW` and `STAT6` (capabilities) in `VDP_CAPS`, and sets `HW_VID` only if `STAT6` b7 says the card has the built-in font. The ROM carries no character set, so a card without it is not a console. A TMS9918A takes the probe's select as a harmless register 7 write and is left alone.

**The console comes up on first use.** `KernalInit` leaves the card as its own reset leaves it — the legacy submode, where a program that writes `M1`/`M2`/`M3` and its tables itself gets what a TMS9918 gave it. The first `Chrout`, `VideoClear`, `VideoSetCursor`, `VideoGetCursor` or `VideoSetColor` calls `InitVideo` and clears the screen. BASIC's header is that first output.

**`InitVideo`** writes the Text layout with the display off — name table `$0000`, attributes `$0400`, pattern table `$0800`, palette at `$FC00` (`PALBASE` = `$3F`), layer 1 and sprites off — then writes `FONT` (`$30`) for font `$00` and waits for the vertical blank at which the card copies it into `$0800` (§7), restores palette row 0 (the sixteen TMS9918 colours), sets the border from the pen and turns the display on. It does not clear the screen. It is also the way back to text for a program that changed modes, moved tables or overwrote the glyphs.

**Per-cell colour.** Every character is written with an attribute byte, `fg<<4 | bg`, from the pen `VID_PEN`. `COLOR` and `VideoSetColor` set the pen, so text already on screen keeps its colours; `CLS` fills the whole screen with the pen. The pen survives `NEW`, `RUN`, `CLR` and errors; only `KernalInit` resets it, to `$1F` (black on white).

**Hardware scroll.** Scrolling moves layer 0's origin (`L0SCRY`) down a row and clears the row that becomes the bottom line; nothing is copied. `VID_TOP` is the name-table row shown at the top, so a cell's address is `((row + VID_TOP) mod 24) × 40 + column`. `VideoGetCursor` still returns screen coordinates.

**Ports and the pointer.** The card has two complete port pairs (§4): port A at `$9C00`/`$9C01` and port B at `$9C02`/`$9C03`, each with its own VRAM pointer, command flip-flop and status select.

- The Kernal uses **port A only** and never touches port B. Port B is for interrupt handlers (see [Chaining an IRQ Handler](#chaining-an-irq-handler)), so no VDP work needs `sei`/`cli` around it.
- `VBANK` (register `$08`) and `VINC` (`$09`) are shared by both ports. Every Kernal entry assumes and leaves `VBANK` = 0 and `VINC` = +1. A program or handler that changes either puts it back, or calls `InitVideo`, before anything is printed.
- Outside the boot probe, the Kernal reads `STAT0` only where a caller asks it to (`VdpStatus` with `X` = 0, `VSTAT(0)`). `WaitVBlank` polls `STAT3`, so the `STAT0` flags and `STAT1` latches a program relies on are left alone.

**Back to text.** `VID_MODE` (`$0393`) records whether the Text console is intact. `SCREEN` 1–3, `VREG 13`, `SPRITE`, `SCROLL`, `LAYER` and the matching Kernal entries mark it disturbed; when a BASIC program stops, BASIC then calls `InitVideo` and clears the screen. `VPOKE` and `PALETTE` do not, so glyphs redefined in Text mode survive `END`.

The video variables, after `NV_ID`:

| Address | Name | Meaning |
|---------|------|---------|
| `$0391` | `VID_PEN` | Attribute byte for new output, `fg<<4 \| bg` |
| `$0392` | `VID_TOP` | Name-table row shown at the top (0–23); `L0SCRY` = `VID_TOP` × 8 |
| `$0393` | `VID_MODE` | `$00` console not set up since `KernalInit`; `$01` Text console intact; otherwise the `VMODE` last set, b7 = disturbed |
| `$0394` | `VDP_FW` | `STAT5` at boot, `$00` if no PICOVDP |
| `$0395` | `VDP_CAPS` | `STAT6` at boot, `$00` if no PICOVDP |
| `$0396–$0397` | `VDP_L0CTRL_SHADOW`, `VDP_L1CTRL_SHADOW` | What was last written to the write-only `L0CTRL`/`L1CTRL` |
| `$0398–$039B` | `VDP_P0`–`VDP_P3` | Parameters for `VdpSprite` and `VdpSetScroll` |

### Keyboard

Both a PS/2 keyboard (via CA1 interrupt) and a matrix keyboard (via CB1 interrupt) are supported simultaneously. Key presses are queued in a 256-byte ring buffer at `$0200–$02FF` and read via `Chrin`.

### Joystick

Two joystick ports are supported. `ReadJoystick1` and `ReadJoystick2` each return a bitmask byte in `A`:

```
Bit:  7   6   5   4   3   2   1   0
      R   L   D   U   Y   X   B   A
```

The joysticks share the VIA's two ports with the keyboard encoders, so a read cannot happen until the encoders let go of the lines. Each read therefore runs a fixed sequence:

1. `KBDisable` (`$A099`) raises `CB2`/`CA2` to tell both encoders to release the ports, then busy-waits ~200 µs so they have time to go high-impedance.
2. The 6502 reads the raw port directly — `GPIO_PORTB` for joystick 1, `GPIO_PORTA` for joystick 2.
3. `KBEnable` (`$A09C`) lowers `CB2`/`CA2` to hand the ports back to the encoders.

The keyboard is briefly offline for the duration — roughly 200 µs per read — but the encoders buffer PS/2 and matrix keystrokes across the gap and resume their scan where they left off, so nothing is dropped. Because both ports are released together, both sticks can be read in a single disable/enable window: a caller that wants both at once should bracket two raw reads with its own `KBDisable`/`KBEnable` rather than paying the settle twice. This is exactly what `JOY()` in BASIC does, one stick at a time.

### CompactFlash Storage

A simple flat filesystem is stored on a CompactFlash card (true 8-bit IDE). The card is divided into up to **256 disk banks** of 1 MB each (2048 sectors × 512 bytes), giving a maximum usable capacity of **256 MB**. The current disk bank is selected with `DISK n` in BASIC (or `FsSetDisk`), and resets to 0 (disk 0) on power-on or reset.

Within each disk, the directory lives at the first sector (LBA `n×2048`) and holds up to **16 entries** (8.3 filenames). Data sectors follow contiguously. The filesystem prevents a file on one disk from spilling into the next disk's region.

`LOAD`/`SAVE`/`DIR`/`DEL` in BASIC, and the Kernal's filesystem entries, all operate on the currently selected disk bank. `BLOAD` and `BSAVE` load/save raw binary data to/from any memory address, making it straightforward to load game maps, graphics, or data files while a program is running.

Assembly programs can access disk storage directly through the Kernal jump table (see `FsLoadFileAddr`, `FsSaveFileAddr`, `FsSetDisk`, and `FsFormatDisk` below).

### Serial I/O & XModem Transfer

A 6551 ACIA provides a serial port at 19200 baud (8-N-1). The `IO_MODE` Kernal variable selects whether `Chrout` routes to video or serial. `LOAD`/`SAVE`, and `BLOAD`/`BSAVE`, without a filename use the standard XModem protocol (128-byte blocks with checksum) to transfer programs and raw bytes over serial. The receiver initiates the transfer by sending NAK; the sender responds with data blocks; each block is acknowledged before the next is sent. The last block is padded with SUB (`$1A`). Compatible with any terminal program that supports XModem (checksum mode).

When an XModem transfer is initiated, the system prints `XMODEM RX READY` (receive) or `XMODEM TX READY` (send) and waits up to ~60 seconds for the terminal program to start the transfer, giving ample time to configure and begin the transfer in your terminal program.

### Real-Time Clock

A DS1511Y RTC provides time and date. `RtcReadTime` returns hours/minutes/seconds in `A`/`X`/`Y` (binary). `RtcReadDate` returns date/month/year. 256 bytes of battery-backed NVRAM are accessible via `RtcReadNVRAM` / `RtcWriteNVRAM`.

#### NVRAM Save Slots

The NVRAM is also a game-save area of **16 slots**, which the Kernal reads and writes by slot number (`NvStat`, `NvRead`, `NvWrite`, `NvErase`, `NvFind`, `NvFormat`, from `$A09F`). Slot `n` occupies NVRAM `n*16` to `n*16+15`:

| Offset | Contents |
|--------|----------|
| `+$0` | Owner ID. `$00` means the slot is free; any other value is an identity byte the game chooses |
| `+$1` | Checksum |
| `+$2–$F` | 14 payload bytes |

The checksum covers the owner ID and the 14 payload bytes, in that order, skipping the checksum byte itself:

```
ck = $A6
for each byte b:  ck = rotate_left_8(ck) EOR b
```

The rotate catches transposed bytes, which a plain sum would miss. The nonzero seed stops an all-`$FF` slot, which is what an erased or unpowered part holds, from passing. Each slot is validated on its own, with no shared directory, so one damaged slot never takes the others with it.

`NvStat` reports a slot as `NV_EMPTY` (0, owner ID `$00`), `NV_VALID` (1, checksum agrees) or `NV_BAD` (2, checksum does not). All six follow the same rules:

- **Carry set means the call did nothing.** That covers no RTC fitted, a slot number of 16 or more, `NvWrite` given `NV_ID` = 0 (use `NvErase`), `NvFind` with no match, and `NvRead` on a slot that is not `NV_VALID`. A failed `NvRead` still returns the status in `A` and the owner ID in `Y`, so a game can tell "no save yet" from "your save is damaged". It never writes the buffer.
- **`X` is preserved** by `NvStat`, `NvRead`, `NvWrite` and `NvErase`, so a loop over the slots needs no reload. `NvRead` and `NvWrite` clobber `STR_PTR` (`$02–$03`), as `PrintStr` does.
- **The caller's decimal and interrupt flags come back unchanged.** A game that keeps its score in decimal mode can save safely. Interrupts are held off for the few hundred microseconds a slot copy takes, because the copy uses the DS1511Y's burst mode, where every access of the data port moves the address. For the same reason, **an NMI handler must not touch NVRAM**, since NMI cannot be masked.
- **Burst mode is off again on return**, so `RtcReadNVRAM` / `RtcWriteNVRAM` keep their one-byte-per-call behaviour.
- `NvFind` matches damaged slots as well as valid ones, and returns the lowest-numbered match. A game that finds its ID and then gets carry from `NvRead` knows its save was damaged, rather than starting over as if it had none.

A typical startup and save, where `SAVE_BUF` is the game's own 14 bytes:

```asm
        lda #MY_GAME_ID
        jsr NvFind              ; X = my slot, carry set if none
        bcc @Load
        lda #$00
        jsr NvFind              ; X = first free slot
        bcs @NoRoom
        stx SaveSlot
        ...
@Load:  stx SaveSlot
        lda #<SAVE_BUF
        ldy #>SAVE_BUF
        jsr NvRead              ; carry set, A = NV_BAD: tell the player
        ...
        ; later, to save
        lda #MY_GAME_ID
        sta NV_ID
        ldx SaveSlot
        lda #<SAVE_BUF
        ldy #>SAVE_BUF
        jsr NvWrite
```

From BASIC, see [`SAVEMGR.BAS`](#savemgrbas--save-slots-from-basic).

### Sound

A SID chip provides audio output. The `Beep` Kernal routine plays a ~475 Hz tone on voice 1. Use `SidPlayNote` to play any frequency on any of the three voices, `SidSilence` to stop all voices, and `SidSetVolume` to set the master volume (0–15).

---

## Memory Map

### ROM (`$8000–$FFFF`, 32KB)

| Range | Size | Contents |
|-------|------|----------|
| `$8000–$9FFF` | 8KB | I/O space (hardware registers) |
| `$A000–$A0FF` | 256B | **Kernal jump table** (public API) |
| `$A100–$BFFF` | ~8KB | Kernal routines |
| `$C000–$FEFF` | ~16KB | BASIC interpreter (5-byte floating-point) |
| `$FF00–$FFF9` | 250B | Wozmon (Apple I machine-code monitor) |
| `$FFFA–$FFFF` | 6B | CPU vectors (NMI / RESET / IRQ) |

### RAM (`$0000–$7FFF`, 32KB)

| Range | Size | Purpose |
|-------|------|---------|
| `$0000–$00FF` | 256B | Zero page (Kernal + BASIC workspace) |
| `$0100–$01FF` | 256B | CPU stack — and therefore BASIC's `GOSUB` and `FOR` frames, which are pushed onto it |
| `$0200–$02FF` | 256B | Keyboard input ring buffer |
| `$0300–$03FF` | 256B | Kernal variables (vectors, cursor, `HW_PRESENT`, `CF_DISK`, `BOOT_VECTOR`, RTC, FS state including `FS_IO_ADDR`, BASIC runtime, `NV_ID` at `$0390`, the video variables at `$0391–$039B`; `$039C–$03FF` unassigned) |
| `$0400–$04FF` | 256B | `BAS_LINBUF` — the raw input line, as typed |
| `$0500–$05FF` | 256B | `BAS_TOKBUF` — tokenizing scratch |
| `$0600–$07FF` | 512B | `FS_SECTOR_BUF` — CompactFlash sector buffer, overwritten by **any** filesystem call (`LOAD`, `SAVE`, `DIR`, `DEL`, `BLOAD`, `BSAVE`, `FORMAT`) |
| `$0800–$7FFF` | ~31KB | Program text grows up from `$0800`; numeric/string variables follow; arrays then string heap grow down from `$8000` |

> **None of `$0400–$07FF` is free memory**, despite `BIOS.inc` naming `$0400` `USER_VARS` — a legacy name kept only because Wozmon builds its input buffer on it. The free RAM is `$003A–$00FF` in zero page (for a machine-code program that has taken the machine over; not underneath a running BASIC, which uses that space as it interprets) and everything above your program up to `$8000`.

---

## Kernal Jump Table (`$A000`)

All public Kernal entry points are accessed through stable 3-byte `jmp` slots. Call these addresses from your own code — the implementation behind each slot can change without breaking your program.

The table is a fixed 256 bytes: the 72 published slots below, then 13 reserved slots (`$A0D8–$A0FE`) that return immediately, then one pad byte. New entry points are appended into the reserved space, so no existing address ever moves. Calling a reserved slot on a BIOS that has not filled it in yet returns cleanly rather than crashing.

| Address | Label | Description |
|---------|-------|-------------|
| `$A000` | `Chrout` | Output one character (routed by `IO_MODE`) |
| `$A003` | `Chrin` | Read one character from the input buffer |
| `$A006` | `WriteBuffer` | Push byte into the input buffer |
| `$A009` | `ReadBuffer` | Pop byte from the input buffer |
| `$A00C` | `BufferSize` | Return number of bytes waiting in buffer |
| `$A00F` | `SetIOMode` | Set `IO_MODE`: `A`=0 (video) or 1 (serial) |
| `$A012` | `GetIOMode` | Get `IO_MODE` → `A` |
| `$A015` | `InitVideo` | Put the PICOVDP in the Text-mode console — writes the registers (40×24, per-cell colour, name table `$0000`, attributes `$0400`), has the card reload its built-in font into the pattern table at `$0800` (`VdpLoadFont`, which waits up to a frame) **and** restores palette row 0. Does not clear the screen |
| `$A018` | `VideoClear` | Clear the screen to spaces in the current pen and home the cursor |
| `$A01B` | `VideoPutChar` | Write character at current cursor position |
| `$A01E` | `VideoSetCursor` | Set cursor: `X`=column (0–39), `Y`=row (0–23) |
| `$A021` | `VideoGetCursor` | Get cursor: returns column in `X`, row in `Y` |
| `$A024` | `VideoScroll` | Scroll screen up one line |
| `$A027` | `VideoSetColor` | Set the pen for later output, and the border: `A`=`(fg<<4)\|bg`. Cells already on screen keep their colours |
| `$A02A` | `VideoChroutRaw` | Output character glyph at cursor (raw, no control-code handling): `A`=char code |
| `$A02D` | `InitSID` | Initialise SID sound chip |
| `$A030` | `Beep` | Play a short beep tone |
| `$A033` | `SidPlayNote` | Play note: `A`=voice (0–2), `X`=freqLo, `Y`=freqHi |
| `$A036` | `SidSilence` | Silence all SID voices |
| `$A039` | `SidSetVolume` | Set SID master volume: `A`=0–15 |
| `$A03C` | `FsLoadFile` | Load a file from CompactFlash by name |
| `$A03F` | `FsSaveFile` | Save a file to CompactFlash by name |
| `$A042` | `FsDeleteFile` | Delete a file from CompactFlash by name |
| `$A045` | `InitKB` | Initialise VIA keyboard / joystick ports |
| `$A048` | `ReadJoystick1` | Read joystick 1 → bitmask in `A` |
| `$A04B` | `ReadJoystick2` | Read joystick 2 → bitmask in `A` |
| `$A04E` | `InitSC` | Initialise 6551 serial card (19200 8-N-1) |
| `$A051` | `SerialChrout` | Output character directly to serial (bypass `IO_MODE`) |
| `$A054` | `XModemLoad` | Receive data via XModem into memory at `XFER_PTR`; returns total bytes in `XFER_REMAIN` |
| `$A057` | `XModemSave` | Send data via XModem from `XFER_PTR`, `XFER_REMAIN` bytes |
| `$A05A` | `RtcReadTime` | Read time → `A`=hours, `X`=minutes, `Y`=seconds |
| `$A05D` | `RtcReadDate` | Read date → `A`=date, `X`=month, `Y`=year |
| `$A060` | `RtcWriteTime` | Write time ← `A`=hours, `X`=minutes, `Y`=seconds |
| `$A063` | `RtcWriteDate` | Write date ← `A`=date, `X`=month, `Y`=year |
| `$A066` | `RtcReadNVRAM` | Read NVRAM byte: `X`=address → `A`=data |
| `$A069` | `RtcWriteNVRAM` | Write NVRAM byte: `X`=address, `A`=data |
| `$A06C` | `StReadSector` | Read one 512-byte CF sector |
| `$A06F` | `StWriteSector` | Write one 512-byte CF sector |
| `$A072` | `StWaitReady` | Wait for CF ready; carry set on error |
| `$A075` | `SysDelay` | Delay `A`=count\_lo, `X`=count\_hi centiseconds (~10 ms each) using VIA T1 |
| `$A078` | `KernalInit` | Initialise all hardware (caller must reset stack pointer first; no cli, no beep, no header; the video console is not brought up until first used). Returns via `RTS` |
| `$A07B` | `KernalVersion` | Get BIOS version → `A`=major, `X`=minor |
| `$A07E` | `FsLoadFileAddr` | Load named file from current disk to `FS_IO_ADDR` ($037F); returns size in `FS_FILE_SIZE` |
| `$A081` | `FsSaveFileAddr` | Save `FS_FILE_SIZE` bytes from `FS_IO_ADDR` to a named file on the current disk |
| `$A084` | `FsFormatDisk` | Zero the current disk's directory sector (no confirmation — caller decides) |
| `$A087` | `FsSetDisk` | Select current CF disk bank: `A` = 0–255 → `CF_DISK` ($030F) |
| `$A08A` | `FsGetDisk` | Get current CF disk bank: `A` ← `CF_DISK` |
| `$A08D` | `FsPrintDisk` | Print `DISK n` + CRLF via `Chrout` (uses current `CF_DISK`) |
| `$A090` | `PrintStr` | Print a NUL-terminated string via `Chrout`: `A`=lo, `Y`=hi (address) |
| `$A093` | `PrintCRLF` | Print CR+LF via `Chrout` |
| `$A096` | `PrintDecU16` | Print an unsigned 16-bit value as decimal, no leading zeros: `A`=lo, `X`=hi |
| `$A099` | `KBDisable` | Disable both keyboard encoders and wait for them to release the ports (~200 µs). Modifies `A`, flags |
| `$A09C` | `KBEnable` | Re-enable both keyboard encoders. Modifies `A`, flags |
| `$A09F` | `NvStat` | Save-slot status: `X`=slot (0–15) → `A`=`NV_EMPTY`/`NV_VALID`/`NV_BAD`, `Y`=owner ID. `X` preserved; carry set if no RTC or bad slot |
| `$A0A2` | `NvRead` | Copy a valid slot's 14 payload bytes: `X`=slot, `A`/`Y`=destination lo/hi → `A`=status, `Y`=owner ID. Carry set and buffer untouched unless the slot is `NV_VALID`. `X` preserved; clobbers `STR_PTR` |
| `$A0A5` | `NvWrite` | Write a slot: `X`=slot, `A`/`Y`=source lo/hi, `NV_ID` ($0390)=owner ID (1–255). Carry set and nothing written if no RTC, bad slot or `NV_ID`=0. `X` preserved; clobbers `STR_PTR` |
| `$A0A8` | `NvErase` | Zero all 16 bytes of a slot: `X`=slot. Carry set if no RTC or bad slot. `X` preserved |
| `$A0AB` | `NvFind` | Lowest slot whose owner ID is `A` (valid or damaged); `A`=0 finds the lowest free slot → `X`=slot. Carry set if none |
| `$A0AE` | `NvFormat` | Erase all 16 save slots. Carry set if no RTC |
| `$A0B1` | `VdpInfo` | What the boot probe found: → `A`=`VDP_FW` (`STAT5`, firmware version), `X`=`VDP_CAPS` (`STAT6`, capabilities), `Y`=`$AC`. No console card (`HW_VID` clear): carry set, `Y`=0, and `A`/`X` are 0 — or, for a PICOVDP without the built-in font, what it reported |
| `$A0B4` | `VdpWriteReg` | Write a register: `A`=value, `X`=register (0–127). A `VMODE` write updates `VID_MODE`; `L0CTRL`/`L1CTRL` are kept in `VDP_L0CTRL_SHADOW`/`VDP_L1CTRL_SHADOW` (`$0396–$0397`). `X`, `Y` preserved; carry set and nothing written if no card or `X` > 127 |
| `$A0B7` | `VdpSetMode` | Write `VMODE`: `A`=1 Text, 2 Compact, 3 Graphics, 4 Full, and `VID_MODE` with it. The register only — tables, layers and sprites are the caller's; the Text console proper is `InitVideo`. Carry set and nothing written if no card or `A` out of range |
| `$A0BA` | `VdpPoke` | Write one VRAM byte: `A`=value, `X`/`Y`=address lo/hi, anywhere in the 64 KB (`VBANK` is set for the address and put back to 0). Carry set and nothing written if no card |
| `$A0BD` | `VdpPeek` | Read one VRAM byte: `X`/`Y`=address lo/hi → `A`. Carry set if no card |
| `$A0C0` | `VdpSetPalette` | Set a palette entry: `X`=entry (0–255), `A`=`$0R`, `Y`=`$GB`, written at `$FC00 + 2X`, where `InitVideo` puts `PALBASE`. Carry set and nothing written if no card |
| `$A0C3` | `WaitVBlank` | Return at the start of the next vertical blank, by polling `STAT3` b0 on port A; `STAT0`'s flags and the `STAT1` latches are left untouched, and `STATSEL_A` is put back to 0. No card: a 2 cs `SysDelay`, carry set. Modifies `A`, `X`, `Y` |
| `$A0C6` | `VdpLoadFile` | Load a named file from the current disk into VRAM: `STR_PTR`=filename, `FS_IO_ADDR` ($037F)=VRAM address (any of the 64 KB) → `FS_FILE_SIZE`. Writes exactly the file's bytes, never the rest of its last sector. Carry set if no card (nothing read), or not found or read error. Clobbers `XFER_REMAIN` and `FS_SECTOR_BUF` |
| `$A0C9` | `VdpLoadFont` | Load a built-in font from the card into layer 0's pattern table, at `L0PAT` × `$800` as it stands at the call: `A`=font ID, `$00` (CP437 6×8) being the only one. Writes `FONT` (`$30`) and returns at the start of the next vertical blank, when the copy has landed; `STAT0` is not read. Carry set and nothing written if no card or `A` ≠ 0. Modifies `A`, `X`, `Y` |
| `$A0CC` | `VdpSprite` | Write a sprite's attributes: `X`=sprite (0–63), `VDP_P0`–`VDP_P3` (`$0398–$039B`)=Y, X bits 7:0, pattern, attributes (b7 = X bit 8). Assumes the attribute table at VRAM `$2000` (`SPRATTR`=`$40`, where `SCREEN` 1–3 put it); after moving it, use `VdpPoke`. `X` preserved; carry set and nothing written if no card or `X` > 63 |
| `$A0CF` | `VdpSetScroll` | Scroll a layer: `X`=layer (0–1), `A`=x bits 7:0, `Y`=y, `VDP_P0`=x bit 8 (0 or not). Writes `LxSCRX`, `LxSCRY` and `LxCTRL` b6, keeping `LxCTRL`'s other bits. Carry set and nothing written if no card or `X` > 1 |
| `$A0D2` | `VdpLayer` | Show or hide a layer: `X`=layer (0–1), `A`=0 hides, anything else shows. Sets or clears `LxCTRL` b4, keeping its other bits. Carry set and nothing written if no card or `X` > 1 |
| `$A0D5` | `VdpStatus` | Read a status register on port A: `X`=0–15 → `A`=`STATn`, with `STATSEL_A` put back to 0. Reading `STAT0` clears its flags and `STAT1` its latches (SPEC §6). `X`, `Y` preserved; carry set if no card or `X` > 15 |

### Cartridge Support

Cartridges for this system overlay the ROM area from `$C000–$FFFF`. When inserted, the cartridge replaces BASIC, Wozmon, and CPU vectors (NMI/RESET/IRQ) with its own code. The Kernal (`$A000–$BFFF`) remains accessible. There is no character set in ROM: the text font comes from the PICOVDP (`InitVideo`).

Two Kernal facilities support cartridge development:

**`KernalInit` ($A078)** — A callable subroutine that performs the complete hardware initialisation sequence (IRQ/BRK/NMI pointers, hardware probing, peripheral init, console auto-detection) and returns via `RTS`. It clears decimal mode and disables interrupts, but does **not** reset the stack pointer (the caller must do `ldx #$ff / txs` before the `JSR`), enable interrupts (`cli`), play the beep, or start BASIC. It leaves the PICOVDP in its legacy submode: a cartridge that programs the card's modes and tables itself finds it as a 1.x ROM left a TMS9918, and the Text console comes up the first time the cartridge prints. This gives the cartridge full control over what happens after hardware init.

**`BOOT_VECTOR` ($035B–$035C)** — A 2-byte RAM address that, if non-zero after `KernalInit`, causes the normal `Reset` flow to jump to the specified address instead of starting BASIC. `KernalInit` zeroes this variable, so a cartridge must write to it *after* calling `KernalInit` but *before* `Reset` checks it — or use Pattern B below.

#### Cart Usage Patterns

**Pattern A — Direct KernalInit call** (cart handles everything after init):

```asm
; Cart reset vector points here
CartReset:
    ldx #$ff
    txs                 ; Reset stack pointer
    jsr $A078           ; KernalInit — all hardware ready, interrupts off
    ; Override IRQ_PTR ($0300) / NMI_PTR ($0304) if needed
    cli
    jmp CartMain         ; Cart's own program entry
```

This is the simplest approach. The cartridge gets fully initialised hardware and takes complete control. No beep, no header — the cart decides what the user sees and hears.

**Pattern B — KernalInit + Beep** (get the audible startup feedback, then take control):

```asm
; Cart reset vector points here
CartReset:
    ldx #$ff
    txs                 ; Reset stack pointer
    jsr $A078           ; KernalInit — all hardware ready, interrupts off
    jsr $A030           ; Beep — audible "system alive" feedback
    ; Override IRQ_PTR ($0300) / NMI_PTR ($0304) if needed
    cli
    jmp CartMain         ; Cart's own program entry
```

This is Pattern A with the addition of the startup beep. The beep provides audible confirmation that hardware initialised successfully, which is useful when the cartridge has its own display that may take time to set up.

> **Note on `BOOT_VECTOR`:** `KernalInit` zeroes `BOOT_VECTOR` during init. A cartridge can write to `BOOT_VECTOR` after calling `KernalInit` if it needs to redirect a later soft-reset back to the cart. However, for the initial boot, Patterns A and B above are the recommended approaches.

In practice, **Pattern A is recommended** for most cartridges.

#### What Cartridges Can Rely On

- **Kernal jump table** (`$A000–$A0FF`) — all entries remain stable across BIOS versions
- **`HW_PRESENT`** (`$030D`) — read after `KernalInit` to discover installed hardware
- **`KernalVersion`** (`$A07B`) — check BIOS compatibility (`A`=major, `X`=minor)
- **RAM vectors** — `IRQ_PTR` (`$0300`), `BRK_PTR` (`$0302`), `NMI_PTR` (`$0304`) can be overwritten to install custom interrupt handlers. **A handler that chains to the Kernal's must not leave anything on the stack** — see below
- **`IO_MODE`** (`$0306`) — set via `SetIOMode` (`$A00F`) to route console output
- **No-console safe** — `KernalInit` does not halt if neither video nor serial is detected, allowing cartridges with their own display hardware to boot normally
- **`BRK_PTR`** — `KernalInit` points it at the Kernal's `BRK` report, which ends by warm-starting BASIC at `$C000`. A cartridge with no BASIC there must point `BRK_PTR` at a handler of its own
- **No character set in ROM** — the whole of `$A000–$BFFF` is Kernal on 2.x. The font is the card's: `InitVideo` or `VdpLoadFont` loads it

#### Chaining an IRQ Handler

`IRQ_PTR` can be pointed at your own handler, which then chains to the Kernal's by jumping to the address it replaced. That works, but it carries a constraint nothing else in this README implies:

**A chained handler must leave the stack exactly as the CPU left it.**

The Kernal's `Irq` pushes A, Y and X, then decides whether it was entered by `BRK` or by hardware:

```asm
Irq:
  pha
  phy
  phx
  tsx
  lda $104,x            ; the saved P, at a fixed depth past the three pushes
  and #$10              ; B flag — set by BRK, clear by a hardware IRQ
```

That `$104,x` is an absolute offset, not a search. A handler in front of the Kernal's that pushes anything — even one byte it means to pull back after the chain — shifts the read onto the wrong byte, and the Kernal then services a hardware interrupt as a `BRK` or the reverse.

So a chained handler either touches no register at all (`inc`, `dec` and `stz` on absolute addresses do useful work without one), or saves and restores everything it used *before* the `jmp`. The alternative is to replace the vector outright and end in `rti`, taking on the keyboard and serial servicing yourself.

**A PICOVDP handler uses port B.** The Kernal's handler never touches the video card, and the Kernal and BASIC drive it through port A with interrupts enabled. A handler that reads or writes the card on port A could land between the two writes of a foreground command. On port B it cannot, and it acknowledges through `STAT1`, which clears the interrupt latches and leaves `STAT0`'s flags for foreground code. This one counts frames:

```asm
FRAMES   = $0040               ; the cartridge's own RAM: a program running under
OLD_IRQ  = $0041               ;   BASIC puts these where BASIC does not (not zero page)

InstallVblank:
    sei
    lda $0300           ; IRQ_PTR: keep the old handler
    sta OLD_IRQ
    lda $0301
    sta OLD_IRQ+1
    lda #<VblankIrq
    sta $0300
    lda #>VblankIrq
    sta $0301
    lda #$01            ; STATSEL_B = 1: port B's status reads STAT1
    sta $9C03
    lda #$8E            ; register $0E | $80
    sta $9C03
    lda #$01            ; IRQEN b0: vertical blank
    ldx #$0A
    jsr $A0B4           ; VdpWriteReg (port A, from the foreground)
    cli
    rts

VblankIrq:
    pha                 ; pulled again before the jmp, so the stack is as the CPU left it
    lda $9C03           ; STAT1 on port B: reading it acknowledges
    lsr a               ; b0, vertical blank, into carry
    bcc @chain
    inc FRAMES
@chain:
    pla
    jmp (OLD_IRQ)
```

`InitVideo` writes `IRQEN` = 0, so a program installs this after the console is up — after its first `Chrout` — and enables the interrupt again after anything that calls `InitVideo` (`SCREEN 0`, or BASIC going back to text). A handler that writes `VBANK` or `VINC` puts them back before it returns, because both ports share them.

A template project for creating cartridges for the A.C. Wright 6502 system is available here: [https://github.com/acwright/6502-CRT](https://github.com/acwright/6502-CRT).

---

## Prerequisites

### Install cc65 Toolchain

The cc65 toolchain provides the assembler and linker needed to build 6502 assembly code.

It must be **newer than the 2.19 release**, which is still what every package manager ships. The ROM sets `.setcpu "W65C02"`, and cc65 did not gain that CPU until July 2025 — five and a half years after 2.19 — so the packaged toolchain stops on the first directive in `BIOS.asm` rather than producing a subtly wrong ROM.

macOS (using Homebrew):
```bash
brew install --HEAD cc65
```

Linux, and anywhere else the package is 2.19 — from source, which takes about a minute:
```bash
git clone https://github.com/cc65/cc65.git
make -C cc65 -j"$(nproc)" bin  PREFIX=/usr/local
mkdir -p cc65/lib
make -C cc65 -j"$(nproc)" none PREFIX=/usr/local
sudo make -C cc65/src    install PREFIX=/usr/local
sudo make -C cc65/libsrc install PREFIX=/usr/local
```

`bin` builds the tools; `none` builds the single target library that `cl65 -t none` hands to the linker. cc65 has thirty-odd other targets and this ROM is not any of them, so skipping them is what keeps that to about a minute — the `mkdir` is only there because asking cc65 for one target by name skips the pass that would have created that directory. Both halves get installed because the tools alone are not enough: `BASIC.asm` uses `.macpack longbranch`, which is read from cc65's `asminc`. `.github/workflows/ci.yml` pins the exact commit CI builds against.

Other platforms: See [cc65 documentation](https://cc65.github.io/)

### Optional: Install minipro (for EEPROM burning)

Only required if you plan to program an AT28C256 EEPROM chip:
```bash
brew install minipro
```

## Building

Build the ROM image:
```bash
make
```

This generates:
- `BIOS.bin` - 32KB ROM image ($8000-$FFFF)
- `BIOS.lst` - Assembly listing file for debugging

## Verification

View the generated binary as hex dump:
```bash
make view
```

## Testing

The ROM has a regression suite that runs it headless on the [A.C. Wright 6502 emulator](https://github.com/acwright/6502-EMULATOR), covering every BASIC keyword, the Kernal jump table and the video console:

```bash
make test                # build the ROM and run everything
make test-one T=gosub    # just the cases matching /gosub/
```

It needs Node 22 or newer and an emulator CLI whose video card is a PICOVDP with the built-in font; `SIXTY502` points it at a build of the commit CI pins, and `tests/README.md` says how to make one. `tests/README.md` covers writing a case, and every fix to this ROM is expected to arrive with one that fails without it.

## Programming EEPROM

To burn the ROM to an AT28C256 EEPROM chip using a TL866 programmer:
```bash
make eeprom
```

**Note:** This requires a TL866 (or compatible) programmer and the minipro software.

## Cleaning Build Artifacts

Remove generated files:
```bash
make clean
```

## Related

- [6502-ACE](https://github.com/acwright/6502-ACE) — the hardware, and the index of the whole family
- [6502-PICOVDP](https://github.com/acwright/6502-PICOVDP) — the video card: `SPEC.md` defines the registers, modes and built-in font this ROM drives
- [6502-EMULATOR](https://github.com/acwright/6502-EMULATOR) — runs this ROM on desktop, in a browser, or headless; the regression suite above drives it
- [6502-PRG](https://github.com/acwright/6502-PRG) / [6502-CRT](https://github.com/acwright/6502-CRT) — templates for programs and cartridges, each shipping an include that tracks the Kernal API documented above
- [6502-ASM](https://github.com/acwright/6502-ASM) / [6502-BAS](https://github.com/acwright/6502-BAS) — example programs and BASIC listings
- [cffs](https://github.com/acwright/cffs) — builds CompactFlash images for the filesystem described above
- [bastok](https://github.com/acwright/bastok) — tokenizes BASIC listings into `.prg` images
- [bin2woz](https://github.com/acwright/bin2woz) — converts a binary into a paste-able upload for the Wozmon at `$FF00`
- [6502-DOCS](https://github.com/acwright/6502-DOCS) — the documentation site: the guide, the printable reference cards, and the memory-map and character-set references (the character set is the PICOVDP's font `$00`)

## License

MIT License — see [LICENSE](LICENSE).
