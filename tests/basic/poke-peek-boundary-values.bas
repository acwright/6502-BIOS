# name: POKE round-trips both ends of a byte
# README: "POKE addr, value — Write byte value to memory address addr"
10 POKE 4096, 0
20 POKE 4097, 255
30 IF (PEEK(4096) = 0) AND (PEEK(4097) = 255) THEN PRINT "PASS" : END
40 PRINT "FAIL ";PEEK(4096);" ";PEEK(4097)
