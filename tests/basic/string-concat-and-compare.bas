# name: strings concatenate with + and compare with the relational operators
# README: "`+` between strings — concatenation. Comparisons `= <> < > <= >=`
#          work on numbers and strings"
10 A$ = "AB" : B$ = "CD"
20 IF A$ + B$ <> "ABCD" THEN PRINT "FAIL CONCAT=";A$+B$ : END
30 IF LEN(A$ + B$) <> 4 THEN PRINT "FAIL CONCAT LEN=";LEN(A$+B$) : END
40 IF A$ + "" <> "AB" THEN PRINT "FAIL CONCAT EMPTY=";A$+"" : END
50 IF NOT ("ABC" = "ABC") THEN PRINT "FAIL EQ" : END
60 IF NOT ("ABC" <> "ABD") THEN PRINT "FAIL NE" : END
70 IF NOT ("ABC" < "ABD") THEN PRINT "FAIL LT" : END
80 IF NOT ("B" > "A") THEN PRINT "FAIL GT" : END
90 IF NOT ("AB" < "ABC") THEN PRINT "FAIL PREFIX SHORTER" : END
100 IF NOT ("ABC" <= "ABC") THEN PRINT "FAIL LE" : END
110 IF NOT ("ABC" >= "ABC") THEN PRINT "FAIL GE" : END
120 IF A$ <> "AB" THEN PRINT "FAIL A$ CLOBBERED=";A$ : END
130 PRINT "PASS"
