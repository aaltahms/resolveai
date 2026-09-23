# Approved local repair verification

Scope: this repository's owned Node process and SQLite database. These are deliberately induced, real process/database failures. This evaluation does not establish general IT diagnosis accuracy, Windows/macOS repair coverage, or AI-selected repair quality. The repair selector is deterministic; the AI investigation has no execution tools.

## Running-service checks

`repair-results.json` records three supported cases:

| Fault | Approved action | Verification |
| --- | --- | --- |
| SQLite query-only connection | Enable writes on that connection | Three new records written and independently read back |
| Owned empty competing transaction | Roll back that transaction | Three new records written and independently read back |
| Owned service stopped | Start its process | Three new records written and independently read back |

The same evaluation confirms foreign-origin rejection, stale-plan rejection, replay without another execution, and survival of a user request through 1,001 machine-record writes. Normal service operation is restored afterward. No paid AI requests are made.

## Browser workflow

The local browser flow was exercised through the actual controls: enable read-only failure, submit a test request and observe failure, request a diagnosis, review and approve the scoped change, observe verified repair, then submit the original test request successfully. The request text was retained after the initial failure. Verification details are collapsed by default and a repair record can be downloaded.

## Restart and refusal checks

Unit tests kill a child process during execution after its applying record is stored, then reopen the audit database. The interrupted record is retained and repeating its approval does not run another action. Other tests cover concurrent approvals, stale or mixed evidence, changed preconditions, and successful HTTP responses without the required stored record.

## Remaining limits

- Only three local service repairs are supported. Unknown or mixed faults and slow processing have no automatic repair.
- Approval is local and origin-checked, not an enterprise identity or remote authorization system.
- The local SQLite audit is bounded to 200 records and is not tamper-proof. It is separate from D1 incident history.
- A verified service write does not prove every user workflow or external dependency is healthy. The user should retry the original task.
- Repaired service state is checked at execution and afterward; no long-term uptime or recurrence guarantee is claimed.
