; ***          ***
; ***   BIOS   ***
; ***          ***

; The hardware is a WDC 65C02S. cc65's "65C02" is the Rockwell part: it has
; RMB/SMB/BBR/BBS but not WAI or STP, which are WDC additions. "W65C02" is that
; set plus those two, so this is a pure superset — no instruction already in use
; changes encoding, and the ROM is byte-identical until something emits WAI or
; STP. The Monitor's disassembler already decodes both ($CB, $DB), which is what
; the README means by "full WDC 65C02 + Rockwell instruction set"; before this
; the assembler could not have produced what the disassembler could read.
.setcpu "W65C02"

; Stated as a requirement rather than left to the line above, so that narrowing
; the CPU fails the build here with a reason instead of failing at whichever
; instruction happened to need it.
.if (.cpu .bitand CPU_ISET_W65C02) = 0
  .error "BIOS targets the WDC 65C02S — .setcpu must be W65C02 (WAI/STP)"
.endif

.include "BIOS.inc"

.segment "KERNAL"
.include "Kernal.asm"
.segment "CHARS"
.include "Chars.asm"
.segment "BASIC"
.include "BASIC.asm"
.segment "MONITOR"
.include "Monitor.asm"
.segment "WOZMON"
.include "Wozmon.asm"
.segment "VECTORS"
.include "Vectors.asm"