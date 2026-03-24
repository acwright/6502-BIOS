; ***             ***
; ***   MONITOR   ***
; ***             ***

; Monitor entry points at $C000-$C008
; Currently stub redirects to WozMon — to be replaced with a full monitor later

MonitorEntry:     jmp WozMon          ; $C000 - Monitor entry
MonitorExamine:   jmp WozMon          ; $C003 - Examine memory
MonitorDeposit:   jmp WozMon          ; $C006 - Deposit to memory