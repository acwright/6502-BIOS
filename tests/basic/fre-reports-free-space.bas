# name: FRE reports free space and it falls as space is used
# README: "FRE(x) — Free bytes between top of variable space and bottom of
#          string heap (argument ignored)"
#
# A figure that never moves would satisfy "returns a number", so the assertion
# is the direction of travel: dimension an array and the gap has to close.
# The argument is ignored, so the two calls deliberately pass different ones.
10 A = FRE(0)
20 IF A <= 0 THEN PRINT "FAIL NOT POSITIVE=";A : END
30 DIM Z(200)
40 B = FRE(1)
50 IF B >= A THEN PRINT "FAIL DID NOT FALL ";A;" -> ";B : END
60 IF B <= 0 THEN PRINT "FAIL EXHAUSTED=";B : END
70 PRINT "PASS"
