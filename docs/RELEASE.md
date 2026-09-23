# Portfolio release — scope freeze

The case library is frozen at 12 live Mac checks and 17 guided procedures. Further cases are deferred so the project can be demonstrated and discussed clearly.

## Release verification

- 96 automated tests passed; TypeScript passed.
- All 12 live diagnostic routes passed, including origin and unknown-command rejection.
- Incident API integration passed creation, persistence, revision conflicts, validation, closure, reopening, and Unicode evidence. The test uses fresh HTTP connections because the local development server returned an empty 400 after deliberate rejected requests on a reused connection; this transport behavior remains a development-server limitation.
- Three real lab repairs passed nine independent write/read checks, replay protection, stale-plan rejection, and foreign-origin rejection. Normal sample-service operation was restored.
- Stopping the Mac-check process and rerunning the launcher restored it while reusing the incident desk. A full cold start of both services was not exercised against the existing desk session.
- Launcher recognizes running ResolveAI services and waits for readiness when starting services. It does not kill existing services or install persistent system configuration.
- Publishable working-tree files were scanned for common API-token and private-key patterns. No matches were found. This is a limited pattern scan, not a guarantee that Git history or all personal data is safe.
- Environment files, local SQLite data, dependencies, and build outputs are ignored. Review Git history and any screenshots before making a repository public.
- Full-project lint passes after fixing active code and removing unused generated UI components.

## Packaging review — September 14, 2026

- Production build, TypeScript typecheck, and full-project lint passed after the final copy and cleanup changes.
- Reviewed 204 publishable working-tree files and 264 reachable historical file blobs across 25 commits for common credential patterns, email addresses, personal home paths, and hosted-project identifiers. No common credential patterns were found. This is a bounded pattern review, not a guarantee of secret absence.
- An older launcher commit contains a personal home path. The hosted project identifier also exists in history and current hosting metadata. Publish from a reviewed source export without Git history if those historical details should remain private.
- Three screenshots were visually reviewed; none shows private records, credentials, personal contact details, or host identifiers.
- Corrected the incident landing page to say 17 guides and to describe the launcher’s existing service reuse. No feature changes.

## Remaining limits

Terminal must stay open; startup is not an always-on service. Live hardware recovery is not validated for physical printers or external disks. No paid AI evaluation was run for this release. The hosted version is unchanged. Incident and lab integration tests create clearly labeled synthetic local records.

## GitHub handoff

Create the repository when ready, review `git status` and the staged diff, exclude local data and credentials, and publish only reviewed source. No remote is configured and nothing has been pushed.

Suggested repository description: “Local IT troubleshooting workbench with read-only Mac diagnostics, evidence-based incident workflows, and scoped repair verification in a controlled service lab.”

Suggested résumé bullet: “Built an IT troubleshooting workbench with 12 read-only Mac checks, 17 guided procedures, owner-scoped incident storage, and approval-gated lab repairs verified through independent write/read checks.”

Do not claim production deployment, enterprise adoption, general root-cause accuracy, or automatic repair of users’ devices.
