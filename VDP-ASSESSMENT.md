# VDP assessment: 6502-BIOS

> An outline, not a plan. The detailed plan for this repository goes in `VDP-PLAN.md`,
> written in a session of its own. Surveyed 2026-09-16 across the whole workspace.
> Line numbers drift; file and routine names are the durable references.

## The change

The ACE moves from a Pico9918 running stock TMS9918A firmware to the **6502-PICOVDP**
(`6502-PICOVDP/SPEC.md`) on PICO9918 PRO v2.0 hardware, running **BIOS 2.x**. Everything
else stays where it is: COB, DEV, KIM, VCS, PicoCalc, and any ACE whose card cannot be
reflashed (RP2040 pico9918 v1.0–1.3). Those keep the stock firmware and **BIOS 1.x**,
whose last release is **1.6**.

- **Legacy** in these documents means TMS9918A + BIOS 1.x. **VDP** means PICOVDP + BIOS 2.x.
- **Compatibility runs one way.** The PICOVDP's legacy submode runs Text and Graphics I
  programs unchanged, so BIOS 1.x and existing cartridges run on it. Graphics II and
  Multicolor fall back to Graphics I and draw garbage. Register writes above 7 no longer
  alias, so F18A tricks break. Sprites per line are 16 by default, not 4. Nothing written
  for the VDP runs on a TMS9918A.

## Decisions already made

- **No new repositories.**
- **BIOS 1.6 is the last 1.x release.** It is 1.5 plus the NVRAM save slots in
  `6502-BIOS/PLAN.md`, and nothing else. It ships in emulator **2.7.0**, and the frozen
  legacy docs document it.
- **BIOS 2.0 is 1.6 plus:**
  - The PICOVDP work in `6502-EMULATOR`'s `docs/handoff/6502-BIOS.md` (branch `v3-vdp`):
    card detection, hardware scroll, port B for interrupt handlers, `WaitVBlank`.
  - A console in the PICOVDP's **Text mode** (`VMODE $1`, 40×24, 6×8 cells) with a
    **per-cell colour table**. It keeps the ROM font and every screen layout.
  - **No Monitor.** The machine **boots straight to BASIC**, with a new header and a colour
    logo drawn from the ROM font's CP437 block characters. Wozmon stays at `$FF00`.
  - **BASIC takes the Monitor's 4.3 KB** (`$C000–$FEFF`). The Kernal (`$A000–$B7FF`) and
    the character set (`$B800`) do not move, because cartridges overlay `$C000–$FFFF`.
    The Kernal holds the primitives cartridges need; BASIC-only work lives in BASIC.
  - **New BASIC commands with matching Kernal entries.**
    - Core: `SCREEN`, `VPOKE`/`VPEEK`, `VREG`, `PALETTE`, `VSYNC`, `VLOAD`.
    - Second tier, if room is found: `SPRITE`, `SCROLL`, `LAYER`, `VSTAT`.
    - Save-slot commands, if room is found.
    - `SYS addr[,a,x,y]`, and `BLOAD`/`BSAVE` over XModem when given no filename.
    - BASIC returns to the text console when a program stops.
  - **Tokens:** every 1.x token keeps its value, and new keywords are appended after `$D4`.
    The `BRK` statement is retired and its token `$B4` goes to a new keyword.
  - **A BRK instruction** prints `BREAK $nn AT $xxxx  A= X= Y= P= S=` and warm-starts
    BASIC. `BRK_PTR` stays hookable.
  - **`COLOR fg[,bg[,border]]`** sets the pen for later output, `CLS` fills the screen with
    it, and `border` is register 7's low nibble.
  - **Existing jump-table addresses do not move.** New entries are appended.
- **6502-EMULATOR** makes the video card an option (TMS9918A or PICOVDP): one app, one
  site. It also publishes a frozen **2.7.0** web build at `/6502-EMULATOR/v2/` for the
  legacy docs.
- **6502-DOCS** is versioned: legacy docs (BIOS 1.6) are frozen at `/6502-DOCS/v1/`, and
  the main site is rewritten for the VDP and BIOS 2.x.
- **6502-BIOS** gets a `v1.x` branch cut at `v1.6`; `main` becomes 2.x.
- **Assembly and C projects** get a VDP include chosen by a build option, not branches.
  The legacy `6502.inc` gets one last update, for 1.6.
- **EhBASIC and vc83basic** stay 1.x. **PicoCalc** stays legacy. **The YouTube series**
  teaches the legacy VDP and mentions the new features.

## Order across the workspace

**Part 1: BIOS 1.6, the last legacy release**

