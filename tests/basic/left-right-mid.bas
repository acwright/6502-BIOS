# name: LEFT$, RIGHT$ and MID$ with and without a length
# README: "LEFT$(s$,n) / RIGHT$(s$,n) — First / last n chars of s$"
#         "MID$(s$,start[,len]) — Substring of s$ starting at 1-based index start"
#
# MID$ is one of the routines eed5f37 fixed for zero-page clobber, so line 110
# checks the source string survived being cut up.
10 S$ = "ABCDEFG"
20 IF LEFT$(S$, 3) <> "ABC" THEN PRINT "FAIL LEFT$=";LEFT$(S$,3) : END
30 IF RIGHT$(S$, 3) <> "EFG" THEN PRINT "FAIL RIGHT$=";RIGHT$(S$,3) : END
40 IF MID$(S$, 3) <> "CDEFG" THEN PRINT "FAIL MID$ NO LEN=";MID$(S$,3) : END
50 IF MID$(S$, 3, 2) <> "CD" THEN PRINT "FAIL MID$=";MID$(S$,3,2) : END
60 IF MID$(S$, 1, 1) <> "A" THEN PRINT "FAIL MID$ FIRST=";MID$(S$,1,1) : END
70 IF MID$(S$, 7, 1) <> "G" THEN PRINT "FAIL MID$ LAST=";MID$(S$,7,1) : END
80 IF LEFT$(S$, 0) <> "" THEN PRINT "FAIL LEFT$ ZERO=[";LEFT$(S$,0);"]" : END
90 IF LEFT$(S$, 20) <> S$ THEN PRINT "FAIL LEFT$ OVER=";LEFT$(S$,20) : END
100 IF RIGHT$(S$, 20) <> S$ THEN PRINT "FAIL RIGHT$ OVER=";RIGHT$(S$,20) : END
110 IF S$ <> "ABCDEFG" THEN PRINT "FAIL SOURCE CLOBBERED=";S$ : END
120 PRINT "PASS"
