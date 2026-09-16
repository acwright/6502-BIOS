; =============================================================================
; KERNAL  —  Hardware Driver Library and Jump Table
;             for AC6502 Homebrew Computer
;
;   ROM Region  :  $A000-$B7FF  (6,144 bytes / $1800)
;   Segment     :  KERNAL
;   Entry point :  Chrout  (jump table, first byte of segment = $A000)
;   Assembler   :  ca65  (cc65 toolchain)
;   Linker cfg  :  BIOS.cfg
;
;   Contents    :  85-slot JMP table ($A000-$A0FF) giving external code and
;                   cartridges stable entry points, followed by the driver
;                   implementations for character I/O, TMS9918 video, SID
;                   sound, CompactFlash storage, RTC, keyboard/joystick,
;                   serial (6551 + XModem), and the Reset/NMI/IRQ handlers.
;
;   Coding style :  Match the rest of the BIOS project.
;                   * Routine / data labels : PascalCase  (e.g. ChroutDispatch,
;                     KernalInit, RtcReadTime).
;                   * Constants / equates    : UPPER_SNAKE_CASE  (e.g. IO_MODE).
;                   * Local labels           : @camelCase or @PascalCase.
;                   * Opcodes are lowercase.
; =============================================================================

; === Kernal Jump Table ($A000-$A0FF) ===
; 85 slots of 3-byte JMP instructions plus 1 padding byte
; Provides stable entry points for external code and cartridges

; --- Character I/O ---
Chrout:         jmp ChroutDispatch      ; $A000 - Output char (dispatched by IO_MODE)
Chrin:          jmp ChrinImpl           ; $A003 - Input char from buffer
WriteBuffer:    jmp WriteBufferImpl     ; $A006 - Write byte to input buffer
ReadBuffer:     jmp ReadBufferImpl      ; $A009 - Read byte from input buffer
BufferSize:     jmp BufferSizeImpl      ; $A00C - Get buffer count
; --- IO Mode ---
SetIOMode:      jmp SetIOModeImpl       ; $A00F - Set IO_MODE
GetIOMode:      jmp GetIOModeImpl       ; $A012 - Get IO_MODE
; --- Video (PICOVDP) ---
InitVideo:      jmp InitVideoImpl       ; $A015 - Text-mode console: registers, character set, palette row 0
VideoClear:     jmp VideoClearImpl      ; $A018 - Clear video screen
VideoPutChar:   jmp VideoPutCharImpl    ; $A01B - Write char at cursor
VideoSetCursor: jmp VideoSetCursorImpl  ; $A01E - Set cursor (X=col, Y=row)
VideoGetCursor: jmp VideoGetCursorImpl  ; $A021 - Get cursor position
VideoScroll:    jmp VideoScrollImpl     ; $A024 - Scroll screen up one line
VideoSetColor:  jmp VideoSetColorImpl   ; $A027 - Set the pen and the border (A = fg<<4 | bg)
VideoChroutRaw: jmp VideoChroutRawImpl  ; $A02A - Output char to video (raw, no control-code handling)
; --- Sound (SID) ---
InitSID:        jmp InitSIDImpl         ; $A02D - Initialize SID
Beep:           jmp BeepImpl            ; $A030 - Play beep tone
SidPlayNote:    jmp SidPlayNoteImpl     ; $A033 - Play note (A=voice, X=freqLo, Y=freqHi)
SidSilence:     jmp SidSilenceImpl      ; $A036 - Silence all voices
SidSetVolume:   jmp SidSetVolumeImpl    ; $A039 - Set SID master volume (A=0-15)
; --- Filesystem ---
FsLoadFile:     jmp FsLoadFileImpl      ; $A03C - Load file from CF
FsSaveFile:     jmp FsSaveFileImpl      ; $A03F - Save file to CF
FsDeleteFile:   jmp FsDeleteFileImpl    ; $A042 - Delete file from CF
; --- Keyboard / GPIO ---
InitKB:         jmp InitKBImpl          ; $A045 - Initialize GPIO/VIA keyboard
ReadJoystick1:  jmp ReadJoystick1Impl   ; $A048 - Read joystick 1
ReadJoystick2:  jmp ReadJoystick2Impl   ; $A04B - Read joystick 2
; --- Serial (6551) ---
InitSC:         jmp InitSCImpl          ; $A04E - Initialize serial 6551
SerialChrout:   jmp SerialChroutImpl    ; $A051 - Direct serial output (bypass IO_MODE)
XModemLoad:     jmp XModemLoadImpl      ; $A054 - Receive binary via XModem
XModemSave:     jmp XModemSaveImpl      ; $A057 - Send binary via XModem
; --- RTC (DS1511Y) ---
RtcReadTime:    jmp RtcReadTimeImpl     ; $A05A - Read RTC time
RtcReadDate:    jmp RtcReadDateImpl     ; $A05D - Read RTC date
RtcWriteTime:   jmp RtcWriteTimeImpl    ; $A060 - Set RTC time
RtcWriteDate:   jmp RtcWriteDateImpl    ; $A063 - Set RTC date
RtcReadNVRAM:   jmp RtcReadNVRAMImpl    ; $A066 - Read NVRAM byte
RtcWriteNVRAM:  jmp RtcWriteNVRAMImpl   ; $A069 - Write NVRAM byte
; --- CompactFlash Storage ---
StReadSector:   jmp StReadSectorImpl    ; $A06C - Read CF sector
StWriteSector:  jmp StWriteSectorImpl   ; $A06F - Write CF sector
StWaitReady:    jmp StWaitReadyImpl     ; $A072 - Wait CF ready
; --- System ---
SysDelay:       jmp SysDelayImpl        ; $A075 - Delay A=cnt_lo, X=cnt_hi centiseconds
KernalInit:     jmp KernalInitImpl      ; $A078 - Initialize all hardware (caller must reset SP; no cli); rts when done
KernalVersion:  jmp KernalVersionImpl   ; $A07B - Get BIOS version (A=major, X=minor)
; --- Disk banking / addressed storage ---
FsLoadFileAddr: jmp FsLoadFileAddrImpl  ; $A07E - Load named file to FS_IO_ADDR
FsSaveFileAddr: jmp FsSaveFileAddrImpl  ; $A081 - Save FS_FILE_SIZE bytes from FS_IO_ADDR to named file
FsFormatDisk:   jmp FsFormatDiskImpl    ; $A084 - Zero the current disk's directory sector
FsSetDisk:      jmp FsSetDiskImpl       ; $A087 - Select current CF disk (A=0-255)
FsGetDisk:      jmp FsGetDiskImpl       ; $A08A - Get current CF disk (A=disk)
FsPrintDisk:    jmp FsPrintDiskImpl     ; $A08D - Print "DISK n" + CRLF via Chrout
; --- General output utilities (console = IO_MODE-routed via Chrout) ---
PrintStr:       jmp PrintStrImpl        ; $A090 - Print NUL-terminated string (A=lo, Y=hi); clobbers A,Y,STR_PTR
PrintCRLF:      jmp PrintCRLFImpl       ; $A093 - Print CR+LF
PrintDecU16:    jmp PrintDecU16Impl     ; $A096 - Print unsigned 16-bit decimal (A=lo, X=hi), no leading zeros
; --- Keyboard encoder control (raw port access) ---
KBDisable:      jmp KBDisableImpl       ; $A099 - Release both encoders and settle; ports free for raw read
KBEnable:       jmp KBEnableImpl        ; $A09C - Re-enable both encoders
; --- NVRAM save slots (DS1511Y) ---
NvStat:         jmp NvStatImpl          ; $A09F - Slot status (X=slot) → A=status, Y=owner ID
NvRead:         jmp NvReadImpl          ; $A0A2 - Copy a valid slot's payload (X=slot, A/Y=dest lo/hi)
NvWrite:        jmp NvWriteImpl         ; $A0A5 - Write a slot (X=slot, A/Y=src lo/hi, NV_ID=owner ID)
NvErase:        jmp NvEraseImpl         ; $A0A8 - Zero all 16 bytes of a slot (X=slot)
NvFind:         jmp NvFindImpl          ; $A0AB - Lowest slot owned by A ($00 = first free) → X
NvFormat:       jmp NvFormatImpl        ; $A0AE - Erase all 16 slots

; --- PICOVDP ---
VdpInfo:        jmp VdpInfoImpl         ; $A0B1 - Card found at boot → A=VDP_FW, X=VDP_CAPS, Y=$AC; carry set if none
VdpWriteReg:    jmp VdpWriteRegImpl     ; $A0B4 - Write register (A=value, X=0-127), keeping VID_MODE and the LxCTRL shadows
VdpSetMode:     jmp VdpSetModeImpl      ; $A0B7 - Write VMODE (A=1-4); carry set if out of range
VdpPoke:        jmp VdpPokeImpl         ; $A0BA - Write VRAM byte A at X/Y = address lo/hi (all 64 KB)
VdpPeek:        jmp VdpPeekImpl         ; $A0BD - Read VRAM byte at X/Y = address lo/hi → A
VdpSetPalette:  jmp VdpSetPaletteImpl   ; $A0C0 - Palette entry X = 0-255 ← A = $0R, Y = $GB (at $FC00 + 2X)
WaitVBlank:     jmp WaitVBlankImpl      ; $A0C3 - Return at the start of the next vertical blank (STAT0 untouched)
VdpLoadFile:    jmp VdpLoadFileImpl     ; $A0C6 - Load named file (STR_PTR) into VRAM at FS_IO_ADDR, exactly FS_FILE_SIZE bytes
VdpLoadFont:    jmp VdpLoadFontImpl     ; $A0C9 - Copy built-in font A into L0PAT and wait for it (carry set until Phase 8)
VdpSprite:      jmp VdpSpriteImpl       ; $A0CC - Sprite X = 0-63 ← VDP_P0-P3 = Y, X lo, pattern, attributes (table at $2000)
VdpSetScroll:   jmp VdpSetScrollImpl    ; $A0CF - Layer X = 0-1 scroll: A = x lo, Y = y, VDP_P0 = x bit 8
VdpLayer:       jmp VdpLayerImpl        ; $A0D2 - Layer X = 0-1 off (A = 0) or on
VdpStatus:      jmp VdpStatusImpl       ; $A0D5 - Read status register X = 0-15 on port A → A

; Reserved entries ($A0D8-$A0FE)
.repeat 13
                jmp UnimplementedStub
.endrepeat
.byte $00                             ; Pad to 256 bytes ($A0FF)

; === Kernal Implementation ===

; Stub for unimplemented jump table entries
UnimplementedStub:
  rts

; Chrout dispatcher — routes output based on IO_MODE
; Input: A = character to output
; Modifies: Flags
ChroutDispatch:
  pha
  lda IO_MODE
  and #$01                      ; Bit 0: 0=video, 1=serial
  bne @Serial
  pla
  jmp VideoChroutImpl
@Serial:
  pla
  jmp SerialChroutImpl

; Set IO_MODE
; Input: A = mode (bit 0: 0=video, 1=serial)
SetIOModeImpl:
  sta IO_MODE
  rts

; Get IO_MODE
; Output: A = current IO_MODE
GetIOModeImpl:
  lda IO_MODE
  rts

; === PICOVDP Video Driver ===
;
; The console is Text mode (VMODE $1): 40x24 cells of 6x8, a name table of 960
; bytes at VRAM $0000 and a per-cell attribute table beside it at $0400, one
; fg<<4 | bg byte for each cell.  A cell's name byte is at VID_CURSOR_ADDR and
; its attribute at VID_CURSOR_ADDR | $0400.  Everything here goes through port
; A and leaves VBANK = 0 and VINC = +1; nothing in the ROM touches port B, which
; belongs to interrupt handlers (SPEC §4).

; VdpSetReg — write a VDP register through port A (no card check)
; Input: A = value, X = register (0-127)
; Modifies: Flags, A
VdpSetReg:
  sta VC_REG                    ; Value
  txa
  ora #$80                      ; Register number with the write flag
  sta VC_REG
  rts

; === PICOVDP entries ($A0B1-$A0D5) ===
;
; Each one returns carry set, having written nothing, when no card is fitted
; (HW_VID clear) or an argument is out of range, and carry clear otherwise.
; Port A only, and VBANK = 0, VINC = +1 on the way out, like the console.

; VdpInfo — What the probe found
; Output: A = VDP_FW (STAT5), X = VDP_CAPS (STAT6), Y = VDP_ID ($AC); with no
;         card A = X = Y = 0 and carry set
; Modifies: Flags, A, X, Y
VdpInfoImpl:
  lda VDP_FW                    ; Both $00 when the probe found no card
  ldx VDP_CAPS
  ldy #$00
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl VdpNoCard
  ldy #VDP_ID
  clc
  rts

; VdpWriteReg — Write a VDP register, keeping the Kernal's records of it
; Input: A = value, X = register (0-127)
; A VMODE write sets VID_MODE: the mode, with b7 (disturbed) set when it takes
; the card to Text or the legacy submode from anything else, so that only
; InitVideo can say the Text console is intact.  L0CTRL and L1CTRL, which read
; back as nothing, are kept in VDP_L0CTRL_SHADOW and VDP_L1CTRL_SHADOW.
; Output: carry set, and nothing written, if no card or X > 127
; Preserves: X, Y
; Modifies: Flags, A
VdpWriteRegImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl VdpNoCard
  cpx #$80
  bcs VdpNoCard
  cpx #VDP_VMODE
  bne @VdpWriteRegL0
  pha
  and #$0F                      ; The mode, b3:0
  cmp #$02
  bcs @VdpWriteRegMode          ; Compact, Graphics, Full: the mode itself
  cmp VID_MODE
  beq @VdpWriteRegMode          ; Text over the Text console, or legacy over legacy
  ora #$80                      ; Anything else back to Text or legacy: disturbed
@VdpWriteRegMode:
  sta VID_MODE
  pla
@VdpWriteRegL0:
  cpx #VDP_L0CTRL
  bne @VdpWriteRegL1
  sta VDP_L0CTRL_SHADOW
@VdpWriteRegL1:
  cpx #VDP_L1CTRL
  bne @VdpWriteRegSet
  sta VDP_L1CTRL_SHADOW
@VdpWriteRegSet:
  jsr VdpSetReg
  clc
  rts

; The shared exit for no card or a bad argument
VdpNoCard:
  sec
  rts

; VdpSetMode — Set VMODE: 1 Text, 2 Compact, 3 Graphics, 4 Full
; Only the register (and VID_MODE, as VdpWriteReg keeps it): the tables, layers
; and sprites are the caller's to lay out.  The Text console proper is
; InitVideo.
; Input: A = mode (1-4)
; Output: carry set, and nothing written, if no card or A is out of range
; Modifies: Flags, A, X
VdpSetModeImpl:
  cmp #$01
  bcc VdpNoCard
  cmp #$05
  bcs VdpNoCard
  ldx #VDP_VMODE
  bra VdpWriteRegImpl

; VdpPoke — Write one byte anywhere in VRAM
; Input: A = value, X = address low, Y = address high ($0000-$FFFF)
; Output: carry set, and nothing written, if no card
; Modifies: Flags, A, X
VdpPokeImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl VdpNoCard
  pha
  lda #$40                      ; Write
  jsr VdpAddress
  pla
  sta VC_DATA
  clc
  rts

; VdpPeek — Read one byte anywhere in VRAM
; Input: X = address low, Y = address high ($0000-$FFFF)
; Output: A = the byte; carry set, and nothing read, if no card
; Modifies: Flags, A, X
VdpPeekImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl VdpNoCard
  lda #$00                      ; Read: the address command prefetches it
  jsr VdpAddress
  lda VC_DATA
  clc
  rts

; VdpSetPalette — Set one palette entry in VRAM, at $FC00 + 2 * entry
; The card takes the write into its palette at once (SPEC §11).  $FC00 is where
; InitVideo puts PALBASE; a program that moves PALBASE writes its own.
; Input: X = entry (0-255), A = $0R, Y = $GB
; Output: carry set, and nothing written, if no card
; Modifies: Flags, A, X, Y
VdpSetPaletteImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl VdpNoCard
  phy                           ; $GB
  pha                           ; $0R
  txa
  asl a                         ; 2 * entry: the low byte, and the carry
  tax                           ;   into the high one
  lda #>$FC00
  adc #$00
  tay
  lda #$40                      ; Write
  jsr VdpAddress
  pla
  sta VC_DATA
  pla
  sta VC_DATA
  clc
  rts

; WaitVBlank — Return at the start of the next vertical blank
; Polls STAT3 b0 on port A: waits while the display is in blanking, then until
; it is, and puts STATSEL_A back to 0.  Not STAT0's F: reading STAT0 clears
; F, OVF and COL and the STAT1 latches a program or its interrupt handler may
; be relying on, and this leaves them all as they were.
; No card: waits 2 cs through SysDelay instead, so a loop paced by it still
; runs at about the speed it would, and returns carry set.
; Modifies: Flags, A, X, Y
WaitVBlankImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bmi @WaitVBlankCard
  lda #2
  ldx #0
  jsr SysDelay
  sec
  rts
@WaitVBlankCard:
  lda #$03
  jsr VdpSelectStat             ; STAT3
@WaitVBlankOut:
  lda VC_STATUS
  lsr a                         ; b0, vertical blanking, into carry
  bcs @WaitVBlankOut            ; Still in the last one
@WaitVBlankIn:
  lda VC_STATUS
  lsr a
  bcc @WaitVBlankIn             ; Not yet in the next
  lda #$00
  jsr VdpSelectStat             ; STATSEL_A back to STAT0, without reading it
  clc
  rts

; VdpLoadFont — Load one of the card's built-in fonts into the pattern table
; The published slot for SPEC draft 0.5's FONT register.  Until the Kernal
; loads the font from the card (VDP-PLAN §5 Phase 8), InitVideo still uploads
; the character set from ROM, and this returns carry set having done nothing.
; Input: A = font ID
; Output: carry set
; Modifies: Flags
VdpLoadFontImpl:
  sec
  rts

; VdpSprite — Write one sprite's four attribute bytes
; The attribute table is taken to be at VRAM $2000 (SPRATTR = $40), where
; BASIC's SCREEN 1-3 puts it; a program that moves SPRATTR writes its sprites
; with VdpPoke.  Sets VID_MODE b7 (disturbed).
; Input: X = sprite (0-63), VDP_P0 = Y, VDP_P1 = X bits 7:0, VDP_P2 = pattern,
;        VDP_P3 = attributes (b7 = X bit 8, b6 priority, b5:4 flips, b3:0
;        sub-palette; SPEC §10)
; Output: carry set, and nothing written, if no card or X > 63
; Preserves: X
; Modifies: Flags, A, Y
VdpSpriteImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl @VdpSpriteNone
  cpx #64
  bcs @VdpSpriteNone
  phx
  txa
  asl a                         ; 4 bytes a sprite: at most 252
  asl a
  tax
  ldy #>$2000
  lda #$40                      ; Write
  jsr VdpAddress
  ldx #$00
