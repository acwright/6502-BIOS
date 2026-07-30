# name: index 0 and index size are both valid in a DIMed array
# README: "DIM var(size) ... valid indices 0..size"
#
# The inclusive upper bound is the half of this that is easy to get wrong: a
# DIM A(5) has six elements, not five.
10 DIM A(5)
20 A(0) = 11
30 A(5) = 66
40 IF (A(0) = 11) AND (A(5) = 66) THEN PRINT "PASS" : END
50 PRINT "FAIL A(0)=";A(0);" A(5)=";A(5)
