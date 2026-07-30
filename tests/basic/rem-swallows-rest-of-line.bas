# name: REM swallows the rest of the line, colons included
# README: "REM [text] — Comment — rest of line is ignored"
#
# The colon is the point: REM has to consume the statement separator too, or
# everything after it on the line runs as code.
10 A = 1
20 REM A = 2 : A = 3
30 IF A = 1 THEN PRINT "PASS" : END
40 PRINT "FAIL A=";A
