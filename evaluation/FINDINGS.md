# ResolveAI: purpose and evidence

## Decision

Develop ResolveAI as an **automatic incident evidence collector**, with optional AI-assisted triage. Do not position it as an autonomous repair system or a model that diagnoses better than ChatGPT. Stop expanding the sample form and visual dashboard as the main product.

The target user is an IT technician responding to “the application opens, but I cannot save.” The useful deliverable is a timestamped incident brief containing the affected operation, observed failure, available evidence, unanswered questions, next checks, and verified recovery observations.

## What we actually tested

Two controlled failures were exercised against the local SQLite-backed service. The collector detected both in approximately 5.5 seconds and generated incidents. Six live Luna API requests cost $0.0005548 in total, using the recorded token usage and the previously verified standard rates.

| Evidence supplied | Read-only database | Slow write |
|---|---|---|
| User complaint only | Unknown; requested logs | Unknown; requested logs |
| Automatically collected evidence | Database read-only | Write timeout |
| Same evidence manually pasted | Database read-only | Write timeout |

The classification outcomes were identical when the inputs were identical. There is no demonstrated AI advantage over manually pasting the same logs. The benefit being pursued is collection and organization of evidence before a technician starts the investigation.

## Limits that matter

- Two scenarios, one response per arm: not a general accuracy benchmark.
- The read-only error is explicit, so its classification is easy.
- The slow-write result identifies a symptom, not the dependency or code responsible.
- A next check is not a confirmed diagnosis. In the read-only case, model suggestions emphasized filesystem permissions, while the injected cause was SQLite query-only mode. Exact root-cause identification was not demonstrated.
- Technician effort, collection time, and production usefulness have not been measured.
- The collector currently knows only one local application; it is not a general monitoring integration.

## Next implementation boundary

Make the incident brief the core product. Extend collection with correlated request IDs and per-operation application/database timings so a timeout can be localized using evidence. Keep controlled fault labels out of the model input. Evaluate against manually collected identical evidence and a simple rule-based baseline. Preserve unknown/insufficient-evidence outcomes.

Success means a reviewer can inspect a failed request, see the relevant evidence collected without copying logs, understand which conclusions are supported, and verify recovery. Only after a broader held-out evaluation should the resume mention measured diagnostic performance. Do not claim reduced incident response time until it is measured with an appropriate baseline.

## Honest current resume description

Built a local incident evidence collector that tests application writes, captures database errors and timeouts, and records verified recovery; compared AI triage with complaint-only and identical-log baselines across two controlled failures.

This is a description of completed work, not yet a standout performance claim.
