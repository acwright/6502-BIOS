; ***             ***
; ***   KERNAL    ***
; ***             ***

; === Kernal Jump Table ($A000-$A0FF) ===
; 85 slots of 3-byte JMP instructions plus 1 padding byte
; Provides stable entry points for external code and cartridges

Chrout:         jmp ChroutDispatch    ; $A000 - Output char (dispatched by IO_MODE)
Chrin:          jmp ChrinImpl         ; $A003 - Input char from buffer
WriteBuffer:    jmp WriteBufferImpl   ; $A006 - Write byte to input buffer
ReadBuffer:     jmp ReadBufferImpl    ; $A009 - Read byte from input buffer
BufferSize:     jmp BufferSizeImpl    ; $A00C - Get buffer count
InitVideo:      jmp InitVideoImpl     ; $A00F - Initialize TMS9918
InitKB:         jmp InitKBImpl        ; $A012 - Initialize GPIO/VIA keyboard
InitSC:         jmp InitSCImpl        ; $A015 - Initialize serial 6551
InitSID:        jmp InitSIDImpl       ; $A018 - Initialize SID
Beep:           jmp BeepImpl          ; $A01B - Play beep tone
VideoClear:     jmp VideoClearImpl    ; $A01E - Clear video screen
VideoPutChar:   jmp VideoPutCharImpl  ; $A021 - Write char at cursor
VideoSetCursor: jmp VideoSetCursorImpl; $A024 - Set cursor (X=col, Y=row)
VideoGetCursor: jmp VideoGetCursorImpl; $A027 - Get cursor position
VideoScroll:    jmp VideoScrollImpl   ; $A02A - Scroll screen up one line
SerialChrout:   jmp SerialChroutImpl  ; $A02D - Direct serial output (bypass IO_MODE)
ReadJoystick1:  jmp UnimplementedStub ; $A030 - Read joystick 1
ReadJoystick2:  jmp UnimplementedStub ; $A033 - Read joystick 2
RtcReadTime:    jmp UnimplementedStub ; $A036 - Read RTC time
RtcReadDate:    jmp UnimplementedStub ; $A039 - Read RTC date
RtcWriteTime:   jmp UnimplementedStub ; $A03C - Set RTC time
RtcWriteDate:   jmp UnimplementedStub ; $A03F - Set RTC date
StReadSector:   jmp UnimplementedStub ; $A042 - Read CF sector
StWriteSector:  jmp UnimplementedStub ; $A045 - Write CF sector
StWaitReady:    jmp UnimplementedStub ; $A048 - Wait CF ready
SetIOMode:      jmp SetIOModeImpl     ; $A04B - Set IO_MODE
GetIOMode:      jmp GetIOModeImpl     ; $A04E - Get IO_MODE

; Reserved entries ($A051-$A0FE)
.repeat 58
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

; === TMS9918 Video Driver ===

; VideoClear — Fill name table (960 bytes at VRAM $0000) with spaces, reset cursor to (0,0)
; Modifies: Flags, A, X, Y
VideoClearImpl:
  ; Set VRAM write address to $0000 (name table base)
  lda #$00
  sta VC_REG
  lda #$40                      ; High byte $00 OR $40 for write mode
  sta VC_REG
  ; Fill 960 bytes with space ($20) — 3 full pages + 192 bytes
  lda #$20
  ldy #$00
  ldx #$03                      ; 3 full pages (768 bytes)
@VideoClearPage:
  sta VC_DATA
  iny
  bne @VideoClearPage
  dex
  bne @VideoClearPage
  ; Remaining 192 bytes (960 - 768)
  ldy #192
@VideoClearRem:
  sta VC_DATA
  dey
  bne @VideoClearRem
  ; Reset cursor to (0,0)
  stz VID_CURSOR_X
  stz VID_CURSOR_Y
  stz VID_CURSOR_ADDR
  stz VID_CURSOR_ADDR + 1
  rts

