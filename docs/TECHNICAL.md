# ResolveAI

**New here? Read [Using ResolveAI](../HOW-TO-USE.md) first.** It explains which screen to use, what to click, and how to tell whether your problem is fixed. This README is the detailed setup and technical reference.

ResolveAI’s local home helps troubleshoot twelve Mac problem workflows: internet access, slow performance, low storage, an unresponsive app, charging, sound output, external displays, missing printers, print queues, and default-printer selection. Each flow runs read-only host checks, explains what the evidence supports, gives a practical next step, and lets you recheck. The incident desk and approved sample-service repair lab remain separate tools.

The portfolio release is frozen at 12 live checks and 17 guided procedures. The [case roadmap](../CASE-ROADMAP.md) records deferred ideas and distinguishes live checks from guided procedures.

## Start the Mac assistant

From this repository, with Node.js 22.13+:

```sh
node local-lab/run.mjs
```

Open **http://resolveai.localhost:4318/** and keep the terminal running. This named address works on this Mac; it is not a public website. If your browser cannot resolve it, use **http://127.0.0.1:4318/**. With Node available on your PATH:

```sh
node local-lab/run.mjs
```

No API key, paid AI calls, install, or incident-desk sign-in is needed for the twelve diagnostic flows. Ports 4318 and 4319 must be free; do not start a second copy. This runner also starts the preserved owned sample service and its synthetic monitor at 4319. Its optional incident sync may report unavailable if the separate desk on 3000 is not running; Mac diagnostics still work. Control-C stops this runner and its owned child only. The `Start Local Lab.command` launcher starts missing services and reuses recognized running services, including the incident desk.

### Two-minute demo

1. Choose **My internet isn’t working** → **Check my connection**. Read the finding; expand evidence to see each DNS and HTTPS result.
2. Choose **My Mac is slow** → **Check performance**. Compare the CPU sample with the macOS pressure reading; neither identifies a guilty app by itself.
3. Choose **I’m low on storage** → **Check storage**. Review available Data-volume capacity and the next step.
4. Choose **An app isn’t responding** → **Check app activity**, then select an app. Helpers are grouped by name. Confirm responsiveness yourself with a harmless menu action.
5. After following an appropriate next step, choose **Check again**. The previous finding is retained for comparison; verify your original failing action yourself.

These checks do not change settings, delete files, quit apps, or perform general repairs. A restricted launcher may deny process or pressure readings; the UI explicitly identifies unavailable data and points to Activity Monitor. No permission expansion is required. Results are transient and are not saved to incident records. This release is local; the older hosted site is unchanged. See [capabilities and release verification](../evaluation/MAC-DIAGNOSTICS.md). The three additional hardware workflows and their validation are covered in [hardware cases](../evaluation/HARDWARE-CASES.md).

## Additional incident desk and developer lab capabilities

- Seventeen guided troubleshooting procedures at `/troubleshoot`, with user observations, suggested next steps, and verification notes saved into incidents.
- User-triggered Chrome capture for the local test page; successful background polling is filtered out, and background-only captures cannot be sent.
- Three approved repairs for the owned local service: start its process, disable query-only mode, or release its empty blocking transaction. Fresh correlated evidence and unchanged preconditions are required.
- Three independent write/read checks after each repair, persistent local repair records, single-execution approvals, expiring plans, and downloadable repair evidence.
- AI distinguishes supplied observations from guide text and rejects hypotheses supported only by unchecked questions or suggested fixes.

- Private user-owned incidents in Cloudflare D1, with atomic revision checks.
- Reported incidents contain supplied evidence, never generated endpoint readings.
- Ten log examples: full disk, DNS lookup failure, refused connections, timeouts, permissions, port conflicts, missing files, database authentication, database connection capacity, and kernel watchdog lockups.
- Text/log import, bounded to 6,000 characters; imported text is reviewed before saving.
- Deterministic error-signature analysis with matching line numbers, excerpts, investigation checks, verification criteria, and official technical reference links.
- Optional GPT-5.6 Luna investigation: likely causes tied to saved evidence lines, missing-information questions, and verification checks. Results persist with the incident and appear in reports.
- Priority, category, affected asset, search, status/source filters, and priority sorting.
- Technician work notes, escalation, documented resolution, and reopening. Closing requires a verification note; closed records reject further changes until reopened.
- Timestamped activity and downloadable full incident reports.
- Three original device simulations preserved and clearly labeled. Their approval operations cannot apply to reported incidents or log examples.

