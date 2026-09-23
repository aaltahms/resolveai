# Does ResolveAI add value?

The decision under test is whether automated evidence collection makes an IT investigation more actionable than the initial user complaint. It is **not** whether a wrapper makes the same AI model more intelligent.

## Protocol

Run `node evaluation/compare.mjs` only with explicit permission for paid API testing. The local lab and incident desk must be running. This changes the lab's database-write and processing-delay settings, then restores normal operation. It makes at most six requests, without retries, with a 220-output-token ceiling and a 2,400-byte request bound. It never prints the API key. Each invocation incurs additional usage; the cap is per invocation, not an account-wide spending limit.

Two actual failures are introduced: database read-only mode and a write exceeding the monitor deadline. After three failed observations and incident creation, the script restores operation. The model receives neither fault-control events nor ground-truth labels.

Each case has three arms using the same model and instructions:

- Initial complaint only: “My request will not save.” The supported answer is unknown; a specific diagnosis would be a guess.
- Evidence automatically collected by ResolveAI.
- The identical evidence manually supplied to the same API model. This approximates pasting logs into a chat, not the full ChatGPT product.

The scoring criterion is a supported failure classification, not a proven root cause. A timeout does not establish why processing was slow. No root-cause credit should be claimed for identifying a timeout. Complete raw inputs, outputs, usage, and limitations are in `results.json`.

This is a two-case feasibility check with one response per arm. It cannot establish general accuracy, statistical superiority, time saved by technicians, or production readiness. Manual collection time is not measured. The next decision must be based on the result, not adding more UI.

## Repeatable functional regression matrix

With the local lab and incident desk running, `pnpm eval:local` exercises four known faults twice, in opposite orders. It checks correct evidence-based classification, exact saved incident brief, request IDs in saved evidence, no duplicate incident during continued failure, and recovery recorded on the same incident. A short healthy control checks that normal operation does not create an incident. Normal operation is restored in cleanup. Results and limitations are written to `matrix-results.json` and `MATRIX-REPORT.md`, including partial results if a check fails.

This test creates eight local incidents and changes only the owned lab service. It makes no AI calls. It is regression coverage for the supported rules, not held-out accuracy or a benchmark of real IT environments. Repeat runs overwrite the latest report; Git can preserve reviewed runs. Run only one evaluator at a time and avoid manual fault controls during a run.

## Separate-application integration

`node evaluation/inventory-check.mjs` tests a Python inventory reference app through an HTTP-only adapter. Read `integrations/inventory/README.md` for the API contract, run requirements, and limitations. `inventory-results.json` preserves successful create/read checks, external failure observations, abstention on root cause, and the saved recovery incident. Unlike the original service's trace-based diagnoses, this case intentionally has no internal telemetry.
