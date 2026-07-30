# name: FOR counts down with a negative STEP
10 A = 0 : C = 0
20 FOR I = 5 TO 1 STEP -1
30 A = A + I : C = C + 1
40 NEXT I
50 IF (A = 15) AND (C = 5) THEN PRINT "PASS" : END
60 PRINT "FAIL A=";A;" C=";C
