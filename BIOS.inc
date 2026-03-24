; ***                     ***
; ***   6502 INCLUDES     ***
; ***                     ***

; Zero Page
ZP                  := $00
READ_PTR            := $00
WRITE_PTR           := $01
STR_PTR             := $02               ; $02-$03 - String pointer (2 bytes)

; Stack
STACK               := $0100             ; $0100-$01FF

; Input Buffer
INPUT_BUFFER        := $0200             ; $0200-$02FF

; Kernal Vars
KERNAL_VARS         := $0300             ; $0300-$03FF
IRQ_PTR             := $0300             ; $0300-$0301
BRK_PTR             := $0302             ; $0302-$0303
NMI_PTR             := $0304             ; $0304-$0305
                                         ; $0306-$030F Reserved for future pointers
BRK_P               := $0310             ; Saved P at time of BRK
BRK_PCL             := $0311             ; Saved PCL at time of BRK (points to BRK+2)
BRK_PCH             := $0312             ; Saved PCH at time of BRK

; User Vars
USER_VARS           := $0400             ; $0400-$07FF

; Program
PROGRAM_START       := $0800             ; $0800-$7FFF

; RAM Card | IO 1 | $8000-$83FF 
RAM_DATA_L          := $8000             ; R/W ($8000-$83FE)
RAM_BANK_L          := $83FF             ; Write-only RAM bank latch, value ($00-$FF) sets which of 256 ~1K banks of RAM is selected

; RAM Card | IO 2 | $8400-$87FF 
RAM_DATA_H          := $8400             ; R/W ($8400-$87FE)
RAM_BANK_H          := $87FF             ; Write-only RAM bank latch, value ($00-$FF) sets which of 256 ~1K banks of RAM is selected

; RTC Card | IO 3 | $8800-$881F
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

; Storage Card | IO 4 | $8C00-$8C07
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

; Serial Card / Serial Card Pro | IO 5 | $9000-$9003
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

; GPIO Card / Input Board | IO 6 | $9400-$940F
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
GPIO_PCR_CB2_LO     := %11000000         ; PCR CB2 mode = manual output low (enables keyboard controller)
GPIO_PCR_CB1_NEG    := %00000000         ; PCR CB1 active on falling (high-to-low) edge
GPIO_INT_CB1        := %00010000         ; IFR/IER bit 4 = CB1 interrupt flag/enable
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

; Video Card / VGA Card (TMS9918/pico9918) | IO 8 | $9C00-$9C01
VC_DATA             := $9C00             ; R/W
VC_REG              := $9C01             ; Write
VC_STATUS           := $9C01             ; Read