# BIOS v1.6 — NVRAM Save Slots

**1.6 is the last 1.x release.** It adds the save slots and nothing else. After it is tagged,
`v1.x` is cut from `v1.6` for bug fixes only, and `main` becomes BIOS 2.x. The rollout it
belongs to is in [VDP-ASSESSMENT.md](VDP-ASSESSMENT.md), Part 1. Everything this file
defines is **ABI that 2.x inherits unchanged**: the six entries, the slot format, `NV_ID` at
`$0390`, and `NV_PTR` = `STR_PTR`.

**Status, 2026-09-16: built and released.** Tag `v1.6` is at `71e1e66`, with a GitHub release,
and `v1.x` is cut from it. CI is green, with 167 passed. §8 records what was done and what is
left. The rest of this file is the design as it was settled before any code was written. Its
measurements came from the v1.5 build (`BIOS.bin`, `BIOS.dbg`) and sources, except where a figure
is labelled an estimate. Where the build turned out differently, the section says so.

---

## 1. What this adds

The DS1511Y's 256 bytes of battery-backed NVRAM become a game-save area of **16 slots**,
addressed by slot number rather than by byte address, with Kernal routines that read, write,
erase, and enumerate them. Six new jump-table entries; no existing entry moves.

### Constraints that shape the design

Per-segment free space, measured from the trailing `$00` fill in `BIOS.bin`:

| Segment | Region | Size | Used | Free |
|---|---|---|---|---|
| KERNAL | `$A000-$B7FF` | 6144 | 4592 | **1552** |
| CHARS | `$B800-$BFFF` | 2048 | 2038 | 10 |
| BASIC | `$C000-$EDFF` | 11776 | 11735 | **41** |
| MONITOR | `$EE00-$FEFF` | 4352 | 4345 | **7** |
| WOZMON | `$FF00-$FFF9` | 250 | 241 | 9 |