1. **6502-BIOS:** build 1.6 on `main`, tag `v1.6`, and cut `v1.x` from it.
2. **6502-EMULATOR `main`:** bundle 1.6, re-capture the `bios/` goldens (the splash says
   v1.6), and release **2.7.0**. Then merge `main` into `v3-vdp` and re-capture there.
3. **6502-PICOVDP:** re-sync `tests/oracle/`, whose pinned `bios` goldens moved.
4. **The legacy include** gains the NVRAM entries in every copy: 6502-ASM, 6502-CRT,
   6502-PRG, 6502-BIN, 6502-EHBASIC, 6502-C (with `6502.h`) and WIZARDSLAB.
5. **6502-DOCS `main`** documents 1.6 and pins 2.7.0. Then it cuts `v1`, published at
   `/6502-DOCS/v1/`, against the emulator's frozen 2.7.0 build at `/6502-EMULATOR/v2/`.

**Part 2: the VDP**

6. **6502-PICOVDP:** firmware proven on the PRO (its Phases 9–11). This gates the
   hardware switch, not the software work.
7. **6502-EMULATOR:** `v3-vdp` merged, with the card as an option; tagged 3.x.
8. **6502-BIOS:** 2.0 on `main`. This can start once step 1 is done, because the `v3-vdp`
   emulator already runs the PICOVDP.
9. **6502-ASM** sets the VDP include convention. 6502-CRT, 6502-PRG, 6502-BIN and 6502-C
   follow it.
10. **Everything else follows BIOS 2.0:**
    - The emulator bundles BIOS 2.0.
    - 6502-DOCS `main` is rewritten.
    - bastok gains the 2.x token table.
    - 6502-ACE, WIZARDSLAB, 6502-EHBASIC, vc83basic, cffs and 6502-ASSEMBLY follow.

---

## This repository's role

The ROM both platforms boot. Its jump table is the ABI that every include file,
cartridge and program in the workspace compiles against. Its sources are what 6502-DOCS
extracts facts from, and what bastok transcribes its token table from.

## Where it stands

- Tags `v1.1`–`v1.5`. `main` is v1.5 plus three commits: the CI emulator pin,
  `.gitignore`, and `PLAN.md`.
- `PLAN.md` designs "v1.6 — NVRAM Save Slots": 6 jump-table entries appended at `$A09F`,
  about 230 Kernal bytes, and a latent `ProbeRTC` BME bug (§4.3). No code yet.
- ROM layout (`BIOS.cfg`):

  | Segment | Range | Size | Free |
  |---|---|--:|--:|
  | KERNAL | `$A000–$B7FF` | 6144 | 1552 |
  | CHARS | `$B800–$BFFF` | 2048 | 10 |
  | BASIC | `$C000–$EDFF` | 11776 | 41 |
  | MONITOR | `$EE00–$FEFF` | 4352 | 7 |
  | WOZMON | `$FF00–$FFF9` | 250 | 9 |

- **The layout constraint.** Cartridges overlay `$C000–$FFFF` and still call the Kernal,
  and `InitVideo` reads the font from `$B800`. So the Kernal and CHARS must stay inside
  `$A000–$BFFF`. Nothing the Kernal needs can move above `$C000`.
- BASIC has 85 keywords, tokens `$80`–`$D4`, so 43 token values are free.
- CI (`.github/workflows/ci.yml`) pins cc65 and pins the emulator to `v2.6.0`.
- Version: `BIOS_VERSION_MAJOR/MINOR` in `BIOS.inc` (1 / 5). The splash is derived from it.

## Work outline

### A. BIOS 1.6: the last legacy release

1. Build `PLAN.md` as written: NVRAM save slots, the `ProbeRTC` BME fix, and a
   `SAVEMGR.BAS` example. No BASIC or Monitor commands (41 and 7 bytes free).
2. Set `BIOS_VERSION_MINOR = 5` → `6`, update `tests/fixtures/jumptable.json`, the README
   and `tests/`, and tag `v1.6`.
3. Cut `v1.x` from `v1.6`. That branch takes bug fixes only, as 1.6.x, with CI on
   emulator 2.7.0.
4. **Hand off:**
   - 6502-EMULATOR `main` bundles 1.6 and releases 2.7.0.
   - The legacy `6502.inc` copies gain the 6 entries.
   - 6502-DOCS documents 1.6 before cutting its `v1`.

### B. BIOS 2.0 on `main`: the platform

1. **Version 2.0**, and retire `PLAN.md` into the record once 1.6 ships.
2. **ROM layout.**
   - Merge MONITOR into BASIC, so BASIC is `$C000–$FEFF` (16,128 bytes).
   - KERNAL, CHARS, WOZMON and VECTORS keep their places.
   - Remove `MonitorEntry` and `MonitorBrkEntry` (`$EE00`/`$EE03`).
   - `BasEntry` stays at `$C000`.
   - **Put in the Kernal only what a cartridge could use.** Argument parsing, the header
     and logo, and `SCREEN`'s mode defaults live in BASIC.