; VideoSetCursor — Set cursor position
; Input: X = column (0-39), Y = row (0-23)
; Calculates VRAM address = Y * 40 + X and stores in VID_CURSOR_ADDR
; Modifies: Flags, A
VideoSetCursorImpl:
  stx VID_CURSOR_X
  sty VID_CURSOR_Y
  ; Calculate VRAM address = Y * 40 + X
  ; Y * 40 = Y * 32 + Y * 8
  lda #$00
  sta VID_CURSOR_ADDR + 1       ; Clear high byte
  tya                           ; A = row
  ; Multiply by 8: shift left 3
  asl a
  rol VID_CURSOR_ADDR + 1
  asl a
  rol VID_CURSOR_ADDR + 1
  asl a
  rol VID_CURSOR_ADDR + 1
  sta VID_CURSOR_ADDR           ; Store Y*8 low byte
  ; Save Y*8 for later addition
  pha
  lda VID_CURSOR_ADDR + 1
  pha
  ; Multiply original row by 32: shift left 5 total (Y*8 << 2)
  lda VID_CURSOR_ADDR
  asl a
  rol VID_CURSOR_ADDR + 1
  asl a
  rol VID_CURSOR_ADDR + 1
  sta VID_CURSOR_ADDR           ; Now holds Y*32 low byte
  ; Add Y*8 + Y*32
  pla                           ; Restore Y*8 high byte
  adc VID_CURSOR_ADDR + 1       ; Carry still valid from last rol
  sta VID_CURSOR_ADDR + 1
  pla                           ; Restore Y*8 low byte
  clc
  adc VID_CURSOR_ADDR
  sta VID_CURSOR_ADDR
  bcc @NoCarry
  inc VID_CURSOR_ADDR + 1
@NoCarry:
  ; Add X (column)
  txa
  clc
  adc VID_CURSOR_ADDR
  sta VID_CURSOR_ADDR
  bcc @SetCursorDone
  inc VID_CURSOR_ADDR + 1
@SetCursorDone:
  rts

; VideoGetCursor — Get cursor position
; Output: X = column (0-39), Y = row (0-23)
; Modifies: Flags
VideoGetCursorImpl:
  ldx VID_CURSOR_X
  ldy VID_CURSOR_Y
  rts

; VideoPutChar — Write a single character to VRAM at VID_CURSOR_ADDR
; Input: A = character to write
; Modifies: Flags
VideoPutCharImpl:
  pha
  ; Set VRAM write address from VID_CURSOR_ADDR
  lda VID_CURSOR_ADDR
  sta VC_REG                    ; Low byte of address
  lda VID_CURSOR_ADDR + 1
  ora #$40                      ; Set bit 6 for write mode
  sta VC_REG                    ; High byte with write flag
  pla
  sta VC_DATA                   ; Write character to VRAM
  rts

; VideoScroll — Scroll screen up one line
; Copies VRAM rows 1-23 to rows 0-22 (920 bytes), clears row 23 with spaces
; Uses SCROLL_BUF ($0320, 40 bytes) as temporary storage
; Modifies: Flags, A, X, Y
VideoScrollImpl:
  ; Save STR_PTR (may be in use by caller, e.g. VideoPrintStr)
  lda STR_PTR
  pha
  lda STR_PTR + 1
  pha
  ; Source starts at row 1 (VRAM offset 40=$28), dest at row 0 (offset 0)
  ; We process 23 rows, copying each row up by one
  lda #<40                      ; Source address low = 40 (row 1)
  sta STR_PTR
  lda #>40
  sta STR_PTR + 1

  ldx #23                       ; 23 rows to copy
@ScrollRowLoop:
  phx                           ; Save row counter

  ; Set VRAM read address (source row)
  lda STR_PTR
  sta VC_REG
  lda STR_PTR + 1
  sta VC_REG                    ; Bit 6 clear = read mode
  ; Read 40 bytes into SCROLL_BUF
  ldy #$00
@ScrollRead:
  lda VC_DATA
  sta SCROLL_BUF,y
  iny
  cpy #40
  bne @ScrollRead

  ; Set VRAM write address (dest = source - 40)
  lda STR_PTR
  sec
  sbc #40
  sta VC_REG                    ; Dest address low
  lda STR_PTR + 1
  sbc #$00
  ora #$40                      ; Set bit 6 for write mode
  sta VC_REG                    ; Dest address high

  ; Write 40 bytes from SCROLL_BUF
  ldy #$00
@ScrollWrite:
  lda SCROLL_BUF,y
  sta VC_DATA
  iny
  cpy #40
  bne @ScrollWrite

  ; Advance source pointer by 40 for next row
  lda STR_PTR
  clc
  adc #40
  sta STR_PTR
  bcc @ScrollNoCarry
  inc STR_PTR + 1
@ScrollNoCarry:
  plx                           ; Restore row counter
  dex
  bne @ScrollRowLoop

  ; Clear bottom row (row 23) with spaces
  ; Row 23 address = 23 * 40 = 920 = $0398
  lda #$98                      ; Low byte of $0398
  sta VC_REG
  lda #$03
  ora #$40                      ; Write mode
  sta VC_REG
  lda #$20                      ; Space character
  ldy #40