## Deliberate limits

There is no general remote command execution, remote desktop access, or live document retrieval. The local service controller and independent inventory watcher perform automatic functional monitoring. The repair controller operates only on its own service process and explicitly owned test settings. The AI analyzes supplied evidence and cannot execute repairs. Log analysis uses ten regular-expression signatures; a match is a lead rather than proof of root cause. Guided procedures include project-authored checks and vendor references.

Reported incidents and synthetic examples are explicitly distinguished. Resolution means the technician recorded verification; the app cannot independently confirm a disconnected device. Activity is stored with the incident, not in a tamper-proof audit system. Replacing evidence invalidates previous analysis. Old resolution notes remain in history after reopening.

Each user is limited to 497 created records plus three legacy sample slots; each evidence incident supports 250 activity entries. This small portfolio app loads the owner's bounded record set rather than implementing enterprise pagination. Log imports are text-only; remove confidential material and secrets before saving. Prior v0.1 browser-session tickets were not stored and cannot be recovered.

## Run locally

Requires Node.js 22.13+ and pnpm. Tests use built-in Node TypeScript stripping and SQLite.

```sh
pnpm install
pnpm db:migrate:local
pnpm dev
```

Open `/signin-with-chatgpt?return_to=/` on the local server for the starter's development-only test identity. The Sites plugin removes caller-supplied authenticated-user headers and supplies its mock identity after local sign-in. Production uses the Sites dispatcher's authenticated headers and private access policy. Do not deploy the Worker directly to an origin where a caller can forge those headers.

```sh
pnpm test
pnpm typecheck
pnpm lint
node tests/api-smoke.mjs  # requires the running local server; creates synthetic local records
pnpm build
```

## Small architecture

- `app/page.tsx`: interface, API requests, pending/error states, and download action.
- `components/incident-workspace.tsx`: evidence, triage, work notes, reports, and legacy simulation controls.
- `lib/incidents.ts`: error signatures, evidence analysis, real incident transitions, and report formatting.
- `lib/lab.ts`: isolated legacy simulation logic.
- `lib/incident-validation.ts`: request field and triage validation.
- `lib/ticket-store.ts`: prepared SQL queries, owner scoping, and optimistic concurrency.
- `lib/api.ts`: authenticated identity, same-origin writes, bounded JSON bodies, and errors.
- `lib/database.ts`: D1 binding access.
- `app/api/tickets/**`: list, create, seed, simulation transitions, and evidence-workflow endpoints.
- `db/schema.ts` and `drizzle/**`: schema and generated migrations.
- `lib/use-lab-tools.ts`: optional browser-agent tools for reading loaded tickets and requesting diagnostics. No approval tool is exposed.

### Storage choices

One row holds a ticket's JSON snapshot and its activity, with an owner/id composite primary key, revision, and creation timestamp. Updating the snapshot and activity in one conditional SQL statement makes each transition atomic. An owner/creation-time index supports listing. This keeps the small lab simple; normalized events can be introduced if actual reporting requirements justify them.

Every read and write scopes by the server-provided user ID. A transition reads the saved record, validates its revision and state, computes the result on the server, and updates only if that same revision is still current. A conflicting write returns 409. Prepared parameters separate user text from SQL.

GET requests never seed data. The sample button issues an explicit POST. No runtime schema creation occurs; generated migrations own schema changes. Applied migration files and metadata are immutable.

## API

| Endpoint                 | Request                                                                  | Result                           |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------- |
| `GET /api/tickets`       | Signed-in identity                                                       | Current user's saved incidents   |
| `POST /api/tickets`      | `title`, `description`, optional source/priority/category/asset/evidence | New incident with revision 1     |
| `POST /api/tickets/seed` | Empty JSON object                                                        | Idempotent sample creation       |
| `PATCH /api/tickets/:id` | `operation`, `revision`                                                  | Saved transition or 409 conflict |

