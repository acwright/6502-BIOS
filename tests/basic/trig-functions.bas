# name: SIN, COS, TAN and ATN against known values in radians
# README: "SIN(x) / COS(x) / TAN(x) — Trig functions, radians"
#         "ATN(x) — Arctangent, radians"
#
# Identities as well as points, because a table-driven approximation can be
# right at the sample points and wrong between them.
10 P = 3.14159265
20 IF ABS(SIN(0)) > .001 THEN PRINT "FAIL SIN(0)=";SIN(0) : END
30 IF ABS(SIN(P / 2) - 1) > .001 THEN PRINT "FAIL SIN(PI/2)=";SIN(P/2) : END
40 IF ABS(COS(0) - 1) > .001 THEN PRINT "FAIL COS(0)=";COS(0) : END
50 IF ABS(COS(P) + 1) > .001 THEN PRINT "FAIL COS(PI)=";COS(P) : END
60 IF ABS(TAN(P / 4) - 1) > .001 THEN PRINT "FAIL TAN(PI/4)=";TAN(P/4) : END
70 IF ABS(ATN(1) - P / 4) > .001 THEN PRINT "FAIL ATN(1)=";ATN(1) : END
80 IF ABS(ATN(0)) > .001 THEN PRINT "FAIL ATN(0)=";ATN(0) : END
90 S = SIN(.7) : C = COS(.7)
100 IF ABS(S * S + C * C - 1) > .001 THEN PRINT "FAIL IDENTITY ";S*S+C*C : END
110 PRINT "PASS"
