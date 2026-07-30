# name: an out-of-range ON index silently continues
# README: "Out-of-range index silently continues"
10 A = 0
20 ON 0 GOTO 100
30 ON 4 GOTO 100,100,100
40 A = 1
50 IF A = 1 THEN PRINT "PASS" : END
60 PRINT "FAIL A=";A
70 END
100 PRINT "FAIL BRANCHED"
