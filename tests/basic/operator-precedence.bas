# name: one assertion per row of the README's precedence table
# README: precedence high to low — `^`, unary `-`, `*` `/`, `+` `-`,
#         relational, NOT, AND, OR
#
# Each line pits one level against the level below it, so a wrong ordering
# changes the answer rather than merely rearranging equal-precedence work.
10 IF 2 + 3 * 4 <> 14 THEN PRINT "FAIL MUL OVER ADD=";2+3*4 : END
20 IF 2 * 3 ^ 2 <> 18 THEN PRINT "FAIL POW OVER MUL=";2*3^2 : END
30 IF 10 - 6 / 2 <> 7 THEN PRINT "FAIL DIV OVER SUB=";10-6/2 : END
40 IF (1 + 2 = 3) <> -1 THEN PRINT "FAIL ADD OVER REL=";(1+2=3) : END
50 IF (NOT 0) <> -1 THEN PRINT "FAIL NOT=";(NOT 0) : END
60 IF ((1 = 1) AND (2 = 2)) <> -1 THEN PRINT "FAIL AND OF RELS" : END
70 IF (0 OR (1 = 1)) <> -1 THEN PRINT "FAIL AND OVER OR" : END
80 IF ((1 = 2) OR (3 = 3) AND (4 = 4)) <> -1 THEN PRINT "FAIL AND BINDS FIRST" : END
90 IF (2 + 3) * 4 <> 20 THEN PRINT "FAIL PARENS=";(2+3)*4 : END
100 PRINT "PASS"