@VdpSpriteByte:
  lda VDP_P0,x
  sta VC_DATA
  inx
  cpx #4
  bne @VdpSpriteByte
  plx
  bra VdpDisturbed
@VdpSpriteNone:
  sec
  rts

; VdpSetScroll — Scroll a layer
; Writes LxSCRX, LxSCRY, and LxCTRL with b6 = X bit 8 and its other bits from
; the shadow.  Sets VID_MODE b7 (disturbed).
; Input: X = layer (0-1), A = x bits 7:0, Y = y, VDP_P0 = x bit 8 (0 or not)
; Output: carry set, and nothing written, if no card or X > 1
; Modifies: Flags, A, X
VdpSetScrollImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl VdpLayerNone
  cpx #2
  bcs VdpLayerNone
  phy                           ; y
  pha                           ; x
  lda VDP_L0CTRL_SHADOW,x
  and #<~$40
  ldy VDP_P0
  beq @VdpSetScrollCtrl
  ora #$40                      ; X bit 8
@VdpSetScrollCtrl:
  jsr VdpWriteLayerCtrl         ; X = LxCTRL
  dex                           ; LxSCRX
  dex
  pla
  jsr VdpWriteRegImpl
  inx                           ; LxSCRY
  pla
  jsr VdpWriteRegImpl
  bra VdpDisturbed

; VdpLayer — Show or hide a layer
; Sets or clears LxCTRL b4, keeping its other bits from the shadow.  Sets
; VID_MODE b7 (disturbed).
; Input: X = layer (0-1), A = 0 to hide, anything else to show
; Output: carry set, and nothing written, if no card or X > 1
; Modifies: Flags, A, X
VdpLayerImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl VdpLayerNone
  cpx #2
  bcs VdpLayerNone
  tay                           ; Sets Z from A
  lda VDP_L0CTRL_SHADOW,x
  and #<~$10
  cpy #$00
  beq @VdpLayerOff
  ora #$10                      ; Enable
@VdpLayerOff:
  jsr VdpWriteLayerCtrl
VdpDisturbed:                   ; VID_MODE b7: sprites, scroll or layers moved
  lda VID_MODE
  ora #$80
  sta VID_MODE
  clc
  rts
VdpLayerNone:
  sec
  rts

; VdpWriteLayerCtrl — LxCTRL = A for layer X (0-1) through VdpWriteReg, so the
; shadow follows (no checks)
; Output: X = the register, $15 or $1D
; Modifies: Flags, A, X
VdpWriteLayerCtrl:
  pha
  txa
  asl a                         ; 0 or 8, carry clear
  asl a
  asl a
  adc #VDP_L0CTRL
  tax
  pla
  jmp VdpWriteRegImpl

; VdpStatus — Read a status register through port A
; Selects STATn with STATSEL_A, reads it, and puts STATSEL_A back to 0 without
; reading STAT0.  Reading STAT0 itself clears its flags, and STAT1 its
; latches, as SPEC §6 says.
; Input: X = status register (0-15)
; Output: A = its value; carry set, and nothing read, if no card or X > 15
; Preserves: X, Y
; Modifies: Flags, A
VdpStatusImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl VdpLayerNone
  cpx #16
  bcs VdpLayerNone
  txa
  jsr VdpReadStat
  clc
  rts

; VdpAddress — Point port A at any VRAM address (no card check)
; VBANK = the address's bits 15:14 for the address command, then back to 0:
; the card samples it there, and the pointer carries across banks by itself.
; Input: A = $40 to write or $00 to read, X = address low, Y = address high
; Modifies: Flags, A, X
VdpAddress:
  pha                           ; Write or read
  tya
  asl a                         ; Bits 15:14 down to 1:0
  rol a
  rol a
  and #$03
  phx
  ldx #VDP_VBANK
  jsr VdpSetReg
  pla
  sta VC_REG                    ; Address low
  tya
  and #$3F
  tsx
  ora $0101,x                   ; With the write bit
  sta VC_REG
  pla
  lda #$00
  ldx #VDP_VBANK
  jmp VdpSetReg

; VdpReadStat — A = STATn for n in A, leaving STATSEL_A = 0 (no card check)
; Modifies: Flags, A
VdpReadStat:
  jsr VdpSelectStat
  lda VC_STATUS
  pha
  lda #$00                      ; STATSEL_A back to STAT0, without reading it
  jsr VdpSelectStat
  pla
  rts

; VdpSelectStat — STATSEL_A = A (no card check)
; Modifies: Flags, A
VdpSelectStat:
  sta VC_REG
  lda #($80 | VDP_STATSEL_A)
  sta VC_REG
  rts

; VideoClear — Fill the screen with spaces in the current pen, cursor home
; Fills the 960-byte name table at VRAM $0000 with $20 and the 960 attributes at
; $0400 with VID_PEN, so COLOR fg,bg : CLS gives a screen of that colour, and
; takes the scroll origin back to row 0.
; Skips silently if no video card is fitted
; Modifies: Flags, A, X, Y
VideoClearImpl:
  bit HW_PRESENT                ; Video is bit 7, so BIT tests it in N without
  bmi @VideoClearFitted         ;   disturbing A — these routines take their
  rts                           ;   argument there.  See the note above
                                ;   HW_PRESENT's bit definitions in BIOS.inc.
@VideoClearFitted:
  lda VID_MODE                  ; First use since KernalInit: bring the console
  bne VideoClearNow             ;   up, and then this is the clear it needs
  jsr InitVideoImpl
VideoClearNow:
  lda #$40                      ; Name table, $0000, write
  ldx #$20
  jsr @Fill
  lda #$44                      ; Attribute table, $0400, write
  ldx VID_PEN
  jsr @Fill
  stz VID_TOP                   ; Unscrolled
  lda #$00
  ldx #VDP_L0SCRY
  jsr VdpSetReg
  ; Reset cursor to (0,0)
  stz VID_CURSOR_X
  stz VID_CURSOR_Y
  stz VID_CURSOR_ADDR
  stz VID_CURSOR_ADDR + 1
  rts
@Fill:                          ; A = address command high byte, X = fill value
  stz VC_REG                    ; Low byte of the address
  sta VC_REG
  txa
  ldy #$00
  ldx #$03                      ; 3 full pages (768 bytes)
@VideoClearPage:
  sta VC_DATA
  iny
  bne @VideoClearPage
  dex
  bne @VideoClearPage
  ldy #192                      ; Remaining 192 bytes (960 - 768)
@VideoClearRem:
  sta VC_DATA
  dey
  bne @VideoClearRem
  rts

; VideoSetCursor — Set cursor position
; Input: X = column (0-39), Y = row (0-23), on the screen as shown
; VID_CURSOR_ADDR = ((Y + VID_TOP) mod 24) * 40 + X, the cell's place in the
; name table once the scroll origin is folded in
; Skips silently if no video card is fitted
; Modifies: Flags, A
VideoSetCursorImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl @VideoSetCursorNone
  jsr VideoConsoleReady
  stx VID_CURSOR_X
  sty VID_CURSOR_Y
  tya                           ; Screen row to name-table row:
  clc                           ;   (row + VID_TOP) mod 24
  adc VID_TOP
  cmp #24
  bcc @VideoSetCursorRow
  sbc #24                       ; Carry is set
@VideoSetCursorRow:
  jsr VideoRowAddr              ; VID_CURSOR_ADDR = row * 40, carry clear
  txa                           ; Add the column
  adc VID_CURSOR_ADDR
  sta VID_CURSOR_ADDR
  bcc @VideoSetCursorNone
  inc VID_CURSOR_ADDR + 1
@VideoSetCursorNone:
  rts

; VideoConsoleReady — Bring the Text console up on its first use
; KernalInit leaves the card in the legacy submode it resets to (VID_MODE = $00),
; so that a cartridge programming M1/M2/M3 itself sees what it saw on 1.x.  The
; console entries call this first: if the card is fitted and VID_MODE is still
; $00, InitVideo + VideoClear.  Only $00 triggers it, so a program that switched
; to another mode and then prints is not reset behind its back.
; Preserves: A, X, Y
; Modifies: Flags
VideoConsoleReady:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl @VideoConsoleNone
  pha
  lda VID_MODE
  bne @VideoConsoleUp
  phx
  phy
  jsr InitVideoImpl             ; Sets VID_MODE = $01, so no recursion
  jsr VideoClearNow
  ply
  plx
@VideoConsoleUp:
  pla
@VideoConsoleNone:
  rts

