# name: ^ is right-associative and binds tighter than unary minus
# README: precedence puts `^` above unary `-`
#
# The two interactions that separate a correct expression parser from one that
# merely gets simple cases right. 2^3^2 is 2^9 = 512 if ^ is right-associative
# and (2^3)^2 = 64 if it is left-associative; -2^2 is -(2^2) = -4 because ^
# binds first, not (-2)^2 = 4.
#
# The chained case is compared against a tolerance because ^ is computed
# through exp/log: the ROM gives 512.000002, which is the six-digit format
# working as designed, not a parsing error. 64 and 512 are far enough apart
# that no tolerance this small could confuse the two associativities.
10 IF ABS(2 ^ 3 ^ 2 - 512) > .01 THEN PRINT "FAIL ASSOC=";2^3^2 : END
20 IF ABS(-2 ^ 2 + 4) > .001 THEN PRINT "FAIL UNARY=";-2^2 : END
30 IF ABS((-2) ^ 2 - 4) > .001 THEN PRINT "FAIL PARENTHESISED=";(-2)^2 : END
40 IF - 3 + 5 <> 2 THEN PRINT "FAIL UNARY THEN ADD=";-3+5 : END
50 IF 5 * -2 <> -10 THEN PRINT "FAIL UNARY AS OPERAND=";5*-2 : END
60 IF - - 4 <> 4 THEN PRINT "FAIL DOUBLE NEGATE=";- -4 : END
70 IF ABS(2 ^ 2 ^ 3 - 256) > .01 THEN PRINT "FAIL ASSOC 2=";2^2^3 : END
80 PRINT "PASS"
