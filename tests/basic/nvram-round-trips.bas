# name: NVRAM writes and reads back, across the whole 0-255 address range
# README: "NVRAM <addr>, <value> — Write a byte to RTC NVRAM at address 0–255"
#         "NVRAM(addr) — Read byte from RTC NVRAM"
#
# The RTC is present on the default profile (HW_PRESENT = $7F), so this needs
# no fixture. Both ends of the address range are written, because a bad index
# calculation typically survives the middle and fails at 0 or 255.
10 NVRAM 0, 11
20 NVRAM 255, 22
30 NVRAM 128, 33
40 IF NVRAM(0) <> 11 THEN PRINT "FAIL AT 0=";NVRAM(0) : END
50 IF NVRAM(255) <> 22 THEN PRINT "FAIL AT 255=";NVRAM(255) : END
60 IF NVRAM(128) <> 33 THEN PRINT "FAIL AT 128=";NVRAM(128) : END
70 NVRAM 0, 0
80 IF NVRAM(0) <> 0 THEN PRINT "FAIL ZERO=";NVRAM(0) : END
90 NVRAM 7, 255
100 IF NVRAM(7) <> 255 THEN PRINT "FAIL FULL BYTE=";NVRAM(7) : END
110 IF NVRAM(255) <> 22 THEN PRINT "FAIL 255 DISTURBED=";NVRAM(255) : END
120 PRINT "PASS"
