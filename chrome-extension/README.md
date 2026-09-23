# ResolveAI Capture for Chrome

Capture a failed action on the local test website, review the request evidence, and send it to a ResolveAI incident. This is a local development extension, not a published Chrome Web Store release.

## Install once

1. Start ResolveAI on `http://127.0.0.1:3000` and the local test website on `http://127.0.0.1:4318` using the project launcher.
2. In Chrome, open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select this `chrome-extension` folder.
4. Pin **ResolveAI Capture** from Chrome’s Extensions menu.

## Try a real failed request

1. Open `http://127.0.0.1:4318/lab` in Chrome. Expand **Test a problem** and choose **Block saving**.
2. Click the ResolveAI Capture extension, then **Start capture**.
3. Submit the page’s form. The application makes an actual request that fails under the selected local fault.
4. Reopen the extension, click **Stop capture**, and review the request statuses and durations.
5. Click **Send to ResolveAI**. A local sign-in page opens and saves your approved report as an incident. Repeating Send for the same capture does not duplicate the incident.
6. Restore the test service when finished.

## Scope and limits

- Only the selected tab on `http://127.0.0.1:4318` is captured, for up to 60 seconds or 40 completed requests.
- Captures request methods, allowlisted static route names, status codes and elapsed times. Omits query strings, unknown paths, headers, cookies, bodies and full URLs.
- Records document and fetch/XHR requests only. Requests still pending when capture stops are omitted. No console, DOM or browser history collection.
- Successful `/state` background checks are hidden from review and summarized in the report. A capture containing only those checks cannot be sent. Failed background checks remain visible.
- Stores the sanitized capture in Chrome session memory. Clear removes it; closing Chrome clears session storage. An approved report saved in ResolveAI persists as a ticket.
- The manifest permits loopback HTTP because Chrome host permissions cannot select a port. Runtime checks restrict capture to port 4318 and delivery to port 3000.
- A failed browser request is evidence, not proof of a database or server root cause. This version does not automatically fix problems or verify recovery.
- No API key is stored in the extension. Capturing and importing do not make paid AI requests.

Automated checks cover sanitization, selected-tab scope, start/stop, report authorization, background-only rejection and duplicate imports. A user capture reached the local incident desk on September 11, 2026; it contained only successful background checks. The updated extension still needs reloading in Chrome and a failed-action capture needs verification.
