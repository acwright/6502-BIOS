# name: CLR clears variables and arrays
# README: "CLR — Clear variables and arrays; reset GOSUB/FOR stacks. Program is kept"
#
# The program-is-kept half needs a second RUN to show, so it lives in
# tests/console/clr-keeps-the-program.txt.
10 DIM A(3)
20 A(1) = 9
30 B = 5
40 C$ = "SET"
50 CLR
60 IF (B = 0) AND (C$ = "") THEN PRINT "PASS" : END
70 PRINT "FAIL B=";B;" C$=";C$
