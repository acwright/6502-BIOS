# name: VAL parses a leading number and returns 0 when there is none
# README: "VAL(s$) — Parse s$ as a number; returns 0 if not numeric"
#
# VAL is one of the routines eed5f37 fixed for zero-page clobber, so the cases
# that mix it with other work in the same expression are the interesting ones.
10 IF VAL("123") <> 123 THEN PRINT "FAIL VAL(123)=";VAL("123") : END
20 IF VAL("-45") <> -45 THEN PRINT "FAIL VAL(-45)=";VAL("-45") : END
30 IF VAL("3.5") <> 3.5 THEN PRINT "FAIL VAL(3.5)=";VAL("3.5") : END
40 IF VAL("XYZ") <> 0 THEN PRINT "FAIL VAL(XYZ)=";VAL("XYZ") : END
50 IF VAL("") <> 0 THEN PRINT "FAIL VAL EMPTY=";VAL("") : END
60 IF VAL("12AB") <> 12 THEN PRINT "FAIL VAL(12AB)=";VAL("12AB") : END
70 IF VAL("  7") <> 7 THEN PRINT "FAIL VAL SPACES=";VAL("  7") : END
80 A$ = "50" : B$ = "25"
90 IF VAL(A$) + VAL(B$) <> 75 THEN PRINT "FAIL SUM=";VAL(A$)+VAL(B$) : END
100 IF LEN(A$) <> 2 THEN PRINT "FAIL VAL CLOBBERED A$, LEN=";LEN(A$) : END
110 PRINT "PASS"
