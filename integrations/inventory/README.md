# Independent inventory reference application

A standard-library Python HTTP API with its own SQLite database, no ResolveAI imports, no trace IPC, and no fault-control HTTP endpoints. Its contract differs from the original ingestion service:

- `GET /ready`: process readiness, not storage-write health.
- `POST /items`: creates an item from `sku` and `name`.
- `GET /items/:sku`: independently retrieves a stored item.

`--database PATH` selects its local database. `--read-only` opens an existing database read-only; the application returns only `storage_unavailable` for operational database failures. The collector cannot observe that startup flag. The evaluator owns and stops this application, listening only on 127.0.0.1:4321.

Run `node evaluation/inventory-check.mjs` from the ResolveAI root while its local incident desk is running. The evaluator starts this reference app, verifies a healthy create/read cycle, restarts it read-only, collects three failures into a real local incident, restarts it normally, and records three verified recoveries. It retains raw observations in `evaluation/inventory-results.json` and shuts down its child process. No AI calls are made.

The adapter in `local-lab/inventory-probe.mjs` uses only HTTP. It checks both item ID and contents on an independent read and does not fabricate internal traces. Its brief is generated from observed responses, not test labels. Generic storage errors support an investigation boundary, not a claim about the underlying database setting.

This is a second controlled reference application written for integration testing, not a third-party production deployment. It demonstrates adapting a different API/language and handling limited visibility; it does not establish compatibility with arbitrary applications. Continuous monitoring is available through the CLI described below. Production authentication and a deployment package are not implemented. The inventory application is separate from the existing local dashboard's service controls.

## Continuous monitoring

With the inventory API and local ResolveAI incident desk running, `pnpm monitor:inventory` starts the standalone collector. It checks periodically until Control-C, creates one incident after three failures, and appends recovery after three successful create/read-back checks. It does not launch or modify the target app. The reference app can be started using `python3 integrations/inventory/app.py --database local-lab/data/inventory.sqlite` from the project root.

The collector writes observations and delivery status to ignored `local-lab/data/inventory-monitor.jsonl`, rotating at 5 MB and retaining one previous log. A separate SQLite ownership lock prevents overlapping watcher processes and is released by the operating system if the process dies. `evaluation/inventory-continuous-check.mjs` verifies the same monitoring engine against the real reference API and saves its result separately.

Incident delivery now uses `local-lab/durable-inventory.mjs`. Its SQLite state file preserves monitor counters, the current episode, and pending outage/recovery events. Each event is committed locally before network delivery. The authenticated `/api/collector` endpoint deduplicates outage and recovery by episode; replaying the same event returns the existing result, while conflicting evidence is rejected. Recovery appends evidence without marking the incident resolved or changing a technician's status decision.

A pending queue survives restart and is retried in order. At 100 queued events, new probing pauses until delivery can drain the queue. Errors remain visible; permanent validation or capacity errors require attention rather than discarding evidence. State must not be shared between owners. Only one watcher should use a state file; the SQLite ownership lock prevents accidental concurrent CLI instances and releases after abrupt termination. Missing/corrupt state is not silently reset. SQLite/file durability still depends on the local disk; this is not replicated storage.

`tests/collector-delivery.test.mjs` verifies committed-but-unacknowledged deliveries, restart during outage, queued recovery during incident-desk unavailability, replay conflicts, and owner isolation. `tests/collector-api-smoke.mjs` checks the running HTTP endpoint, including auth/origin enforcement. The earlier continuous evaluation covers the original in-memory engine; the CLI now uses the durable engine. Both remain explicitly local-development integrations, not production authentication.


## Crash validation

`node evaluation/delivery-crash-check.mjs` sends fixed synthetic observations through the durable collector to the real local HTTP endpoint. It SIGKILLs owned child processes immediately after the server confirms each write but before the local queue acknowledges it, then restarts from the same state. The recorded run produced one incident, one recovery note, and no remaining queued events after two crashes. This validates delivery/replay, not fault diagnosis, machine power-loss durability, or automatic process supervision. `tests/process-lock.test.mjs` separately verifies cross-process exclusion and ownership-lock release after SIGKILL.

## Supervised collector

`pnpm monitor:inventory:supervised` runs the watcher under a small local supervisor. It restarts failed child processes with increasing delays, stops after five consecutive failures, and resets the failure count after a run lasts at least one minute. A clean child exit ends supervision. Control-C or SIGTERM stops both; a child that ignores shutdown is force-stopped after five seconds. Durable pending events remain in the same SQLite state file across restarts.

This command supervises only the collector. It does not start the inventory application or incident desk, does not install a login item, and does not survive the supervisor itself being killed or the Mac rebooting. Network delivery failures are handled by the collector queue, not by unnecessary process restarts. Four subprocess tests verify crash restart, failure limits/backoff, cancellation during backoff, and stopping a running child.