; VideoRowAddr — VID_CURSOR_ADDR = A * 40, for a name-table row 0-23
; Output: carry clear
; Modifies: Flags, A
VideoRowAddr:
  stz VID_CURSOR_ADDR + 1
  asl a                         ; x8 fits in a byte (23 * 8 = 184)
  asl a
  asl a
  sta VID_CURSOR_ADDR
  asl a                         ; x32 does not: carry into the high byte
  rol VID_CURSOR_ADDR + 1
  asl a
  rol VID_CURSOR_ADDR + 1       ; Leaves carry clear (the high byte's b7 was 0)
  adc VID_CURSOR_ADDR           ; x32 + x8
  sta VID_CURSOR_ADDR
  bcc @VideoRowAddrDone
  inc VID_CURSOR_ADDR + 1
  clc
@VideoRowAddrDone:
  rts

; VideoGetCursor — Get cursor position
; Output: X = column (0-39), Y = row (0-23)
; Modifies: Flags
VideoGetCursorImpl:
  jsr VideoConsoleReady
  ldx VID_CURSOR_X
  ldy VID_CURSOR_Y
  rts

; VideoPutChar — Write a character at VID_CURSOR_ADDR, coloured with VID_PEN
; Input: A = character to write
; Modifies: Flags
VideoPutCharImpl:
  pha
  lda VID_CURSOR_ADDR           ; Name byte
  sta VC_REG
  lda VID_CURSOR_ADDR + 1
  ora #$40                      ; Write mode
  sta VC_REG
  pla
  sta VC_DATA
  pha
  lda VID_CURSOR_ADDR           ; Attribute byte, $0400 further on
  sta VC_REG
  lda VID_CURSOR_ADDR + 1
  ora #$44                      ; Write mode, + $0400
  sta VC_REG
  lda VID_PEN
  sta VC_DATA
  pla
  rts

; VideoScroll — Scroll the screen up one line, in hardware
; Moves the display origin down a row (VID_TOP, and L0SCRY = VID_TOP * 8) and
; blanks the row that was at the top, which is now the bottom line, in the
; current pen.  The name table does not move.  The cursor keeps its screen
; position, so its VRAM address is worked out again.
; Skips silently if no video card is fitted
; Modifies: Flags, A, X, Y
VideoScrollImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl @VideoScrollNone
  lda VID_TOP
  pha                           ; The row leaving the top
  inc a
  cmp #24
  bcc @VideoScrollTop
  lda #$00
@VideoScrollTop:
  sta VID_TOP
  asl a                         ; x8 pixels (at most 184)
  asl a
  asl a
  ldx #VDP_L0SCRY
  jsr VdpSetReg
  pla
  jsr VideoRowAddr              ; VID_CURSOR_ADDR = that row * 40
  lda #$40                      ; Its names, write mode
  ldx #$20
  jsr @VideoScrollRow
  lda #$44                      ; Its attributes, write mode, + $0400
  ldx VID_PEN
  jsr @VideoScrollRow
  ldx VID_CURSOR_X              ; Put the cursor back on its screen cell
  ldy VID_CURSOR_Y
  jmp VideoSetCursorImpl
@VideoScrollNone:
  rts
@VideoScrollRow:                ; A = address high bits, X = fill value
  ora VID_CURSOR_ADDR + 1
  ldy VID_CURSOR_ADDR
  sty VC_REG
  sta VC_REG
  txa
  ldy #40
@VideoScrollFill:
  sta VC_DATA
  dey
  bne @VideoScrollFill
  rts

; VideoChrout — Output character to video display
; Handles control characters: CR ($0D), LF ($0A), BS ($08), BEL ($07)
; Printable ASCII ($20-$7E) written to VRAM; all other codes silently discarded
; Auto-wraps at column 40, auto-scrolls at row 24
; Input: A = character to output
; Preserves: A, X, Y (callers like ChrinImpl, BasPrintStr and Wozmon depend on this)
; Modifies: Flags
VideoChroutImpl:
  jsr VideoConsoleReady
  pha
  phx
  phy
  ; Fast path: printable ASCII ($20-$7E) — most common case
  cmp #$20
  bcc @Control                  ; < $20 → check control codes
  cmp #$7F
  bcc @PrintChar                ; $20-$7E → printable character
  ; >= $7F (DEL and above) — discard
  ; User programs wanting raw glyph output should use VideoChroutRaw.
  bra @VideoChroutDone
@Control:
  cmp #$0D                      ; Carriage Return?
  beq @VideoCR
  cmp #$0A                      ; Line Feed?
  beq @VideoLF
  cmp #$08                      ; Backspace?
  beq @VideoBS
  cmp #$07                      ; Bell?
  beq @VideoBEL
  ; Unrecognized control code — discard
  bra @VideoChroutDone
@PrintChar:
  ; Regular printable character — write at cursor and advance
  jsr VideoPutChar              ; Write char to VRAM at cursor
  ; Advance cursor
  inc VID_CURSOR_X
  ; Increment VRAM address
  inc VID_CURSOR_ADDR
  bne @CheckWrap
  inc VID_CURSOR_ADDR + 1
@CheckWrap:
  lda VID_CURSOR_X
  cmp #40                       ; Past last column?
  bcc @VideoChroutDone          ; No, done
  ; Auto-wrap: CR + LF
  stz VID_CURSOR_X
  inc VID_CURSOR_Y
  lda VID_CURSOR_Y
  cmp #24                       ; Past last row?
  bcc @WrapRecalc
  ; Need to scroll
  jsr VideoScroll
  lda #23
  sta VID_CURSOR_Y
@WrapRecalc:
  ldx VID_CURSOR_X
  ldy VID_CURSOR_Y
  jsr VideoSetCursor            ; Recalculate VRAM address
@VideoChroutDone:
  ply
  plx
  pla
  rts

@VideoCR:
  stz VID_CURSOR_X              ; Column = 0
  ldx #$00
  ldy VID_CURSOR_Y
  jsr VideoSetCursor            ; Recalculate VRAM address
  bra @VideoChroutDone

@VideoLF:
  inc VID_CURSOR_Y
  lda VID_CURSOR_Y
  cmp #24                       ; Past last row?
  bcc @LFRecalc
  jsr VideoScroll
  lda #23
  sta VID_CURSOR_Y
@LFRecalc:
  ldx VID_CURSOR_X
  ldy VID_CURSOR_Y
  jsr VideoSetCursor
  bra @VideoChroutDone

@VideoBS:
  lda VID_CURSOR_X
  beq @VideoChroutDone          ; Already at column 0, ignore
  dec VID_CURSOR_X
  ldx VID_CURSOR_X
  ldy VID_CURSOR_Y
  jsr VideoSetCursor            ; Recalculate VRAM address
  lda #$20                      ; Write space to erase character
  jsr VideoPutChar
  bra @VideoChroutDone

@VideoBEL:
  jsr Beep
  bra @VideoChroutDone

; VideoChroutRaw — Output character to video (raw, no control-code handling)
; Always writes the character glyph at the cursor position and advances.
; Input: A = character code (0-255)
; Preserves: A, X, Y
; Modifies: Flags
VideoChroutRawImpl:
  jsr VideoConsoleReady
  pha
  phx
  phy
  jsr VideoPutChar              ; Write char to VRAM at cursor
  inc VID_CURSOR_X
  inc VID_CURSOR_ADDR
  bne @RawCheckWrap
  inc VID_CURSOR_ADDR + 1
@RawCheckWrap:
  lda VID_CURSOR_X
  cmp #40                       ; Past last column?
  bcc @RawDone
  stz VID_CURSOR_X
  inc VID_CURSOR_Y
  lda VID_CURSOR_Y
  cmp #24                       ; Past last row?
  bcc @RawRecalc
  jsr VideoScroll
  lda #23
  sta VID_CURSOR_Y
@RawRecalc:
  ldx VID_CURSOR_X
  ldy VID_CURSOR_Y
  jsr VideoSetCursor
@RawDone:
  ply
  plx
  pla
  rts

; PrintStr — Print a NUL-terminated string to the console (routed by IO_MODE
; through Chrout, so it works for video OR serial).  General-purpose; used by
; BASIC (via the BasPrintStr alias) and available to cartridges.
; Input : A = string address low, Y = string address high
; Output: A, Y clobbered; X preserved; clobbers STR_PTR (Chrout preserves it)
PrintStrImpl:
  sta STR_PTR
  sty STR_PTR + 1
  ldy #$00
@PrintStrLoop:
  lda (STR_PTR),y
  beq @PrintStrDone             ; NUL terminator
  jsr Chrout
  iny
  bne @PrintStrLoop             ; Max 256 chars per call
@PrintStrDone:
  rts

; PrintCRLF — Emit CR ($0D) then LF ($0A) via Chrout.
PrintCRLFImpl:
  lda #$0D
  jsr Chrout
  lda #$0A
  jmp Chrout

; KernalInit — Initialize RAM variables, probe & init all hardware
; Sets HW_PRESENT, IO_MODE, IRQ/BRK/NMI pointers, BOOT_VECTOR=0
; Does NOT enable interrupts (caller must cli)
; Does NOT reset the stack pointer (caller should do this before JSR)
; Does NOT print anything or start BASIC
; Modifies: All registers, flags
KernalInitImpl:
  cld                           ; Clear decimal mode
  sei                           ; Disable interrupts

  lda #<Irq                     ; Initialize the IRQ pointer
  sta IRQ_PTR
  lda #>Irq
  sta IRQ_PTR + 1

  lda #<Break                   ; Initialize the BRK pointer
  sta BRK_PTR
  lda #>Break
  sta BRK_PTR + 1

  lda #<Nmi                     ; Initialize the NMI pointer
  sta NMI_PTR
  lda #>Nmi
  sta NMI_PTR + 1

  stz HW_PRESENT                ; Clear all hardware flags
  stz BOOT_VECTOR               ; Clear boot redirect vector
  stz BOOT_VECTOR + 1
  stz PRG_IMAGE_END             ; No externally-loaded program image yet.  This
  stz PRG_IMAGE_END + 1         ;   runs before any loader can, so a non-zero
                                ;   value always means a loader put it there
  stz CF_DISK                   ; Reset current CF disk bank to 0
  lda #$1F                      ; Black on white.  Only KernalInit resets the
  sta VID_PEN                   ;   pen: NEW, RUN, CLR and errors keep it

  jsr InitBuffer                ; Initialize the input buffer (RAM-only, no hardware)

  jsr ProbeRAM                  ; Sets HW_RAM_L / HW_RAM_H if present (no init needed)

  jsr ProbeRTC                  ; Sets HW_RTC if present (no init needed)

  jsr StInit                    ; CF: timeout will handle absent card in Phase 3, sets HW_CF on success

  jsr ProbeSerial               ; Sets HW_SC if present
  lda HW_PRESENT
  and #HW_SC
  beq @SkipSerial
  jsr InitSCImpl
@SkipSerial:

  jsr ProbeGPIO                 ; Sets HW_GPIO if present
  lda HW_PRESENT
  and #HW_GPIO
  beq @SkipGPIO
  jsr InitKBImpl
@SkipGPIO:

  jsr ProbeSID                  ; Sets HW_SID if present
  lda HW_PRESENT
  and #HW_SID
  beq @SkipSID
  jsr InitSIDImpl
@SkipSID:

  stz VID_MODE                  ; No console set up since KernalInit
  stz VID_TOP
  jsr ProbeVideo                ; Sets HW_VID if present
  bit HW_PRESENT
  bpl @SkipVideo
  ; The card as it is after its own reset, so that a warm KernalInit matches a
  ; power-on: the legacy submode, unscrolled, port A reading STAT0 (the probe
  ; restored that).  No InitVideo — the console comes up on first use
  ; (VideoConsoleReady), and a cartridge that drives the card itself finds it
  ; where a 1.x ROM left a TMS9918.
  ldx #VDP_VMODE
  jsr @ZeroReg
  ldx #VDP_L0SCRX
  jsr @ZeroReg
  ldx #VDP_L0SCRY
  jsr @ZeroReg
  lda #$3C                      ; LxCTRL as the card resets them (SPEC §5), for
  sta VDP_L0CTRL_SHADOW         ;   VdpSetScroll and VdpLayer before anything
  lda #$0C                      ;   has written them
  sta VDP_L1CTRL_SHADOW
@SkipVideo:

  ; Console auto-detection — determine IO_MODE from available hardware
  lda HW_PRESENT
  and #HW_VID
  bne @ConsoleVideo             ; Video present — use it
  lda HW_PRESENT
  and #HW_SC
  bne @ConsoleSerial            ; Serial present — use it
  ; Neither video nor serial — IO_MODE left as-is (no console)
  bra @ConsoleDone

@ConsoleVideo:
  lda #$00                      ; IO_MODE = video
  sta IO_MODE
  stz VID_CURSOR_X
  stz VID_CURSOR_Y
  stz VID_CURSOR_ADDR
  stz VID_CURSOR_ADDR + 1
  bra @ConsoleDone

@ConsoleSerial:
  lda #$01                      ; IO_MODE = serial
  sta IO_MODE

@ConsoleDone:
  rts
@ZeroReg:                       ; X = register
  lda #$00
  jmp VdpSetReg

; KernalVersion — Return BIOS version in registers
; Output: A = major version, X = minor version
; Modifies: A, X
KernalVersionImpl:
  lda #BIOS_VERSION_MAJOR
  ldx #BIOS_VERSION_MINOR
  rts

; ProgramEnd — Determine where the program image at PROGRAM_START ends.
; A program image is a tokenized BASIC line chain, optionally followed by machine
; code (a ".prg").  Only a byte count can find the end of the machine code; a
; chain walk stops at the $0000 end marker.  So prefer a count recorded by a
; loader running outside BASIC, and fall back to the walk when there is none.
; Input: none (reads PRG_IMAGE_END, set by a loader that places a .prg at $0800)
; Output: A = end lo, Y = end hi — the address BASIC should use for VARTAB
; Modifies: Flags, A, X, Y, PE_PTR, PE_NEXT, PRG_IMAGE_END (consumed)
; Note: writes the $00 $00 end marker at PROGRAM_START in the empty case.
; Not in the jump table — BASIC calls this label directly, as it does ReqHw.
ProgramEnd:
  ; --- 1. A loader recorded a byte count: trust it if it is in range ---
  lda PRG_IMAGE_END
  ldx PRG_IMAGE_END + 1
  stz PRG_IMAGE_END             ; Consume it either way, so a stale value cannot
  stz PRG_IMAGE_END + 1         ;   be acted on twice
  cpx #>PROGRAM_START           ; Must be >= PROGRAM_START + 2 (0 fails here too)
  bcc @PeWalk
  bne @PeHiOk
  cmp #<(PROGRAM_START + 2)
  bcc @PeWalk
@PeHiOk:
  cpx #>MEMORY_TOP              ; ...and must not run past the top of RAM
  bcc @PeUse
  bne @PeWalk
  cmp #<MEMORY_TOP
  bne @PeWalk
@PeUse:
  phx                           ; Y = hi; A still holds lo
  ply
  rts

  ; --- 2. No count: walk the line chain to the $0000 end marker ---
@PeWalk:
  lda PROGRAM_START + 1         ; High byte of the first next-pointer: a real
  cmp #>PROGRAM_START           ;   program's lines all live in [$0800, $8000)
  bcc @PeEmpty
  cmp #>MEMORY_TOP
  bcs @PeEmpty
  lda #<PROGRAM_START
  sta PE_PTR
  lda #>PROGRAM_START
  sta PE_PTR + 1
@PeWalkLoop:
  ldy #1
  lda (PE_PTR),y                ; Next-pointer high byte
  beq @PeWalkDone               ; 0 → end marker reached
  cmp #>MEMORY_TOP              ; Out of range → not a real program
  bcs @PeEmpty
  sta PE_NEXT + 1
  dey
  lda (PE_PTR),y                ; Next-pointer low byte
  sta PE_NEXT
  ; Lines are stored in strictly ascending address order.  If the next-pointer
  ; does not advance upward we are walking random power-up RAM, which would
  ; otherwise loop forever — bail out and install an empty program.
  lda PE_PTR
  cmp PE_NEXT
  lda PE_PTR + 1
  sbc PE_NEXT + 1
  bcs @PeEmpty                  ; current >= candidate → invalid chain
  lda PE_NEXT                   ; Advance to the next line
  sta PE_PTR
  lda PE_NEXT + 1
  sta PE_PTR + 1
  bra @PeWalkLoop
@PeWalkDone:
  clc                           ; PE_PTR is on the end marker; end = PE_PTR + 2
  lda PE_PTR
  adc #2
  tax
  lda PE_PTR + 1
  adc #0
  tay
  txa
  rts

  ; --- 3. Nothing usable at $0800: install an empty program ---
@PeEmpty:
  stz PROGRAM_START             ; Write the [00][00] end marker
  stz PROGRAM_START + 1
  lda #<(PROGRAM_START + 2)
  ldy #>(PROGRAM_START + 2)
  rts

; Reset — Full system startup: init hardware, beep, check boot vector, start BASIC
Reset:
  ldx #$ff
  txs                           ; Reset the stack pointer
  jsr KernalInitImpl            ; Initialize all hardware (leaves interrupts disabled)

  jsr Beep                      ; Play the startup beep (guarded — skips if no SID)

  ; Check boot redirect vector — cartridges set this before jumping to Reset
  lda BOOT_VECTOR
  ora BOOT_VECTOR + 1
  beq @NormalBoot               ; Zero — continue normal boot
  jmp (BOOT_VECTOR)             ; Non-zero — jump to cartridge/external program

@NormalBoot:
  ; Verify console is available for interactive boot
  lda HW_PRESENT
  and #(HW_VID | HW_SC)
  bne @HasConsole
  ; Neither video nor serial — halt (no console for interactive boot)
@Halt:
  bra @Halt

@HasConsole:
  stz BAS_WARM                  ; A reset is a cold BASIC start: the header
                                ;   prints and the variables are cleared, while
                                ;   the program at $0800 is kept (ProgramEnd
                                ;   walks its line chain)
  cli                           ; Enable interrupts before anything is printed:
                                ;   reading the ACIA's status register clears a
                                ;   pending receive interrupt (6551 datasheet),
                                ;   and the transmit loop reads it on every
                                ;   character — so a key pressed while the
                                ;   header prints would be sitting in the
                                ;   receive register with nothing left to tell
                                ;   the handler about it.  With interrupts on,
                                ;   it is in the input buffer when BASIC asks.
  jmp BasEntry

; Initialize the Keyboard via VIA (IO 6)
; Configures Port B (matrix) and Port A (PS/2) as inputs
; CB2 low (enable matrix encoder), CA2 low (enable PS/2 encoder)
; CB1 and CA1 falling-edge IRQs enabled
; Modifies: Flags, A
InitKBImpl:
  lda #$00                      ; Port B all inputs (matrix keyboard data bus)
  sta GPIO_DDRB
  lda #$00                      ; Port A all inputs (PS/2 keyboard data bus)
  sta GPIO_DDRA
  ; PCR: CB2 low + CB1 neg + CA2 low + CA1 neg
  lda #(GPIO_PCR_CB2_LO | GPIO_PCR_CB1_NEG | GPIO_PCR_CA2_LO | GPIO_PCR_CA1_NEG)
  sta GPIO_PCR
  ; Enable both CB1 and CA1 interrupts
  lda #(GPIO_IER_SET | GPIO_INT_CB1 | GPIO_INT_CA1)
  sta GPIO_IER
  rts
  
; Initialize the Serial Card (6551)
; Modifies: Flags, A
InitSCImpl:
  lda     #$1F                  ; 8-N-1, 19200 baud
  sta     SC_CTRL
  lda     #$09                  ; No parity, no echo, RTSB low, TX interrupts disabled, RX interrupts enabled
  sta     SC_CMD
  rts

; Initialze the Sound Card (6581)
; Modifies: Flags, A, X
InitSIDImpl:
  lda #$00
  ldx #$1D                      ; Clear all 29 SID registers
@InitSIDLoop:
  sta SID_V1_FREQ_LO,x          ; Clear register
  dex
  bpl @InitSIDLoop              ; Loop until all registers cleared
  lda #$0F                      ; Set volume to maximum
  sta SID_MODE_VOL
  rts

; InitVideo — Put the PICOVDP in the Kernal's Text-mode console
; Writes the register table below with the display off, reloads the character
; set into the pattern table at $0800, restores palette row 0, sets the border
; from VID_PEN and turns the display on.  It does not clear the screen: the
; name and attribute tables are left as they were and shown unscrolled.  A
; program that switched modes, moved tables or overwrote the glyphs gets the
; console back with this one call.
; Skips silently if no video card is fitted
; Modifies: Flags, A, X, Y
InitVideoImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl @InitVideoNone
  ldx #$00
@InitVideoLoop:
  lda @InitVideoRegs + 1,x      ; Value
  sta VC_REG
  lda @InitVideoRegs,x          ; Register | $80
  sta VC_REG
  inx
  inx
  cpx #(@InitVideoRegsEnd - @InitVideoRegs)
  bne @InitVideoLoop
  jsr InitCharacters            ; The font, into L0PAT = $0800
  ; Palette row 0, 16 entries of $0R $GB at $FC00.  $FC00 is in bank 3, and
  ; VBANK is sampled by the address command, so it goes straight back to 0.
  lda #$03
  ldx #VDP_VBANK
  jsr VdpSetReg
  stz VC_REG                    ; $FC00 = bank 3, $3C00
  lda #($40 | $3C)
  sta VC_REG
  lda #$00
  ldx #VDP_VBANK
  jsr VdpSetReg
  ldx #$00
@InitVideoPalette:
  lda @InitVideoPaletteRow0,x
  sta VC_DATA
  inx
  cpx #32
  bne @InitVideoPalette
  lda VID_PEN                   ; Border = the pen's background
  ldx #VDP_COLOR
  jsr VdpSetReg
  lda #$40                      ; Display on
  ldx #VDP_MODE1
  jsr VdpSetReg
  lda #$30
  sta VDP_L0CTRL_SHADOW
  lda #$0C
  sta VDP_L1CTRL_SHADOW
  lda #$01
  sta VID_MODE                  ; Text console intact
  stz VID_TOP
  ldx VID_CURSOR_X              ; The cursor keeps its screen position
  ldy VID_CURSOR_Y
  jmp VideoSetCursorImpl
@InitVideoNone:
  rts
@InitVideoRegs:                 ; Register | $80, value
  .byte $80 | VDP_MODE1,     $00  ; Display off, IRQ off, legacy mode bits clear
  .byte $80 | VDP_MODE0,     $00
  .byte $80 | VDP_VMODE,     $01  ; Text, 40x24 of 6x8
  .byte $80 | VDP_VBANK,     $00  ; The Kernal assumes both
  .byte $80 | VDP_VINC,      $01
  .byte $80 | VDP_IRQEN,     $00
  .byte $80 | VDP_STATSEL_A, $00  ; Port B's STATSEL_B is never touched
  .byte $80 | VDP_PALBASE,   $3F  ; $FC00
  .byte $80 | VDP_L0NAME,    $00  ; Name table $0000
  .byte $80 | VDP_L0ATTR,    $01  ; Attributes $0400
  .byte $80 | VDP_L0PAT,     $01  ; Patterns $0800
  .byte $80 | VDP_L0SCRX,    $00
  .byte $80 | VDP_L0SCRY,    $00
  .byte $80 | VDP_L0CTRL,    $30  ; 1bpp, per-cell attributes, enabled, index 0 opaque
  .byte $80 | VDP_L0PAL,     $00  ; Palette row 0, the TMS9918 colours
  .byte $80 | VDP_L1CTRL,    $0C  ; Layer 1 off (its reset value)
  .byte $80 | VDP_SPRCTRL,   $26  ; Sprites off
@InitVideoRegsEnd:
@InitVideoPaletteRow0:          ; SPEC §11 default palette, row 0
  .byte $00,$00, $00,$00, $02,$C4, $06,$D7, $05,$5E, $07,$7F, $0C,$55, $04,$EE
  .byte $0F,$55, $0F,$77, $0C,$B5, $0D,$C8, $02,$A4, $0C,$5B, $0C,$CC, $0F,$FF

; Initialize the character set
; Copies the 2KB character ROM into the pattern table at VRAM $0800.
; STR_PTR is used as the source pointer but is saved and restored, so callers
; may hold a pointer there across the call.
; Modifies: Flags, A, X, Y
InitCharacters:
  lda STR_PTR                   ; Preserve caller's STR_PTR
  pha
  lda STR_PTR + 1
  pha
  ; Set VRAM write address to $0800 (pattern table base)
  lda #$00                      ; Low byte of address
  sta VC_REG
  lda #$48                      ; High byte ($08) OR $40 for write mode
  sta VC_REG
  ; Set up source pointer
  lda #<CharacterSet
  sta STR_PTR                   ; Use STR_PTR ($02-$03) for character set pointer
  lda #>CharacterSet
  sta STR_PTR + 1
  ; Copy 2048 bytes (8 pages of 256 bytes each)
  ldx #$08                      ; 8 pages to copy
  ldy #$00                      ; Byte counter within page
@InitCharPageLoop:
  lda (STR_PTR),y               ; Load from character set
  sta VC_DATA                   ; Write to VRAM
  iny
  bne @InitCharPageLoop         ; Loop until page complete (256 bytes)
  inc STR_PTR + 1               ; Move to next page
  dex
  bne @InitCharPageLoop         ; Loop for all 8 pages
  pla                           ; Restore caller's STR_PTR
  sta STR_PTR + 1
  pla
  sta STR_PTR
  rts

; Initialize the INPUT_BUFFER
; Modifies: Flags, A
InitBuffer:
  lda #$00
  sta READ_PTR                  ; Init read and write pointers
  sta WRITE_PTR
  rts

; Write a character from the A register to the INPUT_BUFFER
; Modifies: Flags, X
WriteBufferImpl:
  ldx WRITE_PTR
  sta INPUT_BUFFER,x
  inc WRITE_PTR
  rts

; Read a character from the INPUT_BUFFER and store it in A register
; Modifies: Flags, X, A
ReadBufferImpl:
  ldx READ_PTR
  lda INPUT_BUFFER,x
  inc READ_PTR
  rts

; Return in A register the number of unread bytes in the INPUT_BUFFER
; Modifies: Flags, A
BufferSizeImpl:  
  lda WRITE_PTR
  sec
  sbc READ_PTR
  rts

; Get a character from the INPUT_BUFFER if available
; On return, carry flag indicates whether a character was available
; If character available the character will be in the A register
; Modifies: Flags, A
ChrinImpl:
  phx
  jsr BufferSize                ; Check for character available
  beq @ChrinNoChar              ; Branch if no character available
  jsr ReadBuffer                ; Read the character from the buffer
  jsr Chrout                    ; Echo
  pha
  jsr BufferSize
  cmp #$B0                      ; Check if buffer is mostly full
  bcc @ChrinNotFull             ; Branch if buffer size < $B0
  ; Only touch SC_CMD if serial is present
  lda HW_PRESENT
  and #HW_SC
  beq @ChrinExit
  lda #$01                      ; No parity, no echo, RTSB high, TX interrupts disabled, RX interrupts enabled
  sta SC_CMD
  bra @ChrinExit
@ChrinNotFull:
  lda HW_PRESENT
  and #HW_SC
  beq @ChrinExit
  lda #$09                      ; No parity, no echo, RTSB low, TX interrupts disabled, RX interrupts enabled
  sta SC_CMD
@ChrinExit:
  pla
  plx
  sec
  rts
@ChrinNoChar:
  plx
  clc
  rts

; Output a character from the A register to the Serial Card
; Modifies: Flags
SerialChroutImpl:
  sta SC_DATA
  pha
  phx                           ; WriteBuffer uses X
@ChroutWait:
  lda SC_STATUS
  ; Reading the status register clears a pending receive interrupt. A byte that
  ; arrives while this loop is running therefore loses its interrupt before Irq
  ; can see it, and since the receive register stays full the ACIA will not hand
  ; over the next one either — the console stops accepting input for good. So
  ; the byte is collected here rather than left for a handler that will never
  ; run. XModem is the exception: it turns the receiver interrupt off and polls
  ; the chip itself, and those bytes belong to it.
  bit #SC_STATUS_RDRF           ; Did a byte arrive during the poll?
  beq @ChroutNoRx
  pha                           ; Keep the status just read
  lda SC_CMD
  and #SC_CMD_RXIRQ_OFF
  bne @ChroutRxDone             ; Receiver is somebody else's — leave it alone
  php
  sei                           ; WriteBuffer's pointer bump is not atomic
  lda SC_DATA                   ; Frees the receive register
  jsr WriteBuffer
  plp
@ChroutRxDone:
  pla                           ; Back to the status
@ChroutNoRx:
  and #SC_STATUS_TDRE           ; Check if TX buffer not empty
  beq @ChroutWait               ; Loop if TX buffer not empty
  plx
  pla
  rts

; SidPlayNote — Play a note on a SID voice
; Input: A = voice (0-2), X = frequency low byte, Y = frequency high byte
; Uses triangle waveform with standard ADSR (Attack=0, Decay=9, Sustain=A, Release=2)
; Skips silently if no SID is fitted
; Modifies: Flags, A
SidPlayNoteImpl:
  bit HW_PRESENT                ; SID is bit 6, so BIT tests it in V and leaves
  bvc @SidPlayNoteNone          ;   the voice number in A — see VideoClear
  cmp #$01
  beq @Voice2
  cmp #$02
  beq @Voice3
  ; Voice 0
  stx SID_V1_FREQ_LO
  sty SID_V1_FREQ_HI
  lda #$09                      ; Attack = 0, Decay = 9
  sta SID_V1_AD
  lda #$F8                      ; Sustain = F, Release = 8
  sta SID_V1_SR
  lda #$11                      ; Triangle wave + Gate on
  sta SID_V1_CTRL
  rts
@Voice2:
  stx SID_V2_FREQ_LO
  sty SID_V2_FREQ_HI
  lda #$09
  sta SID_V2_AD
  lda #$F8
  sta SID_V2_SR
  lda #$11
  sta SID_V2_CTRL
  rts
@Voice3:
  stx SID_V3_FREQ_LO
  sty SID_V3_FREQ_HI
  lda #$09
  sta SID_V3_AD
  lda #$F8
  sta SID_V3_SR
  lda #$11
  sta SID_V3_CTRL
@SidPlayNoteNone:
  rts

; SidSilence — Silence all 3 SID voices
; Gates off all voices, letting the release phase of the envelope ring out.
;
; The frequency registers are deliberately left alone. Zeroing them stops the
; oscillator dead, which freezes the waveform at whatever level it had reached
; and leaves the envelope to decay a DC offset instead of a tone — an audible
; thump at the end of every note. Gate off is all the SID needs; the envelope
; takes the voice to zero on its own.
; Skips silently if no SID is fitted
; Modifies: Flags, A
SidSilenceImpl:
  bit HW_PRESENT                ; SID is bit 6 — see VideoClear
  bvc @SidSilenceNone
  lda #$10                      ; Triangle wave, Gate off
  sta SID_V1_CTRL
  sta SID_V2_CTRL
  sta SID_V3_CTRL
@SidSilenceNone:
  rts

; Play a short beep sound
; Uses SidPlayNote on voice 0 with ~475 Hz tone, then silences
; Skips silently if SID is absent
; Modifies: Flags, A, X, Y
BeepImpl:
  lda HW_PRESENT
  and #HW_SID
  bne @BeepStart
  rts                           ; No SID — skip silently
@BeepStart:
  lda #$00                      ; Voice 0
  ldx #$20                      ; Frequency low byte (~475 Hz)
  ldy #$1F                      ; Frequency high byte
  jsr SidPlayNote
  ; Override ADSR for beep: fast decay, no sustain
  lda #$09                      ; Attack = 0, Decay = 9
  sta SID_V1_AD
  lda #$00                      ; Sustain = 0, Release = 0
  sta SID_V1_SR
  ; Delay for beep duration
  ldx #$F0                      ; Outer loop counter
@BeepDelay1:
  ldy #$FF                      ; Inner loop counter
@BeepDelay2:
  dey
  bne @BeepDelay2
  dex
  bne @BeepDelay1
  jsr SidSilence                ; Gate off all voices
  rts

; SysDelay — Delay for a specified number of centiseconds
; Input: A = count low byte, X = count high byte
; Uses VIA T1 in one-shot mode. 9999 cycles @ 1MHz = ~10ms per tick.
; Modifies: Flags, A, X, Y (X/Y clobbered only in software-fallback path)
SysDelayImpl:
  sta DELAY_CNT
  stx DELAY_CNT + 1
  ; Return immediately if count is zero
  ora DELAY_CNT + 1
  beq @DelayDone
  ; Check if VIA is present for hardware timer
  lda HW_PRESENT
  and #HW_GPIO
  bne @DelayHardware
  ; Software fallback — calibrated busy loop (~10ms per centisecond at 1MHz)
  ; Inner loop: 5 cycles × 256 iterations × 8 = ~10240 cycles ≈ 10ms
@DelaySoftLoop:
  ldy #$00                      ; 256 outer iterations
  ldx #8
@DelaySoftInner:
  dey
  bne @DelaySoftInner
  dex
  bne @DelaySoftInner
  ; 16-bit decrement of DELAY_CNT
  lda DELAY_CNT
  bne @SoftDecLo
  dec DELAY_CNT + 1
@SoftDecLo:
  dec DELAY_CNT
  lda DELAY_CNT
  ora DELAY_CNT + 1
  bne @DelaySoftLoop
  rts
@DelayHardware:
  ; Configure T1 one-shot mode: clear ACR bit 6
  lda GPIO_ACR
  and #%10111111
  sta GPIO_ACR
@DelayLoop:
  ; Load T1 latch: 9999 = $270F
  lda #$0F
  sta GPIO_T1LL
  lda #$27
  sta GPIO_T1LH
  ; Write T1CH to start countdown (also clears IFR T1 flag)
  lda #$27
  sta GPIO_T1CH
@DelayPoll:
  lda GPIO_IFR
  and #%01000000                ; T1 timeout flag
  beq @DelayPoll
  ; Clear flag by reading T1CL
  lda GPIO_T1CL
  ; 16-bit decrement
  lda DELAY_CNT
  bne @DelayDecLo
  dec DELAY_CNT + 1
@DelayDecLo:
  dec DELAY_CNT
  ; Loop until both bytes zero
  lda DELAY_CNT
  ora DELAY_CNT + 1
  bne @DelayLoop
@DelayDone:
  rts

; SidSetVolume — Set SID master volume
; Input: A = volume (0-15); upper nibble of SID_MODE_VOL is cleared (no filter)
; Skips silently if no SID is fitted
; Modifies: Flags, A
SidSetVolumeImpl:
  bit HW_PRESENT                ; SID is bit 6 — see VideoClear
  bvc @SidSetVolumeNone
  and #$0F
  sta SID_MODE_VOL
@SidSetVolumeNone:
  rts

; VideoSetColor — Set the pen for later output, and the border
; Input: A = fg<<4 | bg.  VID_PEN = A, and register 7 = A, so the border follows
; the background.  Characters already on screen keep their colours.
; Skips silently if no video card is fitted
; Modifies: Flags, A
VideoSetColorImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl @VideoSetColorNone
  jsr VideoConsoleReady
  sta VID_PEN
  sta VC_REG                    ; Data byte
  lda #($80 | VDP_COLOR)
  sta VC_REG
@VideoSetColorNone:
  rts

; Encoder settle count for KBDisableImpl. Each loop iteration is 5 cycles, so
; the busy-wait is ~KB_SETTLE_COUNT*5 cycles. Sized against the 2 MHz clock
; option (the worst case): 80 => ~400 cycles => ~200 us @ 2 MHz (~400 us @ 1 MHz),
; comfortably above the firmware's guaranteed 100 us release ceiling.
KB_SETTLE_COUNT = 80

; KBDisable — Disable both keyboard encoders and wait for them to release the ports
; Sets CB2/CA2 high, then busy-waits so the encoder firmware has time to let go of
; both ports before the caller reads them. Self-contained cycle loop — deliberately
; not SysDelay or the VIA T1 path, so it is safe to call while the caller owns the timers.
; Modifies: Flags, A
KBDisableImpl:
  lda #(GPIO_PCR_CB2_HI | GPIO_PCR_CB1_NEG | GPIO_PCR_CA2_HI | GPIO_PCR_CA1_NEG)
  sta GPIO_PCR                  ; Tell both encoders to release the ports
  txa
  pha                           ; Preserve X so the contract stays "Modifies: Flags, A"
  ldx #KB_SETTLE_COUNT
@KBSettle:
  dex
  bne @KBSettle                 ; Give the encoders time to go high-impedance
  pla
  tax
  rts

; KBEnable — Re-enable both keyboard encoders
; Sets CB2 low (enable matrix encoder) and CA2 low (enable PS/2 encoder)
; Modifies: Flags, A
KBEnableImpl:
  lda #(GPIO_PCR_CB2_LO | GPIO_PCR_CB1_NEG | GPIO_PCR_CA2_LO | GPIO_PCR_CA1_NEG)
  sta GPIO_PCR
  rts

; ReadJoystick1 — Read joystick 1 on Port B
; Disables both encoders, waits for release, then reads the raw port directly —
; the same way a C64 reads a CIA port. No sei/PCR save-restore is needed: the port
; is static while the encoders are off and no interrupt handler touches these ports.
; Output: A = joystick bitmask (active-low bits: R-L-D-U-Y-X-B-A)
; Modifies: Flags, A
ReadJoystick1Impl:
  jsr KBDisableImpl             ; Encoders off, ports released, settled
  lda GPIO_PORTB                ; JOY(1) - raw Port B
  pha
  jsr KBEnableImpl
  pla
  rts

; ReadJoystick2 — Read joystick 2 on Port A
; Output: A = joystick bitmask (active-low bits: R-L-D-U-Y-X-B-A)
; Modifies: Flags, A
ReadJoystick2Impl:
  jsr KBDisableImpl             ; Encoders off, ports released, settled
  lda GPIO_PORTA                ; JOY(2) - raw Port A
  pha
  jsr KBEnableImpl
  pla
  rts

; === BCD Conversion Helpers ===

; BcdToBin — Convert BCD byte to binary
; Input: A = BCD value (e.g. $35 represents 35)
; Output: A = binary value (e.g. 35 = $23)
; Modifies: Flags
BcdToBin:
  pha
  lsr a                         ; Shift tens digit to low nibble
  lsr a
  lsr a
  lsr a                         ; A = tens digit (0-9)
  asl a                         ; A = tens * 2
  sta RTC_TMP
  asl a                         ; A = tens * 4
  asl a                         ; A = tens * 8
  clc
  adc RTC_TMP                   ; A = tens * 10 (8 + 2)
  sta RTC_TMP
  pla
  and #$0F                      ; A = ones digit
  clc
  adc RTC_TMP                   ; A = tens * 10 + ones = binary
  rts

; BinToBcd — Convert binary byte to BCD
; Input: A = binary value (0-99)
; Output: A = BCD value
; Modifies: Flags, X
BinToBcd:
  ldx #$FF                      ; Tens counter (starts at -1)
@BinToBcdLoop:
  inx
  sec
  sbc #10
  bcs @BinToBcdLoop             ; Count tens
  adc #10                       ; Restore ones (carry clear, so adds 10 + 0)
  sta RTC_TMP                   ; Save ones digit
  txa                           ; A = tens digit
  asl a
  asl a
  asl a
  asl a                         ; Shift tens to high nibble
  ora RTC_TMP                   ; Combine with ones
  rts

; === DS1511Y RTC Routines ===

; The clock registers at $8800-$8807 are double buffered.  A set of internal
; counters does the actual timekeeping; what the CPU reads and writes is a
; user-facing copy, and the TE bit in Control Register B decides how the two
; are joined:
;
;   TE = 1  the counters are copied into the user registers once a second —
;           the normal running state, and what makes a read see time advance
;   TE = 0  that copy is inhibited, so the user registers hold one consistent
;           instant.  Returning TE to 1 transfers the user registers back into
;           the counters, which is how a write takes effect
;
; So a write brackets itself with RtcFreeze / RtcThaw, keeping the per-second
; update from landing in the middle of the bytes being set and then committing
; the lot.  Leaving TE set afterwards is not housekeeping, it is the whole
; point: TE is battery-backed and no internal function of the part ever changes
; it, so a TE left at 0 freezes the CPU's view of the clock indefinitely — the
; counters go on counting, but every read returns the same instant, across
; resets and power cycles alike, until something sets TE again.
;
; A read has a rollover to worry about — read the hour at 23:59:59 and the
; minute a moment later and the answer is 23:00, an hour that never happened —
; but it deliberately does not use TE for it.  Freezing would work, and is what
; the part is for, except that the thaw both commits the user registers back
; into the counters and restarts the second from zero; a program polling the
; time in a loop would thereby hold the clock still.  Reading the seconds on
; either side of the other registers and retrying if they differ costs nothing
; and writes nothing.

; RtcFreeze — Clear TE, holding the user registers at one instant
; Modifies: Flags, A
RtcFreeze:
  lda RTC_CTRL_B
  and #<~RTC_CTRL_B_TE
  sta RTC_CTRL_B
  rts

; RtcThaw — Set TE, committing the user registers and resuming the updates
; Modifies: Flags, A
RtcThaw:
  lda RTC_CTRL_B
  ora #RTC_CTRL_B_TE
  sta RTC_CTRL_B
  rts

; RtcReadTime — Read current time from DS1511Y
; Output: A = hours (binary), X = minutes (binary), Y = seconds (binary)
; Modifies: Flags
RtcReadTimeImpl:
  ldy #2                        ; Attempts.  One retry is all a working clock
@Retry:                         ;   can need — a rollover cannot happen twice
  lda RTC_SEC                   ;   in the same second — and the count is what
  sta RTC_TMP                   ;   keeps a floating bus, on a machine with no
  lda RTC_HR                    ;   card, from spinning here forever
  pha                           ; Stacked raw: the seconds have to be compared
  lda RTC_MIN                   ;   before BcdToBin, which wants RTC_TMP itself
  pha
  lda RTC_SEC                   ; Seconds after; unchanged means no rollover
  cmp RTC_TMP                   ;   happened between the two reads above
  beq @Stable
  dey
  beq @Stable                   ; Out of attempts: take what is there
  pla                           ; Torn — drop the pair and read again
  pla
  bra @Retry
@Stable:
  jsr BcdToBin                  ; A still holds the seconds
  tay                           ; Y = seconds
  pla
  jsr BcdToBin
  tax                           ; X = minutes
  pla
  jsr BcdToBin                  ; A = hours
  rts

; RtcReadDate — Read current date from DS1511Y
; Output: A = day of month (binary), X = month (binary), Y = year (binary)
;         RTC_BUF_CENT = century (binary)
; Modifies: Flags
RtcReadDateImpl:
  ldy #2                        ; Attempts, bounded as in RtcReadTime
@Retry:
  lda RTC_SEC                   ; The date rolls over on a second like anything
  sta RTC_TMP                   ;   else, so it is guarded the same way
  lda RTC_DATE                  ; Pushed in reverse of the order they are
  pha                           ;   wanted, so the day of month comes off last
  lda RTC_YR                    ;   and is already in A to return
  pha
  lda RTC_MON
  pha
  lda RTC_CENT
  pha
  lda RTC_SEC
  cmp RTC_TMP
  beq @Stable
  dey
  beq @Stable                   ; Out of attempts: take what is there
  pla                           ; Torn — drop the four and read again
  pla
  pla
  pla
  bra @Retry
@Stable:
  pla
  jsr BcdToBin
  sta RTC_BUF_CENT              ; Store century in buffer
  pla
  and #RTC_MON_MASK             ; Strip control bits (EOSC/E32K/BB32) before BCD decode
  jsr BcdToBin
  tax                           ; X = month
  pla
  jsr BcdToBin
  tay                           ; Y = year
  pla
  jsr BcdToBin                  ; A = day of month
  rts

; RtcWriteTime — Set DS1511Y time
; Input: A = hours (binary), X = minutes (binary), Y = seconds (binary)
; Modifies: Flags, A, X
RtcWriteTimeImpl:
  pha                           ; Save hours
  phx                           ; Save minutes
  phy                           ; Save seconds
  jsr RtcFreeze                 ; Hold off the once-a-second update
  ; Write seconds
  pla                           ; A = seconds
  jsr BinToBcd
  sta RTC_SEC
  ; Write minutes
  pla                           ; A = minutes
  jsr BinToBcd
  sta RTC_MIN
  ; Write hours
  pla                           ; A = hours
  jsr BinToBcd
  sta RTC_HR
  jmp RtcThaw                   ; Commit the write and resume the updates

; RtcWriteDate — Set DS1511Y date
; Input: A = day of month (binary), X = month (binary), Y = year (binary)
;        RTC_BUF_CENT = century (binary)
; Modifies: Flags, A, X
RtcWriteDateImpl:
  pha                           ; Save day
  phx                           ; Save month
  phy                           ; Save year
  jsr RtcFreeze                 ; Hold off the once-a-second update
  ; Write century
  lda RTC_BUF_CENT
  jsr BinToBcd
  sta RTC_CENT
  ; Write year
  pla                           ; A = year
  jsr BinToBcd
  sta RTC_YR
  ; Write month
  pla                           ; A = month
  jsr BinToBcd
  and #RTC_MON_MASK             ; Keep only the month value bits
  sta RTC_TMP
  lda RTC_MON
  and #<~RTC_MON_MASK           ; Preserve control bits (EOSC/E32K/BB32)
  ora RTC_TMP
  sta RTC_MON
  ; Write day
  pla                           ; A = day
  jsr BinToBcd
  sta RTC_DATE
  jmp RtcThaw                   ; Commit the write and resume the updates

; RtcReadNVRAM — Read a byte from DS1511Y NVRAM
; Input: X = NVRAM address ($00-$FF)
; Output: A = data byte
; Modifies: Flags
RtcReadNVRAMImpl:
  stx RTC_RAM_ADDR
  lda RTC_RAM_DATA
  rts

; RtcWriteNVRAM — Write a byte to DS1511Y NVRAM
; Input: X = NVRAM address ($00-$FF), A = data byte
; Modifies: Flags
RtcWriteNVRAMImpl:
  stx RTC_RAM_ADDR
  sta RTC_RAM_DATA
  rts

; === NVRAM Save Slots ===
;
; The 256 NVRAM bytes are 16 slots of 16 bytes; slot n starts at NVRAM n*16:
;
;   +$0      owner ID     $00 = free, otherwise a game-chosen identity byte
;   +$1      checksum     over the owner ID and the 14 payload bytes
;   +$2-$F   payload
;
; Checksum: ck = NV_CK_SEED, then ck = rol8(ck) EOR b for each covered byte.
; The 8-bit rotate is asl / adc #0, which is why these routines clear D.
;
; Contract shared by all six:
;   * Carry set means the call did nothing: no RTC card, slot >= NV_SLOTS, and
;     the per-routine cases documented on each.
;   * The caller's D and I flags come back unchanged.  Interrupts are masked for
;     the duration, because the slot copies use burst mode, where every access
;     of RTC_RAM_DATA advances the address latch — an IRQ handler touching NVRAM
;     mid-copy would corrupt the save.  A user NMI handler must not touch NVRAM.
;   * BME is clear on exit, so RtcReadNVRAM / RtcWriteNVRAM keep their
;     single-byte behaviour.
;   * While BME is set, RTC_RAM_DATA is only ever touched with plain absolute
;     addressing: one instruction, one bus access, one step of the latch.

; NvStat — Report a slot's state
; Input: X = slot (0-15)
; Output: A = NV_EMPTY / NV_VALID / NV_BAD, Y = owner ID, C clear
;         C set on no RTC or bad slot (A, Y undefined)
; Modifies: Flags (D and I preserved), A, Y
NvStatImpl:
  php
  sei
  cld
  jsr NvCheck
  bcs NvFail
  jsr NvScan
  jmp NvOk

; NvRead — Copy a valid slot's 14 payload bytes to the caller's buffer
; Input: X = slot (0-15), A/Y = destination lo/hi
; Output: A = status, Y = owner ID; C clear and the buffer written only if A = NV_VALID
;         C set on no RTC or bad slot (A, Y undefined), or a slot that is not
;         valid (A = its status, Y = its owner ID) — the buffer is untouched
; Modifies: Flags (D and I preserved), A, Y, NV_PTR
NvReadImpl:
  php
  sei
  cld
  sta NV_PTR
  sty NV_PTR+1
  jsr NvCheck
  bcs NvFail
  jsr NvScan
  cmp #NV_VALID
  bne NvFail                    ; Nothing copied until the slot has validated
  phy                           ; Owner ID
  jsr NvBurstStart
  lda RTC_RAM_DATA              ; Step past the owner ID...
  lda RTC_RAM_DATA              ;   ...and the checksum
  ldy #0
@Copy:
  lda RTC_RAM_DATA
  sta (NV_PTR),y
  iny
  cpy #NV_SLOT_DATA
  bne @Copy
  jsr NvBurstEnd
  ply
  lda #NV_VALID
  jmp NvOk

; NvOk / NvFail — Common exits: restore the caller's flags, then report
; Entered by jmp with the P byte an entry's php pushed on top of the stack.
; A, X and Y pass through untouched.
NvOk:
  plp
  clc
  rts
NvFail:
  plp
  sec
  rts

; NvFind — Find the lowest slot whose owner ID is A
; Matches any non-free slot, valid or damaged; A = $00 finds the lowest free slot.
; Input: A = owner ID
; Output: X = slot, C clear; C set if no slot matched (X undefined)
; Modifies: Flags (I preserved), A, X, RTC_TMP
NvFindImpl:
  php
  sei
  sta RTC_TMP
  lda HW_PRESENT
  and #HW_RTC
  beq NvFail
  ldx #0
@Next:
  txa
  asl a
  asl a
  asl a
  asl a
  sta RTC_RAM_ADDR              ; One byte per slot, so no burst: the latch is
  lda RTC_RAM_DATA              ;   set afresh each time
  cmp RTC_TMP
  beq NvOk
  inx
  cpx #NV_SLOTS
  bne @Next
  beq NvFail

; NvErase — Zero all 16 bytes of a slot, so nothing of the old save is legible
; Input: X = slot (0-15)
; Output: C clear; C set on no RTC or bad slot
; Modifies: Flags (I preserved), A, Y
NvEraseImpl:
  php
  sei
  jsr NvCheck
  bcs NvFail
  jsr NvBurstStart
  ldy #NV_SLOT_SIZE
@Zero:
  stz RTC_RAM_DATA
  dey
  bne @Zero
  jsr NvBurstEnd
  jmp NvOk

; NvWrite — Write a slot: owner ID, checksum and 14 payload bytes
; Input: X = slot (0-15), A/Y = source lo/hi, NV_ID = owner ID ($01-$FF)
; Output: C clear; C set on no RTC, bad slot, or NV_ID = 0 (nothing written)
; Modifies: Flags (D and I preserved), A, Y, NV_PTR
NvWriteImpl:
  php
  sei
  cld
  sta NV_PTR
  sty NV_PTR+1
  jsr NvCheck
  bcs NvFail
  lda NV_ID
  beq NvFail                    ; ID 0 marks a free slot — that is NvErase
  lda #NV_CK_SEED               ; Checksum first, from the caller's buffer
  asl a
  adc #$00
  eor NV_ID
  ldy #0
@Sum:
  asl a
  adc #$00
  eor (NV_PTR),y
  iny
  cpy #NV_SLOT_DATA
  bne @Sum
  sta RTC_TMP
  jsr NvBurstStart
  lda NV_ID
  sta RTC_RAM_DATA
  lda RTC_TMP
  sta RTC_RAM_DATA
  ldy #0
@Copy:
  lda (NV_PTR),y
  sta RTC_RAM_DATA
  iny
  cpy #NV_SLOT_DATA
  bne @Copy
  jsr NvBurstEnd
  jmp NvOk

; NvFormat — Erase all 16 slots
; Output: C clear; C set on no RTC
; Modifies: Flags, A, X, Y
NvFormatImpl:
  ldx #NV_SLOTS-1
@Next:
  jsr NvEraseImpl
  bcs @Done
  dex
  bpl @Next
@Done:
  rts

; NvCheck — Fail unless an RTC is fitted and X names a slot
; Input: X = slot
; Output: C set if no RTC or X >= NV_SLOTS
; Modifies: Flags, A
NvCheck:
  lda HW_PRESENT
  and #HW_RTC
  beq @Fail
  cpx #NV_SLOTS                 ; C = X >= NV_SLOTS
  rts
@Fail:
  sec
  rts

; NvScan — Read slot X's header and validate its checksum
; Input: X = slot (already checked), D clear, interrupts masked
; Output: A = NV_EMPTY / NV_VALID / NV_BAD, Y = owner ID
; Modifies: Flags, A, Y, RTC_TMP
NvScan:
  jsr NvBurstStart
  lda RTC_RAM_DATA              ; Owner ID
  pha
  sta RTC_TMP
  lda #NV_CK_SEED               ; Fold in the owner ID
  asl a
  adc #$00
  eor RTC_TMP
  ldy RTC_RAM_DATA              ; Stored checksum
  sty RTC_TMP
  ldy #NV_SLOT_DATA
@Sum:
  asl a                         ; Rotate left: bit 7 into carry...
  adc #$00                      ;   ...and back into bit 0
  eor RTC_RAM_DATA              ; Next payload byte
  dey
  bne @Sum
  eor RTC_TMP                   ; 0 when the checksum agrees
  sta RTC_TMP
  jsr NvBurstEnd
  ply                           ; Y = owner ID
  beq @Empty
  lda RTC_TMP
  beq @Valid
  lda #NV_BAD
  rts
@Valid:
  lda #NV_VALID
  rts
@Empty:
  lda #NV_EMPTY
  rts

; NvBurstStart — Point the NVRAM latch at slot X and enable burst mode
; Input: X = slot
; Modifies: Flags, A
NvBurstStart:
  txa
  asl a                         ; Slot base = slot * 16
  asl a
  asl a
  asl a
  sta RTC_RAM_ADDR
  lda RTC_CTRL_B                ; Read-modify-write: Control B also holds TE
  ora #RTC_CTRL_B_BME
  sta RTC_CTRL_B
  rts

; NvBurstEnd — Disable burst mode
; Modifies: Flags, A
NvBurstEnd:
  lda RTC_CTRL_B
  and #<~RTC_CTRL_B_BME
  sta RTC_CTRL_B
  rts

; === Hardware Probes ===

; ProbeRAM — Test for banked SRAM on IO 1 and IO 2
; Two-pattern read-back test ($A5 then $5A) on bank 0 data byte
; Sets HW_RAM_L / HW_RAM_H in HW_PRESENT on success
; Modifies: Flags, A
ProbeRAM:
  ; A naive "write byte, immediately read it back" test is unreliable: with no
  ; SRAM responding, bus/parasitic capacitance holds the just-written value for
  ; a cycle or two, so the read-back matches and the probe falsely passes.
  ; Instead we write complementary patterns into TWO different banks, then read
  ; them back AFTER intervening bus cycles (opcode fetches from ROM + a second
  ; bank's data) have flushed the bus. This forces the chip to actually store
  ; distinct values and also exercises the bank-select latch. Open bus cannot
  ; fake both reads. Bank-0/bank-1 byte 0 are saved and restored.

  ; --- Probe RAM Low (IO 1) ---
  stz RAM_BANK_L                ; Bank 0
  lda RAM_DATA_L                ; Save bank-0 byte 0
  pha
  lda #$01
  sta RAM_BANK_L                ; Bank 1
  lda RAM_DATA_L                ; Save bank-1 byte 0
  pha
  stz RAM_BANK_L               ; Bank 0
  lda #$A5
  sta RAM_DATA_L                ; bank0[0] = $A5
  lda #$01
  sta RAM_BANK_L                ; Bank 1
  lda #$5A
  sta RAM_DATA_L                ; bank1[0] = $5A (flips data + address lines)
  stz RAM_BANK_L               ; Back to bank 0
  lda RAM_DATA_L               ; Read bank0[0] (bus no longer holds $A5)
  cmp #$A5
  bne @RAMLRestore             ; Bank 0 did not retain its value
  lda #$01
  sta RAM_BANK_L                ; Bank 1
  lda RAM_DATA_L               ; Read bank1[0]
  cmp #$5A
  bne @RAMLRestore             ; Bank 1 did not retain (or latch failed)
  lda HW_PRESENT
  ora #HW_RAM_L
  sta HW_PRESENT
@RAMLRestore:
  lda #$01
  sta RAM_BANK_L                ; Bank 1
  pla
  sta RAM_DATA_L                ; Restore bank-1 byte 0
  stz RAM_BANK_L               ; Bank 0
  pla
  sta RAM_DATA_L                ; Restore bank-0 byte 0

  ; --- Probe RAM High (IO 2) ---
  stz RAM_BANK_H                ; Bank 0
  lda RAM_DATA_H                ; Save bank-0 byte 0
  pha
  lda #$01
  sta RAM_BANK_H                ; Bank 1
  lda RAM_DATA_H                ; Save bank-1 byte 0
  pha
  stz RAM_BANK_H               ; Bank 0
  lda #$A5
  sta RAM_DATA_H                ; bank0[0] = $A5
  lda #$01
  sta RAM_BANK_H                ; Bank 1
  lda #$5A
  sta RAM_DATA_H                ; bank1[0] = $5A (flips data + address lines)
  stz RAM_BANK_H               ; Back to bank 0
  lda RAM_DATA_H               ; Read bank0[0] (bus no longer holds $A5)
  cmp #$A5
  bne @RAMHRestore             ; Bank 0 did not retain its value
  lda #$01
  sta RAM_BANK_H                ; Bank 1
  lda RAM_DATA_H               ; Read bank1[0]
  cmp #$5A
  bne @RAMHRestore             ; Bank 1 did not retain (or latch failed)
  lda HW_PRESENT
  ora #HW_RAM_H
  sta HW_PRESENT
@RAMHRestore:
  lda #$01
  sta RAM_BANK_H                ; Bank 1
  pla
  sta RAM_DATA_H                ; Restore bank-1 byte 0
  stz RAM_BANK_H               ; Bank 0
  pla
  sta RAM_DATA_H                ; Restore bank-0 byte 0
  rts

; ProbeVideo — identify a 6502-PICOVDP (SPEC §16)
; Selects STAT4 on port A and looks for the identification byte.  Only a PICOVDP
; is video: an empty slot reads something else, and a TMS9918A decodes three
; register bits, takes the select as a harmless register 7 write, and is left
; alone after that.  On a PICOVDP, records STAT5 in VDP_FW and STAT6 in
; VDP_CAPS, puts STATSEL_A back to STAT0 and sets HW_VID.  STAT5 gates nothing.
; Modifies: Flags, A, VDP_FW, VDP_CAPS
ProbeVideo:
  stz VDP_FW                    ; No card until one answers
  stz VDP_CAPS
  lda VC_STATUS                 ; Resynchronise the command flip-flop (and, on
                                ;   a TMS9918A, clear the flags that could
                                ;   otherwise read as $AC)
  lda #$04
  jsr VdpSelectStat
  lda VC_STATUS                 ; STAT4
  cmp #VDP_ID
  bne @ProbeVideoDone           ; Not a PICOVDP: nothing more is written
  lda #$05
  jsr VdpSelectStat
  lda VC_STATUS
  sta VDP_FW                    ; STAT5: firmware version, BCD
  lda #$06
  jsr VdpReadStat               ; And STATSEL_A back to STAT0
  sta VDP_CAPS                  ; STAT6: capability bits
  lda HW_PRESENT
  ora #HW_VID
  sta HW_PRESENT
@ProbeVideoDone:
  rts

; ProbeGPIO — VIA DDR register read-back test
; Writes $AA to GPIO_DDRB, reads it back
; Sets HW_GPIO in HW_PRESENT on success
; Restores GPIO_DDRB to $00 afterward
; Modifies: Flags, A
ProbeGPIO:
  lda #$AA
  sta GPIO_DDRB
  cmp GPIO_DDRB
  bne @ProbeGPIODone
  lda HW_PRESENT
  ora #HW_GPIO
  sta HW_PRESENT
@ProbeGPIODone:
  stz GPIO_DDRB                 ; Restore to inputs (InitKBImpl will configure properly)
  rts

; ProbeSerial — R65C51 CMD register write/read-back test
; Issues programmatic reset, writes test value to CMD, reads back
; Open bus will not match — prevents false detection
; Sets HW_SC in HW_PRESENT on success
; Modifies: Flags, A
ProbeSerial:
  stz SC_RESET                  ; Programmatic reset (write any value)
  lda #$0A                      ; Test value (bits within CMD writable range)
  sta SC_CMD                    ; Write to Command Register
  cmp SC_CMD                    ; Read back — should match if real hardware
  bne @ProbeSerialDone          ; Mismatch = open bus, no card present
  lda HW_PRESENT
  ora #HW_SC
  sta HW_PRESENT
@ProbeSerialDone:
  rts

; ProbeSID — Active oscillator test using voice 3
; Configures voice 3 noise waveform, brief delay, reads SID_OSC3
; Non-zero and non-$FF result indicates SID present
; Sets HW_SID in HW_PRESENT on success
; Modifies: Flags, A, X, Y
ProbeSID:
  ; Set voice 3 frequency to a fast value
  lda #$FF
  sta SID_V3_FREQ_LO
  sta SID_V3_FREQ_HI
  ; Gate on + noise waveform
  lda #(SID_CTRL_GATE | SID_CTRL_NOISE)
  sta SID_V3_CTRL
  ; Brief software delay for oscillator to run
  ldy #$00
@ProbeSIDDelay:
  dey
  bne @ProbeSIDDelay            ; ~1280 cycles
  ; Read oscillator 3 output
  lda SID_OSC3
  beq @ProbeSIDCleanup          ; Zero → no SID
  cmp #$FF
  beq @ProbeSIDCleanup          ; $FF → likely floating bus
  ; SID detected
  pha
  lda HW_PRESENT
  ora #HW_SID
  sta HW_PRESENT
  pla
@ProbeSIDCleanup:
  ; Silence voice 3
  stz SID_V3_CTRL
  stz SID_V3_FREQ_LO
  stz SID_V3_FREQ_HI
  rts

; ProbeRTC — DS1511Y NVRAM read-back test
; Writes test pattern to NVRAM address 0, reads it back
; Sets HW_RTC in HW_PRESENT on success
; Restores original NVRAM value afterward
; Modifies: Flags, A
ProbeRTC:
  ; BME is battery-backed and undefined at power-up, like TE beside it.  Left set,
  ; every access of RTC_RAM_DATA below would advance the address latch: the
  ; read-back would compare against the wrong byte, HW_RTC would never be set,
  ; and the restore would land on a third address.  So clear it before the RAM
  ; ports are touched — read-modify-write, since Control B also holds TE.
  lda RTC_CTRL_B
  and #<~RTC_CTRL_B_BME
  sta RTC_CTRL_B
  stz RTC_RAM_ADDR              ; Select NVRAM address 0
  lda RTC_RAM_DATA              ; Save existing value
  pha
  lda #$A5
  sta RTC_RAM_DATA              ; Write test pattern
  cmp RTC_RAM_DATA              ; Read back
  bne @ProbeRTCDone
  lda HW_PRESENT
  ora #HW_RTC
  sta HW_PRESENT
  ; The DS1511Y SQW pin feeds the AB Controller, which turns every SQW edge into
  ; a 6502 NMI. Its control bits power up undefined and are battery-backed, so
  ; explicitly disable the square-wave output here. E32K/BB32/EOSC live in the
  ; upper 3 bits of the month register (05H); keep the month value and leave the
  ; oscillator running.
  ;
  ; Bracketed like any other clock write, since 05H carries the month as well as
  ; the control bits. The thaw doubles as a repair: TE is battery-backed, so a
  ; board whose TE was left at 0 reads a stopped clock forever, and setting it
  ; here is the only thing that starts the readout moving again.
  jsr RtcFreeze
  lda RTC_MON
  and #RTC_MON_MASK             ; Keep month value (low 5 bits)
  ora #RTC_MON_E32K             ; E32K=1 → SQW disabled; BB32=0, EOSC=0
  sta RTC_MON
  jsr RtcThaw
@ProbeRTCDone:
  pla
  sta RTC_RAM_DATA              ; Restore original value
  rts

; === CompactFlash Storage Driver (True 8-bit IDE Mode) ===

; StWaitReady — Wait for CompactFlash to become ready
; Polls ST_STATUS until BSY=0 and RDY=1, with X/Y timeout (~65536 iterations)
; Output: Carry clear = ready, Carry set = error or timeout
; Modifies: Flags, A, X, Y
StWaitReadyImpl:
  lda HW_PRESENT
  and #HW_CF
  bne StWaitReadyPoll           ; Card fitted — poll it
  sec                           ; No card: fail now rather than spinning out a
  rts                           ;   65536-iteration timeout per sector.  This is
                                ;   the one guard the whole storage stack needs
                                ;   — every read, write and directory listing
                                ;   comes through here first — so a caller on
                                ;   a machine with an empty slot gets carry set
                                ;   without carrying a presence check of its
                                ;   own.

; StWaitReadyPoll — the same wait without the presence check, for the probe that
; establishes presence in the first place.
StWaitReadyPoll:
  ldx #$00                      ; Outer timeout counter (256 × 256 = 65536 iterations)
  ldy #$00
@StWaitBsy:
  lda ST_STATUS
  and #ST_STATUS_BSY            ; Check BSY bit
  beq @StCheckRdy               ; BSY clear — check RDY
  dey
  bne @StWaitBsy
  dex
  bne @StWaitBsy
  sec                           ; Timed out — no device
  rts
@StCheckRdy:
  lda ST_STATUS
  and #ST_STATUS_RDY            ; Check RDY bit
  bne @StCheckErr               ; RDY set — check for errors
  dey
  bne @StWaitBsy
  dex
  bne @StWaitBsy
  sec                           ; Timed out
  rts
@StCheckErr:
  lda ST_STATUS
  and #ST_STATUS_ERR            ; Check ERR bit
  bne @StWaitErr
  clc                           ; Ready, no error
  rts
@StWaitErr:
  sec                           ; Error condition
  rts

; StWaitDrq — Wait for CompactFlash data request
; Polls ST_STATUS until BSY=0 and DRQ=1, with X/Y timeout (~65536 iterations)
; Output: Carry clear = DRQ active, Carry set = error or timeout
; Modifies: Flags, A, X, Y
StWaitDrq:
  ldx #$00                      ; Outer timeout counter (256 × 256 = 65536 iterations)
  ldy #$00
@StDrqBsy:
  lda ST_STATUS
  and #ST_STATUS_BSY
  beq @StDrqCheckDrq            ; BSY clear — check DRQ
  dey
  bne @StDrqBsy
  dex
  bne @StDrqBsy
  sec                           ; Timed out — no device
  rts
@StDrqCheckDrq:
  lda ST_STATUS
  and #ST_STATUS_ERR
  bne @StDrqErr
  lda ST_STATUS
  and #ST_STATUS_DRQ
  bne @StDrqOk                  ; DRQ set — ready for data
  dey
  bne @StDrqBsy
  dex
  bne @StDrqBsy
  sec                           ; Timed out
  rts
@StDrqOk:
  clc
  rts
@StDrqErr:
  sec
  rts

; StInit — Initialize CompactFlash for 8-bit data transfers
; Issues Set Features command with subcommand $01 (enable 8-bit I/O)
; Output: Carry clear = success, Carry set = error
; Modifies: Flags, A
StInit:
  jsr StWaitReadyPoll           ; Not StWaitReady: HW_CF is what this sets, so
                                ;   the guarded entry would answer "no card"
                                ;   before the card had been asked
  bcs @StInitDone               ; Timeout or error — CF not present
  ; CF responded — set presence flag
  lda HW_PRESENT
  ora #HW_CF
  sta HW_PRESENT
  lda #ST_FEAT_8BIT             ; Feature: enable 8-bit data I/O
  sta ST_FEATURE
  lda #ST_CMD_SET_FEAT          ; Set Features command
  sta ST_CMD
  jsr StWaitReady               ; Wait for command completion
@StInitDone:
  rts

; StSetupLba — Set up LBA registers from CF_LBA zero page variables
; Also sets sector count to 1 and selects master drive in LBA mode
; Modifies: Flags, A
StSetupLba:
  lda #$01
  sta ST_SECT_CNT               ; Always 1 sector
  ; Effective LBA = CF_LBA + CF_DISK * FS_DISK_SECTORS (disk banking base offset).
  ; base = CF_DISK << 11: byte0=0, byte1=(CF_DISK<<3)&$FF, byte2=CF_DISK>>5, byte3=0.
  ; Precompute base bits 16-23 (CF_DISK >> 5) into X before any add clobbers carry.
  lda CF_DISK
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  tax                           ; X = CF_DISK >> 5 (disk base, LBA bits 16-23)
  lda CF_LBA
  sta ST_LBA_0                  ; LBA bits 0-7 (base low byte is 0)
  ; LBA bits 8-15: CF_LBA+1 + (CF_DISK << 3)
  lda CF_DISK
  asl a
  asl a
  asl a                         ; A = (CF_DISK << 3) & $FF
  clc
  adc CF_LBA + 1
  sta ST_LBA_1
  ; LBA bits 16-23: CF_LBA+2 + (CF_DISK >> 5) + carry
  txa
  adc CF_LBA + 2
  sta ST_LBA_2
  ; LBA bits 24-27: CF_LBA+3 + carry
  lda CF_LBA + 3
  adc #$00
  and #$0F                      ; Mask to 4 bits (LBA 24-27)
  ora #ST_LBA3_MASTER           ; LBA mode, master drive
  sta ST_LBA_3
  rts

; StReadSector — Read one 512-byte sector from CompactFlash
; Input: CF_LBA ($26-$29) = LBA address, CF_BUF_PTR ($24-$25) = destination pointer
; Output: Carry clear = success, Carry set = error
;         CF_BUF_PTR advanced by 512 bytes on success
; Modifies: Flags, A, X, Y
StReadSectorImpl:
  jsr StWaitReady
  bcs @StReadDone
  jsr StSetupLba
  lda #ST_CMD_READ              ; Issue read command
  sta ST_CMD
  jsr StWaitDrq                 ; Wait for data ready
  bcs @StReadDone
  ; Read 512 bytes: 2 pages of 256 bytes
  ldy #$00
  ldx #$02                      ; 2 pages
@StReadPage:
  lda ST_DATA                   ; Read byte from CF
  sta (CF_BUF_PTR),y            ; Store to destination
  iny
  bne @StReadPage               ; Loop for 256 bytes
  inc CF_BUF_PTR + 1            ; Next page
  dex
  bne @StReadPage
  clc                           ; Success
@StReadDone:
  rts

; StWriteSector — Write one 512-byte sector to CompactFlash
; Input: CF_LBA ($26-$29) = LBA address, CF_BUF_PTR ($24-$25) = source pointer
; Output: Carry clear = success, Carry set = error
;         CF_BUF_PTR advanced by 512 bytes on success
; Modifies: Flags, A, X, Y
StWriteSectorImpl:
  jsr StWaitReady
  bcs @StWriteDone
  jsr StSetupLba
  lda #ST_CMD_WRITE             ; Issue write command
  sta ST_CMD
  jsr StWaitDrq                 ; Wait for data request
  bcs @StWriteDone
  ; Write 512 bytes: 2 pages of 256 bytes
  ldy #$00
  ldx #$02                      ; 2 pages
@StWritePage:
  lda (CF_BUF_PTR),y            ; Load from source
  sta ST_DATA                   ; Write byte to CF
  iny
  bne @StWritePage              ; Loop for 256 bytes
  inc CF_BUF_PTR + 1            ; Next page
  dex
  bne @StWritePage
  jsr StWaitReady               ; Wait for write to complete
@StWriteDone:
  rts

; === Simple Custom Filesystem ===
; Directory at LBA 0: 16 entries x 32 bytes = 512 bytes
; Entry format:
;   $00-$07: 8-byte filename (space-padded)
;   $08-$0A: 3-byte extension (space-padded)
;   $0B:     flags (bit 0 = in use)
;   $0C-$0D: start sector (little-endian)
;   $0E-$0F: file size in bytes (little-endian)
;   $10-$1F: reserved (16 bytes)

; FsParseName — Parse null-terminated filename at STR_PTR into FS_FNAME_BUF
; Converts "NAME.EXT" into 8+3 space-padded format
; Input: STR_PTR ($02-$03) points to null-terminated filename
; Output: FS_FNAME_BUF filled with padded 8+3 name
; Modifies: Flags, A, X, Y
; The extension is inert: it is split on the dot, padded into the directory
; fields, and matched by FsFindFile's flat 11-byte compare.  Nothing anywhere
; branches on it, so .PRG / .BAS / .FOO all behave identically — what a file
; means is decided by the command that loads it (LOAD vs BLOAD), never by name.
FsParseName:
  ; Fill FS_FNAME_BUF with spaces
  lda #$20
  ldx #10
@FsParseClr:
  sta FS_FNAME_BUF,x
  dex
  bpl @FsParseClr
  ; Copy name part (up to 8 chars, stop at '.' or null)
  ldy #$00                      ; Source index
  ldx #$00                      ; Dest index (name portion)
@FsParseName:
  lda (STR_PTR),y
  beq @FsParseDone              ; Null terminator — no extension
  cmp #'.'
  beq @FsParseExt               ; Found dot — start extension
  cpx #$08
  bcs @FsParseSkipName          ; Already 8 chars, skip extras
  ; Convert lowercase to uppercase
  cmp #'a'
  bcc @FsStoreNameChar
  cmp #'z' + 1
  bcs @FsStoreNameChar
  and #$DF                      ; Clear bit 5 to uppercase
@FsStoreNameChar:
  sta FS_FNAME_BUF,x
  inx
@FsParseSkipName:
  iny
  bra @FsParseName
@FsParseExt:
  iny                           ; Skip the dot
  ldx #$08                      ; Extension starts at offset 8
@FsParseExtLoop:
  lda (STR_PTR),y
  beq @FsParseDone              ; Null terminator
  cpx #$0B
  bcs @FsParseDone              ; Max 3 ext chars
  ; Convert lowercase to uppercase
  cmp #'a'
  bcc @FsStoreExtChar
  cmp #'z' + 1
  bcs @FsStoreExtChar
  and #$DF
@FsStoreExtChar:
  sta FS_FNAME_BUF,x
  inx
  iny
  bra @FsParseExtLoop
@FsParseDone:
  rts

; FsReadDir — Read directory sector (LBA 0) into FS_SECTOR_BUF
; Output: Carry clear = success, Carry set = error
; Modifies: Flags, A, X, Y, CF_LBA, CF_BUF_PTR
FsReadDir:
  stz CF_LBA                    ; LBA = 0 (directory sector)
  stz CF_LBA + 1
  stz CF_LBA + 2
  stz CF_LBA + 3
  lda #<FS_SECTOR_BUF
  sta CF_BUF_PTR
  lda #>FS_SECTOR_BUF
  sta CF_BUF_PTR + 1
  jmp StReadSector

; FsWriteDir — Write directory sector from FS_SECTOR_BUF to LBA 0
; Output: Carry clear = success, Carry set = error
; Modifies: Flags, A, X, Y, CF_LBA, CF_BUF_PTR
FsWriteDir:
  stz CF_LBA
  stz CF_LBA + 1
  stz CF_LBA + 2
  stz CF_LBA + 3
  lda #<FS_SECTOR_BUF
  sta CF_BUF_PTR
  lda #>FS_SECTOR_BUF
  sta CF_BUF_PTR + 1
  jmp StWriteSector

; FsFindFile — Search directory for filename in FS_FNAME_BUF
; Must call FsReadDir first to load directory into FS_SECTOR_BUF
; Output: Carry clear = found, X = entry index (0-15), CF_BUF_PTR points to entry
;         Carry set = not found
; Modifies: Flags, A, X, Y, CF_BUF_PTR
FsFindFile:
  lda #<FS_SECTOR_BUF
  sta CF_BUF_PTR
  lda #>FS_SECTOR_BUF
  sta CF_BUF_PTR + 1
  ldx #$00                      ; Entry index
@FsFindLoop:
  ; Check if entry is in use
  ldy #FS_ENTRY_FLAGS
  lda (CF_BUF_PTR),y
  and #FS_FLAG_USED
  beq @FsFindNext               ; Skip unused entries
  ; Compare 11-byte filename
  ldy #$00
@FsFindCmp:
  lda (CF_BUF_PTR),y
  cmp FS_FNAME_BUF,y
  bne @FsFindNext               ; Mismatch
  iny
  cpy #11
  bne @FsFindCmp
  ; Match found
  stx FS_DIR_IDX
  clc
  rts
@FsFindNext:
  ; Advance CF_BUF_PTR by 32 (FS_ENTRY_SIZE)
  lda CF_BUF_PTR
  clc
  adc #FS_ENTRY_SIZE
  sta CF_BUF_PTR
  bcc @FsFindNoCarry
  inc CF_BUF_PTR + 1
@FsFindNoCarry:
  inx
  cpx #FS_MAX_FILES
  bne @FsFindLoop
  sec                           ; Not found
  rts

; FsFindFree — Find first free directory entry
; Must call FsReadDir first
; Output: Carry clear = found, X = entry index, CF_BUF_PTR points to entry
;         Carry set = directory full
; Modifies: Flags, A, X, Y, CF_BUF_PTR
FsFindFree:
  lda #<FS_SECTOR_BUF
  sta CF_BUF_PTR
  lda #>FS_SECTOR_BUF
  sta CF_BUF_PTR + 1
  ldx #$00
@FsFreeLoop:
  ldy #FS_ENTRY_FLAGS
  lda (CF_BUF_PTR),y
  and #FS_FLAG_USED
  beq @FsFreeFound              ; Found unused entry
  ; Advance by 32
  lda CF_BUF_PTR
  clc
  adc #FS_ENTRY_SIZE
  sta CF_BUF_PTR
  bcc @FsFreeNoCarry
  inc CF_BUF_PTR + 1
@FsFreeNoCarry:
  inx
  cpx #FS_MAX_FILES
  bne @FsFreeLoop
  sec                           ; Directory full
  rts
@FsFreeFound:
  stx FS_DIR_IDX
  clc
  rts

; FsCalcNextSec — Calculate next free sector by scanning all directory entries
; Must call FsReadDir first
; Output: FS_NEXT_SEC = first free sector after all used files
; Modifies: Flags, A, X, Y
FsCalcNextSec:
  lda #<FS_DATA_START           ; Start with first data sector
  sta FS_NEXT_SEC
  lda #>FS_DATA_START
  sta FS_NEXT_SEC + 1
  ; Scan all entries to find highest used sector + file sector count
  lda #<FS_SECTOR_BUF
  sta CF_BUF_PTR
  lda #>FS_SECTOR_BUF
  sta CF_BUF_PTR + 1
  ldx #$00
@FsCalcLoop:
  ldy #FS_ENTRY_FLAGS
  lda (CF_BUF_PTR),y
  and #FS_FLAG_USED
  beq @FsCalcNext               ; Skip unused
  ; Get start sector + ceil(size/512)
  ldy #FS_ENTRY_START
  lda (CF_BUF_PTR),y
  sta FS_START_SEC
  iny
  lda (CF_BUF_PTR),y
  sta FS_START_SEC + 1
  ; Get file size
  ldy #FS_ENTRY_FSIZE
  lda (CF_BUF_PTR),y
  sta FS_FILE_SIZE
  iny
  lda (CF_BUF_PTR),y
  sta FS_FILE_SIZE + 1
  ; Calculate sectors used = (size + 511) / 512 = (size + 511) >> 9
  ; = (size_hi + 1) if size_lo > 0, else size_hi / 2... simplify:
  ; sectors = (size >> 9) rounded up = high_byte >> 1, plus 1 if any remainder
  lda FS_FILE_SIZE + 1          ; High byte of size
  lsr a                         ; Divide by 2 (each sector = 512 = 2 pages)
  sta FS_SEC_COUNT
  ; Check if there's a remainder (low byte != 0 or high byte bit 0 was set)
  lda FS_FILE_SIZE + 1
  and #$01                      ; Was high byte odd?
  bne @FsCalcRound
  lda FS_FILE_SIZE              ; Low byte non-zero?
  beq @FsCalcNoRound
@FsCalcRound:
  inc FS_SEC_COUNT              ; Round up
@FsCalcNoRound:
  ; End sector = start + sector count.
  ; NOTE: X holds the directory-entry loop counter, so the end sector must
  ; NOT be kept in X (doing so ran the scan off the end of the directory
  ; buffer into program memory, corrupting FS_NEXT_SEC and causing spurious
  ; ?SAVE ERROR after a few files).  Stash it in memory scratch instead:
  ; FS_SEC_COUNT (end low) and FS_DIR_IDX (end high) are both free here.
  lda FS_START_SEC
  clc
  adc FS_SEC_COUNT
  sta FS_SEC_COUNT              ; end sector low (reuse as scratch)
  lda FS_START_SEC + 1
  adc #$00
  sta FS_DIR_IDX               ; end sector high (reuse as scratch)
  ; Compare with FS_NEXT_SEC — keep the larger value
  cmp FS_NEXT_SEC + 1
  bcc @FsCalcNext               ; End high < FS_NEXT_SEC high, skip
  bne @FsCalcUpdate             ; End high > FS_NEXT_SEC high, update
  lda FS_SEC_COUNT
  cmp FS_NEXT_SEC
  bcc @FsCalcNext               ; End low < FS_NEXT_SEC low, skip
@FsCalcUpdate:
  lda FS_SEC_COUNT
  sta FS_NEXT_SEC
  lda FS_DIR_IDX
  sta FS_NEXT_SEC + 1
@FsCalcNext:
  ; Advance CF_BUF_PTR by 32
  lda CF_BUF_PTR
  clc
  adc #FS_ENTRY_SIZE
  sta CF_BUF_PTR
  bcc @FsCalcNoCarry
  inc CF_BUF_PTR + 1
@FsCalcNoCarry:
  inx
  cpx #FS_MAX_FILES
  bne @FsCalcLoop
  rts

; FsDirectory — Print directory listing of all used entries
; Output via Chrout (respects current IO_MODE)
; Modifies: Flags, A, X, Y
FsDirectory:
  jsr FsReadDir                 ; Load directory sector
  bcc @FsDirStart
  rts                           ; Error reading directory
@FsDirStart:
  jsr FsPrintDiskImpl           ; Print "DISK n" header
  lda #<FS_SECTOR_BUF
  sta CF_BUF_PTR
  lda #>FS_SECTOR_BUF
  sta CF_BUF_PTR + 1
  ldx #$00                      ; Entry counter
@FsDirLoop:
  phx
  ldy #FS_ENTRY_FLAGS
  lda (CF_BUF_PTR),y
  and #FS_FLAG_USED
  beq @FsDirNext                ; Skip unused entries
  ; Print filename (8 chars)
  ldy #$00
@FsDirName:
  lda (CF_BUF_PTR),y
  jsr Chrout
  iny
  cpy #$08
  bne @FsDirName
  ; Print dot separator
  lda #'.'
  jsr Chrout
  ; Print extension (3 chars)
@FsDirExt:
  lda (CF_BUF_PTR),y
  jsr Chrout
  iny
  cpy #$0B
  bne @FsDirExt
  ; Print space
  lda #' '
  jsr Chrout
  ; Print file size in decimal
  ldy #FS_ENTRY_FSIZE
  lda (CF_BUF_PTR),y
  sta FS_FILE_SIZE
  iny
  lda (CF_BUF_PTR),y
  sta FS_FILE_SIZE + 1
  jsr FsPrintSize
  ; Print newline
  lda #$0D
  jsr Chrout
  lda #$0A
  jsr Chrout
@FsDirNext:
  ; Advance CF_BUF_PTR by 32
  lda CF_BUF_PTR
  clc
  adc #FS_ENTRY_SIZE
  sta CF_BUF_PTR
  bcc @FsDirNoCarry
  inc CF_BUF_PTR + 1
@FsDirNoCarry:
  plx
  inx
  cpx #FS_MAX_FILES
  bne @FsDirLoop
  rts

; PrintDecU16 — Print an unsigned 16-bit value as decimal (no leading zeros).
; General-purpose console output; used by BASIC (line numbers) and available
; to cartridges.  Shares the FsPrintSize core below.
; Input : A = value low, X = value high
; Modifies: Flags, A, X, Y, FS_FILE_SIZE (consumed), FS_DIR_IDX
PrintDecU16Impl:
  sta FS_FILE_SIZE
  stx FS_FILE_SIZE + 1
  ; fall through to the shared decimal-print core
; FsPrintSize — Print 16-bit value in FS_FILE_SIZE as decimal
; Modifies: Flags, A, X, Y
FsPrintSize:
  ; Convert 16-bit value to decimal digits (up to 5 digits for 0-65535)
  ; Use successive subtraction of powers of 10
  ldx #$00                      ; Digit index / leading zero suppression
  ldy #$00                      ; Power-of-10 table index
@FsPrintSizeLoop:
  lda #'0' - 1                  ; Start character below '0'
  sta FS_DIR_IDX                ; Reuse as digit scratch
@FsPrintSub:
  inc FS_DIR_IDX
  lda FS_FILE_SIZE
  sec
  sbc @FsPow10Lo,y
  pha
  lda FS_FILE_SIZE + 1
  sbc @FsPow10Hi,y
  bcc @FsPrintSizeDig           ; Underflow — done subtracting
  sta FS_FILE_SIZE + 1
  pla
  sta FS_FILE_SIZE
  bra @FsPrintSub
@FsPrintSizeDig:
  pla                           ; Discard underflowed low byte
  lda FS_DIR_IDX
  cmp #'0'
  bne @FsPrintSizeOut           ; Non-zero digit
  cpx #$00
  beq @FsPrintSizeSkip          ; Suppress leading zeros
@FsPrintSizeOut:
  jsr Chrout
  inx                           ; Mark that we've printed a digit
@FsPrintSizeSkip:
  iny
  cpy #$04                      ; 4 powers of 10 (10000, 1000, 100, 10)
  bne @FsPrintSizeLoop
  ; Always print ones digit
  lda FS_FILE_SIZE
  ora #'0'                      ; Low byte is 0-9 at this point
  jsr Chrout
  rts
@FsPow10Lo: .byte <10000, <1000, <100, <10
@FsPow10Hi: .byte >10000, >1000, >100, >10

; FsSetDiskImpl — Select the current CF disk bank
; Input: A = disk number (0-255)
; Modifies: Flags
FsSetDiskImpl:
  sta CF_DISK
  rts

; FsGetDiskImpl — Get the current CF disk bank
; Output: A = current disk number
; Modifies: Flags, A
FsGetDiskImpl:
  lda CF_DISK
  rts

; FsFormatDiskImpl — Zero the current disk's directory sector (erases its file list)
; Output: Carry clear = success, Carry set = write error
; Modifies: Flags, A, X, Y, CF_LBA, CF_BUF_PTR
FsFormatDiskImpl:
  lda #<FS_SECTOR_BUF
  sta CF_BUF_PTR
  lda #>FS_SECTOR_BUF
  sta CF_BUF_PTR + 1
  ldy #$00
  ldx #$02                      ; 2 pages = 512 bytes
  lda #$00
@FsFormatClr:
  sta (CF_BUF_PTR),y
  iny
  bne @FsFormatClr
  inc CF_BUF_PTR + 1
  dex
  bne @FsFormatClr
  jmp FsWriteDir                ; Write zeroed directory sector (returns carry status)

; FsPrintDiskImpl — Print "DISK n" (decimal) + CRLF via Chrout
; Modifies: Flags, A, X, Y, FS_FILE_SIZE, FS_DIR_IDX
FsPrintDiskImpl:
  ldy #$00
@FsPDLbl:
  lda FsDiskLbl,y
  beq @FsPDNum
  jsr Chrout
  iny
  bra @FsPDLbl
@FsPDNum:
  lda CF_DISK
  sta FS_FILE_SIZE
  stz FS_FILE_SIZE + 1
  jsr FsPrintSize               ; Print CF_DISK as decimal (0-255, no leading zeros)
  lda #$0D
  jsr Chrout
  lda #$0A
  jmp Chrout
FsDiskLbl: .byte "DISK ", 0

; FsLoadFileImpl — Load file from CF into PROGRAM_START ($0800)
; Input: STR_PTR ($02-$03) points to null-terminated filename
; Output: Carry clear = success, FS_FILE_SIZE = bytes loaded
;         Carry set = file not found or read error
; Modifies: Flags, A, X, Y, CF_LBA, CF_BUF_PTR
FsLoadFileImpl:
  lda #<PROGRAM_START           ; Default target = PROGRAM_START
  sta FS_IO_ADDR
  lda #>PROGRAM_START
  sta FS_IO_ADDR + 1
; FsLoadFileAddrImpl — Load named file to FS_IO_ADDR (caller preset)
; Input: STR_PTR = filename, FS_IO_ADDR = destination address
FsLoadFileAddrImpl:
  jsr FsOpenFile
  bcs @FsLoadErr
  ; Set destination pointer from FS_IO_ADDR
  lda FS_IO_ADDR
  sta CF_BUF_PTR
  lda FS_IO_ADDR + 1
  sta CF_BUF_PTR + 1
  ; Read sectors
  ldx FS_SEC_COUNT
  beq @FsLoadOk                 ; Zero-size file
@FsLoadSec:
  phx
  jsr StReadSector              ; Read sector (advances CF_BUF_PTR by 512)
  bcs @FsLoadSecErr
  ; Increment LBA
  inc CF_LBA
  bne @FsLoadSecNext
  inc CF_LBA + 1
@FsLoadSecNext:
  plx
  dex
  bne @FsLoadSec
@FsLoadOk:
  clc
  rts
@FsLoadSecErr:
  plx                           ; Balance stack
@FsLoadErr:
  sec
  rts

; VdpLoadFile — Load a named file from the current disk into VRAM
; Streams the file through port A to FS_IO_ADDR, anywhere in the 64 KB, and
; writes exactly its FS_FILE_SIZE bytes: the rest of the last sector is read
; and dropped, so a table loaded here cannot spill into the one after it.
; Input: STR_PTR = filename, FS_IO_ADDR = VRAM address
; Output: Carry clear = loaded, FS_FILE_SIZE = bytes written
;         Carry set = no video card (nothing read), or not found or read error
; Modifies: Flags, A, X, Y, CF_LBA, CF_BUF_PTR, XFER_REMAIN, FS_SECTOR_BUF
VdpLoadFileImpl:
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bmi @VdpLoadFileCard
  sec
  rts
@VdpLoadFileCard:
  jsr FsOpenFile
  bcs @VdpLoadFileDone
  lda FS_FILE_SIZE              ; Bytes still to write
  sta XFER_REMAIN
  lda FS_FILE_SIZE + 1
  sta XFER_REMAIN + 1
  ldx FS_IO_ADDR
  ldy FS_IO_ADDR + 1
  lda #$40                      ; Write
  jsr VdpAddress
@VdpLoadFileSector:
  lda XFER_REMAIN
  ora XFER_REMAIN + 1
  beq @VdpLoadFileOk            ; Written them all: no more sectors to read
  lda #<FS_SECTOR_BUF
  sta CF_BUF_PTR
  lda #>FS_SECTOR_BUF
  sta CF_BUF_PTR + 1
  jsr StReadSector
  bcs @VdpLoadFileDone
  inc CF_LBA
  bne @VdpLoadFileCopy
  inc CF_LBA + 1
@VdpLoadFileCopy:
  dec CF_BUF_PTR + 1            ; StReadSector left it 512 bytes on
  dec CF_BUF_PTR + 1
  ldy #$00
@VdpLoadFileByte:
  lda XFER_REMAIN
  bne @VdpLoadFileCount
  lda XFER_REMAIN + 1
  beq @VdpLoadFileOk            ; The file ends inside this sector
  dec XFER_REMAIN + 1
@VdpLoadFileCount:
  dec XFER_REMAIN
  lda (CF_BUF_PTR),y
  sta VC_DATA
  iny
  bne @VdpLoadFileByte
  inc CF_BUF_PTR + 1            ; The sector's second page
  lda CF_BUF_PTR + 1
  cmp #>(FS_SECTOR_BUF + 512)
  bne @VdpLoadFileByte
  bra @VdpLoadFileSector
@VdpLoadFileOk:
  clc
@VdpLoadFileDone:
  rts

; FsOpenFile — Find a named file and get ready to read it
; Shared by FsLoadFileAddr and VdpLoadFile.
; Input: STR_PTR = filename
; Output: Carry clear = found: FS_FILE_SIZE = its size, FS_SEC_COUNT = the
;         sectors it spans, CF_LBA = its first sector
;         Carry set = not found or read error
; Modifies: Flags, A, X, Y, CF_BUF_PTR, FS_START_SEC
FsOpenFile:
  jsr FsParseName               ; Parse filename into FS_FNAME_BUF
  jsr FsReadDir                 ; Read directory sector
  bcs @FsOpenDone
  jsr FsFindFile                ; Search for filename
  bcs @FsOpenDone               ; Not found
  ; Read file metadata from entry
  ldy #FS_ENTRY_START
  lda (CF_BUF_PTR),y
  sta FS_START_SEC
  iny
  lda (CF_BUF_PTR),y
  sta FS_START_SEC + 1
  ldy #FS_ENTRY_FSIZE
  lda (CF_BUF_PTR),y
  sta FS_FILE_SIZE
  iny
  lda (CF_BUF_PTR),y
  sta FS_FILE_SIZE + 1
  ; Calculate number of sectors to read
  lda FS_FILE_SIZE + 1
  lsr a
  sta FS_SEC_COUNT
  lda FS_FILE_SIZE + 1
  and #$01
  bne @FsLoadRound
  lda FS_FILE_SIZE
  beq @FsLoadNoRound
@FsLoadRound:
  inc FS_SEC_COUNT
@FsLoadNoRound:
  ; Set up LBA starting at file's start sector
  lda FS_START_SEC
  sta CF_LBA
  lda FS_START_SEC + 1
  sta CF_LBA + 1
  stz CF_LBA + 2
  stz CF_LBA + 3
  clc
@FsOpenDone:
  rts

; FsSaveFileImpl — Save data from PROGRAM_START to CF
; Input: STR_PTR ($02-$03) points to null-terminated filename
;        FS_FILE_SIZE ($034A-$034B) = number of bytes to save
; Output: Carry clear = success, Carry set = error (directory full or write error)
; Modifies: Flags, A, X, Y, CF_LBA, CF_BUF_PTR
FsSaveFileImpl:
  lda #<PROGRAM_START           ; Default source = PROGRAM_START
  sta FS_IO_ADDR
  lda #>PROGRAM_START
  sta FS_IO_ADDR + 1
; FsSaveFileAddrImpl — Save FS_FILE_SIZE bytes from FS_IO_ADDR to named file
; Input: STR_PTR = filename, FS_IO_ADDR = source address, FS_FILE_SIZE = byte count
FsSaveFileAddrImpl:
  jsr FsParseName               ; Parse filename into FS_FNAME_BUF
  jsr FsReadDir                 ; Read directory sector
  bcc @FsSaveReadOk
  jmp @FsSaveErr
@FsSaveReadOk:
  ; Try to find existing file with same name
  jsr FsFindFile
  bcc @FsSaveOverwrite
  ; Not found — find a free slot
  jsr FsFindFree
  bcc @FsSaveAlloc
  jmp @FsSaveErr                ; Directory full
@FsSaveOverwrite:
  ; CF_BUF_PTR already points to the existing entry — clear old flags
  ldy #FS_ENTRY_FLAGS
  lda #$00
  sta (CF_BUF_PTR),y            ; Mark old entry as free
  ; Find a free slot (could be the one we just freed or another)
  jsr FsFindFree
  bcc @FsSaveAlloc
  jmp @FsSaveErr
@FsSaveAlloc:
  ; Save CF_BUF_PTR (points to free entry from FsFindFree)
  lda CF_BUF_PTR
  pha
  lda CF_BUF_PTR + 1
  pha
  ; Save FS_FILE_SIZE (FsCalcNextSec clobbers it while scanning entries)
  lda FS_FILE_SIZE
  pha
  lda FS_FILE_SIZE + 1
  pha
  ; Calculate next free sector (clobbers CF_BUF_PTR and FS_FILE_SIZE)
  jsr FsCalcNextSec
  ; Restore FS_FILE_SIZE
  pla
  sta FS_FILE_SIZE + 1
  pla
  sta FS_FILE_SIZE
  ; Restore CF_BUF_PTR to the free directory entry
  pla
  sta CF_BUF_PTR + 1
  pla
  sta CF_BUF_PTR
  ; Calculate sectors needed
  lda FS_FILE_SIZE + 1
  lsr a
  sta FS_SEC_COUNT
  lda FS_FILE_SIZE + 1
  and #$01
  bne @FsSaveRound
  lda FS_FILE_SIZE
  beq @FsSaveNoRound
@FsSaveRound:
  inc FS_SEC_COUNT
@FsSaveNoRound:
  ; Disk-full guard: reject if the file would spill past this disk's region.
  ; end sector = FS_NEXT_SEC + FS_SEC_COUNT must be <= FS_DISK_SECTORS.
  lda FS_NEXT_SEC
  clc
  adc FS_SEC_COUNT
  tay                           ; Y = end sector low
  lda FS_NEXT_SEC + 1
  adc #$00                      ; A = end sector high
  cmp #>FS_DISK_SECTORS
  bcc @FsSaveSpaceOk            ; end high < high(FS_DISK_SECTORS) -> fits
  bne @FsSaveDiskFull           ; end high > high(FS_DISK_SECTORS) -> full
  tya                           ; end high equal: OK only if end low == 0
  beq @FsSaveSpaceOk
@FsSaveDiskFull:
  jmp @FsSaveErr                ; Disk full
@FsSaveSpaceOk:
  ; Fill in directory entry at CF_BUF_PTR
  ; Copy filename (11 bytes)
  ldy #$00
@FsSaveCopyName:
  lda FS_FNAME_BUF,y
  sta (CF_BUF_PTR),y
  iny
  cpy #11
  bne @FsSaveCopyName
  ; Set flags = in use
  lda #FS_FLAG_USED
  sta (CF_BUF_PTR),y            ; Y = 11 = FS_ENTRY_FLAGS
  ; Set start sector
  ldy #FS_ENTRY_START
  lda FS_NEXT_SEC
  sta (CF_BUF_PTR),y
  sta FS_START_SEC
  iny
  lda FS_NEXT_SEC + 1
  sta (CF_BUF_PTR),y
  sta FS_START_SEC + 1
  ; Set file size
  ldy #FS_ENTRY_FSIZE
  lda FS_FILE_SIZE
  sta (CF_BUF_PTR),y
  iny
  lda FS_FILE_SIZE + 1
  sta (CF_BUF_PTR),y
  ; Clear reserved bytes
  ldy #$10
  lda #$00
@FsSaveClearRsv:
  sta (CF_BUF_PTR),y
  iny
  cpy #FS_ENTRY_SIZE
  bne @FsSaveClearRsv
  ; Write updated directory back to CF
  jsr FsWriteDir
  bcs @FsSaveErr
  ; Now write file data sectors
  lda FS_START_SEC
  sta CF_LBA
  lda FS_START_SEC + 1
  sta CF_LBA + 1
  stz CF_LBA + 2
  stz CF_LBA + 3
  ; Source = FS_IO_ADDR
  lda FS_IO_ADDR
  sta CF_BUF_PTR
  lda FS_IO_ADDR + 1
  sta CF_BUF_PTR + 1
  ldx FS_SEC_COUNT
  beq @FsSaveOk                 ; Zero-size file
@FsSaveSec:
  phx
  jsr StWriteSector             ; Write sector (advances CF_BUF_PTR by 512)
  bcs @FsSaveSecErr
  ; Increment LBA
  inc CF_LBA
  bne @FsSaveSecNext
  inc CF_LBA + 1
@FsSaveSecNext:
  plx
  dex
  bne @FsSaveSec
@FsSaveOk:
  clc
  rts
@FsSaveSecErr:
  plx                           ; Balance stack
@FsSaveErr:
  sec
  rts

; FsDeleteFile — Delete a file from the CompactFlash filesystem
; Input: STR_PTR ($02-$03) points to null-terminated filename
; Output: Carry clear = success, Carry set = file not found or error
; Modifies: Flags, A, X, Y, CF_LBA, CF_BUF_PTR
FsDeleteFileImpl:
  jsr FsParseName               ; Parse filename into FS_FNAME_BUF
  jsr FsReadDir                 ; Read directory sector
  bcs @FsDelErr
  jsr FsFindFile                ; Search for filename
  bcs @FsDelErr                 ; Not found
  ; Clear the flags byte to mark entry as unused
  ldy #FS_ENTRY_FLAGS
  lda #$00
  sta (CF_BUF_PTR),y
  ; Write updated directory back to CF
  jsr FsWriteDir
  ; Carry already set/clear from FsWriteDir
  rts
@FsDelErr:
  sec
  rts

; === XModem Serial LOAD/SAVE ===
; Standard XModem protocol over serial (128-byte blocks, checksum)
; Load: receives blocks into memory at caller-supplied XFER_PTR
; Save: sends blocks from memory at caller-supplied XFER_PTR / XFER_REMAIN

; --- Shared XModem Utilities ---

; XModemGetByte — Read one byte from serial with timeout
; Polls SC_STATUS for RDRF directly (bypasses IRQ-driven buffer).
; Caller must disable serial RX IRQ before calling.
; Output: A = byte received, Carry clear = got byte
;         Carry set = timeout
; Preserves: X, Y
XModemGetByte:
  phx
  phy
  ldx #$00                      ; Outer loop: 256 passes
@Outer:
  ldy #$00                      ; Inner loop: 256 polls
@Inner:
  lda SC_STATUS
  and #SC_STATUS_RDRF           ; Received byte waiting?
  bne @Got
  dey
  bne @Inner
  dex
  bne @Outer
  ; Timeout
  ply
  plx
  sec
  rts
@Got:
  lda SC_DATA                   ; Read received byte (clears RDRF)
  ply
  plx
  clc
  rts

; XModemPurge — Drain all pending bytes from input buffer and hardware
; Modifies: A, X
XModemPurge:
  ; Drain software input buffer (bytes captured before IRQ was disabled)
@DrainBuf:
  jsr BufferSize
  beq @DrainHw
  jsr ReadBuffer
  bra @DrainBuf
@DrainHw:
  ; Drain hardware RDRF
  lda SC_STATUS
  and #SC_STATUS_RDRF
  beq @Done
  lda SC_DATA                   ; Read and discard
  bra @DrainHw
@Done:
  rts

; --- XModem Load (Receive) ---

; XModemLoadImpl — Receive data via standard XModem protocol
; Input: XFER_PTR = destination address (set by caller)
; Output: Carry clear = success, XFER_PTR past last byte written
;         XFER_REMAIN = total bytes received
;         Carry set = transfer failed
; Modifies: Flags, A, X, Y
XModemLoadImpl:
  ; Save and switch IO_MODE to serial
  lda IO_MODE
  sta XFER_IO_SAVE
  lda #$01
  sta IO_MODE
  ; Disable serial RX IRQ — XModem polls SC_STATUS directly
  lda #$0B                      ; Bit 1 set = RX IRQ disabled, RTSB low, DTR
  sta SC_CMD
  ; Initialize
  lda #$01
  sta XMODEM_BLK                ; First expected block number
  stz XFER_REMAIN
  stz XFER_REMAIN + 1
  lda #XMODEM_STARTRETRY
  sta XMODEM_RETRY
  ; Print status message so user can start the terminal send
  ldx #0
@PrintMsg:
  lda XModemStrReceive,x
  beq @PrintDone
  jsr Chrout
  inx
  bra @PrintMsg
@PrintDone:
  jsr XModemPurge               ; Drain stale bytes
  ; Send initial NAK to start transfer
  lda #XMODEM_NAK
  jsr SerialChrout
@RecvWait:
  jsr XModemGetByte
  bcs @RecvTimeout
  cmp #XMODEM_SOH
  beq @RecvBlock
  cmp #XMODEM_EOT
  beq @RecvEOT
  cmp #XMODEM_CAN
  beq @RecvFail
  bra @RecvWait                 ; Ignore unknown bytes

@RecvTimeout:
  dec XMODEM_RETRY
  beq @RecvFail
  lda #XMODEM_NAK
  jsr SerialChrout
  bra @RecvWait

@RecvEOT:
  lda #XMODEM_ACK
  jsr SerialChrout
  ; Re-enable serial RX IRQ
  lda #$09
  sta SC_CMD
  lda XFER_IO_SAVE
  sta IO_MODE
  clc                           ; Success
  rts

@RecvFail:
  lda #XMODEM_CAN
  jsr SerialChrout
  lda #XMODEM_CAN
  jsr SerialChrout
  ; Re-enable serial RX IRQ
  lda #$09
  sta SC_CMD
  lda XFER_IO_SAVE
  sta IO_MODE
  sec                           ; Failure
  rts

@RecvBlock:
  ; Reset retry counter on SOH received
  lda #XMODEM_MAXRETRY
  sta XMODEM_RETRY
  ; Read block number
  jsr XModemGetByte
  bcs @RecvNAK
  sta XMODEM_RCVBLK
  ; Read complement
  jsr XModemGetByte
  bcs @RecvNAK
  ; Verify block# + complement = $FF
  clc
  adc XMODEM_RCVBLK
  cmp #$FF
  bne @RecvNAK
  ; Receive 128 data bytes into (XFER_PTR), accumulate checksum
  stz XMODEM_CHK
  ldy #$00
@RecvData:
  jsr XModemGetByte             ; A = byte (X/Y preserved)
  bcs @RecvNAK
  sta (XFER_PTR),y              ; Write to destination at offset Y
  clc
  adc XMODEM_CHK
  sta XMODEM_CHK
  iny
  cpy #XMODEM_BLKSZ
  bne @RecvData
  ; Read and verify checksum
  jsr XModemGetByte
  bcs @RecvNAK
  cmp XMODEM_CHK
  bne @RecvNAK
  ; Verify block number matches expected
  lda XMODEM_RCVBLK
  cmp XMODEM_BLK
  bne @RecvDupChk
  ; Good block — advance pointer by 128
  clc
  lda XFER_PTR
  adc #XMODEM_BLKSZ
  sta XFER_PTR
  lda XFER_PTR + 1
  adc #$00
  sta XFER_PTR + 1
  ; Update total bytes received
  clc
  lda XFER_REMAIN
  adc #XMODEM_BLKSZ
  sta XFER_REMAIN
  lda XFER_REMAIN + 1
  adc #$00
  sta XFER_REMAIN + 1
  ; Increment expected block number (wraps 255→0)
  inc XMODEM_BLK
  ; ACK the block
  lda #XMODEM_ACK
  jsr SerialChrout
  jmp @RecvWait

@RecvDupChk:
  ; Check if this is a retransmit of the previous block (lost ACK)
  lda XMODEM_BLK
  sec
  sbc #$01
  cmp XMODEM_RCVBLK
  bne @RecvNAK                  ; Not a dup — NAK
  ; Duplicate — re-ACK without advancing
  lda #XMODEM_ACK
  jsr SerialChrout
  jmp @RecvWait

@RecvNAK:
  jsr XModemPurge               ; Drain any remaining bytes
  lda #XMODEM_NAK
  jsr SerialChrout
  jmp @RecvWait

; --- XModem Save (Send) ---

; XModemSaveImpl — Send data via standard XModem protocol
; Input: XFER_PTR = source address, XFER_REMAIN = byte count (set by caller)
; Output: Carry clear = success, Carry set = transfer failed
; Modifies: Flags, A, X, Y
XModemSaveImpl:
  ; Save and switch IO_MODE to serial
  lda IO_MODE
  sta XFER_IO_SAVE
  lda #$01
  sta IO_MODE
  ; Disable serial RX IRQ — XModem polls SC_STATUS directly
  lda #$0B                      ; Bit 1 set = RX IRQ disabled, RTSB low, DTR
  sta SC_CMD
  ; Initialize
  lda #$01
  sta XMODEM_BLK                ; First block number
  lda #XMODEM_STARTRETRY
  sta XMODEM_RETRY
  ; Print status message so user can start the terminal receive
  ldx #0
@PrintMsg:
  lda XModemStrSend,x
  beq @PrintDone
  jsr Chrout
  inx
  bra @PrintMsg
@PrintDone:
  jsr XModemPurge               ; Drain stale bytes
  ; Wait for initial NAK (or 'C' for CRC mode) from receiver
@SendWaitNAK:
  jsr XModemGetByte
  bcs @SendInitTO
  cmp #XMODEM_NAK
  beq @SendLoop
  cmp #'C'                      ; CRC mode request — treat as NAK (send checksum packets)
  beq @SendLoop
  cmp #XMODEM_CAN
  bne :+
  jmp @SendFail
: bra @SendWaitNAK

@SendInitTO:
  dec XMODEM_RETRY
  bne :+
  jmp @SendFail
: bra @SendWaitNAK

@SendLoop:
  ; Check if any data remains to send
  lda XFER_REMAIN
  ora XFER_REMAIN + 1
  bne :+
  jmp @SendEOT                  ; All data sent
:
  ; Reset retry counter for this block
  lda #XMODEM_MAXRETRY
  sta XMODEM_RETRY
@SendBlock:
  ; Save XFER_PTR and XFER_REMAIN on stack for retry
  lda XFER_PTR + 1
  pha
  lda XFER_PTR
  pha
  lda XFER_REMAIN + 1
  pha
  lda XFER_REMAIN
  pha
  ; Send header: SOH, block#, ~block#
  lda #XMODEM_SOH
  jsr SerialChrout
  lda XMODEM_BLK
  jsr SerialChrout
  eor #$FF
  jsr SerialChrout
  ; Send 128 data bytes, computing checksum
  stz XMODEM_CHK
  ldy #$00                      ; Y=0 for (XFER_PTR),y indirect addressing
  ldx #XMODEM_BLKSZ             ; X = byte counter (128 down to 0)
@SendData:
  lda XFER_REMAIN
  ora XFER_REMAIN + 1
  beq @SendPad                  ; No more real data — pad remainder
  lda (XFER_PTR),y              ; Read source byte
  jsr SerialChrout              ; Send it (A preserved by SerialChrout)
  clc
  adc XMODEM_CHK
  sta XMODEM_CHK
  ; Advance source pointer
  inc XFER_PTR
  bne @SendNoPg
  inc XFER_PTR + 1
@SendNoPg:
  ; Decrement remaining byte count
  lda XFER_REMAIN
  bne @SendDecLo
  dec XFER_REMAIN + 1
@SendDecLo:
  dec XFER_REMAIN
  dex
  bne @SendData
  bra @SendChk
@SendPad:
  ; Pad remaining block bytes with SUB ($1A)
  lda #XMODEM_SUB
  jsr SerialChrout
  clc
  adc XMODEM_CHK
  sta XMODEM_CHK
  dex
  bne @SendPad
@SendChk:
  ; Send checksum byte
  lda XMODEM_CHK
  jsr SerialChrout
  ; Wait for ACK/NAK response
  jsr XModemGetByte
  bcs @SendRetry                ; Timeout — retry
  cmp #XMODEM_ACK
  beq @SendBlockOK
  cmp #XMODEM_CAN
  beq @SendCancel
  ; NAK or unknown — retry
@SendRetry:
  ; Restore XFER_PTR and XFER_REMAIN from stack
  pla
  sta XFER_REMAIN
  pla
  sta XFER_REMAIN + 1
  pla
  sta XFER_PTR
  pla
  sta XFER_PTR + 1
  dec XMODEM_RETRY
  beq @SendFail
  jmp @SendBlock

@SendBlockOK:
  ; Discard saved state from stack (4 bytes)
  pla
  pla
  pla
  pla
  ; Advance to next block
  inc XMODEM_BLK
  jmp @SendLoop

@SendCancel:
  ; Discard saved state from stack
  pla
  pla
  pla
  pla
@SendFail:
  ; Re-enable serial RX IRQ
  lda #$09
  sta SC_CMD
  lda XFER_IO_SAVE
  sta IO_MODE
  sec                           ; Failure
  rts

@SendEOT:
  ; All data sent — send EOT
  lda #XMODEM_EOT
  jsr SerialChrout
  ; Wait for ACK (best-effort; don't fail if timeout)
  jsr XModemGetByte
  ; Re-enable serial RX IRQ
  lda #$09
  sta SC_CMD
  lda XFER_IO_SAVE
  sta IO_MODE
  clc                           ; Success
  rts

; XModem status strings
XModemStrReceive:
  .byte "XMODEM RX READY", $0D, $0A, 0
XModemStrSend:
  .byte "XMODEM TX READY", $0D, $0A, 0

; NMI Handler
Nmi:
  rti

; BRK Handler — saves full CPU state, reports it, and warm-starts BASIC
; On entry from @IrqBrk: A/X/Y are the user's original values (restored by IRQ handler).
; The CPU's hardware push left P/PCL/PCH on the stack.
; Prints, on the console IO_MODE names:
;   BREAK $nn AT $xxxx
;   A=xx X=xx Y=xx P=xx S=xx
; xxxx is the BRK opcode's address (BRK_PC - 2), nn the byte after it, and S
; the stack pointer before the BRK (BRK_SP + 3).  A video console that a
; program has taken out of the Text console is put back first.  BRK_PTR stays
; hookable; a cartridge with no BASIC at $C000 must point it elsewhere.
Break:
  sta BRK_A                     ; Save user's A register
  stx BRK_X                     ; Save user's X register
  sty BRK_Y                     ; Save user's Y register
  tsx                           ; Get current SP
  stx BRK_SP                   ; Save SP (points below P/PCL/PCH on stack)
  pla                           ; Pull saved P
  sta BRK_P
  pla                           ; Pull saved PCL (PC+2)
  sta BRK_PCL
  pla                           ; Pull saved PCH
  sta BRK_PCH
  ldx #$FF                      ; BasEntry resets the stack anyway, and a BRK
  txs                           ;   reached by running off a full one has no
                                ;   room left to print the report with
  bit HW_PRESENT                ; Video is bit 7 — see VideoClear
  bpl @BreakReport
  lda VID_MODE
  cmp #$01
  beq @BreakReport              ; The Text console is intact
  jsr InitVideoImpl             ; A program moved the card on: bring the
  jsr VideoClearNow             ;   console back to print on
@BreakReport:
  jsr PrintCRLF
  lda #<KMsgBreak               ; "BREAK $"
  ldy #>KMsgBreak
  jsr PrintStr
  lda BRK_PCL                   ; The opcode's address, BRK_PC - 2
  sec
  sbc #2
  sta STR_PTR
  tax
  lda BRK_PCH
  sbc #0
  sta STR_PTR + 1
  pha                           ; Its high byte, then its low byte, for later
  phx
  ldy #1
  lda (STR_PTR),y               ; The byte after the BRK
  jsr KPrintHexByte
  lda #<KMsgAt                  ; " AT $"
  ldy #>KMsgAt
  jsr PrintStr
  pla
  tax
  pla
  jsr KPrintHexByte
  txa
  jsr KPrintHexByte
  jsr PrintCRLF
  ldx #0                        ; A=xx X=xx Y=xx P=xx S=xx
@BreakReg:
  txa
  beq @BreakRegName
  lda #' '
  jsr Chrout
@BreakRegName:
  lda KBreakRegName,x
  jsr Chrout
  lda #'='
  jsr Chrout
  ldy KBreakRegOffset,x
  lda BRK_P,y
  cpx #4                        ; S: the stack pointer before the BRK pushed
  bne @BreakRegHex              ;   PCH, PCL and P
  adc #2                        ; Carry is set: + 3
@BreakRegHex:
  jsr KPrintHexByte
  inx
  cpx #5
  bne @BreakReg
  jsr PrintCRLF
  jmp BasEntry                  ; Warm start: the program is kept
KMsgBreak:
  .byte "BREAK $", 0
KMsgAt:
  .byte " AT $", 0
KBreakRegName:
  .byte "AXYPS"
KBreakRegOffset:                ; From BRK_P
  .byte BRK_A - BRK_P, BRK_X - BRK_P, BRK_Y - BRK_P, 0, BRK_SP - BRK_P

; KPrintHexByte — Print A as two hex digits through Chrout
; Preserves: X, Y
; Modifies: Flags, A
KPrintHexByte:
  pha
  lsr a
  lsr a
  lsr a
  lsr a
  jsr @KHexDigit
  pla
  and #$0F
@KHexDigit:
  cmp #10
  bcc @KHexDec
  adc #6                        ; Carry is set: 'A' - '0' - 10
@KHexDec:
  adc #'0'
  jmp Chrout

; IRQ Handler
Irq:
  pha
  phy
  phx
  tsx                           ; Get stack pointer to check saved status register
  lda $104,x                    ; Load saved P (SP+4: past X, Y, A we pushed)
  and #$10                      ; Test B flag — set by BRK, clear by hardware IRQ
  bne @IrqBrk                   ; Branch if this was a BRK instruction
@IrqSc:
  lda HW_PRESENT
  and #HW_SC
  beq @IrqCheckKB               ; Serial not present — skip
  lda SC_STATUS
  and #SC_STATUS_IRQ            ; Check if serial data caused the interrupt
  beq @IrqCheckKB               ; If not, check keyboard
  lda SC_DATA                   ; Read the data from serial register
  jsr WriteBuffer               ; Store to the input buffer
  jsr BufferSize
  cmp #$F0                      ; Is the buffer almost full?
  bcc @IrqCheckKB               ; If not, also check keyboard
  lda #$01                      ; No parity, no echo, RTSB high, TX interrupts disabled, RX interrupts enabled
  sta SC_CMD                    ; Otherwise, signal not ready for receiving (RTSB high)
                                ; Fall through to check keyboard — always clear VIA flags
@IrqCheckKB:
  lda HW_PRESENT
  and #HW_GPIO
  beq @IrqExit                  ; GPIO not present — skip
  lda GPIO_IFR
  and #GPIO_INT_CB1             ; Check if CB1 (matrix keyboard data ready) caused the interrupt
  beq @IrqCheckPS2              ; If not, check PS/2 keyboard
  lda GPIO_PORTB                ; Read ASCII byte from matrix keyboard (also clears CB1 IFR flag)
  jsr WriteBuffer               ; Store to the input buffer
  bra @IrqExit
@IrqCheckPS2:
  lda GPIO_IFR
  and #GPIO_INT_CA1             ; Check if CA1 (PS/2 keyboard data ready) caused the interrupt
  beq @IrqExit                  ; If not, exit
  lda GPIO_PORTA                ; Read ASCII byte from PS/2 keyboard (also clears CA1 IFR flag)
  jsr WriteBuffer               ; Store to the input buffer
@IrqExit:
  plx
  ply
  pla
  rti
@IrqBrk:
  plx                           ; Restore saved registers
  ply
  pla
  cli                           ; Re-enable interrupts — abandoning interrupt context
  jmp (BRK_PTR)                 ; BRK — dispatch with P/PCL/PCH still on stack

; NMI Vector
NmiVec:
  jmp (NMI_PTR)                 ; Indirect jump through NMI pointer to the NMI handler

; Reset Vector
ResetVec:
  jmp Reset                     ; Initialize the system

; IRQ Vector
IrqVec:
  jmp (IRQ_PTR)                 ; Indirect jump through IRQ pointer to the IRQ handler