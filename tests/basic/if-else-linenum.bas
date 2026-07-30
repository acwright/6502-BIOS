# name: ELSE linenum is shorthand for ELSE GOTO linenum
# README: "`THEN linenum` is shorthand for `THEN GOTO linenum`, and `ELSE
#          linenum` for `ELSE GOTO linenum`"
#
# The ELSE branch is dispatched by the same tail as the THEN branch, so the
# digit-means-GOTO shorthand has to hold on both sides or the two arms of one
# statement disagree about what a bare line number means.
10 IF 0 THEN 90 ELSE 40
20 PRINT "FAIL FELL THROUGH"
30 END
40 IF 1 THEN 60 ELSE 90
50 PRINT "FAIL TOOK ELSE ON A TRUE CONDITION"
60 PRINT "PASS"
70 END
90 PRINT "FAIL TOOK THE WRONG BRANCH"
