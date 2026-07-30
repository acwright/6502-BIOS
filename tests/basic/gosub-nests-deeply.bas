# name: GOSUB nests 20 levels deep and every RETURN unwinds
# README: "GOSUB linenum — Push current position and jump. Nesting is bounded
#          by the 6502 stack; at least 20 levels are available, and exceeding
#          the space raises OUT OF MEMORY"
#
# 20 is the documented floor, not the measured ceiling: frames land on page 1
# alongside the interpreter's own JSR returns, so the real limit moves with
# whatever the subroutine body does. The guarantee is what gets tested.
# The companion case is tests/console/gosub-too-deep-raises-out-of-memory.txt.
10 D = 0 : U = 0
20 GOSUB 100
30 IF (D = 20) AND (U = 20) THEN PRINT "PASS" : END
40 PRINT "FAIL DOWN=";D;" UP=";U
50 END
100 D = D + 1
110 IF D < 20 THEN GOSUB 100
120 U = U + 1
130 RETURN