@ScrollClearBottom:
  sta VC_DATA
  dey
  bne @ScrollClearBottom
  ; Restore STR_PTR
  pla
  sta STR_PTR + 1
  pla
  sta STR_PTR
  rts

; VideoChrout — Output character to video display
; Handles control characters: CR ($0D), LF ($0A), BS ($08), BEL ($07)
; Auto-wraps at column 40, auto-scrolls at row 24
; Input: A = character to output
; Preserves: A, X, Y (callers like ChrinImpl, BasPrintStr and Wozmon depend on this)
; Modifies: Flags
VideoChroutImpl:
  pha
  phx
  phy
  cmp #$0D                      ; Carriage Return?
  beq @VideoCR
  cmp #$0A                      ; Line Feed?
  beq @VideoLF
  cmp #$08                      ; Backspace?
  beq @VideoBS
  cmp #$07                      ; Bell?
  beq @VideoBEL
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

; VideoPrintStr — Print null-terminated string to video
; Input: STR_PTR ($02-$03) points to string
; Modifies: Flags, A, X, Y
VideoPrintStrImpl:
  ldy #$00
@VideoPrintStrLoop:
  lda (STR_PTR),y
  beq @VideoPrintStrDone        ; Exit on null terminator
  phy
  jsr VideoChroutImpl           ; Output character via video
  ply
  iny
  bne @VideoPrintStrLoop        ; Max 256 chars per string
@VideoPrintStrDone:
  rts

; Main entry point
Reset:
  cld                           ; Clear decimal mode
  sei                           ; Disable interrupts

  ldx #$ff                      
  txs                           ; Reset the stack pointer

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

  jsr InitBuffer                ; Initialize the input buffer
  jsr InitSC                    ; Initialize the Serial Card (6551)
  jsr InitSID                   ; Initialize the Sound Card (6581)
  jsr InitVideo                 ; Initialize the Video Card (TMS9918)
  jsr InitCharacters            ; Initialize the character set
  jsr InitKB                    ; Initialize the keyboard (VIA)

  lda #$00                      ; Default to video output mode
  sta IO_MODE
  stz VID_CURSOR_X              ; Initialize video cursor state
  stz VID_CURSOR_Y
  stz VID_CURSOR_ADDR
  stz VID_CURSOR_ADDR + 1

  jsr Beep                      ; Play the startup beep
  jsr Splash                    ; Draw the splash screen

  cli                           ; Enable interrupts

  ; Boot menu — wait for keypress
@BootWait:
  jsr BufferSize
  beq @BootWait                 ; Loop until a key is pressed
  jsr ReadBuffer                ; Read the keypress
  cmp #$0D                      ; ENTER?
  beq @BootBASIC
  cmp #$1B                      ; ESC?
  beq @BootMonitor
  bra @BootWait                 ; Ignore other keys
@BootBASIC:
  jsr VideoClear                ; Clear screen before entering BASIC
  jmp BasEntry
@BootMonitor:
  jsr VideoClear                ; Clear screen before entering Monitor
  jmp WozMon

; Initialize the Keyboard via VIA (IO 6)
; Configures Port B as input, CB2 low (enable keyboard controller), CB1 falling-edge IRQ
; Modifies: Flags, A
InitKBImpl:
  lda #$00                      ; Port B all inputs (keyboard data bus)
  sta GPIO_DDRB
  lda #(GPIO_PCR_CB2_LO | GPIO_PCR_CB1_NEG) ; CB2 manual output low + CB1 falling edge
  sta GPIO_PCR
  lda #(GPIO_IER_SET | GPIO_INT_CB1)        ; Enable CB1 interrupt
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

; Initialize the Video Card (TMS9918)
; Modifies: Flags, A, X
InitVideoImpl:
  ldx #$00                      ; Start with register 0
@InitVideoLoop:
  lda @InitVideoRegData,x       ; Load register value
  sta VC_REG                    ; Write data byte
  txa                           
  ora #$80                      ; Set bit 7 to indicate register write
  sta VC_REG                    ; Write register number
  inx
  cpx #$08                      ; Check if all 8 registers written
  bne @InitVideoLoop            ; Continue until done
  rts
