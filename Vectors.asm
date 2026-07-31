; =============================================================================
; VECTORS  —  Hardware Interrupt Vectors (NMI / RESET / IRQ)
;              for AC6502 Homebrew Computer
;
;   ROM Region  :  $FFFA-$FFFF  (6 bytes / $0006)
;   Segment     :  VECTORS
;   Assembler   :  ca65  (cc65 toolchain)
;   Linker cfg  :  BIOS.cfg
;
;   Contents    :  Three .word entries read by the 65C02 at reset/interrupt
;                   time. Targets (NmiVec, ResetVec, IrqVec) are defined in
;                   Kernal.asm.
; =============================================================================

.word   NmiVec           ; NMI vector
.word   ResetVec         ; RESET vector
.word   IrqVec           ; IRQ vector