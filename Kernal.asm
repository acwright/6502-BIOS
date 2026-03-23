; ***             ***
; ***   KERNAL    ***
; ***             ***

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

  jsr Beep                      ; Play the startup beep
  jsr Splash                    ; Draw the splash screen

  cli                           ; Enable interrupts
  brk                           ; Brk to Wozmon (for now)

; Initialize the Keyboard via VIA (IO 6)
; Configures Port B as input, CB2 low (enable keyboard controller), CB1 falling-edge IRQ
; Modifies: Flags, A
InitKB:
  lda #$00                      ; Port B all inputs (keyboard data bus)
  sta GPIO_DDRB
  lda #(GPIO_PCR_CB2_LO | GPIO_PCR_CB1_NEG) ; CB2 manual output low + CB1 falling edge
  sta GPIO_PCR
  lda #(GPIO_IER_SET | GPIO_INT_CB1)        ; Enable CB1 interrupt
  sta GPIO_IER
  rts
  
; Initialize the Serial Card (6551)
; Modifies: Flags, A
InitSC:
  lda     #$1F                  ; 8-N-1, 19200 baud
  sta     SC_CTRL
  lda     #$09                  ; No parity, no echo, RTSB low, TX interrupts disabled, RX interrupts enabled
  sta     SC_CMD
  rts

; Initialze the Sound Card (6581)
; Modifies: Flags, A, X
InitSID:
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
InitVideo:
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
WriteBuffer:
  ldx WRITE_PTR
  sta INPUT_BUFFER,x
  inc WRITE_PTR
  rts

; Read a character from the INPUT_BUFFER and store it in A register
; Modifies: Flags, X, A
ReadBuffer:
  ldx READ_PTR
  lda INPUT_BUFFER,x
  inc READ_PTR
  rts

; Return in A register the number of unread bytes in the INPUT_BUFFER
; Modifies: Flags, A
BufferSize:  
  lda WRITE_PTR
  sec
  sbc READ_PTR
  rts

; Get a character from the INPUT_BUFFER if available
; On return, carry flag indicates whether a character was available
; If character available the character will be in the A register
; Modifies: Flags, A
Chrin:
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
Chrout:
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
Beep:
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
; Modifies: Flags, A, X, Y
Splash:
  ; Set VRAM write address to center of screen
  ; Name table base = $0000, center position = row 11, col 10
  ; Address = $0000 + (11 * 40) + 6 = $01B8 + $0A = $01C2
  lda #$C2                      ; Low byte of address
  sta VC_REG
  lda #$41                      ; High byte ($01) OR $40 for write mode
  sta VC_REG
  ; Set up string pointer
  lda #<@SplashText
  sta STR_PTR
  lda #>@SplashText
  sta STR_PTR + 1
  ; Write string to VRAM
  ldy #$00
@SplashLoop:
  lda (STR_PTR),y
  beq @SplashDone               ; Exit if null terminator
  sta VC_DATA                   ; Write character to VRAM
  iny
  bne @SplashLoop
@SplashDone:
  rts
@SplashText: .asciiz "-- The 'COB' v1.0 --"

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