@InitVideoRegData:
  .byte $00                     ; R0: Mode control (no external video)
  .byte $D0                     ; R1: 16K, display on, interrupt off, text mode M1
  .byte $00                     ; R2: Name table at $0000 (0x00 * 0x400)
  .byte $00                     ; R3: Color table (not used in text mode)
  .byte $01                     ; R4: Pattern table at $0800 (0x01 * 0x800)
  .byte $00                     ; R5: Sprite attribute table (not used in text mode)
  .byte $00                     ; R6: Sprite pattern table (not used in text mode)
  .byte $F0                     ; R7: White text on black background

; Initialize the character set
; Modifies: Flags, A, X, Y
InitCharacters:
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
  lda #$01                      ; No parity, no echo, RTSB high, TX interrupts disabled, RX interrupts enabled
  sta SC_CMD
  bra @ChrinExit
@ChrinNotFull:
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
@ChroutWait:
  lda SC_STATUS
  and #SC_STATUS_TDRE           ; Check if TX buffer not empty
  beq @ChroutWait               ; Loop if TX buffer not empty
  pla
  rts

; Play a short beep sound
; Modifies: Flags, A, X, Y
BeepImpl:
  lda #$09                      ; Set Attack = 0, Decay = 9 (fast)
  sta SID_V1_AD
  lda #$00                      ; Set Sustain = 0, Release = 0
  sta SID_V1_SR
  lda #$20                      ; Frequency low byte (~8000 Hz / 1000 Hz tone)
  sta SID_V1_FREQ_LO
  lda #$1F                      ; Frequency high byte (for ~1000 Hz)
  sta SID_V1_FREQ_HI
  lda #$11                      ; Triangle wave + Gate on
  sta SID_V1_CTRL
  ; Delay for beep duration
  ldx #$F0                      ; Outer loop counter
@BeepDelay1:
  ldy #$FF                      ; Inner loop counter
@BeepDelay2:
  dey
  bne @BeepDelay2
  dex
  bne @BeepDelay1
  lda #$10                      ; Gate off (stop sound)
  sta SID_V1_CTRL
  rts

; Draw the splash screen
; Uses video output to display centered title and boot menu
; Modifies: Flags, A, X, Y
Splash:
  jsr VideoClear                ; Clear the video screen
  ; Position cursor at row 10, col 10 for title
  ldx #10
  ldy #10
  jsr VideoSetCursor
  lda #<@SplashTitle
  sta STR_PTR
  lda #>@SplashTitle
  sta STR_PTR + 1
  jsr VideoPrintStrImpl
  ; Position cursor at row 12, col 8 for boot menu (centered: (40-24)/2 = 8)
  ldx #8
  ldy #12
  jsr VideoSetCursor
  lda #<@SplashMenu
  sta STR_PTR
  lda #>@SplashMenu
  sta STR_PTR + 1
  jsr VideoPrintStrImpl
  rts
@SplashTitle: .asciiz "-- The 'COB' v1.0 --"
@SplashMenu:  .asciiz "ENTER=BASIC  ESC=MONITOR"

; NMI Handler
Nmi:
  rti

; BRK Handler — default dispatches to WozMon
; On entry the stack holds the processor-pushed state from the BRK:
;   SP+1 = saved P, SP+2 = PCL (PC+2), SP+3 = PCH
; State is saved to BRK_P/BRK_PCL/BRK_PCH for inspection by a custom handler.
Break:
  pla                           ; Pull saved P
  sta BRK_P
  pla                           ; Pull saved PCL (PC+2)
  sta BRK_PCL
  pla                           ; Pull saved PCH
  sta BRK_PCH
  jmp WozMon

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
  lda SC_STATUS
  and #SC_STATUS_IRQ            ; Check if serial data caused the interrupt
  beq @IrqCheckKB               ; If not, check keyboard
  lda SC_DATA                   ; Read the data from serial register
  jsr WriteBuffer               ; Store to the input buffer
  jsr BufferSize
  cmp #$F0                      ; Is the buffer almost full?
  bcc @IrqExit                  ; If not, exit
  lda #$01                      ; No parity, no echo, RTSB high, TX interrupts disabled, RX interrupts enabled
  sta SC_CMD                    ; Otherwise, signal not ready for receiving (RTSB high)
  bra @IrqExit
@IrqCheckKB:
  lda GPIO_IFR
  and #GPIO_INT_CB1             ; Check if CB1 (keyboard data ready) caused the interrupt
  beq @IrqExit                  ; If not, exit
  lda GPIO_PORTB                ; Read ASCII byte from keyboard (also clears CB1 IFR flag)
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