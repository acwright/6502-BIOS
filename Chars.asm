; IBM Code Page 437 Character Set
; 6x8 pixel font in 8x8 area, 8 bytes per character (256 characters total)
; Each byte represents one horizontal row of pixels (6 pixels centered in 8-bit space)

CharacterSet:
    ; Character $00 - NULL (blank)
    .byte $00, $00, $00, $00, $00, $00, $00, $00
    ; Character $01 - ☺ (white smiling face)
    .byte $00, $7C, $82, $AA, $82, $BA, $44, $38
    ; Character $02 - ☻ (black smiling face)
    .byte $00, $7C, $FE, $D6, $FE, $C6, $7C, $38
    ; Character $03 - ♥ (heart)
    .byte $00, $00, $6C, $FE, $FE, $7C, $38, $10
    ; Character $04 - ♦ (diamond)
    .byte $00, $10, $38, $7C, $FE, $7C, $38, $10
    ; Character $05 - ♣ (club)
    .byte $00, $38, $7C, $38, $FE, $D6, $10, $38
    ; Character $06 - ♠ (spade)
    .byte $00, $10, $38, $7C, $FE, $7C, $10, $38
    ; Character $07 - • (bullet)
    .byte $00, $00, $00, $38, $38, $00, $00, $00
    ; Character $08 - ◘ (inverse bullet)
    .byte $FE, $FE, $FE, $C6, $C6, $FE, $FE, $FE
    ; Character $09 - ○ (white circle)
    .byte $00, $00, $38, $44, $44, $44, $38, $00
    ; Character $0A - ◙ (inverse white circle)
    .byte $FE, $FE, $C6, $BA, $BA, $BA, $C6, $FE
    ; Character $0B - ♂ (male symbol)
    .byte $00, $78, $30, $68, $5C, $CC, $CC, $78
    ; Character $0C - ♀ (female symbol)
    .byte $00, $78, $CC, $CC, $78, $30, $FC, $30
    ; Character $0D - ♪ (eighth note)
    .byte $00, $70, $60, $60, $60, $E0, $E0, $C0
    ; Character $0E - ♫ (beamed eighth notes)
    .byte $00, $6C, $6C, $6C, $6C, $EC, $EC, $C0
    ; Character $0F - ☼ (sun)
    .byte $00, $92, $54, $38, $EE, $38, $54, $92
    ; Character $10 - ► (right-pointing triangle)
    .byte $00, $00, $40, $60, $78, $60, $40, $00
    ; Character $11 - ◄ (left-pointing triangle)
    .byte $00, $00, $08, $18, $78, $18, $08, $00
    ; Character $12 - ↕ (up/down arrow)
    .byte $00, $10, $38, $54, $10, $54, $38, $10
    ; Character $13 - ‼ (double exclamation mark)
    .byte $00, $00, $48, $48, $48, $00, $48, $00
    ; Character $14 - ¶ (pilcrow)
    .byte $00, $7C, $D4, $D4, $54, $54, $54, $00
    ; Character $15 - § (section sign)
    .byte $00, $38, $40, $30, $48, $30, $08, $70
    ; Character $16 - ▬ (black rectangle)
    .byte $00, $00, $00, $00, $FC, $FC, $00, $00
    ; Character $17 - ↨ (up/down arrow with base)
    .byte $00, $10, $38, $54, $10, $54, $38, $10
    ; Character $18 - ↑ (up arrow)
    .byte $00, $10, $38, $54, $10, $10, $10, $00
    ; Character $19 - ↓ (down arrow)
    .byte $00, $10, $10, $10, $54, $38, $10, $00
    ; Character $1A - → (right arrow)
    .byte $00, $00, $10, $08, $FC, $08, $10, $00
    ; Character $1B - ← (left arrow)
    .byte $00, $00, $10, $20, $FC, $20, $10, $00
    ; Character $1C - ∟ (right angle)
    .byte $00, $00, $00, $40, $40, $40, $FC, $00
    ; Character $1D - ↔ (left/right arrow)
    .byte $00, $00, $28, $10, $FE, $10, $28, $00
    ; Character $1E - ▲ (up-pointing triangle)
    .byte $00, $10, $38, $54, $92, $FE, $00, $00
    ; Character $1F - ▼ (down-pointing triangle)
    .byte $00, $00, $FE, $92, $54, $38, $10, $00
    ; Character $20 - SPACE
    .byte $00, $00, $00, $00, $00, $00, $00, $00
    ; Character $21 - !
    .byte $00, $10, $10, $10, $10, $00, $10, $00
    ; Character $22 - "
    .byte $00, $28, $28, $28, $00, $00, $00, $00
    ; Character $23 - #
    .byte $00, $28, $28, $7C, $28, $7C, $28, $28
    ; Character $24 - $
    .byte $00, $10, $78, $A0, $70, $28, $F0, $10
    ; Character $25 - %
    .byte $00, $C8, $C8, $10, $20, $4C, $4C, $00
    ; Character $26 - &
    .byte $00, $60, $90, $90, $60, $94, $88, $74
    ; Character $27 - '
    .byte $00, $10, $10, $20, $00, $00, $00, $00
    ; Character $28 - (
    .byte $00, $08, $10, $20, $20, $20, $10, $08
    ; Character $29 - )
    .byte $00, $20, $10, $08, $08, $08, $10, $20
    ; Character $2A - *
    .byte $00, $00, $28, $10, $7C, $10, $28, $00
    ; Character $2B - +
    .byte $00, $00, $10, $10, $7C, $10, $10, $00
    ; Character $2C - ,
    .byte $00, $00, $00, $00, $00, $10, $10, $20
    ; Character $2D - -
    .byte $00, $00, $00, $00, $7C, $00, $00, $00
    ; Character $2E - .
    .byte $00, $00, $00, $00, $00, $00, $10, $00
    .byte $00, $04, $08, $10, $20, $40, $80, $00
    ; Character $30 - 0
    .byte $00, $38, $44, $4C, $54, $64, $44, $38
    ; Character $31 - 1
    .byte $00, $10, $30, $10, $10, $10, $10, $38
    ; Character $32 - 2
    .byte $00, $38, $44, $04, $08, $10, $20, $7C
    ; Character $33 - 3
    .byte $00, $38, $44, $04, $18, $04, $44, $38
    ; Character $34 - 4
    .byte $00, $08, $18, $28, $48, $7C, $08, $08
    ; Character $35 - 5
    .byte $00, $7C, $40, $78, $04, $04, $44, $38
    ; Character $36 - 6
    .byte $00, $18, $20, $40, $78, $44, $44, $38
    ; Character $37 - 7
    .byte $00, $7C, $04, $08, $10, $20, $20, $20
    ; Character $38 - 8
    .byte $00, $38, $44, $44, $38, $44, $44, $38
    ; Character $39 - 9
    .byte $00, $38, $44, $44, $3C, $04, $08, $30
    ; Character $3A - :
    .byte $00, $00, $10, $00, $00, $00, $10, $00
    ; Character $3B - ;
    .byte $00, $00, $10, $00, $00, $00, $10, $20
    ; Character $3C - <
    .byte $00, $08, $10, $20, $40, $20, $10, $08
    ; Character $3D - =
    .byte $00, $00, $00, $7C, $00, $7C, $00, $00
    ; Character $3E - >
    .byte $00, $20, $10, $08, $04, $08, $10, $20
    ; Character $3F - ?
    .byte $00, $38, $44, $04, $08, $10, $00, $10
    ; Character $40 - @
    .byte $00, $38, $44, $5C, $54, $5C, $40, $38
    ; Character $41 - A
    .byte $00, $10, $28, $44, $44, $7C, $44, $44
    ; Character $42 - B
    .byte $00, $78, $44, $44, $78, $44, $44, $78
    ; Character $43 - C
    .byte $00, $38, $44, $40, $40, $40, $44, $38
    ; Character $44 - D
    .byte $00, $78, $44, $44, $44, $44, $44, $78
    ; Character $45 - E
    .byte $00, $7C, $40, $40, $78, $40, $40, $7C
    ; Character $46 - F
    .byte $00, $7C, $40, $40, $78, $40, $40, $40
    ; Character $47 - G
    .byte $00, $38, $44, $40, $5C, $44, $44, $3C
    ; Character $48 - H
    .byte $00, $44, $44, $44, $7C, $44, $44, $44
    ; Character $49 - I
    .byte $00, $38, $10, $10, $10, $10, $10, $38
    ; Character $4A - J
    .byte $00, $04, $04, $04, $04, $04, $44, $38
    ; Character $4B - K
    .byte $00, $44, $48, $50, $60, $50, $48, $44
    ; Character $4C - L
    .byte $00, $40, $40, $40, $40, $40, $40, $7C
    ; Character $4D - M
    .byte $00, $44, $6C, $54, $54, $44, $44, $44
    ; Character $4E - N
    .byte $00, $44, $64, $54, $54, $4C, $44, $44
    ; Character $4F - O
    .byte $00, $38, $44, $44, $44, $44, $44, $38
    ; Character $50 - P
    .byte $00, $78, $44, $44, $78, $40, $40, $40
    ; Character $51 - Q
    .byte $00, $38, $44, $44, $44, $54, $48, $34
    ; Character $52 - R
    .byte $00, $78, $44, $44, $78, $50, $48, $44
    ; Character $53 - S
    .byte $00, $38, $44, $40, $38, $04, $44, $38
    ; Character $54 - T
    .byte $00, $7C, $10, $10, $10, $10, $10, $10
    ; Character $55 - U
    .byte $00, $44, $44, $44, $44, $44, $44, $38
    ; Character $56 - V
    .byte $00, $44, $44, $44, $44, $28, $28, $10
    ; Character $57 - W
    .byte $00, $44, $44, $44, $54, $54, $6C, $44
    ; Character $58 - X
    .byte $00, $44, $44, $28, $10, $28, $44, $44
    ; Character $59 - Y
    .byte $00, $44, $44, $28, $10, $10, $10, $10
    ; Character $5A - Z
    .byte $00, $7C, $04, $08, $10, $20, $40, $7C
    ; Character $5B - [
    .byte $00, $38, $20, $20, $20, $20, $20, $38
    ; Character $5C - \
    .byte $00, $00, $40, $20, $10, $08, $04, $00
    ; Character $5D - ]
    .byte $00, $38, $08, $08, $08, $08, $08, $38
    ; Character $5E - ^
    .byte $00, $10, $28, $44, $00, $00, $00, $00
    ; Character $5F - _
    .byte $00, $00, $00, $00, $00, $00, $00, $FC
    ; Character $60 - `
    .byte $00, $20, $10, $08, $00, $00, $00, $00
    .byte $00, $00, $38, $04, $3C, $44, $3C, $00
    ; Character $62 - b
    .byte $00, $40, $40, $78, $44, $44, $44, $78
    ; Character $63 - c
    .byte $00, $00, $38, $44, $40, $40, $44, $38
    ; Character $64 - d
    .byte $00, $04, $04, $3C, $44, $44, $44, $3C
    ; Character $65 - e
    .byte $00, $00, $38, $44, $7C, $40, $44, $38
    ; Character $66 - f
    .byte $00, $18, $20, $20, $78, $20, $20, $20
    ; Character $67 - g
    .byte $00, $00, $3C, $44, $44, $3C, $04, $38
    ; Character $68 - h
    .byte $00, $40, $40, $78, $44, $44, $44, $44
    ; Character $69 - i
    .byte $00, $10, $00, $30, $10, $10, $10, $38
    ; Character $6A - j
    .byte $00, $04, $00, $04, $04, $04, $44, $38
    ; Character $6B - k
    .byte $00, $40, $40, $48, $50, $60, $50, $48
    ; Character $6C - l
    .byte $00, $30, $10, $10, $10, $10, $10, $38
    ; Character $6D - m
    .byte $00, $00, $68, $54, $54, $54, $54, $00
    ; Character $6E - n
    .byte $00, $00, $78, $44, $44, $44, $44, $00
    ; Character $6F - o
    .byte $00, $00, $38, $44, $44, $44, $44, $38
    ; Character $70 - p
    .byte $00, $00, $78, $44, $44, $78, $40, $40
    ; Character $71 - q
    .byte $00, $00, $3C, $44, $44, $3C, $04, $04
    ; Character $72 - r
    .byte $00, $00, $58, $64, $40, $40, $40, $00
    ; Character $73 - s
    .byte $00, $00, $38, $40, $38, $04, $44, $38
    ; Character $74 - t
    .byte $00, $20, $20, $78, $20, $20, $24, $18
    ; Character $75 - u
    .byte $00, $00, $44, $44, $44, $44, $4C, $34
    ; Character $76 - v
    .byte $00, $00, $44, $44, $44, $28, $28, $10
    ; Character $77 - w
    .byte $00, $00, $44, $54, $54, $54, $6C, $00
    ; Character $78 - x
    .byte $00, $00, $44, $28, $10, $28, $44, $00
    ; Character $79 - y
    .byte $00, $00, $44, $44, $44, $3C, $04, $38
    ; Character $7A - z
    .byte $00, $00, $7C, $08, $10, $20, $7C, $00
    ; Character $7B - {
    .byte $00, $18, $20, $20, $40, $20, $20, $18
    ; Character $7C - |
    .byte $00, $10, $10, $10, $10, $10, $10, $10
    ; Character $7D - }
    .byte $00, $30, $08, $08, $04, $08, $08, $30
    ; Character $7E - ~
    .byte $00, $00, $34, $58, $00, $00, $00, $00
    ; Character $7F - ⌂ (house)
    .byte $00, $10, $28, $44, $44, $7C, $44, $00
    ; Character $80 - Ç
    .byte $00, $38, $44, $40, $44, $38, $10, $20
    ; Character $81 - ü
    .byte $00, $28, $00, $44, $44, $44, $3C, $00
    ; Character $82 - é
    .byte $00, $08, $10, $38, $44, $7C, $40, $38
    ; Character $83 - â
    .byte $00, $10, $28, $38, $04, $3C, $44, $3C
    ; Character $84 - ä
    .byte $00, $28, $00, $38, $04, $3C, $44, $3C
    ; Character $85 - à
    .byte $00, $20, $10, $38, $04, $3C, $44, $3C
    ; Character $86 - å
    .byte $00, $10, $28, $38, $04, $3C, $44, $3C
    ; Character $87 - ç
    .byte $00, $00, $38, $44, $40, $38, $10, $20
    ; Character $88 - ê
    .byte $00, $10, $28, $38, $44, $7C, $40, $38
    ; Character $89 - ë
    .byte $00, $28, $00, $38, $44, $7C, $40, $38
    ; Character $8A - è
    .byte $00, $20, $10, $38, $44, $7C, $40, $38
    ; Character $8B - ï
    .byte $00, $28, $00, $30, $10, $10, $10, $38
    ; Character $8C - î
    .byte $00, $10, $28, $00, $30, $10, $10, $38
    ; Character $8D - ì
    .byte $00, $20, $10, $00, $30, $10, $10, $38
    ; Character $8E - Ä
    .byte $00, $28, $10, $28, $44, $7C, $44, $44
    ; Character $8F - Å
    .byte $00, $10, $28, $10, $28, $44, $7C, $44
    ; Character $90 - É
    .byte $00, $08, $10, $7C, $40, $78, $40, $7C
    ; Character $91 - æ
    .byte $00, $00, $6C, $10, $7C, $90, $7C, $00
    ; Character $92 - Æ
    .byte $00, $3C, $50, $90, $FC, $90, $90, $9C
    ; Character $93 - ô
    .byte $00, $10, $28, $00, $38, $44, $44, $38
    ; Character $94 - ö
    .byte $00, $28, $00, $38, $44, $44, $44, $38
    ; Character $95 - ò
    .byte $00, $20, $10, $00, $38, $44, $44, $38
    ; Character $96 - û
    .byte $00, $10, $28, $00, $44, $44, $4C, $34
    ; Character $97 - ù
    .byte $00, $20, $10, $00, $44, $44, $4C, $34
    ; Character $98 - ÿ
    .byte $00, $28, $00, $44, $44, $3C, $04, $38
    ; Character $99 - Ö
    .byte $00, $28, $38, $44, $44, $44, $44, $38
    ; Character $9A - Ü
    .byte $00, $28, $00, $44, $44, $44, $44, $38
    ; Character $9B - ¢
    .byte $00, $10, $38, $50, $50, $38, $10, $00
    ; Character $9C - £
    .byte $00, $18, $24, $20, $78, $20, $20, $7C
    ; Character $9D - ¥
    .byte $00, $44, $28, $10, $7C, $10, $7C, $10
    ; Character $9E - ₧
    .byte $00, $78, $44, $78, $44, $5C, $44, $44
    ; Character $9F - ƒ
    .byte $00, $1C, $20, $18, $20, $20, $A0, $60
    ; Character $A0 - á
    .byte $00, $08, $10, $38, $04, $3C, $44, $3C
    ; Character $A1 - í
    .byte $00, $08, $10, $00, $30, $10, $10, $38
    ; Character $A2 - ó
    .byte $00, $08, $10, $00, $38, $44, $44, $38
    ; Character $A3 - ú
    .byte $00, $08, $10, $00, $44, $44, $4C, $34
    ; Character $A4 - ñ
    .byte $00, $28, $50, $00, $78, $44, $44, $44
    ; Character $A5 - Ñ
    .byte $00, $28, $50, $44, $64, $54, $4C, $44
    ; Character $A6 - ª
    .byte $00, $38, $04, $3C, $44, $3C, $00, $7C
    ; Character $A7 - º
    .byte $00, $38, $44, $44, $44, $38, $00, $7C
    ; Character $A8 - ¿
    .byte $00, $10, $00, $10, $20, $40, $44, $38
    ; Character $A9 - ⌐
    .byte $00, $00, $00, $7C, $40, $40, $40, $00
    ; Character $AA - ¬
    .byte $00, $00, $00, $7C, $04, $04, $04, $00
    ; Character $AB - ½
    .byte $00, $44, $C8, $50, $2C, $58, $9C, $04
    ; Character $AC - ¼
    .byte $00, $44, $C8, $58, $34, $54, $BC, $04
    ; Character $AD - ¡
    .byte $00, $10, $00, $10, $10, $10, $10, $00
    ; Character $AE - «
    .byte $00, $00, $24, $48, $90, $48, $24, $00
    ; Character $AF - »
    .byte $00, $00, $90, $48, $24, $48, $90, $00
    ; Character $B0 - ░ (light shade)
    .byte $44, $11, $44, $11, $44, $11, $44, $11
    ; Character $B1 - ▒ (medium shade)
    .byte $55, $AA, $55, $AA, $55, $AA, $55, $AA
    ; Character $B2 - ▓ (dark shade)
    .byte $BB, $EE, $BB, $EE, $BB, $EE, $BB, $EE
    ; Character $B3 - │ (box drawing vertical)
    .byte $10, $10, $10, $10, $10, $10, $10, $10
    ; Character $B4 - ┤ (box drawing vertical and left)
    .byte $10, $10, $10, $10, $F0, $10, $10, $10
    ; Character $B5 - ╡ (box drawing vertical double and left single)
    .byte $10, $10, $F0, $10, $F0, $10, $10, $10
    ; Character $B6 - ╢ (box drawing down double and left single)
    .byte $28, $28, $28, $28, $E8, $28, $28, $28
    ; Character $B7 - ╖ (box drawing down single and left double)
    .byte $00, $00, $00, $00, $F8, $28, $28, $28
    ; Character $B8 - ╕ (box drawing double vertical and left)
    .byte $00, $00, $F0, $10, $F0, $10, $10, $10
    ; Character $B9 - ╣ (box drawing double vertical and left)
    .byte $28, $28, $E8, $08, $E8, $28, $28, $28
    ; Character $BA - ║ (box drawing double vertical)
    .byte $28, $28, $28, $28, $28, $28, $28, $28
    ; Character $BB - ╗ (box drawing double down and left)
    .byte $00, $00, $F8, $08, $E8, $28, $28, $28
    ; Character $BC - ╝ (box drawing double up and left)
    .byte $28, $28, $E8, $08, $F8, $00, $00, $00
    ; Character $BD - ╜ (box drawing up double and left single)
    .byte $28, $28, $28, $28, $F8, $00, $00, $00
    ; Character $BE - ╛ (box drawing up single and left double)
    .byte $10, $10, $F0, $10, $F0, $00, $00, $00
    ; Character $BF - ┐ (box drawing down and left)
    .byte $00, $00, $00, $00, $F0, $10, $10, $10
    ; Character $C0 - └ (box drawing up and right)
    .byte $10, $10, $10, $10, $1C, $00, $00, $00
    ; Character $C1 - ┴ (box drawing vertical and horizontal)
    .byte $10, $10, $10, $10, $FC, $00, $00, $00
    ; Character $C2 - ┬ (box drawing down and horizontal)
    .byte $00, $00, $00, $00, $FC, $10, $10, $10
    ; Character $C3 - ├ (box drawing vertical and right)
    .byte $10, $10, $10, $10, $1C, $10, $10, $10
    ; Character $C4 - ─ (box drawing horizontal)
    .byte $00, $00, $00, $00, $FC, $00, $00, $00
    ; Character $C5 - ┼ (box drawing vertical and horizontal)
    .byte $10, $10, $10, $10, $FC, $10, $10, $10
    .byte $10, $10, $1C, $10, $1C, $10, $10, $10
    ; Character $C7 - ╟ (box drawing vertical double and right single)
    .byte $28, $28, $28, $28, $2C, $28, $28, $28
    ; Character $C8 - ╚ (box drawing double up and right)
    .byte $28, $28, $2C, $20, $3C, $00, $00, $00
    ; Character $C9 - ╔ (box drawing double down and right)
    .byte $00, $00, $3C, $20, $2C, $28, $28, $28
    ; Character $CA - ╩ (box drawing double up and horizontal)
    .byte $28, $28, $EC, $00, $FC, $00, $00, $00
    ; Character $CB - ╦ (box drawing double down and horizontal)
    .byte $00, $00, $FC, $00, $EC, $28, $28, $28
    ; Character $CC - ╠ (box drawing double vertical and right)
    .byte $28, $28, $2C, $20, $2C, $28, $28, $28
    ; Character $CD - ═ (box drawing double horizontal)
    .byte $00, $00, $FC, $00, $FC, $00, $00, $00
    ; Character $CE - ╬ (box drawing double vertical and horizontal)
    .byte $28, $28, $EC, $00, $EC, $28, $28, $28
    ; Character $CF - ╧ (box drawing up single and horizontal double)
    .byte $10, $10, $FC, $00, $FC, $00, $00, $00
    ; Character $D0 - ╨ (box drawing up double and horizontal single)
    .byte $28, $28, $28, $28, $FC, $00, $00, $00
    ; Character $D1 - ╤ (box drawing down single and horizontal double)
    .byte $00, $00, $FC, $00, $FC, $10, $10, $10
    ; Character $D2 - ╥ (box drawing down double and horizontal single)
    .byte $00, $00, $00, $00, $FC, $28, $28, $28
    ; Character $D3 - ╙ (box drawing up double and right single)
    .byte $28, $28, $28, $28, $3C, $00, $00, $00
    ; Character $D4 - ╘ (box drawing up single and right double)
    .byte $10, $10, $1C, $10, $1C, $00, $00, $00
    ; Character $D5 - ╒ (box drawing down single and right double)
    .byte $00, $00, $1C, $10, $1C, $10, $10, $10
    ; Character $D6 - ╓ (box drawing down double and right single)
    .byte $00, $00, $00, $00, $3C, $28, $28, $28
    ; Character $D7 - ╫ (box drawing vertical double and horizontal single)
    .byte $28, $28, $28, $28, $FC, $28, $28, $28
    ; Character $D8 - ╪ (box drawing vertical single and horizontal double)
    .byte $10, $10, $FC, $10, $FC, $10, $10, $10
    ; Character $D9 - ┘ (box drawing up and left)
    .byte $10, $10, $10, $10, $F0, $00, $00, $00
    ; Character $DA - ┌ (box drawing down and right)
    .byte $00, $00, $00, $00, $1C, $10, $10, $10
    ; Character $DB - █ (full block)
    .byte $FC, $FC, $FC, $FC, $FC, $FC, $FC, $FC
    ; Character $DC - ▄ (lower half block)
    .byte $00, $00, $00, $00, $FC, $FC, $FC, $FC
    ; Character $DD - ▌ (left half block)
    .byte $E0, $E0, $E0, $E0, $E0, $E0, $E0, $E0
    ; Character $DE - ▐ (right half block)
    .byte $1C, $1C, $1C, $1C, $1C, $1C, $1C, $1C
    ; Character $DF - ▀ (upper half block)
    .byte $FC, $FC, $FC, $FC, $00, $00, $00, $00
    ; Character $E0 - α
    .byte $00, $00, $64, $98, $90, $90, $6C, $00
    ; Character $E1 - ß
    .byte $00, $60, $90, $90, $E0, $90, $B0, $80
    ; Character $E2 - Γ
    .byte $00, $7C, $40, $40, $40, $40, $40, $00
    ; Character $E3 - π
    .byte $00, $00, $7C, $44, $44, $44, $44, $00
    ; Character $E4 - Σ
    .byte $00, $7C, $40, $20, $10, $20, $40, $7C
    ; Character $E5 - σ
    .byte $00, $00, $7C, $90, $90, $90, $60, $00
    ; Character $E6 - µ
    .byte $00, $00, $44, $44, $44, $7C, $40, $80
    ; Character $E7 - τ
    .byte $00, $00, $7C, $10, $10, $10, $10, $00
    ; Character $E8 - Φ
    .byte $00, $10, $38, $54, $54, $54, $38, $10
    ; Character $E9 - Θ
    .byte $00, $38, $44, $44, $7C, $44, $44, $38
    ; Character $EA - Ω
    .byte $00, $38, $44, $44, $44, $28, $6C, $00
    ; Character $EB - δ
    .byte $00, $18, $20, $10, $38, $44, $44, $38
    ; Character $EC - ∞
    .byte $00, $00, $6C, $92, $92, $92, $6C, $00
    ; Character $ED - φ
    .byte $00, $04, $38, $54, $54, $54, $38, $40
    ; Character $EE - ε
    .byte $00, $1C, $20, $40, $3C, $40, $20, $1C
    ; Character $EF - ∩
    .byte $00, $38, $44, $44, $44, $44, $44, $00
    ; Character $F0 - ≡
    .byte $00, $00, $7C, $00, $7C, $00, $7C, $00
    ; Character $F1 - ±
    .byte $00, $10, $10, $7C, $10, $10, $00, $7C
    ; Character $F2 - ≥
    .byte $00, $20, $10, $08, $10, $20, $00, $7C
    ; Character $F3 - ≤
    .byte $00, $08, $10, $20, $10, $08, $00, $7C
    ; Character $F4 - ⌠ (top half integral)
    .byte $00, $1C, $10, $10, $10, $10, $10, $10
    ; Character $F5 - ⌡ (bottom half integral)
    .byte $10, $10, $10, $10, $10, $10, $90, $60
    ; Character $F6 - ÷
    .byte $00, $00, $10, $00, $7C, $00, $10, $00
    ; Character $F7 - ≈
    .byte $00, $00, $28, $54, $00, $28, $54, $00
    .byte $00, $38, $44, $44, $38, $00, $00, $00
    ; Character $F9 - ∙
    .byte $00, $00, $00, $10, $10, $00, $00, $00
    ; Character $FA - · (middle dot)
    .byte $00, $00, $00, $00, $10, $00, $00, $00
    ; Character $FB - √
    .byte $00, $0C, $0C, $0C, $4C, $2C, $1C, $0C
    ; Character $FC - ⁿ
    .byte $00, $60, $50, $50, $50, $00, $00, $00
    ; Character $FD - ²
    .byte $00, $60, $10, $20, $40, $70, $00, $00
    ; Character $FE - ■ (black square)
    .byte $00, $00, $38, $38, $38, $38, $00, $00
    ; Character $FF - nbsp (non-breaking space, displayed as blank)
    .byte $00, $00, $00, $00, $00, $00, $00, $00
