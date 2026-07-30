# name: IF takes THEN when true and ELSE when false
# xfail: a false IF with an ELSE branch raises ?SYNTAX ERROR instead of running it
# issue: tests/FINDINGS.md#else-on-a-false-condition-is-a-syntax-error
# README: "IF expr THEN stmt [ELSE stmt] — Execute THEN branch if `expr`
#          non-zero, else (if present) the ELSE branch."
10 A = 0 : B = 0
20 IF 1 THEN A = 1 ELSE A = 2
30 IF 0 THEN B = 1 ELSE B = 2
40 IF (A = 1) AND (B = 2) THEN PRINT "PASS" : END
50 PRINT "FAIL A=";A;" B=";B
