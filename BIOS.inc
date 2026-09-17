; =============================================================================
; BIOS.INC  —  Shared Zero-Page, Memory-Map, and Hardware Register Equates
;               for AC6502 Homebrew Computer
;
;   Role        :  .include'd by BIOS.asm before any segment. Defines the
;                   zero-page layout, stack/buffer addresses, Kernal RAM
;                   variables, and the memory-mapped I/O registers (VIA,
;                   6551 ACIA, 6502-PICOVDP, SID, RTC, CompactFlash) shared by
;                   every segment.
;   Assembler   :  ca65  (cc65 toolchain)
;
;   Coding style :  Match the rest of the BIOS project.
;                   * Constants / equates : UPPER_SNAKE_CASE.
; =============================================================================

; Zero Page
ZP                  := $00
READ_PTR            := $00
WRITE_PTR           := $01
STR_PTR             := $02               ; $02-$03 - String pointer (2 bytes)
; $04-$23 reserved by BASIC interpreter
CF_BUF_PTR          := $24               ; $24-$25 - CF sector data buffer pointer (2 bytes)
CF_LBA              := $26               ; $26-$29 - CF 28-bit LBA address (4 bytes, little-endian)
XFER_PTR            := $2A               ; $2A-$2B - Serial transfer data pointer (2 bytes)
DELAY_CNT           := $2C               ; $2C-$2D - SysDelay 16-bit centisecond counter
; $2E-$35 unassigned

; XModem ZP variables ($36-$39)
XMODEM_BLK          := $36               ; $36     - XModem expected/current block number
XMODEM_CHK          := $37               ; $37     - XModem running checksum
XMODEM_RETRY        := $38               ; $38     - XModem retry counter
XMODEM_RCVBLK       := $39               ; $39     - XModem received block number

; ProgramEnd chain-walk scratch.  Aliases the CF sector pointer / LBA, which are
; idle whenever ProgramEnd runs (BASIC cold init or BASIC entry, never with an
; I/O transfer in flight).
PE_PTR              := CF_BUF_PTR        ; $24-$25 - chain walk cursor
PE_NEXT             := CF_LBA            ; $26-$27 - candidate next-pointer

; NVRAM save-slot copy pointer.  Aliases STR_PTR, which NvRead/NvWrite clobber
; exactly as PrintStr does — the two are never live at the same time.
NV_PTR              := STR_PTR           ; $02-$03 - caller's buffer during a slot copy

; Stack
STACK               := $0100             ; $0100-$01FF

; Input Buffer
INPUT_BUFFER        := $0200             ; $0200-$02FF

