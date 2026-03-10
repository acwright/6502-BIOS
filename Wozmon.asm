; ***             ***
; ***   WOZMON    ***
; ***             ***

WOZ_XAML  = $24               ; Last "opened" location Low
WOZ_XAMH  = $25               ; Last "opened" location High
WOZ_STL   = $26               ; Store address Low
WOZ_STH   = $27               ; Store address High
WOZ_L     = $28               ; Hex value parsing Low
WOZ_H     = $29               ; Hex value parsing High
WOZ_YSAV  = $2A               ; Used to see if hex value is given
WOZ_MODE  = $2B               ; $00=XAM, $7F=STOR, $AE=BLOCK XAM
WOZ_IN    = USER_VARS         ; Input buffer

WozMon:
  lda     #$1B                ; Begin with escape

WozNotCr:
  cmp     #$08                ; Backspace key?
  beq     WozBackspace        ; Yes
  cmp     #$1B                ; ESC?
  beq     WozEscape           ; Yes
  iny                         ; Advance text index
  bpl     WozNextchar         ; Auto ESC if line longer than 127

WozEscape:
  lda     #$5C                ; "\"
  jsr     WozEcho             ; Output it

WozGetline:
  lda     #$0D                ; Send CR
  jsr     WozEcho
  lda     #$0A                ; Send LF
  jsr     WozEcho

  ldy     #$01                ; Initialize text index
WozBackspace:      
  dey                         ; Back up text index
  bmi     WozGetline          ; Beyond start of line, reinitialize

WozNextchar:
  jsr     Chrin               ; Get next character
  bcc     WozNextchar         ; No character found
  sta     WOZ_IN,y            ; Add to text buffer
  cmp     #$0D                ; CR?
  bne     WozNotCr            ; No

  ldy     #$FF                ; Reset text index
  lda     #$00                ; For XAM mode
  tax                         ; X=0
WozSetblock:
  asl
WozSetstor:
  asl                         ; Leaves $7B if setting STOR mode
  sta     WOZ_MODE            ; $00 = XAM, $74 = STOR, $B8 = BLOK XAM
WozBlskip:
  iny                         ; Advance text index
WozNextitem:
  lda     WOZ_IN,y            ; Get character
  cmp     #$0D                ; CR?
  beq     WozGetline          ; Yes, done this line
  cmp     #$2E                ; "."?
  bcc     WozBlskip           ; Skip delimiter
  beq     WozSetblock         ; Set BLOCK XAM mode
  cmp     #$3A                ; ":"?
  beq     WozSetstor          ; Yes, set STOR mode
  cmp     #$52                ; "R"?
  beq     WozRun              ; Yes, run user program
  stx     WOZ_L               ; $00 -> L
  stx     WOZ_H               ;    and H
  sty     WOZ_YSAV            ; Save Y for comparison

WozNexthex:
  lda     WOZ_IN,y            ; Get character for hex test
  eor     #$30                ; Map digits to $0-9
  cmp     #$0A                ; Digit?
  bcc     WozDig              ; Yes
  adc     #$88                ; Map letter "A"-"F" to $FA-FF
  cmp     #$FA                ; Hex letter?
  bcc     WozNothex           ; No, character not hex
WozDig:
  asl
  asl                         ; Hex digit to MSD of A
  asl
  asl

  ldx     #$04                ; Shift count
WozHexshift:
  asl                         ; Hex digit left, MSB to carry
  rol     WOZ_L               ; Rotate into LSD
  rol     WOZ_H               ; Rotate into MSD's
  dex                         ; Done 4 shifts?
  bne     WozHexshift         ; No, loop
  iny                         ; Advance text index
  bne     WozNexthex          ; Always taken. Check next character for hex

WozNothex:
  cpy     WOZ_YSAV            ; Check if L, H empty (no hex digits)
  beq     WozEscape           ; Yes, generate ESC sequence

  bit     WOZ_MODE            ; Test MODE byte
  bvc     WozNotstor          ; B6=0 is STOR, 1 is XAM and BLOCK XAM

  lda     WOZ_L               ; LSD's of hex data
  sta     (WOZ_STL,x)         ; Store current 'store index'
  inc     WOZ_STL             ; Increment store index
  bne     WozNextitem         ; Get next item (no carry)
  inc     WOZ_STH             ; Add carry to 'store index' high order
WozTonextitem:     
  jmp     WozNextitem         ; Get next command item

WozRun:
  jsr     WozJump             ; Begin executing at XAM index
  jmp     WozMon              ; After returning we reset
WozJump:
  jmp     (WOZ_XAML)          ; Run at current XAM index

WozNotstor:
  bmi     WozXamnext          ; B7 = 0 for XAM, 1 for BLOCK XAM

  ldx     #$02                ; Byte count
WozSetadr:         
  lda     WOZ_L-1,x           ; Copy hex data to
  sta     WOZ_STL-1,x         ;  'store index'
  sta     WOZ_XAML-1,x        ; And to 'XAM index'
  dex                         ; Next of 2 bytes
  bne     WozSetadr           ; Loop unless X = 0

WozNxtprnt:
  bne     WozPrdata           ; NE means no address to print
  lda     #$0D                ; CR
  jsr     WozEcho             ; Output it
  lda     #$0A                ; LF
  jsr     WozEcho             ; Output it
  lda     WOZ_XAMH            ; 'Examine index' high-order byte
  jsr     WozPrbyte           ; Output it in hex format
  lda     WOZ_XAML            ; Low-order 'examine index' byte
  jsr     WozPrbyte           ; Output it in hex format
  lda     #$3A                ; ":"
  jsr     WozEcho             ; Output it

WozPrdata:
  lda     #$20                ; Blank
  jsr     WozEcho             ; Output it
  lda     (WOZ_XAML,x)        ; Get data byte at 'examine index'
  jsr     WozPrbyte           ; Output it in hex format
WozXamnext:        
  stx     WOZ_MODE            ; 0 -> MODE (XAM mode)
  lda     WOZ_XAML
  cmp     WOZ_L               ; Compare 'examine index' to hex data
  lda     WOZ_XAMH
  sbc     WOZ_H
  bcs     WozTonextitem       ; Not less, so no more data to output

  inc     WOZ_XAML
  bne     WozMod8chk          ; Increment 'examine index'
  inc     WOZ_XAMH

WozMod8chk:
  lda     WOZ_XAML            ; Check low-order 'examine index' byte
  and     #$07                ; For MOD 8 = 0
  bpl     WozNxtprnt          ; Always taken

WozPrbyte:
  pha                         ; Save A for LSD
  lsr
  lsr
  lsr                         ; MSD to LSD position
  lsr
  jsr     WozPrhex            ; Output hex digit
  pla                         ; Restore A

WozPrhex:
  and     #$0F                ; Mask LSD for hex print
  ora     #$30                ; Add "0"
  cmp     #$3A                ; Digit?
  bcc     WozEcho             ; Yes, output it
  adc     #$06                ; Add offset for letter

WozEcho:
  jsr Chrout                  ; Output the character
  rts                         ; Return