# name: AND, OR and NOT operate bitwise on the integer parts
# README: "Logical `AND`, `OR`, `NOT` operate bitwise on the integer parts of
#          operands; relational comparisons return `-1` (true) or `0` (false)"
#
# -1 is all bits set, which is why it doubles as true: `x AND -1` is x, and
# NOT 0 is -1. The masking cases are the ones that prove these are bit
# operations rather than a boolean special case.
10 IF (12 AND 10) <> 8 THEN PRINT "FAIL AND=";(12 AND 10) : END
20 IF (12 OR 10) <> 14 THEN PRINT "FAIL OR=";(12 OR 10) : END
30 IF (255 AND 15) <> 15 THEN PRINT "FAIL MASK=";(255 AND 15) : END
40 IF (240 AND 15) <> 0 THEN PRINT "FAIL DISJOINT=";(240 AND 15) : END
50 IF (NOT 0) <> -1 THEN PRINT "FAIL NOT 0=";(NOT 0) : END
60 IF (NOT -1) <> 0 THEN PRINT "FAIL NOT -1=";(NOT -1) : END
70 IF (NOT 5) <> -6 THEN PRINT "FAIL NOT 5=";(NOT 5) : END
80 IF (7 AND -1) <> 7 THEN PRINT "FAIL AND MINUS ONE=";(7 AND -1) : END
90 IF (5.9 AND 3) <> 1 THEN PRINT "FAIL INTEGER PART=";(5.9 AND 3) : END
100 PRINT "PASS"
