# name: self-check — a tier 1 case that prints FAIL is reported as a failure
# selftest: must-fail
#
# A suite that cannot fail is not testing anything. This case asserts something
# untrue, so the run is red if the runner ever calls it a pass.
10 A = 6 * 7
20 IF A = 43 THEN PRINT "PASS" : END
30 PRINT "FAIL ";A
