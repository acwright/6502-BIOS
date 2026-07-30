# name: ON expr GOSUB calls the nth target and returns
10 A = 0
20 ON 3 GOSUB 100,200,300
30 IF A = 3 THEN PRINT "PASS" : END
40 PRINT "FAIL A=";A
50 END
100 A = 1 : RETURN
200 A = 2 : RETURN
300 A = 3 : RETURN