Write operations require same-origin JSON requests. Legacy simulation operations are `diagnose`, `approve`, or `decline`. `PATCH /api/tickets/:id/work` accepts `operation`, `revision`, and operation-specific fields: `text` for evidence/comment/resolve/reopen/escalate; category/priority/asset for details; no additional fields for analyze. New incidents default to source `reported`; examples must be explicitly labeled. Request bodies are capped at 32 KB for evidence routes and 8 KB for legacy routes, with smaller per-field limits. Unauthenticated requests receive 401; records belonging to another user appear as 404. No endpoint accepts shell commands, action plans, or replacement ticket state.

## Verification

Automated tests cover incident ownership, concurrent updates, API validation, evidence attribution, AI budgeting, Chrome capture, monitoring, durable delivery, and approved repair preconditions and verification. Store tests execute real generated SQL against SQLite through a small D1-compatible adapter. Run `pnpm test` for the current count and results.

The local integration check also exercises the running Worker/D1 API: sign-in, unauthenticated rejection, creation, concurrent diagnostics, approval, prohibited payloads, and a fresh saved-result read. These tests demonstrate controlled lab behavior, not real-world resolution accuracy or AI quality.

The guided investigation was saved through the browser and WebMCP tools were observed on the incident page. A user Chrome capture reached the desk; capture of a failed action with the updated extension still needs verification. The local repair evaluation in `evaluation/repair-results.json` records three successful repairs and nine independent write/read checks. These are controlled supported faults, not a measure of general IT diagnosis accuracy. Production database migrations are applied by Sites when publishing.

## Try the approved repair loop

With the local lab and incident desk running, open `http://127.0.0.1:4318/lab`. Under **Test a problem**, choose **Block saving**. After three failed monitor checks, choose **Check the problem**. Review the proposed change, then choose **Apply this fix**. The controller changes only its owned service setting and checks three new records using separate write and read requests. Finally, choose **Try saving a note** and save a test note yourself. Past repairs, incident records, and technical details are collapsed so the main view focuses on the current problem and next action.

Plans expire after one minute or a service change. Unknown, mixed, or stale evidence gets no repair plan. Slow processing has no automatic repair. Completed approvals cannot execute twice, including after restart; interrupted execution is marked for review. Local repair history is bounded to 200 records, stored in ignored `local-lab/data/repairs.sqlite`, and is not tamper-proof. Download a record to retain it beyond that window. These records are separate from incident notes in D1.

Run `node tests/repair-live-smoke.mjs` against the running local services to exercise three real faults and repairs, rejected stale plans, and origin checks. It restores normal service operation and writes the evaluation artifact. It makes no paid AI requests.

## Try it

1. Choose Incident library → Service hostname cannot be resolved → Create incident.
2. Analyze saved evidence. Inspect the matching line and follow-up checks.
3. In Work notes, record a check, then a fix and its verification result before resolving.
4. Refresh and export the report. Reopen with a reason if the problem returns.
5. Create a reported incident with your own non-sensitive log excerpt; no endpoint readings are fabricated.
6. Try unknown text. The app returns manual investigation guidance, not a fabricated diagnosis.

## AI connection and allowance

Set `OPENAI_API_KEY` in an ignored `.env.local` for local development and as a secret in Sites for production. Never put it in browser code or hosting metadata. Requests use the Responses API with structured output, `store: false`, no tools, a 45-second timeout, and no automatic retries. Saving evidence or changing incident details invalidates the previous AI investigation.

The server reserves one US cent before each attempt, including failed attempts. A global SQLite ledger stops new attempts at $4.99 reserved, leaving one cent of the agreed $5 budget for setup and local validation. At the verified Luna standard rates ($0.20/million input tokens and $1.20/million output tokens), the 25,000-byte input/context bound and 1,600-output-token ceiling keep each request below one cent. This is a conservative app allowance, not an OpenAI account spending limit, and does not cover usage from other applications. Review the bound if the model or pricing changes. Local and production ledgers are separate; do not run repeated paid local tests outside the setup allowance.

