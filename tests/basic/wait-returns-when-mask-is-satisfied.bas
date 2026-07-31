# name: WAIT returns immediately when the mask is already satisfied
# README: "WAIT <addr>, <mask> — Spin until `(addr) AND mask` is non-zero"
#
# The already-satisfied case is the one a test can make without a second agent
# poking memory underneath it: seed the byte first, so the condition holds on
# the very first read and WAIT has to return rather than spin. A WAIT that
# hangs fails this by timing out with no verdict.
#
# Line 70 is the pin for eed5f37: the address was held in the zero-page BAS_TMP1
# pair while the mask expression was evaluated, and PEEK's own argument goes
# through the routine that uses it — so WAIT polled whatever address the mask
# expression left behind. Here that byte is 0 and the mask is 4, so a broken
# WAIT waits for a bit that will never arrive, which is how this one fails.
10 POKE 4096, 255
20 WAIT 4096, 1
30 POKE 4096, 8
40 WAIT 4096, 8
50 POKE 4097, 4
60 POKE 4098, 0
70 WAIT 4097, PEEK(4098) + 4
80 PRINT "PASS"
