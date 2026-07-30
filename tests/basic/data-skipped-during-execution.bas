# name: DATA is skipped when execution reaches it
# README: "DATA v1,v2,... — ... Skipped during normal execution"
10 A = 1
20 DATA 99, 98
30 A = A + 1
40 IF A = 2 THEN PRINT "PASS" : END
50 PRINT "FAIL A=";A
