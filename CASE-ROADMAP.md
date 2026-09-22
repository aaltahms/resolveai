# Deferred case ideas

The portfolio release is frozen. The ideas below are deferred; adding more cases is not required for this release. The current app has **12 live Mac checks** and **17 guided procedures**; some topics overlap, so these are not 29 distinct root causes.

Every added workflow should identify its evidence source, state what it cannot establish, handle unavailable data, give a relevant next action, and verify by rechecking the original symptom. Label it as a live check or a guided procedure. Repairs need separate, scoped authorization.

## Suggested next batches

| Area | Cases to prioritize | Likely approach |
| --- | --- | --- |
| Printing | Queue paused, jobs stuck, wrong/default printer, network printer unreachable | Read-only local queue checks plus guided comparison; no automatic job cancellation |
| Storage and peripherals | External drive missing, external drive read-only, USB accessory missing, Bluetooth pairing failure | Bounded device inventory where available; guided physical checks and permission/compatibility review |
| Meetings | Microphone unavailable, wrong microphone, camera in use, app-specific audio problem | Device inventory plus user-observed app settings; no recording or camera activation |
| Connectivity | VPN connected but internal service unavailable, captive portal, intermittent connection, one website failing | Known-target checks only when supplied/authorized, with clear network-versus-service evidence |
| Accounts and access | Expired password, MFA trouble, account lockout, shared-folder access denied | Guided procedure and escalation; no credential collection or bypasses |
| Work apps | Email stuck in outbox, mailbox sync, cloud-file sync, software install blocked | Guided observation or a specifically connected service; no invented tenant/admin access |

The printer-list, queue-state/job-count, and reported-default checks are now available. Direct network-printer reachability and the remaining batches are proposed work, not enabled capabilities. Keep Mac-only checks distinct from Windows procedures and organization-specific integrations. Start with printers and external drives, then meeting devices, because each fits a coherent, testable workflow.

## Navigation

- **Troubleshooting:** Search and choose one of the live Mac checks, then inspect its finding in the adjacent panel.
- **Incident desk:** Choose guided procedures or saved incident records. These run on the existing service at port 3000.
- **Repair lab:** Practice the approval-and-verification loop on the owned sample service.
- **How to use:** Read a short walkthrough of each area.

The local sections share a persistent sidebar on wider screens and a compact navigation grid on smaller screens. The incident workspace and guided-procedure page include links back to the local sections. No diagnostic permissions were expanded by this UI change.
