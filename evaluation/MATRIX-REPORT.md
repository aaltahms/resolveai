# ResolveAI regression results

Run: 2026-09-09T23:09:18.611Z

Completed: true. 8/8 scenarios completed. No AI calls.

| Round | Controlled fault | Observed classification | Detection | Recovery recorded | Checks |
|---|---|---|---|---|---|
| 1 | readonly | database_read_only | 5.5 s | 5.6 s | Pass |
| 1 | slow | application_wait | 7.1 s | 5.1 s | Pass |
| 1 | lock | database_locked | 5.5 s | 6.1 s | Pass |
| 1 | stop | unreachable | 6.1 s | 5.4 s | Pass |
| 2 | stop | unreachable | 6.1 s | 5.9 s | Pass |
| 2 | lock | database_locked | 6.0 s | 5.6 s | Pass |
| 2 | slow | application_wait | 7.1 s | 4.6 s | Pass |
| 2 | readonly | database_read_only | 6.0 s | 6.1 s | Pass |

Checks require exactly one new incident, matching saved brief, all three request IDs in evidence, and recorded recovery on the same incident. Healthy control: no new incidents during 6.5 seconds.

These are repeated known cases used to develop the rules, not held-out diagnostic accuracy. Two rounds run in opposite order; this is not a randomized or statistically significant sample. Timings include monitor polling, local application overhead, and evaluation polling. It does not measure technician time saved, AI quality, real-world root-cause accuracy, or production readiness. Raw evidence is in matrix-results.json.
