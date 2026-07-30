# name: LET assigns, and the keyword is optional
# README: "[LET] var = expr — Assign expression to variable. LET keyword is optional"
10 LET A = 6
20 B = 7
30 LET C$ = "OK"
40 D$ = "FINE"
50 IF (A * B = 42) AND (C$ = "OK") AND (D$ = "FINE") THEN PRINT "PASS" : END
60 PRINT "FAIL A=";A;" B=";B;" C$=";C$;" D$=";D$
