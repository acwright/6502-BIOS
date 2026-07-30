# name: DATA holds quoted and unquoted string literals
# README: "DATA v1,v2,... — Inline data for READ (numeric or string literals)"
#
# Unquoted items follow the Microsoft convention the README claims
# comparability with — anything that is not a separator is taken literally, so
# quotes are only needed for a value containing a comma or a leading space.
10 READ A$, B$
20 IF (A$ = "ONE") AND (B$ = "TWO") THEN GOTO 40
30 PRINT "FAIL QUOTED A$=";A$;" B$=";B$ : END
40 READ C$, D$
50 IF (C$ = "THREE") AND (D$ = "FOUR") THEN PRINT "PASS" : END
60 PRINT "FAIL UNQUOTED C$=";C$;" D$=";D$
70 END
100 DATA "ONE", "TWO"
110 DATA THREE, FOUR
