# name: POKE writes a byte and PEEK reads it back
# README: "POKE addr, value — Write byte value to memory address addr"
#         "PEEK(addr) — Read byte from memory"
#
# $1000 is free RAM well clear of the program text at $0800.
10 POKE 4096, 123
20 IF PEEK(4096) = 123 THEN PRINT "PASS" : END
30 PRINT "FAIL ";PEEK(4096)
