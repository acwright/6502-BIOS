# name: GOSUB nests 64 levels deep
# xfail: nesting past 31 overruns the CPU stack and crashes into the Monitor
# issue: tests/FINDINGS.md#gosub-nests-31-levels-not-64-and-crashes-past-that
# timeout: 3000
# README: "GOSUB linenum — Push current position and jump. Up to 64 levels deep"
10 D = 0
20 GOSUB 100
30 IF D = 64 THEN PRINT "PASS" : END
40 PRINT "FAIL DEPTH ";D
50 END
100 D = D + 1
110 IF D < 64 THEN GOSUB 100
120 RETURN
