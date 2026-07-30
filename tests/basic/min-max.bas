# name: MIN and MAX pick the smaller and larger argument
# README: "MIN(a,b) / MAX(a,b) — Smaller / larger of a and b"
10 IF MIN(3, 8) <> 3 THEN PRINT "FAIL MIN(3,8)=";MIN(3,8) : END
20 IF MIN(8, 3) <> 3 THEN PRINT "FAIL MIN(8,3)=";MIN(8,3) : END
30 IF MAX(3, 8) <> 8 THEN PRINT "FAIL MAX(3,8)=";MAX(3,8) : END
40 IF MAX(8, 3) <> 8 THEN PRINT "FAIL MAX(8,3)=";MAX(8,3) : END
50 IF MIN(-5, 2) <> -5 THEN PRINT "FAIL MIN(-5,2)=";MIN(-5,2) : END
60 IF MAX(-5, -9) <> -5 THEN PRINT "FAIL MAX(-5,-9)=";MAX(-5,-9) : END
70 IF MIN(4, 4) <> 4 THEN PRINT "FAIL MIN(4,4)=";MIN(4,4) : END
80 PRINT "PASS"
