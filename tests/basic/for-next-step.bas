# name: FOR/NEXT counts with the default step and with STEP
# README: "Counted loop. Default step is 1"
10 A = 0
20 FOR I = 1 TO 5
30 A = A + I
40 NEXT I
50 B = 0
60 FOR I = 0 TO 10 STEP 2
70 B = B + 1
80 NEXT I
90 IF (A = 15) AND (B = 6) THEN PRINT "PASS" : END
100 PRINT "FAIL A=";A;" B=";B
