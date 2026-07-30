# name: BANK selects a 1KB RAM bank at $8000
# README: "BANK <n> — Select 1KB RAM bank `n` at `$8000–$83FE`"
#
# Banking is only banking if the banks hold different bytes at one address:
# write a marker into two banks at $8000, then read both back after switching
# away and returning. A no-op BANK passes a test that only writes and reads
# within one bank, so this reads each bank after the other has been written.
10 BANK 0
20 POKE 32768, 11
30 BANK 1
40 POKE 32768, 22
50 BANK 0
60 A = PEEK(32768)
70 BANK 1
80 B = PEEK(32768)
90 IF (A = 11) AND (B = 22) THEN PRINT "PASS" : END
100 PRINT "FAIL BANK0=";A;" BANK1=";B
