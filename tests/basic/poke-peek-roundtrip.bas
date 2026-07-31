# name: POKE writes a byte and PEEK reads it back
# README: "POKE addr, value — Write byte value to memory address addr"
#         "PEEK(addr) — Read byte from memory"
#
# $1000 is free RAM well clear of the program text at $0800.
#
# From line 30 on this is the pin for eed5f37, and the only difference is that
# the value is a variable rather than a literal. POKE parked its target address
# in the zero-page INDEX pair before evaluating the value, and loading a
# variable into FAC goes through that same pair — so POKE 4097,D stored D into
# D's own exponent byte and never touched 4097. A numeric constant never gets
# near INDEX, which is why the first two lines passed on the broken ROM and why
# a case built only from literals would have missed the bug entirely.
10 POKE 4096, 123
20 IF PEEK(4096) <> 123 THEN PRINT "FAIL LITERAL ";PEEK(4096) : END
30 D = 77
40 POKE 4097, D
50 IF PEEK(4097) <> 77 THEN PRINT "FAIL VARIABLE ";PEEK(4097) : END
60 IF D <> 77 THEN PRINT "FAIL D CLOBBERED ";D : END
70 POKE 4098, D + PEEK(4096) - 50
80 IF PEEK(4098) <> 150 THEN PRINT "FAIL EXPRESSION ";PEEK(4098) : END
90 PRINT "PASS"