; Kernal Vars
KERNAL_VARS         := $0300             ; $0300-$03FF
IRQ_PTR             := $0300             ; $0300-$0301
BRK_PTR             := $0302             ; $0302-$0303
NMI_PTR             := $0304             ; $0304-$0305
IO_MODE             := $0306             ; Bit 0: 0=video, 1=serial output
VID_CURSOR_X        := $0307             ; Video cursor column (0-39)
VID_CURSOR_Y        := $0308             ; Video cursor row (0-23)
VID_CURSOR_ADDR     := $0309             ; Video cursor VRAM address ($0309-$030A)
RTC_BUF_CENT        := $030B             ; Century value from last RtcReadDate / for RtcWriteDate
RTC_TMP             := $030C             ; Scratch byte for BCD conversion
HW_PRESENT          := $030D             ; Hardware present bitmask (set during Reset probe)
; HW_PRESENT bit definitions (bit order matches IO slot numbers)
HW_RAM_L            = %00000001          ; Bit 0: RAM card low  (IO 1, $8000-$83FF)
HW_RAM_H            = %00000010          ; Bit 1: RAM card high (IO 2, $8400-$87FF)
HW_RTC              = %00000100          ; Bit 2: RTC card (IO 3, DS1511Y)
HW_CF               = %00001000          ; Bit 3: Storage card (IO 4, CompactFlash)
HW_SC               = %00010000          ; Bit 4: Serial card (IO 5, R65C51)
HW_GPIO             = %00100000          ; Bit 5: GPIO card (IO 6, 65C22 VIA — keyboard/joysticks)
HW_SID              = %01000000          ; Bit 6: Sound card (IO 7, SID/ARMSID)
HW_VID              = %10000000          ; Bit 7: Video card (IO 8): a PICOVDP with the built-in font
BAS_PENDKEY         := $030E             ; Pending key from BasCheckBreak (1 byte)
CF_DISK             := $030F             ; Current CF "disk" bank (0-255); base LBA = CF_DISK * FS_DISK_SECTORS
BRK_P               := $0310             ; Saved P at time of BRK
BRK_PCL             := $0311             ; Saved PCL at time of BRK (points to BRK+2)
BRK_PCH             := $0312             ; Saved PCH at time of BRK
BRK_A               := $0313             ; Saved A at time of BRK
BRK_X               := $0314             ; Saved X at time of BRK
BRK_Y               := $0315             ; Saved Y at time of BRK
BRK_SP              := $0316             ; Saved SP at time of BRK
XFER_REMAIN         := $0317             ; $0317-$0318 - Remaining bytes to transfer (2 bytes)
XFER_IO_SAVE        := $0319             ; Saved IO_MODE before switching to serial
BAS_DATAPTR         := $031A             ; $031A-$031B - DATA read position (2 bytes)
BAS_STOPLINE        := $031C             ; $031C-$031D - Saved BAS_CURLINE for CONT (2 bytes)
BAS_STOPTXT         := $031E             ; $031E-$031F - Saved BAS_TXTPTR for CONT (2 bytes)
; $0320-$0347 unassigned (1.x's SCROLL_BUF; the console scrolls in hardware)
; Filesystem temp vars ($0348+)
FS_START_SEC        := $0348             ; $0348-$0349 - File start sector (2 bytes)
FS_FILE_SIZE        := $034A             ; $034A-$034B - File size in bytes (2 bytes)
FS_SEC_COUNT        := $034C             ; Number of sectors to read/write
FS_DIR_IDX          := $034D             ; Directory entry index (0-15)
FS_NEXT_SEC         := $034E             ; $034E-$034F - Next free sector for allocation (2 bytes)
FS_FNAME_BUF        := $0350             ; $0350-$035A - 11-byte filename buffer (8 name + 3 ext)
BOOT_VECTOR         := $035B             ; $035B-$035C - Cart/boot redirect vector (2 bytes, 0=normal boot)

; BASIC runtime variables ($035D-$038F) - additive; assignable by BASIC
BAS_TXTTAB          := $035D             ; $035D-$035E - Start of program text (= $0800)
BAS_VARTAB          := $035F             ; $035F-$0360 - End-of-program / start-of-vars pointer
BAS_ARYTAB          := $0361             ; $0361-$0362 - Start of arrays
BAS_STREND          := $0363             ; $0363-$0364 - End of arrays
BAS_FRETOP          := $0365             ; $0365-$0366 - Top-of-string-heap pointer
BAS_MEMSIZ          := $0367             ; $0367-$0368 - End of usable memory (= $8000)
BAS_CURLIN          := $0369             ; $0369-$036A - Currently executing line ($FFFF=direct mode)
BAS_OLDLIN          := $036B             ; $036B-$036C - Saved line for CONT
BAS_OLDTEXT         := $036D             ; $036D-$036E - Saved text ptr for CONT
BAS_WARM            := $036F             ; Warm-start magic ($A5 = previously initialised)
BAS_POSX            := $0370             ; PRINT column counter (0-39 video / 0-79 serial)
BAS_INPSAV          := $0371             ; $0371-$0372 - Saved TXTPTR across INPUT REDO retry
BAS_FNPTR           := $0373             ; $0373-$0374 - FN variable slot addr held across FnCall's expression evaluations (out of ZP so FrmEvl/Garbag cannot touch it)
BAS_STKBASE         := $0375             ; Stack pointer the READY loop restores before each direct-mode line: $FF with no
                                         ;   program suspended, or the running program's statement-boundary SP after a
                                         ;   STOP/END/Ctrl+C break, which is what keeps its FOR and GOSUB frames alive
                                         ;   for CONT.  Reset to $FF wherever the stack is reset (RUN, CLR, NEW, an error)
FS_IO_ADDR          := $037F             ; $037F-$0380 - Load/save target address for FsLoadFileAddr/FsSaveFileAddr
BAS_FNAME           := $0381             ; $0381-$038D - 13-byte scratch for null-terminated 8.3 filename (12-char "NAME.EXT" + null)
PRG_IMAGE_END       := $038E             ; $038E-$038F - End address of a program image placed at PROGRAM_START by a loader
                                         ;   outside BASIC; 0 = none.  Cleared by KernalInit and consumed by
                                         ;   ProgramEnd, so a stale value can never be mistaken for a fresh load.

; Kernal NVRAM save-slot variables ($0390-$03FF)
NV_ID               := $0390             ; Owner ID input for NvWrite ($00 is refused — that is NvErase)

; Kernal video variables ($0391-$039B)
VID_PEN             := $0391             ; Attribute byte for new output, fg<<4 | bg ($1F from KernalInit)
VID_TOP             := $0392             ; Name-table row shown at the top of the screen (0-23); L0SCRY = VID_TOP * 8
VID_MODE            := $0393             ; $00 = console not set up since KernalInit (card in the legacy submode);
                                         ;   $01 = text console intact.  Otherwise low nibble = the VMODE the Kernal
                                         ;   last set, b7 = disturbed (sprites, scroll, layers)
VDP_FW              := $0394             ; STAT5 (firmware version, BCD) at boot; $00 if no PICOVDP
VDP_CAPS            := $0395             ; STAT6 (capability bits) at boot; $00 if no PICOVDP
VDP_L0CTRL_SHADOW   := $0396             ; Shadow of the write-only L0CTRL register
VDP_L1CTRL_SHADOW   := $0397             ; Shadow of the write-only L1CTRL register
VDP_P0              := $0398             ; Parameter block for VDP entries that take more than A/X/Y
VDP_P1              := $0399
VDP_P2              := $039A
VDP_P3              := $039B

FS_SECTOR_BUF       := $0600             ; $0600-$07FF - 512-byte sector buffer (overlaps BAS_TOKBUF/BAS_STRBUF)

; XModem Protocol Constants
XMODEM_SOH          = $01                ; Start of Header
XMODEM_EOT          = $04                ; End of Transmission
XMODEM_ACK          = $06                ; Acknowledge
XMODEM_NAK          = $15                ; Negative Acknowledge
XMODEM_CAN          = $18                ; Cancel
XMODEM_SUB          = $1A                ; Padding byte (end of last block)
XMODEM_BLKSZ        = 128                ; Data bytes per block
XMODEM_MAXRETRY     = 10                 ; Max retries per block during transfer
XMODEM_STARTRETRY   = 60                 ; Retries waiting for initial connect (~60s)

; BIOS Version
BIOS_VERSION_MAJOR  = 2
BIOS_VERSION_MINOR  = 0

; NOT user memory, despite the name -- kept only because Wozmon builds its input
; buffer on it.  Every byte of $0400-$07FF belongs to something: $0400 is
; BAS_LINBUF (the raw input line), $0500 is BAS_TOKBUF (tokenizing scratch), and
; $0600-$07FF is FS_SECTOR_BUF, which any filesystem call overwrites.  A program
; wanting scratch space has $003A-$00FF in zero page and everything above itself
; up to MEMORY_TOP.
USER_VARS           := $0400             ; $0400-$07FF - see above; Wozmon's input buffer

; Program
PROGRAM_START       := $0800             ; $0800-$7FFF
MEMORY_TOP          := $8000             ; First address past usable RAM (I/O starts here)

; RAM Card | IO 1 | $8000-$83FF 
RAM_DATA_L          := $8000             ; R/W ($8000-$83FE)
RAM_BANK_L          := $83FF             ; Write-only RAM bank latch, value ($00-$FF) sets which of 256 ~1K banks of RAM is selected

; RAM Card | IO 2 | $8400-$87FF 
RAM_DATA_H          := $8400             ; R/W ($8400-$87FE)
RAM_BANK_H          := $87FF             ; Write-only RAM bank latch, value ($00-$FF) sets which of 256 ~1K banks of RAM is selected

; RTC Card (DS1511Y) | IO 3 | $8800-$881F
RTC_SEC             := $8800
RTC_MIN             := $8801
RTC_HR              := $8802
RTC_DAY             := $8803
RTC_DATE            := $8804
RTC_MON             := $8805
RTC_YR              := $8806
RTC_CENT            := $8807
RTC_ALARM_SEC       := $8808
RTC_ALARM_MIN       := $8809
RTC_ALARM_HR        := $880A
RTC_ALARM_DATE      := $880B
RTC_WD_L            := $880C
RTC_WD_H            := $880D
RTC_CTRL_A          := $880E
RTC_CTRL_B          := $880F
RTC_RAM_ADDR        := $8810
RTC_RAM_DATA        := $8813
; DS1511Y Control Register B Bits
RTC_CTRL_B_TE       := %10000000         ; Transfer Enable — 1 = counters update the user registers once a second, 0 = inhibited
RTC_CTRL_B_BME      := %00100000         ; Burst Mode Enable — 1 = RTC_RAM_ADDR auto-increments on each access of RTC_RAM_DATA
; DS1511Y Month Register (05H) — upper 3 bits are control bits, low 5 are month
RTC_MON_MASK        := %00011111         ; Month value occupies the low 5 bits
RTC_MON_EOSC        := %10000000         ; Oscillator Start/Stop (0 = oscillator running)
RTC_MON_E32K        := %01000000         ; 32kHz square-wave enable (1 = SQW output disabled)
RTC_MON_BB32        := %00100000         ; Battery-backup 32kHz SQW enable (1 = enabled in backup)
; NVRAM save slots — slot n occupies NVRAM n*16 .. n*16+15:
;   +0 owner ID ($00 = free), +1 checksum, +2..+15 payload
; Checksum: ck = NV_CK_SEED, then ck = rol8(ck) EOR b for the ID and the 14 payload bytes
NV_SLOTS            = 16                 ; Save slots in RTC NVRAM
NV_SLOT_SIZE        = 16                 ; Bytes per slot (slot n at NVRAM n*16)
NV_SLOT_DATA        = 14                 ; Payload bytes per slot
NV_CK_SEED          = $A6                ; Checksum seed
NV_EMPTY            = 0                  ; NvStat: slot is free
NV_VALID            = 1                  ; NvStat: owner ID set, checksum agrees
NV_BAD              = 2                  ; NvStat: owner ID set, checksum does not

; Storage Card (CompactFlash 8-bit IDE) | IO 4 | $8C00-$8C07
ST_DATA             := $8C00             ; R/W
ST_ERROR            := $8C01             ; Read
ST_FEATURE          := $8C01             ; Write
ST_SECT_CNT         := $8C02             ; R/W
ST_LBA_0            := $8C03             ; R/W
ST_LBA_1            := $8C04             ; R/W
ST_LBA_2            := $8C05             ; R/W
ST_LBA_3            := $8C06             ; R/W
ST_STATUS           := $8C07             ; Read
ST_CMD              := $8C07             ; Write
ST_ERR_AMNF         := %00000001
ST_ERR_ABRT         := %00000100
ST_ERR_IDNF         := %00010000
ST_ERR_UNC          := %01000000
ST_ERR_BBK          := %10000000
ST_STATUS_ERR       := %00000001
ST_STATUS_IDX       := %00000010
ST_STATUS_CORR      := %00000100
ST_STATUS_DRQ       := %00001000
ST_STATUS_DSC       := %00010000
ST_STATUS_DWF       := %00100000
ST_STATUS_RDY       := %01000000
ST_STATUS_BSY       := %10000000
; ATA Command Constants
ST_CMD_READ         := $20               ; Read Sectors
ST_CMD_WRITE        := $30               ; Write Sectors
ST_CMD_SET_FEAT     := $EF               ; Set Features
ST_FEAT_8BIT        := $01               ; Enable 8-bit data I/O
ST_LBA3_MASTER      := $E0               ; LBA mode, master drive (bits 7-5 = 111, bit 4 = 0)
; Filesystem Constants
FS_DIR_LBA          = 0                  ; Directory sector at LBA 0
FS_DATA_START       = 1                  ; Data sectors start at LBA 1
FS_MAX_FILES        = 16                 ; Max directory entries
FS_ENTRY_SIZE       = 32                 ; Bytes per directory entry
FS_ENTRY_FLAGS      = 11                 ; Offset of flags byte within entry
FS_ENTRY_START      = 12                 ; Offset of start sector (2 bytes)
FS_ENTRY_FSIZE      = 14                 ; Offset of file size (2 bytes)
FS_FLAG_USED        = %00000001          ; Entry in use
FS_DISK_SECTORS     = 2048               ; Sectors per disk bank (2048 * 512 = 1 MB); 256 disks = 256 MB

; Serial Card / Serial Card Pro (R65C51) | IO 5 | $9000-$9003
SC_DATA             := $9000             ; R/W
SC_RESET            := $9001             ; Write
SC_STATUS           := $9001             ; Read
SC_CMD              := $9002             ; R/W
SC_CTRL             := $9003             ; R/W
SC_STATUS_IRQ       := %10000000         ; Interrupt
SC_STATUS_DSR       := %01000000         ; Data Set Ready
SC_STATUS_DCD       := %00100000         ; Data Carrier Detect
SC_STATUS_TDRE      := %00010000         ; TX Data Register Empty
SC_STATUS_RDRF      := %00001000         ; RX Data Register Full
SC_STATUS_OVR       := %00000100         ; Overrun
SC_STATUS_FRME      := %00000010         ; Framing Error
SC_STATUS_PARE      := %00000001         ; Parity Error
SC_CMD_RXIRQ_OFF    := %00000010         ; Receiver interrupt disabled

; GPIO Card / Input Board (65C22) | IO 6 | $9400-$940F
GPIO_PORTB          := $9400
GPIO_PORTA          := $9401
GPIO_DDRB           := $9402
GPIO_DDRA           := $9403
GPIO_T1CL           := $9404
GPIO_T1CH           := $9405
GPIO_T1LL           := $9406
GPIO_T1LH           := $9407
GPIO_T2CL           := $9408
GPIO_T2CH           := $9409
GPIO_SR             := $940A
GPIO_ACR            := $940B
GPIO_PCR            := $940C
GPIO_IFR            := $940D
GPIO_IER            := $940E
GPIO_ORA            := $940F
; Keyboard (VIA) Constants
GPIO_PCR_CB2_LO     := %11000000         ; PCR CB2 mode = manual output low (enables matrix keyboard encoder)
GPIO_PCR_CB2_HI     := %11100000         ; PCR CB2 mode = manual output high (disables matrix keyboard encoder)
GPIO_PCR_CB1_NEG    := %00000000         ; PCR CB1 active on falling (high-to-low) edge
GPIO_PCR_CA2_LO     := %00001100         ; PCR CA2 mode = manual output low (enables PS/2 keyboard encoder)
GPIO_PCR_CA2_HI     := %00001110         ; PCR CA2 mode = manual output high (disables PS/2 keyboard encoder)
GPIO_PCR_CA1_NEG    := %00000000         ; PCR CA1 active on falling (high-to-low) edge
GPIO_INT_CB1        := %00010000         ; IFR/IER bit 4 = CB1 interrupt flag/enable
GPIO_INT_CA1        := %00000010         ; IFR/IER bit 1 = CA1 interrupt flag/enable
GPIO_IER_SET        := %10000000         ; IER bit 7 = set mode (1=set named bits, 0=clear)

; Sound Card (SID/ARMSID) | IO 7 | $9800-$981C
SID_V1_FREQ_LO      := $9800             ; Voice 1 Frequency Low
SID_V1_FREQ_HI      := $9801             ; Voice 1 Frequency High
SID_V1_PW_LO        := $9802             ; Voice 1 Pulse Width Low
SID_V1_PW_HI        := $9803             ; Voice 1 Pulse Width High
SID_V1_CTRL         := $9804             ; Voice 1 Control Register
SID_V1_AD           := $9805             ; Voice 1 Attack/Decay
SID_V1_SR           := $9806             ; Voice 1 Sustain/Release
SID_V2_FREQ_LO      := $9807             ; Voice 2 Frequency Low
SID_V2_FREQ_HI      := $9808             ; Voice 2 Frequency High
SID_V2_PW_LO        := $9809             ; Voice 2 Pulse Width Low
SID_V2_PW_HI        := $980A             ; Voice 2 Pulse Width High
SID_V2_CTRL         := $980B             ; Voice 2 Control Register
SID_V2_AD           := $980C             ; Voice 2 Attack/Decay
SID_V2_SR           := $980D             ; Voice 2 Sustain/Release
SID_V3_FREQ_LO      := $980E             ; Voice 3 Frequency Low
SID_V3_FREQ_HI      := $980F             ; Voice 3 Frequency High
SID_V3_PW_LO        := $9810             ; Voice 3 Pulse Width Low
SID_V3_PW_HI        := $9811             ; Voice 3 Pulse Width High
SID_V3_CTRL         := $9812             ; Voice 3 Control Register
SID_V3_AD           := $9813             ; Voice 3 Attack/Decay
SID_V3_SR           := $9814             ; Voice 3 Sustain/Release
SID_FC_LO           := $9815             ; Filter Cutoff Low
SID_FC_HI           := $9816             ; Filter Cutoff High
SID_RES_FILT        := $9817             ; Resonance/Filter
SID_MODE_VOL        := $9818             ; Filter Mode/Volume
SID_PADDLE_X        := $9819             ; Paddle X (Read-only)
SID_PADDLE_Y        := $981A             ; Paddle Y (Read-only)
SID_OSC3            := $981B             ; Oscillator 3 (Read-only)
SID_ENV3            := $981C             ; Envelope 3 (Read-only)
; SID Control Register Bits
SID_CTRL_GATE       := %00000001         ; Gate bit
SID_CTRL_SYNC       := %00000010         ; Sync bit
SID_CTRL_RING       := %00000100         ; Ring modulation
SID_CTRL_TEST       := %00001000         ; Test bit
SID_CTRL_TRIANGLE   := %00010000         ; Triangle waveform
SID_CTRL_SAWTOOTH   := %00100000         ; Sawtooth waveform
SID_CTRL_PULSE      := %01000000         ; Pulse waveform
SID_CTRL_NOISE      := %10000000         ; Noise waveform
; SID Filter Mode Bits
SID_FILT_LP         := %00010000         ; Low-pass filter
SID_FILT_BP         := %00100000         ; Band-pass filter
SID_FILT_HP         := %01000000         ; High-pass filter
SID_FILT_3OFF       := %10000000         ; Voice 3 off

; Video Card (6502-PICOVDP) | IO 8 | $9C00-$9C03
; Two complete port pairs.  The Kernal uses port A only; port B is for interrupt
; handlers (SPEC §4).  A register write is two writes to a command port: the
; value, then the register number with bit 7 set.
VC_DATA             := $9C00             ; R/W  VRAM data, port A
VC_REG              := $9C01             ; Write  command, port A
VC_STATUS           := $9C01             ; Read  status (STATSEL_A selects which), port A
VC_DATA2            := $9C02             ; R/W  VRAM data, port B
VC_REG2             := $9C03             ; Write  command, port B
VC_STATUS2          := $9C03             ; Read  status (STATSEL_B selects which), port B
VDP_ID              = $AC                ; STAT4, the identification byte
; Registers (SPEC §5).  All write-only.
VDP_MODE0           = $00                ; b1 M3
VDP_MODE1           = $01                ; b6 display enable, b5 vblank IRQ enable, b4 M1, b3 M2, b1 sprite size, b0 magnify
                                         ; $02-$06 are legacy aliases of L0NAME, L0ATTR, L0PAT, SPRATTR, SPRPAT
VDP_COLOR           = $07                ; b7:4 default foreground, b3:0 backdrop/border
VDP_VBANK           = $08                ; VRAM address bits 15:14, sampled by an address command
VDP_VINC            = $09                ; VRAM pointer stride, signed (the Kernal assumes +1)
VDP_IRQEN           = $0A                ; b0 vblank, b1 scanline, b2 sprite overflow, b3 collision
VDP_IRQLINE         = $0B                ; Scanline compare value
VDP_PALBASE         = $0C                ; Palette base, x $400 ($3F = $FC00)
VDP_VMODE           = $0D                ; $0 legacy submode, $1 Text, $2 Compact, $3 Graphics, $4 Full
VDP_STATSEL_B       = $0E                ; Status register port B returns
VDP_STATSEL_A       = $0F                ; Status register port A returns
VDP_L0NAME          = $10                ; Layer 0 name table base, x $400
VDP_L0ATTR          = $11                ; Layer 0 attribute table base, x $400
VDP_L0PAT           = $12                ; Layer 0 pattern table base, x $800
VDP_L0SCRX          = $13                ; Layer 0 horizontal scroll, pixels (bit 8 = L0CTRL b6)
VDP_L0SCRY          = $14                ; Layer 0 vertical scroll, pixels
VDP_L0CTRL          = $15                ; b1:0 depth, b3:2 attribute source, b4 enable, b5 index 0 opaque, b6 X bit 8
VDP_L0PAL           = $16                ; Layer 0 palette group high bits
VDP_L1NAME          = $18                ; Layer 1 name table base, x $400
VDP_L1ATTR          = $19                ; Layer 1 attribute table base, x $400
VDP_L1PAT           = $1A                ; Layer 1 pattern table base, x $800
VDP_L1SCRX          = $1B                ; Layer 1 horizontal scroll, pixels (bit 8 = L1CTRL b6)
VDP_L1SCRY          = $1C                ; Layer 1 vertical scroll, pixels
VDP_L1CTRL          = $1D                ; As VDP_L0CTRL
VDP_L1PAL           = $1E                ; Layer 1 palette group high bits
VDP_SPRATTR         = $20                ; Sprite attribute table base, x $80
VDP_SPRPAT          = $21                ; Sprite pattern table base, x $800
VDP_SPRCOUNT        = $22                ; Active sprite slots, 0-64
VDP_SPRCTRL         = $23                ; b0 enable, b1 collision, b2 $D0 terminates, b3 detailed collision, b5:4 depth
VDP_SPRLIMIT        = $24                ; Sprites drawn per scanline, 1-32
VDP_SPRPAL          = $25                ; Sprite palette group high bits
VDP_FONT            = $30                ; Load a built-in font: b7 layer (0 = L0PAT), b6:0 font ID. Every write is a command
; FONT values (SPEC §7)
VDP_FONT_CP437      = $00                ; Font $00: CP437 6x8, 2,048 bytes; reset puts it at $0800
; STAT6 capability bits (SPEC §6)
VDP_CAP_LAYERS      = %00000001          ; Two layers
VDP_CAP_8BPP        = %00000010          ; 8bpp layer
VDP_CAP_FLIP        = %00000100          ; Sprite flip
VDP_CAP_SCROLL      = %00001000          ; Hardware scroll
VDP_CAP_SCANIRQ     = %00010000          ; Scanline IRQ
VDP_CAP_64K         = %00100000          ; 64 KB VRAM
VDP_CAP_FONT        = %10000000          ; Built-in font: FONT and font $00 (the Kernal requires it)
