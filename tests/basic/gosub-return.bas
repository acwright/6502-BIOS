# name: GOSUB calls and RETURN resumes after the GOSUB
10 A = 0 : B = 0
20 GOSUB 100
30 B = B + 1
40 IF (A = 1) AND (B = 1) THEN PRINT "PASS" : END
50 PRINT "FAIL A=";A;" B=";B
60 END
100 A = A + 1
110 RETURN
