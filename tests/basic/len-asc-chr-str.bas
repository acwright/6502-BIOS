# name: LEN, ASC, CHR$ and STR$
# README: "LEN(s$) — String length", "ASC(s$) — ASCII code of first character"
#         "CHR$(n) — One-character string with ASCII code n"
#         "STR$(n) — Numeric value n formatted as a string"
#
# STR$ carries the leading-space sign convention the README documents for
# PRINT, so STR$(42) is " 42" and its length is 3, not 2.
10 IF LEN("HELLO") <> 5 THEN PRINT "FAIL LEN=";LEN("HELLO") : END
20 IF LEN("") <> 0 THEN PRINT "FAIL LEN EMPTY=";LEN("") : END
30 IF ASC("A") <> 65 THEN PRINT "FAIL ASC(A)=";ASC("A") : END
40 IF ASC("ABC") <> 65 THEN PRINT "FAIL ASC(ABC)=";ASC("ABC") : END
50 IF CHR$(65) <> "A" THEN PRINT "FAIL CHR$(65)=";CHR$(65) : END
60 IF ASC(CHR$(90)) <> 90 THEN PRINT "FAIL ROUND TRIP=";ASC(CHR$(90)) : END
70 IF STR$(42) <> " 42" THEN PRINT "FAIL STR$(42)=[";STR$(42);"]" : END
80 IF LEN(STR$(42)) <> 3 THEN PRINT "FAIL LEN STR$=";LEN(STR$(42)) : END
90 IF VAL(STR$(123)) <> 123 THEN PRINT "FAIL VAL STR$=";VAL(STR$(123)) : END
100 PRINT "PASS"
