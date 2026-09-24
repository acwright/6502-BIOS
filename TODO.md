# TODO

For the next BIOS 2.x update. The first two were found on 2026-09-24 while looking
into why an ACE Rev 1.0 missed its SID and CompactFlash card at 2 MHz (6502-ACE
`TODO.md`, "The ACE runs at 1 MHz only"). The ACE now runs at 1 MHz only, so
none of these is failing today. BIOS 1.6's routine addresses are frozen, so these
are for 2.x only, unless 1.x is reissued.

## 1. The CompactFlash probe should wait a fixed time, not a fixed number of cycles

**What happens now:** `KernalInit` calls `StInit`, which calls
`StWaitReadyPoll` to wait for the card to clear `BSY` and set `RDY`. The wait is
a loop of 65,536 polls of `ST_STATUS`, about 13 cycles each, which is about
852,000 cycles. The card's `/RESET` is the 65C02's `RESB`, so the card starts
initialising at the moment the 65C02 leaves reset, and the probe runs a few
milliseconds later. Measured with the emulator's CPU and a card model that holds
`BSY` for a set time after reset, the probe finds a card that is ready within
**about 851 ms at 1 MHz** (and 425 ms at 2 MHz), the same in BIOS 1.6 and
2.0.2. A card that takes longer is recorded as absent: `HW_CF` stays clear, and
`StWaitReady` then refuses every storage call.

**Why it needs changing:** the ACE's card was found on every 1 MHz boot in
6502-PICOVDP's Phase 14, and missed on some 2 MHz boots, so on those boots the
card needed between 425 and 851 ms. How close it comes to 851 ms at 1 MHz is not
known. A slower card, or the same card on a bad day, would be missed. The ATA
standard allows a drive up to 31 seconds to clear `BSY` after a reset, and
CompactFlash cards commonly take several hundred milliseconds.

**What to do:**

1. **Measure first.** Make `StInit` record how many polls it waited, in a
   Kernal variable a user can `PEEK` after boot. That shows how much margin the
   ACE's card has, and it is worth keeping afterwards as a diagnostic.
2. **Wait for a time, not a count.** `ProbeRTC` runs before `StInit` in
   `KernalInit`, so when `HW_RTC` is set the probe can bound its wait with the
   DS1511Y's seconds register (`RTC_SEC`): give up after the seconds have
   changed, say, three times, which is two to three seconds. Without an RTC, keep
   the cycle-counted loop, lengthened to match.
3. **Mind the empty slot.** With no CF adapter fitted, nothing drives the data
   bus, and a read of `ST_STATUS` (`$8C07`) returns the last byte the 65C02
   fetched, `$8C`, the high byte of the address. `$8C` has `BSY` set, so a board
   without a card waits out the whole timeout on every boot: 0.85 s now, and
   however long the new limit is. Decide how long a boot without a card may take.
   Treating a status of exactly `$8C` as "no card" is tempting but unproven: a
   busy card may return any value in the other bits, so check real cards before
   relying on it.

`StWaitReady` and `StWaitDrq` use the same 65,536-poll count, but only after the
probe has found the card ready, so they can stay as they are.

**How to test it:** give the emulator's `Storage` card a busy time after reset
(its status reads `$80` until the time is up), and check that the card is found
up to the new limit and that a boot with the slot empty takes the expected time.
The harness used to find the 851 ms figure wrapped the emulator's `out/core`
build in this way; it was not kept.

## 2. The SID probe passes with nothing in the socket

**What happens now:** `ProbeSID` sets voice 3 to noise at the highest
frequency, waits, reads `SID_OSC3` (`$981B`) once, and records a SID if the value
is neither `$00` nor `$FF`. When nothing answers the read, the 65C02 reads open
bus: the last byte on the data bus, which is `$98`, the high byte of
`SID_OSC3`'s address, fetched in the cycle before. `$98` passes the test. The
ACE's data bus has no pull-up or pull-down resistors, so an ACE with its SID
socket empty would boot with `SID` in the header, and `HW_SID` set. So would any
machine with an empty sound slot.

This showed up in the emulator, with the ACE's 2 MHz clocking added to it: the
SID answers only every other CPU cycle, and on boots where the read missed the
SID, the probe "found" it by reading `$98`. That fits the bench, where some
2 MHz boots found the SID. At 1 MHz with no SID fitted, the read misses in the
same way. It has not been tried on the bench: pull the ARMSID and boot.

**What to do:** accept a SID only if `SID_OSC3` changes. Voice 3's noise at the
highest frequency gives a different value on almost every read, so read it
several times with a short delay between reads, and require at least two
different values. Open bus returns `$98` every time and fails. Rejecting `$98`
by value as well would be cheap insurance.

**Also unexplained:** at 1 MHz the ACE's ARMSID was missed once in about a dozen
boots in Phase 14. A probe that samples several times, over a longer window,
may also cure that, if the ARMSID is sometimes not ready yet when the probe
runs. Recording whether each miss was at power-on or after the reset button
would help.

## 3. The keyboard encoders' settle delay is sized for a clock the ACE no longer has

**What happens now:** `KBDisable` busy-waits `KB_SETTLE_COUNT` (80) loops of
about 5 cycles after disabling both keyboard encoders, so their firmware has let
go of the VIA's ports before the caller reads them. The comment beside it in
`Kernal.asm` sizes that against "the 2 MHz clock option (the worst case)": about
200 µs at 2 MHz, against the encoder firmware's guaranteed release within
100 µs.

**Why it can change:** the ACE runs at 1 MHz only now (6502-ACE `TODO.md`), so
the same count waits about 400 µs, four times the guarantee. Nothing is wrong,
since a longer wait is only slower, but `JOY()` pays it on every read. At 1 MHz a
count of 40 gives about 200 µs, the margin the comment chose. Change the count and
its comment together, and check `JOY()` against a real board's encoders.

