# name: RND stays in [0,1), repeats on 0 and reseeds on a negative argument
# README: "RND(x) — Pseudo-random float in `[0, 1)` for `x > 0`; repeats last
#          value for `x = 0`; reseeds for `x < 0`"
#
# The three documented behaviours. What the generator actually produces from a
# given seed is pinned separately in tests/probe/rnd-sequence-is-stable.mjs, so
# that a change to the algorithm shows up as one obvious failure rather than as
# this case going intermittent.
10 FOR I = 1 TO 25
20 R = RND(1)
30 IF R < 0 THEN PRINT "FAIL BELOW ZERO=";R : END
40 IF R >= 1 THEN PRINT "FAIL AT OR ABOVE ONE=";R : END
50 NEXT I
60 A = RND(1)
70 IF RND(0) <> A THEN PRINT "FAIL RND(0) DID NOT REPEAT" : END
80 IF RND(0) <> A THEN PRINT "FAIL RND(0) DRIFTED" : END
90 B = RND(-7)
100 C = RND(-7)
110 IF B <> C THEN PRINT "FAIL RESEED NOT DETERMINISTIC ";B;" ";C : END
120 D = RND(1)
130 IF D = B THEN PRINT "FAIL SEQUENCE STUCK=";D : END
140 PRINT "PASS"
