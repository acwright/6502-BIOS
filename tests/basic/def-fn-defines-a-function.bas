# name: DEF FN defines a function and FN calls it
# README: "DEF FN A(X) = expr — Define a single-argument numeric user function.
#          Call with FN A(value)"
#
# Only what the README specifies: whether the parameter variable survives the
# call is undocumented either way, so it is not asserted here.
#
# Lines 60 on are the pin for eed5f37, and the difference is again a variable
# instead of a literal. FnCall stored the argument through VARPNT, which the
# argument's own evaluation re-points at whatever variable it names — so
# FN S(Y) evaluated the body against a parameter that had never been set,
# returned 0, and overwrote Y on the way. What the caller passed in is not the
# function's to modify, so both halves are asserted.
10 DEF FN S(X) = X * X
20 IF FN S(7) = 49 THEN GOTO 40
30 PRINT "FAIL S(7)=";FN S(7) : END
40 IF FN S(4) = 16 THEN GOTO 60
50 PRINT "FAIL S(4)=";FN S(4) : END
60 Y = 5
70 IF FN S(Y) <> 25 THEN PRINT "FAIL S(Y)=";FN S(Y) : END
80 IF Y <> 5 THEN PRINT "FAIL Y=";Y : END
90 PRINT "PASS"
