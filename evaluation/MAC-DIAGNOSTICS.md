# Mac diagnostic release — 2026-09-12

Local entry point: http://127.0.0.1:4318/. No hosted release was made.

## Capability boundaries

| Problem | Actual observations | Limits and next step |
| --- | --- | --- |
| Internet | External network-address presence, IPv4 DNS queries, HTTPS HEAD responses from example.com and www.apple.com | A response proves reachability, not that a site is working correctly. No speed, router, proxy, VPN, or captive-portal diagnosis. Browser and OS resolver behavior may differ. Retry the affected site, then recheck. |
| Slow Mac | One-second aggregate CPU activity, read-only macOS memory-pressure sysctl, current-user process CPU estimates and resident memory | Brief activity cannot identify a hung app, thermal throttling, or disk bottleneck. CPU >=85% is a project heuristic. Confirm sustained activity in Activity Monitor and retry the original workload. |
| Low storage | `df -k /System/Volumes/Data` available and total bytes | APFS shares capacity. No file scan, purgeable-space estimate, other-volume check, or quota check. Low means below 10 GiB or 10% available, a project heuristic. Review Storage settings and recheck after a user-chosen action. Displayed GB values use binary units (GiB). |
| Unresponsive app | Up to 500 visible processes owned by the server user, grouped by app-bundle name in the UI | Includes system helpers. Same-named apps are combined. Shared resident memory may be counted twice. Missing apps may be outside the list. Does not query window responsiveness or conclude an app is hung. User checks a harmless menu and Activity Monitor before choosing any quit action. |

Memory-pressure values are the userspace dispatch flags (1 normal, 2 warning, 4 critical), not the kernel's internal enum. Apple's [sysctl implementation](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_memorystatus_notify.c) converts the internal level before returning it. Unknown values remain unavailable.

Commands are fixed executable/argument pairs using `execFile`, never a shell or caller-supplied command. Each command has a three-second deadline and 256 KiB output limit. Process arguments and full executable paths are not returned. Diagnostic results are transient; no paid AI requests or incident persistence are involved. Checks bind to loopback and require the existing exact Host and same Origin. Concurrent clicks for a check share its in-flight result. The browser has a 12-second request deadline and a recoverable error state.

The existing lab runner still starts its owned sample service and synthetic monitor. Those lab writes are separate from the read-only host diagnostics. The incident desk, extension, repair controller, and repair history storage were preserved. The desk on 3000 is optional for these four flows.

## Verification performed

- 75 automated tests passed using the full `tests/*.test.mjs` suite. This includes existing repair, monitoring, incident, and privacy regressions.
- New fixtures cover malformed/partial OS output, denied access, high CPU versus memory pressure, low storage thresholds, missing CPU data, process-path filtering, command timeout, unknown command rejection, unsupported OS, and in-flight deduplication.
- Network fixtures cover missing evidence, partial reachability, error/timeout handling, unavailable interfaces, concurrent runs, and the host-argument regression found during live browser testing.
- `node tests/diagnostics-live-smoke.mjs` passed on the running service: all four routes, cross-origin rejection for each route, GET rejection, unknown route rejection, and `/lab` availability. This smoke test is read-only and makes no repairs or paid requests.
- In the real browser, all four flows completed at normal and 390px widths. Each recheck rendered a previous finding; the app selection survived a recheck. At 390px, document and viewport widths both measured 390px. Screenshots were visually inspected for wrapping and clipping. Keyboard Tab from the app selector reached the evidence disclosure.
- Live observations: both HTTPS hosts responded; Data-volume space was available; the OS reported warning memory pressure; visible app activity was returned. These are temporary observations, not a diagnosis of Aymen's current symptoms or proof of repair.
- The restricted command environment denied `ps` and the pressure sysctl; storage remained readable. The normal local server returned these readings. Safe fixtures verified the unavailable-data response; no settings or permission changes were used to manufacture an OS fault.
- Lint passed for the diagnostic modules and their tests; `git diff --check` passed. Including the existing runner in lint reports its pre-existing `no-unused-expressions` violation at the control-result callback. That unrelated expression was preserved.
- A failed live network request exposed an array callback argument regression, which was fixed and then verified by both orchestration fixtures and the live browser.

Run from the repository:

```sh
node --experimental-strip-types --test tests/*.test.mjs
node tests/diagnostics-live-smoke.mjs # requires the local runner
```

No disk filling, app termination, network disruption, or fault injection on the user's Mac was performed. No general repair or diagnostic accuracy claim is made. There are no blockers to the four local flows; checking actual app responsiveness remains a manual step by design.