3. **Card detection** (handoff §3, SPEC §16).
   - `STAT4` → `$AC`, into a new RAM byte (card type or `STAT6` capabilities), because
     `HW_PRESENT` is full.
   - Probe before `InitVideo`, and restore `STAT0`.
4. **Behaviour on a TMS9918A.** Decide it explicitly. Recommendation: run the console in
   the legacy submode (what 1.x does), and have every VDP-only entry and BASIC command
   return carry set / `?NO DEVICE`. An unguarded write above register 7 aliases onto 0–7
   and wrecks the display.
5. **Console in Text mode with per-cell colour.**
   - `VMODE $1`; layer 0 at 1bpp, per-cell attribute table, index 0 opaque. The font
     stays at `$B800`, and tables are placed per SPEC §7.
   - `Chrout`, `VideoChroutRaw`, `VideoPutChar`, `VideoClear` and the scroll write a colour
     byte per cell from a new pen variable. Set both VRAM addresses on port A for each
     character, keeping port B free for interrupt handlers.
   - A text console exists only on the VDP. On a TMS9918A see item 4.
6. **Hardware scroll** (handoff §4).
   - `L0SCRY` plus a scroll origin, folded into `VideoSetCursorImpl`, the `Chrout` paths,
     `VideoPutCharImpl` and `VideoClearImpl`.
   - The colour table scrolls with the name table, because both are per cell.
   - The row cleared at the bottom takes the current pen.
7. **Port B convention** for user IRQ handlers (`$9C02`/`$9C03`), documented.
8. **Boot straight to BASIC.**
   - Remove the splash, the 5-second menu, ESC-to-Monitor and the `brk` at
     `Kernal.asm` "Enter monitor".
   - Cartridge boot (`BOOT_VECTOR`, `KernalInit`) and console auto-detection are unchanged.
9. **New header.**
   - A colour logo built from the CP437 block characters already in the font
     (`$DB █`, `$DC ▄`, `$DF ▀`, `$DD ▌`, `$DE ▐`, `$B0`–`$B2` shades). They fill the 6-pixel
     cell, so they join seamlessly in Text mode. It costs no glyph data.
   - Store it compressed (roughly 100 bytes) in BASIC, followed by a version and
     bytes-free line and the fitted hardware.
   - A serial console prints the text lines only.
10. **BRK.**
    - The instruction: move the Monitor's register printer into the Kernal (about 100
      bytes), print `BREAK $nn AT $xxxx  A=xx X=xx Y=xx P=xx S=xx` (`$nn` is the byte after
      the opcode), and warm-start BASIC. `BRK_PTR` stays hookable, and vc83basic already
      hooks it.
    - The statement: retire `BRK`; its token `$B4` goes to a new keyword.
11. **BASIC commands.**
    - **Token rule:** every 1.x token keeps its value, and new keywords are appended
      from `$D5`. 1.x programs load and run unchanged, except one containing `BRK`.
    - **COLOR:** `COLOR fg[,bg[,border]]` sets the pen, `CLS` fills the screen with it, and
      `border` writes register 7's low nibble. `COLOR 1,15:CLS` looks as it did in 1.x.
    - **Core graphics:**
      - `SCREEN n`: 0 = text console, 1 = Compact, 2 = Graphics, 3 = Full, with layer
        defaults.
      - `VPOKE a,v` / `VPEEK(a)`, `VREG r,v`, `PALETTE i,r,g,b`, `VSYNC`.
      - `VLOAD "file",addr`, which streams a CF file straight into VRAM.
    - **Back to text on stop:** `END`, an error or Ctrl+C returns BASIC to `SCREEN 0`
      before `OK`.
    - **Second tier, if room is found:** `SPRITE n,x,y,pat[,attr]` / `SPRITE OFF`,
      `SCROLL layer,x,y`, `LAYER n,ON|OFF`, `VSTAT(n)`.
    - **Save slots, if room is found:** BASIC commands over the Kernal's NVRAM slot entries.
    - **Monitor replacements:** `SYS addr[,a,x,y]` loads the registers (and consider
      leaving A/X/Y/P readable after the call). `BLOAD addr` and `BSAVE addr,len` with no
      filename go over XModem, reusing the existing code.
    - Bare-metal pixel graphics (`PSET`/`LINE`/`CIRCLE`) are out: the card is tile-based.
