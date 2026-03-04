; ***          ***
; ***   BIOS   ***
; ***          ***

.setcpu "65C02"

.include "BIOS.inc"

.segment "KERNAL"
.include "Kernal.asm"
.segment "CART"
.include "Cart.asm"
.segment "WOZMON"
.include "Wozmon.asm"
.segment "VECTORS"
.include "Vectors.asm"