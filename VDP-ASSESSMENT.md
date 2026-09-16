# VDP assessment: 6502-BIOS

> An outline, not a plan. The detailed plan for this repository goes in `VDP-PLAN.md`,
> written in a session of its own. Surveyed 2026-09-16 across the whole workspace.
> Line numbers drift; file and routine names are the durable references.

## The change

The ACE moves from a Pico9918 running stock TMS9918A firmware to the **6502-PICOVDP**
(`6502-PICOVDP/SPEC.md`) on PICO9918 PRO v2.0 hardware, running **BIOS 2.x**. Everything
else stays where it is: COB, DEV, KIM, VCS, PicoCalc, and any ACE whose card cannot be
reflashed (RP2040 pico9918 v1.0–1.3). Those keep the stock firmware and **BIOS 1.x (1.5)**.

- **Legacy** in these documents means TMS9918A + BIOS 1.x. **VDP** means PICOVDP + BIOS 2.x.
- **Compatibility runs one way.** The PICOVDP's legacy submode runs Text and Graphics I
  programs unchanged, so BIOS 1.5 and existing cartridges run on it. Graphics II and
  Multicolor fall back to Graphics I and draw garbage. Register writes above 7 no longer
  alias, so F18A tricks break. Sprites per line are 16 by default, not 4. Nothing written
  for the VDP runs on a TMS9918A.
- **BIOS 2.0 is assumed to be:** BIOS 1.5, plus the NVRAM save slots in this repo's
  `PLAN.md`, plus the VDP work in `6502-EMULATOR`'s `docs/handoff/6502-BIOS.md` (branch
  `v3-vdp`). Existing jump-table addresses stay put. A later redesign in this repository
  may revise this.

## Decisions already made

- No new repositories.
- **6502-EMULATOR** makes the video card an option (TMS9918A or PICOVDP): one app, one
  site. It also publishes a frozen 2.6.9 web build at a versioned path for the legacy docs.
- **6502-DOCS** is versioned: legacy docs are frozen at `/6502-DOCS/v1/`, and the main
  site is rewritten for the VDP.
- **This repository** gets a `v1.x` maintenance branch; `main` becomes 2.x.
- **Assembly and C projects** get a VDP include chosen by a build option, not branches.
- **EhBASIC and vc83basic** stay 1.x. **PicoCalc** stays legacy. **The YouTube series**
  teaches the legacy VDP and mentions the new features.

## Order across the workspace

1. **6502-PICOVDP:** firmware proven on the PRO (its Phases 9–11). This gates the
   hardware switch, not the software work.
2. **6502-EMULATOR:** frozen 2.6.9 web build at `/6502-EMULATOR/v2/`.
3. **6502-DOCS:** `v1` branch published at `/6502-DOCS/v1/`, embeds pinned to step 2.
4. **6502-EMULATOR:** `v3-vdp` merged, with the card as an option; tagged 3.x.
5. **6502-BIOS:** `v1.x` cut; 2.0 built on `main`. This can start any time, because the
   `v3-vdp` emulator already runs the PICOVDP.
6. **6502-ASM** sets the VDP include convention. 6502-CRT, 6502-PRG, 6502-BIN and 6502-C
   follow it.
7. The emulator bundles BIOS 2.0. 6502-DOCS `main` is rewritten. 6502-ACE, bastok,
   WIZARDSLAB, 6502-EHBASIC, vc83basic and 6502-ASSEMBLY follow.

---

## This repository's role

The ROM both platforms boot. Its jump table is the ABI that every include file,
cartridge and program in the workspace compiles against. Its sources are what 6502-DOCS
extracts facts from, and what bastok transcribes its token table from.

## Where it stands

- Tags `v1.1`–`v1.5`. `main` is v1.5 plus three commits: the CI emulator pin,
  `.gitignore`, and `PLAN.md`.
- `PLAN.md` designs "v1.6 — NVRAM Save Slots": 6 jump-table entries appended at `$A09F`,
  plus a latent `ProbeRTC` BME bug (§4.3). No code yet.
- Free ROM space (`PLAN.md` §1): KERNAL 1552 bytes, CHARS 10, **BASIC 41**,
  **MONITOR 7**, WOZMON 9.
- CI (`.github/workflows/ci.yml`) builds a pinned cc65 and pins the emulator to `v2.6.0`.
- Version: `BIOS_VERSION_MAJOR/MINOR` in `BIOS.inc` (1 / 5). The splash text is derived
  from it.

## Work outline

### A. Branching

- Cut `v1.x` from `main`. Nothing since `v1.5` changes the ROM.
- `v1.x` takes bug fixes only, released as 1.5.x. Its CI stays on an emulator running the
  TMS9918A card.
- `main` becomes 2.0. Retitle `PLAN.md` from "v1.6" to 2.0 (or fold it into
  `VDP-PLAN.md`), and set `BIOS_VERSION_MAJOR = 2`.

### B. What goes into 2.0

