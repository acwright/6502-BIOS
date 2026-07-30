# name: DIM dimensions numeric and string arrays
# README: "DIM var(size) [, var(size) ...] — Dimension a 1-D array (numeric or
#          string), valid indices 0..size"
10 DIM A(5), B$(3)
20 A(2) = 7
30 B$(1) = "X"
40 IF (A(2) = 7) AND (B$(1) = "X") THEN PRINT "PASS" : END
50 PRINT "FAIL A(2)=";A(2);" B$(1)=";B$(1)
