# name: WAIT returns immediately when the mask is already satisfied
# README: "WAIT <addr>, <mask> — Spin until `(addr) AND mask` is non-zero"
#
# The already-satisfied case is the one a test can make without a second agent
# poking memory underneath it: seed the byte first, so the condition holds on
# the very first read and WAIT has to return rather than spin. A WAIT that
# hangs fails this by timing out with no verdict.
10 POKE 4096, 255
20 WAIT 4096, 1
30 POKE 4096, 8
40 WAIT 4096, 8
50 PRINT "PASS"
