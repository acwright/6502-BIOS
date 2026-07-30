# name: POS reports the current print column
# README: "POS(x) — Current print column (argument ignored)"
#
# Read at a known column each time: after a bare PRINT the cursor is at the
# start of a line, and after five characters with a trailing semicolon it is at
# column 5. The argument is ignored, so 0 is as good as anything.
10 PRINT
20 A = POS(0)
30 PRINT "ABCDE";
40 B = POS(0)
50 PRINT
60 PRINT "XY";
70 C = POS(9)
80 PRINT
90 IF (A = 0) AND (B = 5) AND (C = 2) THEN PRINT "PASS" : END
100 PRINT "FAIL START=";A;" AFTER5=";B;" AFTER2=";C
