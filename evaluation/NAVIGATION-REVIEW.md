# Navigation and layout update

The local troubleshooting, incident-desk entry, lab, and usage guide now share section navigation. A wider layout separates a searchable, grouped case library from the selected diagnostic panel. Mobile selection moves keyboard focus to the selected case. The incident desk entry distinguishes existing guided procedures from saved records and explains the separate server requirement. Local-only return navigation was added to the React incident workspace and guided-procedure page without changing the hosted audience or publishing.

Verification:

- Desktop (1440px): visually inspected troubleshooting, incident-desk entry, and lab; ran a live network check after searching for Wi-Fi.
- Mobile (390px): checked search, selected-case focus, charging check, section navigation, and the guide layout. Troubleshooting, desk entry, lab, and guide all measured 390px content width with a 390px viewport.
- Keyboard: Tab/Enter from search to a case, then Tab from its heading to the check button.
- Empty search: no-match message and recovery after clearing the search.
- Navigated from the desk entry to the actual 14-guide page, then to the incident workspace, then back to the repair lab. No incident or repair was created.
- All 83 automated tests passed. Live smoke passed all seven diagnostic routes and origin/unknown-route safeguards. TypeScript check passed. The new navigation component, shell renderer, and diagnostic UI passed lint. Existing lint findings in the incident page and guide (effect state update and plain internal links) remain outside this change.
- The server restart approval review initially timed out. Its explicitly allowed retry succeeded, and the local app was verified running afterward. A browser tab caught on the temporary connection error was replaced with a fresh verification tab.

The case expansion proposal is in CASE-ROADMAP.md. After the later case work, the current catalogue contains 12 live Mac checks plus 17 guided workflows, with some overlapping topics; deferred proposals are not represented as live capabilities.