1. **NVRAM save slots**, as `PLAN.md` designs them.
2. **Card detection** (handoff §3, SPEC §16).
   - Select `STAT4`, read `$AC`.
   - `HW_PRESENT` has no free bit, so the result needs a new RAM byte: a card type, or a
     copy of `STAT6`'s capabilities.
   - Probe before `InitVideo`, because on a TMS9918A the probe writes register 7. Put
     `STAT0` back afterwards.
3. **Behaviour on a TMS9918A.**
   - 2.x targets the VDP, but a 2.x ROM will end up in a legacy machine sooner or later.
   - Recommendation: keep the 1.5 text path (it already works on both cards), and have
     every new VDP entry point return carry set.
   - Decide explicitly. Registers above 7 alias onto 0–7 on a TMS9918A, so an unguarded
     `L0SCRY` write lands on register 4 and wrecks the character set.
4. **Hardware scroll** (handoff §4).
   - Replace `VideoScrollImpl`'s ~31,000-cycle copy with `L0SCRY` plus a scroll origin.
   - Fold the origin into `VideoSetCursorImpl`, `VideoChroutImpl`,
     `VideoChroutRawImpl`, `VideoPutCharImpl` and `VideoClearImpl`.
   - `VideoGetCursorImpl` needs no change.
   - Acceptance: the emulator's `bios/scroll` index frame stays byte-identical.
5. **Port B convention** for user IRQ handlers (`$9C02`/`$9C03`), documented.
6. **New entry points.**
   - `WaitVBlank` works on both cards.
   - Candidates from SPEC §17: set mode, set a palette entry, set layer scroll, load a
     tile set, place a sprite, enable a layer.
   - The jump table has 32 reserved slots; NVRAM takes 6, leaving 26.
   - Each new entry needs a defined TMS9918A behaviour.
7. **BASIC.** Today the video keywords are `CLS`, `LOCATE` and `COLOR`.
   - With 41 bytes free, any new keyword means restructuring the BASIC segment.
   - Adding, removing or reordering keywords changes token values, and bastok must follow.
8. **Wording** (handoff §2).
   - Replace TMS9918 mentions in `Kernal.asm`, `BIOS.inc`, `Chars.asm`, `README.md` and
     the test helper comments.
   - While there, fix the README's jump-table count, which says 51/34 from `$A099` where
     the source has 53/32 from `$A09F`.

### C. Tests and CI

- `tests/fixtures/jumptable.json` pins the ABI. 2.0 may **append** entries, but no
  existing address moves. EhBASIC, vc83basic and every `6502.inc` copy depend on that.
- `tests/probe/no-video-card-nothing-reaches-the-vdp.mjs`: watch all four ports.
- Retitle `tests/probe/color-sets-the-tms9918-colour-register.mjs` (register 7 is still
  correct on both cards).
- `ci.yml` on `main`: move `EMULATOR_REF` to a 3.x tag, with the PICOVDP card selected
  explicitly rather than relying on the emulator's default.

### D. Handing 2.0 to the rest of the workspace

- **6502-EMULATOR:** bundle `BIOS.bin` for the PICOVDP card, in both bundled locations,
  and re-capture the `bios/` goldens (handoff "Bringing a changed BIOS back").
- **6502-DOCS:** `scripts/extract-facts.mjs --bios` must be able to read `v1.x` for the
  frozen docs and `main` for the rewrite. Generated there: `hardware.json`,
  `kernal.json`, `basic-keywords.json`, `boot.json`, `samples/lib/6502.inc`.
- **6502-ASM:** the VDP include is written from 2.0's `BIOS.inc` and jump table.
- **bastok:** only if keywords change.
- **6502-ACE:** EEPROM image and README.

## Linked repositories

| Repository | Path | Why |
|---|---|---|
| 6502-EMULATOR | `~/Developer/NodeJS/6502-EMULATOR` | `docs/handoff/6502-BIOS.md` on `v3-vdp` is this plan's starting inventory; it bundles the ROM; CI runs on it |
| 6502-PICOVDP | `~/Developer/C/6502-PICOVDP` | `SPEC.md` §16 (detection), §17 (BIOS changes), §5 (registers) |
| 6502-DOCS | `~/Developer/NodeJS/6502-DOCS` | Extracts facts from this source, per branch |
| 6502-ASM (then CRT, PRG, BIN, C) | `~/Developer/Assembly/6502-ASM` | The VDP include tracks 2.0's jump table |
| bastok | `~/Developer/NodeJS/bastok` | Token table transcribed from `BASIC.asm` |
| 6502-EHBASIC, vc83basic | `~/Developer/Assembly/6502-EHBASIC`, `~/Developer/Github/vc83basic` | Stay 1.x, and rely on jump-table addresses not moving |

## Questions for VDP-PLAN.md

1. Does `v1.x` also get the NVRAM slots as 1.6, or only bug fixes such as the `ProbeRTC`
   BME fix?
2. What a 2.x ROM does on a TMS9918A.
3. Which VDP entry points are in 2.0 and which come later, and the RAM byte for the card
   type.
4. Whether BASIC gains any keywords in 2.0.
5. How the redesign you have in mind sequences against this baseline: 2.0 as defined
   here first, or folded in.
