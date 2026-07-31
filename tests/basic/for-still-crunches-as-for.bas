# name: FOR still tokenizes as FOR, spaced or run together, now FORMAT is reachable
# The tokenizer takes the longest keyword rather than the first one that
# matches, which is what lets FORMAT ($D4) be typed at all when FOR ($81) sits
# ahead of it in the table. FOR is the keyword that change could break, and the
# run-together form is the one that goes down the new path: FORJ has a letter
# after the match, so the scan carries on looking for something longer.
10 T = 0
20 FOR I = 1 TO 3 : T = T + I : NEXT I
30 FORJ=1TO3:T=T+J:NEXTJ
40 IF T = 12 THEN PRINT "PASS" : END
50 PRINT "FAIL ";T