KERNAL is the only segment with room for this. The jump table has **32 reserved stubs** at
`$A09F-$A0FE` ([Kernal.asm:96-99](Kernal.asm#L96-L99)), so appending is free and shifts nothing.
`$0390-$03FF` in the Kernal variable page has no equate yet. It sits inside the range
`BIOS.inc` heads "BASIC runtime variables (`$035D-$03FF`)", whose last assignment is
`PRG_IMAGE_END` at `$038E-$038F`. Taking `$0390` for `NV_ID` is safe; when adding it, amend
that heading so the range no longer reads as BASIC's alone.

### A correction to the original premise

**The Monitor has no NVRAM command.** BASIC has the `NVRAM addr,val` statement and the `NVRAM(addr)`
function; the Monitor reaches NVRAM only by hand-poking the register window (`:8810 05`, then
`M 8813`). The coverage that exists today is thinner than it appeared — which matters for §6.

---

## 2. Format

Chosen: **16 slots, 2 header bytes + 14 payload bytes each.** The alternatives considered and
rejected are recorded in §9.

Slot `n` occupies NVRAM `$n0-$nF`. **The slot number is the high nibble of the address** — base
address is `slot << 4`, which is four `asl`s: no multiply, no lookup table.

```
+$0   owner ID     $00 = free; otherwise a game-chosen identity byte
+$1   checksum
+$2   payload byte 0
 ...
+$F   payload byte 13
```

Two header bytes per slot are what make this an ABI rather than a macro: without them the Kernal
cannot tell a written slot from a dead battery, and the routines degrade into `RtcReadNVRAM` in a
loop. Each slot is independently valid — there is no directory whose loss takes the whole area
with it.

### Checksum

Covers the owner ID and all 14 payload bytes — 15 bytes, skipping the checksum byte itself —
seeded `$A6`:

```
ck = $A6
for b in [id, p0 … p13]:
    ck = rotate_left_8(ck) EOR b
```

On the 6502 the inner step is `asl a` / `adc #$00` / `eor <byte>`. `asl` shifts bit 7 into carry
and `adc #$00` adds it back into bit 0, giving a true 8-bit rotate in three bytes. Requires
`D = 0`, which the routines guarantee themselves (§3, "Decimal mode").

The rotate is what catches transposed bytes, which a plain running sum does not. The nonzero seed
stops an all-`$FF` slot — the shape an erased or unpowered part takes — from checksumming to `$FF`
by symmetry.

### Slot states

| State | Condition | Constant |
|---|---|---|
| free | `id == 0` | `NV_EMPTY` = 0 |
| valid | `id != 0` and checksum agrees | `NV_VALID` = 1 |
| corrupt | `id != 0` and checksum disagrees | `NV_BAD` = 2 |

### New equates — [BIOS.inc](BIOS.inc)

```
NV_SLOTS        = 16        ; Save slots in RTC NVRAM
NV_SLOT_SIZE    = 16        ; Bytes per slot (slot n at NVRAM n*16)
NV_SLOT_DATA    = 14        ; Payload bytes per slot
NV_CK_SEED      = $A6       ; Checksum seed
NV_EMPTY        = 0         ; NvStat: slot is free
NV_VALID        = 1         ; NvStat: owner ID set, checksum agrees
NV_BAD          = 2         ; NvStat: owner ID set, checksum does not
NV_ID          := $0390     ; Owner ID input for NvWrite
NV_PTR         := STR_PTR   ; $02-$03 - caller's buffer during a slot copy
```

One addition to the existing RTC hardware equates, alongside `RTC_CTRL_B_TE`:

```
RTC_CTRL_B_BME := %00100000 ; Burst Mode Enable — 1 = RTC_RAM_ADDR auto-increments
                            ;   on each access of RTC_RAM_DATA
```

`NV_PTR` aliases `STR_PTR` the way `PE_PTR` aliases `CF_BUF_PTR` — the two are never live at the
same time, so it costs no new zero page. Callers must treat `STR_PTR` as clobbered by `NvRead` and
`NvWrite`, exactly as they already must for `PrintStr`.

`NV_ID` sits in the free `$0390-$03FF` region and exists because the 6502 has three registers and
`NvWrite` needs four arguments. **As built, it is input-only:** `NvStat` returns the owner ID in
`Y`, as §3's table says, and writes nothing to `NV_ID`. The "in/out" in an earlier draft of the
comment above was not carried into the ABI. This follows the `FS_IO_ADDR` / `RTC_BUF_CENT` precedent.

---

## 3. Jump table additions

Six entries append at `$A09F`. The reserved `.repeat 32` drops to `.repeat 26`, which still fills
the page exactly: `$A0B1 + 26*3 = $A0FF`, where the existing pad byte sits. **The page stays at
85 slots.** Published entries grow 53 → 59, and reserved entries shrink 32 → 26.

| Slot | Name | In | Out |
|---|---|---|---|
| `$A09F` | `NvStat` | `X`=slot | `A`=status, `Y`=owner ID, `X` preserved |
| `$A0A2` | `NvRead` | `X`=slot, `A`/`Y`=dest lo/hi | 14 bytes copied; `A`=status, `Y`=owner ID, `X` preserved |
| `$A0A5` | `NvWrite` | `X`=slot, `A`/`Y`=src lo/hi, `NV_ID`=owner ID | `X` preserved |
| `$A0A8` | `NvErase` | `X`=slot | `X` preserved (zeroes all 16 bytes) |
| `$A0AB` | `NvFind` | `A`=owner ID (`$00` = first free) | `X`=slot |
| `$A0AE` | `NvFormat` | — | — (erases all 16 slots) |

### Register contract (decided)

- **`X` is preserved** by `NvStat`, `NvRead`, `NvWrite` and `NvErase`, so a loop over slots
  needs no reload. `NvFind` returns the slot in `X`.
- **`NvStat` and `NvRead` always return `A` = status and `Y` = owner ID, on failure too**, so
  one call says why a read failed. On a slot number ≥ 16 or no RTC, `A` and `Y` are undefined
  and only carry is meaningful.
- **Everything else is clobbered:** `A`/`Y` where not listed as outputs, the other flags, and
  `STR_PTR` (`NV_PTR`) for `NvRead` and `NvWrite`.
- **The caller's decimal and interrupt flags come back unchanged** (see the two rules below).

### `NvFind` semantics (decided)

- `A` ≠ `$00`: match the owner ID in **any non-free slot, valid or damaged**, and return the
  **lowest-numbered** match. A game that finds its ID then calls `NvRead`; a damaged save
  returns carry set with `A` = `NV_BAD`, so the game can tell the player, rather than silently
  starting over.
- `A` = `$00`: return the lowest free slot.
- A game with several saves walks the slots with `NvStat`.

### Decimal mode (decided)

Every routine that computes a checksum (`NvStat`, `NvRead`, `NvWrite`, and `NvFind` if it
validates) brackets the work with `php` / `cld` … `plp`. Callers never need to clear `D`, and
their flag comes back untouched. A game that keeps its score in decimal mode stays safe.

### Error convention

**Carry set means the call did nothing**, matching `StWaitReady`. The failure cases:

- no RTC fitted (`HW_PRESENT & HW_RTC` clear)
- slot number ≥ 16
- `NvWrite` handed `NV_ID = 0` — that is erasure, and `NvErase` is the routine for it
- `NvFind` matched nothing
- `NvRead` given a slot that is not `NV_VALID`

On an `NvRead` failure `A` carries the `NvStat` code, so a caller distinguishes "no save yet" from
"your save is damaged" without a second call. **The destination buffer is not written on any
failure path**, so a corrupt slot cannot half-fill it.

### Two deliberate departures from the existing RTC routines

**These six check `HW_PRESENT & HW_RTC` themselves.** `RtcReadNVRAM` / `RtcWriteNVRAM` do not —
BASIC gates them at the call site through `ReqHw` ([BASIC.asm:7984](BASIC.asm#L7984)). That
division was fine for a raw byte and is not fine here: a floating bus can produce a pattern that
passes a 15-byte checksum by chance and hands a game a fabricated save. **Nothing about the
existing raw pair changes** — they keep their addresses, contracts, and behaviour.

**`NvErase` zeroes all 16 bytes, not just the ID.** A deleted save should not leave its contents
legible to whatever game next lands in that slot.

### Notes on two of the entries

`NvFind` is the call a game actually makes at startup — "do I have a save, and where?" — in one
shot rather than sixteen `NvStat`s.

`NvFormat` is the first entry to drop if the slot budget ever tightens: it is a loop over `NvErase`
and a management utility can write it. It is included because a format command is the natural
partner to a save area, and reserved slots are not scarce.

**Estimated KERNAL cost: ~250 bytes** (about 230 for the routines, plus the flag brackets and
`X` saves), against 1552 free. **Actual: 314 bytes**, leaving 1230 free. The `ProbeRTC` fix
(§4.3) took another 8 bytes before that.

---

## 4. The two datasheet questions — settled

Both answered against the DS1501/DS1511 datasheet (Dallas/Maxim rev 050802, Table 2 and the
control-bit descriptions), cross-checked against the emulator's `src/core/IO/RTC.ts` at the tag CI
pins, `v2.6.0`. One proposal is withdrawn, one is confirmed, and the investigation turned up a
latent bug in the current ROM.

Datasheet: <https://www.farnell.com/datasheets/47960.pdf> (Analog Devices' and Mouser's copies of
the same document are behind bot protection and will not fetch from a terminal).

### 4.1 Burst mode — confirmed, and the guess about `$8811`/`$8812` was wrong

Table 2 lists **`11H` and `12H` as RESERVED**. There is no address-high or burst-data port there,
so that half of the original hypothesis is dead.

Burst mode is real, but it works through the *existing* two ports and is gated by a control bit:

> **BME - Burst Mode Enable Bit (0FH bit 5)** — "The burst mode enable bit allows the extended user
> RAM address registers to automatically increment for consecutive reads and writes."

> "To enable the burst mode feature, set the BME bit to a 1. With burst mode enabled, write the
> extended RAM starting address location to register 10h. Then read or write the extended RAM data
> from/to register 13h. The extended RAM address locations are automatically incremented on the
> rising edge of OE, WE, or CS **only when register 13h is being accessed**."

So a 16-byte slot copy is: set BME, write the slot base to `RTC_RAM_ADDR` **once**, then sixteen
plain accesses of `RTC_RAM_DATA`, then clear BME. That removes a `RTC_RAM_ADDR` store and an index
bump from every iteration — roughly halves the inner loop against set-address-then-access per byte.
**Adopt it.** The §3 ABI is unchanged.

Three implementation constraints follow from "on the rising edge of OE, WE, or CS":

- **Set and clear BME with read-modify-write on Control B**, never a bare store — Control B also
  holds TE. `RtcFreeze` / `RtcThaw` ([Kernal.asm:1300-1314](Kernal.asm#L1300-L1314)) already use
  exactly this `lda / ora / sta` idiom; follow it.
- **Only plain absolute addressing on `RTC_RAM_DATA` while BME is set.** Indexed modes and
  read-modify-write instructions can generate more than one bus access, and every access
  increments the pointer.
- **Leave BME clear on exit from every routine**, so the raw `RtcReadNVRAM` / `RtcWriteNVRAM` pair
  and anything a cartridge does keep their current single-byte behaviour.
- **Mask interrupts for the burst (decided).** `php` / `sei` before setting BME, `plp` after
  clearing it. A user IRQ handler that touched `RTC_RAM_DATA` mid-copy would move the pointer and
  corrupt the save. The Kernal's own handler never touches the RTC. The copy is 16 accesses, a
  few hundred microseconds, so interrupts are delayed, not lost. NMI can't be masked, and the
  Kernal's NMI path does not touch NVRAM; document that a user NMI handler must not either.

The emulator models this faithfully — `controlB & 0x20` gates the increment on both read and write
of `0x13`, and `0x11`/`0x12` read as 0 with writes ignored — so the burst path is exercised by the
suite rather than only on real silicon.

### 4.2 The alarm-register probe scratch — withdrawn

**Do not do this.** Keep `ProbeRTC` on NVRAM. Three reasons, in descending order of seriousness:

**TPE is battery-backed and indeterminate.** The POWER-UP DEFAULT STATES section clears only
`EOSC`, `E32K`, `TIE`, `KIE`, `WDE`, `WDS`. **`TPE` is not in that list.** And TPE has teeth: "When
the TDF flag bit is set to a '1', if TPE is a '1', the PWR pin will be driven active" — with PAB
(`0EH` bit 4) cleared as a side effect whenever `TDF AND TPE`. Writing the alarm compare registers
on a board whose TPE happens to be 1 can therefore drive a power-control pin. That is the same
shape as the bug fixed in `bc3aaa8` — an indeterminate battery-backed control bit assumed to be in
a convenient state.

**The AM1-AM4 encoding has a trap.** "Configurations not listed in the table default to the once
per second mode to notify the user of an incorrect alarm setting." A test pattern written into
`08H` sets AM1 to whatever bit 7 of the pattern is, and combined with the other three
battery-backed AM bits may land on an unlisted configuration — which then fires TDF every second.

**It trades an inert byte for a live one.** NVRAM byte `$00` feeds nothing but a RAM array. The
alarm registers feed compare logic, an interrupt flag, and a power pin. Moving the probe onto them
is the wrong direction regardless of the two points above.

The original concern that motivated this — a power cut inside the probe corrupting slot 0 — stands,
but it is correctly handled by the checksum: slot 0 reads `NV_BAD` rather than serving a wrong
save. One correction to the earlier framing: the exposure is not "a handful of cycles". The saved
byte is held on the stack across the whole month-register / `RtcFreeze` / `RtcThaw` sequence at
[Kernal.asm:1666-1682](Kernal.asm#L1666-L1682), so the window is a few dozen cycles. Still
microseconds, and still the right trade.

### 4.3 Latent bug found on the way: ProbeRTC breaks if BME is set

**BME is battery-backed and is *not* in the power-up-cleared list either**, and Table 2's note is
explicit: "the state of the control/RTC/SRAM bits in the DS1501/DS1511 is not defined upon initial
power application; the DS1501/DS1511 should be properly configured/defined during initial
configuration."

`ProbeRTC` ([Kernal.asm:1656-1684](Kernal.asm#L1656-L1684)) sets the RAM address **once** and then
makes three accesses to `RTC_RAM_DATA` — save, write pattern, read back, and later restore. With
BME set on entry, each of those steps walks the pointer:

| Step | Intended | With BME set |
|---|---|---|
| `lda RTC_RAM_DATA` (save) | reads `$00` | reads `$00`, pointer → `$01` |
| `sta RTC_RAM_DATA` (pattern) | writes `$00` | writes `$01`, pointer → `$02` |
| `cmp RTC_RAM_DATA` (verify) | reads `$00` | reads `$02`, pointer → `$03` |
| `sta RTC_RAM_DATA` (restore) | writes `$00` | writes `$03` |

The compare then fails against an unrelated byte, so **`HW_RTC` is never set and the machine
reports no clock card** — on a board that has one. The restore also scribbles the saved value into
a third address. Both are silent.

This is pre-existing and independent of save slots; it is reachable today on any board left with
BME set by earlier software. The fix is one instruction sequence: **clear BME before the probe
touches the RAM ports.** `ProbeRTC` is already the right place — it is where the ROM defines E32K
and repairs TE, for the same "battery-backed and indeterminate" reason, and the datasheet
explicitly asks for these bits to be configured at init.

Ordering constraint: BME must be cleared **before** the first `RTC_RAM_DATA` access, which is
earlier than the existing `RtcFreeze` block. A bare `stz RTC_CTRL_B` would destroy TE, so it is
the same read-modify-write as everything else touching Control B.

---

## 5. Files touched

| File | Change |
|---|---|
| [BIOS.inc](BIOS.inc) | `BIOS_VERSION_MINOR` 5 → 6; the `NV_*` block and `RTC_CTRL_B_BME` from §2. Put `NV_ID` with the other `$03xx` RAM equates, above the `; RAM Card \| IO 1` banner, where 6502-DOCS's extractor collects the memory map |
| [Kernal.asm](Kernal.asm) | six table entries; `.repeat 32` → `.repeat 26`, and its comment `; Reserved entries ($A09F-$A0FE)` → `($A0B1-$A0FE)` (6502-DOCS's extractor reads the reserved range from that comment, so a stale one is published); the header's "85 slots" stays correct; six implementations after `RtcWriteNVRAMImpl`; **the §4.3 BME fix in `ProbeRTC`** |
| [README.md](README.md) | six jump-table rows; the jump-table count (it says 51 published and 34 reserved from `$A099`, where the source has 53 and 32 from `$A09F` today, and 59 and 26 from `$A0B1` after this); splash sample v1.5 → v1.6; an "NVRAM Save Slots" subsection under Real-Time Clock documenting the format so third-party code can read it |
| `tests/fixtures/jumptable.json` | six pins — hand-edited, which is the entire point of that file |
| `tests/probe/the-jump-table-fills-a-page-of-jmp-slots.mjs` | its `PUBLISHED` / `RESERVED` constants, 53/32 → 59/26 (missed by this table when it was drafted; the lockstep below names the case) |

`tests/probe/version-agrees-with-splash.mjs` reads `BIOS_VERSION_*` from `BIOS.inc` and needs no
edit; the splash string is derived via `.sprintf` at [Kernal.asm:3135](Kernal.asm#L3135).

### The lockstep the harness enforces

Three cases hold the published API from three directions, and all three must be updated in the
same commit or the build goes red:

- [the-jump-table-addresses-are-pinned.mjs](tests/probe/the-jump-table-addresses-are-pinned.mjs) — ROM vs. the hand-written fixture
- [the-readme-documents-every-jump-slot.mjs](tests/probe/the-readme-documents-every-jump-slot.mjs) — README table vs. the same fixture
- [the-jump-table-fills-a-page-of-jmp-slots.mjs](tests/probe/the-jump-table-fills-a-page-of-jmp-slots.mjs) — the page stays full of `JMP` slots

That friction is intended. The README's table is the document a cartridge author reads addresses
from, so it is pinned as hard as the ROM.

---

## 6. BASIC and the Monitor

**No new BASIC command and no new Monitor command.** BASIC has 41 bytes free and the Monitor 7; a
token plus dispatch-table entry plus handler is several times either figure.

What remains is better than that sounds. `NVRAM addr,val` and `NVRAM(addr)` already reach every
byte, and now that the format is specified rather than ad hoc, a BASIC program can implement it
directly: slot base is `S*16`, and the checksum is a `FOR` loop. `SYS`
([BASIC.asm:8190](BASIC.asm#L8190)) also reaches the Kernal entries, but it passes no registers, so
anything routed that way needs a short `POKE`d stub to set up `X`/`A`/`Y` first.

**Ship a documented `SAVEMGR.BAS` example** in the README's BASIC section instead of spending ROM.
It costs zero bytes and is a better teaching artifact than a command would be.

BASIC commands for save slots are BIOS 2.x work, where dropping the Monitor frees the room (see
[VDP-ASSESSMENT.md](VDP-ASSESSMENT.md)). Nothing in 1.6 anticipates their syntax.

---

## 7. Test plan

Tier 3 probes, since none of this is reachable from a BASIC prompt.

- a written slot round-trips through `NvWrite` → `NvRead`, payload and owner ID intact
- slot 0 and slot 15 both land on the correct 16 bytes — the boundaries a bad shift survives in the
  middle and fails at the ends, the same reasoning
  [nvram-round-trips.bas](tests/basic/nvram-round-trips.bas) already applies to byte addressing
- a slot with a deliberately wrong checksum reports `NV_BAD`; `NvRead` on it sets carry **and leaves
  the destination buffer untouched**
- `NvFind` locates a written owner ID, and returns the first free slot when given `$00`
- `NvErase` leaves no payload bytes behind
- `NvWrite` to slot 16 sets carry and writes nothing
- with the RTC absent, every entry sets carry and touches no bus — the pattern
  [no-sid-card-nothing-reaches-the-sound-chip.mjs](tests/probe/no-sid-card-nothing-reaches-the-sound-chip.mjs)
  uses for the SID
- a slot survives a reset — extends [nvram-survives-a-reset.mjs](tests/probe/nvram-survives-a-reset.mjs)
- **the probe still finds the clock card with BME set on entry** (§4.3) — set Control B bit 5, then
  reset, and assert `HW_RTC` is set in `HW_PRESENT` and that no NVRAM byte outside the probe's own
  scratch changed. This is the regression case for the latent bug, and it fails on today's ROM,
  which is what makes it worth writing first
- a burst-mode copy leaves BME clear afterwards, so `RtcReadNVRAM` still reads one byte without
  moving the pointer
- **the register contract:** `X` survives `NvStat`/`NvRead`/`NvWrite`/`NvErase`; `NvStat` and a
  failing `NvRead` on a damaged slot both return `A` = `NV_BAD` and the owner ID in `Y`
- **decimal mode:** called with `D` set, `NvWrite` then `NvRead` round-trips, and `D` is still
  set on return
- **interrupts:** called with `I` clear, `I` is clear again on return, and set with `I` set
- **`NvFind` on a damaged slot:** finds it, and returns the lowest of two slots holding the same
  owner ID
- **the documented format matches the ROM:** a slot written by the README's `SAVEMGR.BAS` logic
  (plain `NVRAM` statements and the BASIC checksum loop) reads `NV_VALID` through `NvStat`, and a
  slot written by `NvWrite` validates in the BASIC routine. This keeps the published format and the
  implementation from drifting apart.

The emulator's `controlB` starts at `0x80` — TE set, BME clear — so the BME case must set the bit
deliberately rather than relying on a fresh instance.

The corrupt-slot and mixed-population cases need not be written by the test first:
[the-clock-card-holds-the-nvram-image-it-was-given.mjs](tests/probe/the-clock-card-holds-the-nvram-image-it-was-given.mjs)
shows the emulator accepts a prepared NVRAM image, so the fixture can carry a valid slot, a free
slot, and a corrupt one, and the assertions read rather than write.

---

## 8. Order of work

1. ~~Confirm the two §4 datasheet questions.~~ **Done — see §4.**
2. ~~**The §4.3 `ProbeRTC` BME fix, first and on its own.**~~ **Done — `57622ff`.** Its
   regression case was watched to fail on the v1.5 ROM first.
3. ~~`BIOS.inc` — version bump, the `NV_*` block, `RTC_CTRL_B_BME`.~~
4. ~~`Kernal.asm` — table entries and implementations.~~
5. ~~`tests/fixtures/jumptable.json` and the README table, together.~~ **Steps 3–5 done
   together — `fc54dbb`,** since the lockstep (§5) makes them one green point. No slot
   address moved. Fifteen slots' *targets* did (`FsLoadFile` onward), because the routines
   behind them shifted, which is what the table is for.
6. ~~The new Tier 3 probes.~~ **Done — `b892fbe`.** Each was checked by breaking the ROM
   eight ways; every break failed a case.
7. ~~README prose: the format subsection, the splash sample, `SAVEMGR.BAS`.~~ **Done —
   `71e1e66`,** with a case that types `SAVEMGR.BAS` out of the README and holds it to the ROM.
   §10's `tests/README.md` fix went in the same commit.
8. ~~**Release.** Tag `v1.6`, then cut `v1.x` from the tag.~~ **Done.** Then hand off, in this
   order of need:
   - **6502-EMULATOR `main`** bundles the `v1.6` `BIOS.bin` and releases 2.7.0. *Planned* in
     its `VDP-PLAN.md` (on `v3-vdp`), updated for the release.
   - **6502-ASM** adds the `NV_*` equates, `RTC_CTRL_B_BME` and the six entries to the legacy
     `6502.inc`, verified against the `v1.6` build, and copies it to every repo that ships one
     (6502-C also gets `6502.h` declarations). *Not yet planned.*
   - **6502-DOCS** documents 1.6 before cutting its frozen `v1`. *Planned* in its
     `VDP-PLAN.md`, updated for the release.
   - **6502-PICOCALC** embeds the `v1.6` ROM and releases a new UF2, since it is a legacy
     machine shipping the final legacy BIOS. *Not yet planned.*

   Once emulator 2.7.0 is out, `v1.x`'s `ci.yml` moves its `EMULATOR_REF` to `v2.7.0`. That
   workflow runs only on pushes to `main` and on pull requests, so 1.x fixes go through PRs
   into `v1.x`, or `v1.x` is added to its push branches.

Commit at each green point rather than at the end.

---

## 9. Alternatives considered

16 slots × 16 bytes is 256 exactly, leaving **zero bytes for metadata**. The three ways out:

| | Slots | Payload | Kernal can report | Verdict |
|---|---|---|---|---|
| **A** | 16 | 14 | free / valid / corrupt, and owner | **chosen** |
| B | 16 | 16 | nothing | rejected |
| C | 15 | 16 | free / in use, via a directory at `$F0-$FF` | rejected |

**B** was the original instinct and gives the full 16 payload bytes, but the Kernal cannot then
distinguish a written slot from a dead battery, and `NvStat` / `NvFind` have nothing to inspect —
the routine set collapses to bounds-checked `memcpy`, which is not worth six jump-table slots.

**C** keeps 16 payload bytes and a used-map, but concentrates every slot's validity in one 16-byte
directory: lose it and the whole area goes. It also drops to 15 slots.

**A** spends two bytes per slot to buy independent per-slot validity with no shared structure to
lose. 14 bytes still holds a level, a score, lives, and a flag word with room to spare.

---

## 10. Housekeeping note

`OPTIMIZE.md` is listed in `.gitignore`; `PLAN.md` is not. This file is **tracked**, by decision —
unlike the optimization audit, it is the record of an API being designed, and the reasoning in §4
and §9 is worth having in history next to the commits that act on it.

Separately: [tests/README.md](tests/README.md) said "PLAN.md is the map" for the test suite,
but `tests/PLAN.md` was removed in `621a9b2`. With a root `PLAN.md` now tracked, that sentence
pointed a reader at the wrong document. **Fixed in `71e1e66`.**
