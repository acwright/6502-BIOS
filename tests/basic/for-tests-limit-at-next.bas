# name: FOR tests its limit at NEXT, so the body always runs once
# The README calls this BASIC "comparable to Microsoft 6502 BASIC", and MS 6502
# BASIC sets the loop up at FOR and tests the limit at NEXT — so a loop whose
# limit is already passed runs its body once and leaves the variable one step
# beyond init. This is the C64/Applesoft behaviour, not the GW-BASIC one.
10 C = 0
20 FOR I = 5 TO 1
30 C = C + 1
40 NEXT I
50 IF (C = 1) AND (I = 6) THEN PRINT "PASS" : END
60 PRINT "FAIL BODY RAN ";C;" TIMES, I=";I