The unique owner/ticket/revision reservation prevents duplicate clicks from issuing multiple paid requests. Failed attempts are not refunded; adding evidence or a work note creates a new revision eligible for another attempt. Results from a concurrently changed incident are discarded. Budget exhaustion requires a deliberate code/configuration change; it never resets automatically.

`GET /api/ai` returns connection presence and allowance metadata. `POST /api/tickets/:id/ai` takes only `revision` and requires the same authentication/origin checks as other writes. Unit tests mock the provider and cover duplicate attempts, exhausted allowance, failed calls, ownership, invalid evidence references, and concurrent changes. `node tests/ai-live-smoke.mjs` is an **explicit paid local test**, excluded from the ordinary test suite. A real Luna response was verified through the local Worker and persisted in D1; this is a smoke test, not a broad AI quality evaluation.

## Next milestone

Build a held-out evaluation set with ambiguous logs, misleading evidence, and prompt-injection attempts. Start any future real endpoint adapter read-only in a dedicated lab.

## Mac-only service lab

Open `Start Local Lab.command` to run the existing ResolveAI app and a separate local HTTP service/monitor. Node must be installed (the launcher also recognizes this Mac's bundled Codex runtime). Keep its Terminal window open; close it or press Control-C to stop the lab. No hardware, Docker, public tunnel, or paid AI request is required.

The dashboard is at `http://127.0.0.1:4318`; the monitored service is `http://127.0.0.1:4319/health`; the local incident desk is `http://localhost:3000`. The monitor checks every two seconds with a one-second timeout. Three consecutive failures create one reported incident containing actual HTTP observations; three healthy responses append a recovery note to that incident. It does not automatically resolve the incident or call AI. The service is intentionally demo software, explicitly identified in each incident.

Use **Stop service**, wait for the incident ID, then **Restart service** and wait for the recovery event. Open local ResolveAI, select the matching incident, review the recorded evidence/recovery, and resolve it with your own verification note. Local records use the starter's development identity and local D1 database; they do not sync to the hosted account.

The dashboard binds only to loopback, validates its Host header, and requires a matching Origin for control requests. Controls signal only the child process created by this lab; there is no arbitrary command/URL input. A state-machine test checks debouncing and transition deduplication. A real HTTP integration cycle verified outage creation, no duplicate incident during continued failure, recovery recorded on the same incident, and cross-origin control rejection.

Limitations: the monitor and its recent probe history are in-memory and stop when the process exits or the Mac sleeps. Incidents already saved in local D1 survive restart. Incident-sync failures appear in the dashboard; ambiguous creates are not automatically retried to avoid duplicates. This is a single-service learning lab, not production monitoring. Launch only one copy and keep ports 3000, 4318, and 4319 available.

### Functional ingestion milestone

The lab now runs an actual SQLite-backed ingestion service. Every two seconds the monitor checks `/health`, posts a uniquely identified record to `/records`, and validates the database-read response. `/records` also exposes the latest five persisted rows and retained count (maximum 1,000). Data lives in ignored `local-lab/data/records.sqlite` and survives service restarts. Workload records are synthetic; database operations and HTTP failures are real.

Additional controls use parent-owned IPC: **Block database writes** enables SQLite `query_only`; **Delay processing** introduces 1.8 seconds of processing delay against a one-second monitor deadline; **Restore normal operation** clears both faults. A successful liveness response alone no longer means the service is working. Timed-out writes are abandoned when their client disconnects before execution. No device access, AI requests, or production integration is implied.

Run `node tests/functional-lab-smoke.mjs` with the local lab and incident desk running. It exercises both faults, verifies liveness stays HTTP 200, checks stored-record growth stops, verifies distinct incidents and recovery on the same record, and saves measured detection/recovery durations to ignored `local-lab/data/latest-evaluation.json`. The dashboard displays these observed results. This is functional monitoring evaluation; AI diagnostic accuracy remains unmeasured. Earlier instructions describing health-only probes are superseded by this functional check.

### Submit a request yourself

The local lab now starts with a user-facing request form. `/submit` validates a bounded title, forwards a uniquely identified write to the ingestion service, and reports success only after matching read-back. Failures preserve the user's input and explain unavailable service, rejected database writes, or missing confirmation before timeout. Recent user requests are listed separately from automatic monitor records. Nothing is sent to an external IT department.

`node tests/request-lab-smoke.mjs` verifies persistence, absence of a rejected write, blank-input validation, and cross-origin rejection against the running local lab. It restores database writes after testing. The form does not invoke AI; automatic incident creation still requires three failed functional checks.

### Correlated request evidence

Each functional probe has a unique request ID carried through application processing, database insertion, and database read-back. The child service emits bounded trace events over its parent-owned IPC channel. The monitor retains up to 100 request traces with up to 12 events each, and snapshots the matching trace into incident evidence after repeated failures. Trace data contains stages and timing, not submitted text or fault-control labels.

For database errors, the collector reads the actual SQLite `query_only` setting. This distinguishes observed query-only mode from a speculative filesystem-permission diagnosis. For a timeout during application processing, the evidence shows application start without database-write start as of collection time; it does not claim to identify an underlying production code defect. Later trace events are not retroactively applied to saved snapshots. Traces are local and volatile; evidence already saved in incidents persists.

Run `node tests/tracing-lab-smoke.mjs` against the running local lab and incident desk to verify request correlation, healthy stage completion, read-only evidence, pre-database timeout localization, and incident evidence persistence. It restores normal operation and does not call AI.

### Automatic incident brief

New incidents now receive an evidence-based title and description with impact, observations, next checks, and what remains unproven. `local-lab/brief.mjs` uses explicit rules over three failed, request-correlated observations. Supported cases are observed SQLite query-only failures, application processing still incomplete at the client deadline, and refused health connections. Mixed observations or missing traces produce an unknown classification. These briefs do not call AI and do not consume fault-control labels. Existing incident descriptions are preserved; only new incidents get the brief.

The brief is a transparent baseline for later AI evaluation, not a replacement for a technician. Trace completeness is not guaranteed, a timeout does not prove the database healthy, and observed read-only mode does not identify who enabled it. Unit tests cover abstention and correlation as well as supported cases. The tracing integration test checks that the brief is saved with real evidence in the incident desk.

### Competing-writer failure

The lab can hold a real `BEGIN IMMEDIATE` transaction on a second SQLite connection. This blocks the ingestion connection's writes while reads and health checks remain available. Restore releases it with `ROLLBACK`; shutdown also closes the competing connection. The control is inside the existing collapsed practice panel.

Before adding a diagnosis rule, the collector returned unknown for this new case. The original evidence is preserved in `evaluation/lock-observations.json` as a regression fixture. The new rule requires three request-correlated database lock errors with query-only disabled. It recommends inspecting transactions and concurrent writers, without claiming to identify the lock owner. This fixture was used to develop the rule and must not be represented as held-out accuracy.

`node evaluation/lock-check.mjs` exercises the current behavior, checks that the diagnosis is saved to the incident desk, verifies recovery, and writes an ignored local result. It does not overwrite the original baseline fixture and does not call AI. This adds one supported failure type; it does not establish general production diagnostic accuracy.

### Durable inventory delivery

The inventory watcher now persists lifecycle state and an ordered pending-event queue in local SQLite. `/api/collector` accepts bounded authenticated outage/recovery events with an episode UUID. Ticket IDs are stable per owner/episode, creation replays return the existing incident, and recovery is appended once using optimistic concurrency. No schema migration is needed; collector replay metadata lives in the ticket payload. Other incident routes and the original lab monitor retain their existing behavior.

Lost responses can be retried without duplicating writes. Both outage and recovery can queue while the desk is unavailable, then arrive in order after a collector restart. Queue capacity is bounded and never silently evicts pending evidence. The watcher retains its local single-process lock and existing log rotation. Read the inventory integration README for disk, restart, ownership, and delivery limitations. This change is running in the local app; it has not been published to the hosted site.

### Real Mac connection checks

Open `http://127.0.0.1:4318/` and choose **Check my connection**. The local Node process checks external network addresses, DNS resolution, and HTTPS reachability to example.com and www.apple.com. Results explain the next step without changing settings or sending diagnostic data to an AI service. Successful connections do not rule out site-specific, browser, VPN, or intermittent problems. Checks are bounded and concurrent clicks share one run. Sample-service repair experiments remain at `/lab`.
