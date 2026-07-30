# name: a DEF FN body can call another FN
# README: "DEF FN A(X) = expr — Define a single-argument numeric user function"
#
# PLAN.md §6.4 asks for this specifically: the nested call re-enters the same
# evaluator that is already part-way through an FN, which is where a shared
# scratch slot would show up.
10 DEF FN D(X) = X + X
20 DEF FN Q(X) = FN D(X) * 2
30 IF FN Q(5) = 20 THEN PRINT "PASS" : END
40 PRINT "FAIL Q(5)=";FN Q(5)
