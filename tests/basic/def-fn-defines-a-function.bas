# name: DEF FN defines a function and FN calls it
# README: "DEF FN A(X) = expr — Define a single-argument numeric user function.
#          Call with FN A(value)"
#
# Only what the README specifies: whether the parameter variable survives the
# call is undocumented either way, so it is not asserted here.
10 DEF FN S(X) = X * X
20 IF FN S(7) = 49 THEN GOTO 40
30 PRINT "FAIL S(7)=";FN S(7) : END
40 IF FN S(4) = 16 THEN PRINT "PASS" : END
50 PRINT "FAIL S(4)=";FN S(4)
