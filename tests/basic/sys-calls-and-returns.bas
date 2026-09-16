# name: SYS calls a machine-code routine, hands it A, X and Y, and reads them back
# README: "SYS <addr>[,a[,x[,y]]] — Call a machine-code routine with A, X and Y
#          (0 if omitted); RTS returns to BASIC, and A, X, Y and P are left at
#          787, 788, 789 and 784"
#
# 96 is $60, a bare RTS. Line 30 is reached only if SYS returns: a SYS that
# never comes back fails this case by timing out with no verdict.
#
# The routine at 4112 is TAX : INY : RTS ($AA $C8 $60), so what comes back says
# what went in: X is the A it was handed, Y one more than the Y. An omitted
# register is 0, which the second call shows by the same arithmetic.
10 POKE 4096, 96
20 SYS 4096
30 POKE 4112, 170 : POKE 4113, 200 : POKE 4114, 96
40 SYS 4112, 7, 99, 41
50 IF PEEK(787) <> 7 OR PEEK(788) <> 7 OR PEEK(789) <> 42 THEN PRINT "FAIL"; PEEK(787); PEEK(788); PEEK(789) : END
60 SYS 4112
70 IF PEEK(787) <> 0 OR PEEK(788) <> 0 OR PEEK(789) <> 1 THEN PRINT "FAIL OMITTED"; PEEK(787); PEEK(788); PEEK(789) : END
80 SYS 4112, 200
90 IF PEEK(788) <> 200 OR PEEK(789) <> 1 THEN PRINT "FAIL A ONLY"; PEEK(788); PEEK(789) : END
100 PRINT "PASS"
