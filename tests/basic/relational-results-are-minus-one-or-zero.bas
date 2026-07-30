# name: relational comparisons return exactly -1 or 0
# README: "relational comparisons return `-1` (true) or `0` (false)"
#
# Exactly -1, not merely non-zero: the value feeds straight into the bitwise
# AND/OR, so a "true" of 1 would quietly break every compound condition.
10 IF (1 = 1) <> -1 THEN PRINT "FAIL EQ TRUE=";(1=1) : END
20 IF (1 = 2) <> 0 THEN PRINT "FAIL EQ FALSE=";(1=2) : END
30 IF (1 <> 2) <> -1 THEN PRINT "FAIL NE=";(1<>2) : END
40 IF (1 < 2) <> -1 THEN PRINT "FAIL LT=";(1<2) : END
50 IF (2 > 1) <> -1 THEN PRINT "FAIL GT=";(2>1) : END
60 IF (1 <= 1) <> -1 THEN PRINT "FAIL LE=";(1<=1) : END
70 IF (1 >= 2) <> 0 THEN PRINT "FAIL GE=";(1>=2) : END
80 IF ("A" = "A") <> -1 THEN PRINT "FAIL STRING EQ=";("A"="A") : END
90 IF ("A" = "B") <> 0 THEN PRINT "FAIL STRING NE=";("A"="B") : END
100 PRINT "PASS"
