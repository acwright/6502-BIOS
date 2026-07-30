# name: the arithmetic operators including division and exponentiation
# README: "`+ - * /` — standard arithmetic. `^` — exponentiation"
10 IF 7 + 5 <> 12 THEN PRINT "FAIL ADD=";7+5 : END
20 IF 7 - 5 <> 2 THEN PRINT "FAIL SUB=";7-5 : END
30 IF 5 - 7 <> -2 THEN PRINT "FAIL SUB NEG=";5-7 : END
40 IF 7 * 5 <> 35 THEN PRINT "FAIL MUL=";7*5 : END
50 IF 35 / 5 <> 7 THEN PRINT "FAIL DIV=";35/5 : END
60 IF ABS(1 / 8 - .125) > .00001 THEN PRINT "FAIL FRACTION=";1/8 : END
70 IF 2 ^ 10 <> 1024 THEN PRINT "FAIL POW=";2^10 : END
80 IF 9 ^ .5 <> 3 THEN PRINT "FAIL ROOT=";9^.5 : END
90 IF ABS(2 ^ -2 - .25) > .00001 THEN PRINT "FAIL NEG EXP=";2^-2 : END
100 PRINT "PASS"
