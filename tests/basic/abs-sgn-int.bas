# name: ABS, SGN and INT including INT's floor on negatives
# README: "ABS(x) — Absolute value"
#         "SGN(x) — Sign of x: 1, 0, or -1"
#         "INT(x) — Largest integer <= x (floor)"
#
# INT(-2.5) is the one worth writing down: floor gives -3, truncation gives -2,
# and the README says floor.
10 IF ABS(-7) <> 7 THEN PRINT "FAIL ABS(-7)=";ABS(-7) : END
20 IF ABS(7) <> 7 THEN PRINT "FAIL ABS(7)=";ABS(7) : END
30 IF SGN(-9) <> -1 THEN PRINT "FAIL SGN(-9)=";SGN(-9) : END
40 IF SGN(0) <> 0 THEN PRINT "FAIL SGN(0)=";SGN(0) : END
50 IF SGN(9) <> 1 THEN PRINT "FAIL SGN(9)=";SGN(9) : END
60 IF INT(2.7) <> 2 THEN PRINT "FAIL INT(2.7)=";INT(2.7) : END
70 IF INT(-2.5) <> -3 THEN PRINT "FAIL INT(-2.5)=";INT(-2.5) : END
80 IF INT(-3) <> -3 THEN PRINT "FAIL INT(-3)=";INT(-3) : END
90 PRINT "PASS"