12. **Kernal entries**, appended after the 6 NVRAM slots (26 reserved slots remain):
    - `VdpSetMode`, `VdpWriteReg`, `VdpPoke`/`VdpPeek`, `VdpSetPalette`, `WaitVBlank`,
      `VdpLoadFile`.
    - Then `VdpSprite`, `VdpSetScroll`, `VdpLayer`, `VdpStatus`.
    - A way to read the card type.
    - Each has a defined TMS9918A behaviour (item 4).
13. **Budget.** Kernal: about 1,320 bytes free after the NVRAM slots, against roughly
    1,000 for detection, text mode, scroll, the BRK report and the VDP primitives. Tight.
    BASIC: about 4,390 bytes for the header, commands and keyword text.
    - **Order of spending:** core, then save slots, then second tier.
    - **If the Kernal runs out:** first move anything BASIC-only out of it. As a last
      resort, pack CHARS (6-bit rows save about 500 bytes, but change the `$B800` format
      and address).
14. **Wording.** Remove TMS9918 and Monitor mentions from `Kernal.asm`, `BIOS.inc`,
    `Chars.asm`, `README.md` (drop the Monitor section and document the new boot) and
    the test helpers. Fix the README's jump-table count, which says 51/34 from `$A099`
    where the source has 53/32 from `$A09F`.

### C. Tests and CI

- `jumptable.json`: append only. No existing address moves.
- Tests that expect the splash or menu, or that drive the Monitor, are rewritten for the
  new boot, or retired.
- `tests/probe/no-video-card-nothing-reaches-the-vdp.mjs`: watch all four ports.
- Retitle `tests/probe/color-sets-the-tms9918-colour-register.mjs`, and add probes for
  per-cell colour and `COLOR`'s border.
- New BASIC tests for every new keyword. A token-stability test: the 1.x keyword table is
  a prefix of 2.x's, except `$B4`.
- `ci.yml` on `main`: a 3.x emulator tag with the PICOVDP card selected explicitly.
  `v1.x` stays on 2.7.0.

### D. Handing 2.0 to the rest of the workspace

- **6502-EMULATOR:** bundle 2.0 for the PICOVDP card and re-capture the `bios/` goldens.
  They all move: the header, per-cell colour and scroll.
- **6502-DOCS:**
  - `extract-facts.mjs --bios` reads `v1.x` for `v1` and `main` for the rewrite.
  - The keyword, Kernal and boot data change shape; the Monitor data goes.
- **6502-ASM:** the VDP include is written from 2.0's `BIOS.inc` and jump table, with no
  `MONITOR_*` names.
- **bastok:** the 2.x token table, which is 1.x plus appended keywords, with `$B4` renamed.
- **6502-ACE:** EEPROM image and README.

## Linked repositories

| Repository | Path | Why |
|---|---|---|
| 6502-EMULATOR | `~/Developer/NodeJS/6502-EMULATOR` | Bundles 1.6 (2.7.0) and 2.0 (3.x); `docs/handoff/6502-BIOS.md` on `v3-vdp`; CI runs on it |
| 6502-PICOVDP | `~/Developer/C/6502-PICOVDP` | `SPEC.md` §7 (VRAM layout), §8 (attributes), §9 (Text mode), §16 (detection), §17 (BIOS changes) |
| 6502-DOCS | `~/Developer/NodeJS/6502-DOCS` | Documents 1.6 (`v1`) and 2.x (`main`), extracted from this source per branch |
| 6502-ASM (then CRT, PRG, BIN, C) | `~/Developer/Assembly/6502-ASM` | Legacy include takes 1.6's entries; the VDP include tracks 2.0 |
| bastok | `~/Developer/NodeJS/bastok` | Token table transcribed from `BASIC.asm` |
| 6502-EHBASIC, vc83basic | `~/Developer/Assembly/6502-EHBASIC`, `~/Developer/Github/vc83basic` | Cartridges that rely on the Kernal staying below `$C000` and on jump-table addresses not moving |
| cffs, 6502-PRG, 6502-BIN | `~/Developer/NodeJS/cffs`, … | READMEs that describe Monitor workflows |

## Questions for VDP-PLAN.md

1. What a 2.x ROM does on a TMS9918A (item 4).
2. The new keyword chosen for token `$B4`.
3. `SCREEN`'s layer defaults per mode, and exactly what "back to text" restores.
4. Save-slot command syntax.
5. Whether `SYS` leaves registers readable after the call, and where.
6. The logo design.
7. The pen's RAM location and whether `COLOR` values persist across `NEW`/`RUN`.
8. What the Kernal's `VideoSetColor` means on 2.x: set the pen (and whether it also writes
   register 7). Cartridges' `COLOR` statements (EhBASIC, vc83basic) inherit the answer.
