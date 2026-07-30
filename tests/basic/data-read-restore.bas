# name: READ walks DATA in order and RESTORE rewinds it
# README: "READ var [,var ...] — Read next value(s) from DATA into variables"
#         "RESTORE — Reset DATA pointer to start of program"
10 READ A, B
20 READ C
30 RESTORE
40 READ D
50 IF (A = 10) AND (B = 20) AND (C = 30) AND (D = 10) THEN PRINT "PASS" : END
60 PRINT "FAIL ";A;" ";B;" ";C;" ";D
70 END
100 DATA 10, 20
110 DATA 30
