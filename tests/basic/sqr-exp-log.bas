# name: SQR, EXP and LOG against known values
# README: "SQR(x) — Square root", "EXP(x) — e raised to x",
#         "LOG(x) — Natural logarithm"
#
# Six significant digits, so every comparison is against a tolerance rather
# than an exact equality — PLAN.md §11.5. 0.001 is loose enough to survive the
# format and tight enough that a wrong function cannot pass.
10 IF ABS(SQR(144) - 12) > .001 THEN PRINT "FAIL SQR(144)=";SQR(144) : END
20 IF ABS(SQR(2) - 1.41421) > .001 THEN PRINT "FAIL SQR(2)=";SQR(2) : END
30 IF SQR(0) <> 0 THEN PRINT "FAIL SQR(0)=";SQR(0) : END
40 IF ABS(EXP(0) - 1) > .001 THEN PRINT "FAIL EXP(0)=";EXP(0) : END
50 IF ABS(EXP(1) - 2.71828) > .001 THEN PRINT "FAIL EXP(1)=";EXP(1) : END
60 IF ABS(LOG(1)) > .001 THEN PRINT "FAIL LOG(1)=";LOG(1) : END
70 IF ABS(LOG(2.71828) - 1) > .001 THEN PRINT "FAIL LOG(E)=";LOG(2.71828) : END
80 IF ABS(LOG(EXP(5)) - 5) > .001 THEN PRINT "FAIL LOG(EXP(5))=";LOG(EXP(5)) : END
90 PRINT "PASS"
