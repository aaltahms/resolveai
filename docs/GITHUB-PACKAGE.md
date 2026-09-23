# GitHub publication package

The current working tree is the candidate public source. It contains no tracked environment files, local databases, dependencies, build outputs, or personal résumé files. Nothing has been pushed and no remote is configured.

## Proposed repository details

- Name: `resolveai` (subject to the owner’s choice).
- Description: Local IT troubleshooting workbench with read-only Mac diagnostics, guided incident workflows, and approval-gated service repairs.
- Suggested topics: `it-support`, `troubleshooting`, `macos`, `typescript`, `react`, `sqlite`, `portfolio`.
- License: no license selected. Do not imply that this is licensed open-source software until the owner chooses terms and checks source provenance.

## Review before publication

Review the working tree and README, choose the GitHub owner/name and visibility, then authorize publication. Use a fresh repository initialized from a reviewed source export if publishing without the old personal path and hosted identifier in history.

Install dependencies with `pnpm install`, then run `node scripts/start-local.mjs` on macOS with Node 22.13 or newer. Keep Terminal open. All 96 automated tests, type checking, full-project lint, and the production build passed in the current working tree. See RELEASE.md for precise validation and remaining limits.

The screenshot gallery shows the actual local UI. Guided checks use user-entered observations. Only the owned sample service supports controlled repairs; the project does not automatically repair the Mac.
