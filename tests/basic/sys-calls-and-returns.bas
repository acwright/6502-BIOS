# name: SYS calls a machine-code routine and RTS comes back to BASIC
# README: "SYS <addr> — Call a machine-code routine; RTS returns to BASIC"
#
# 96 is $60, a bare RTS. The whole assertion is that line 30 is reached: a SYS
# that never returns fails this case by timing out with no verdict.
10 POKE 4096, 96
20 SYS 4096
30 PRINT "PASS"
