import { guides } from './incidents.ts';

const fixes: Record<string, string> = {
  disk: 'If the affected volume or quota is full, have its owner free approved disposable data or increase capacity. Do not delete unfamiliar system or application files.',
  dns: 'Correct a misspelled hostname if the service owner confirms the intended name. If only the affected environment fails lookup, investigate its resolver or required network connection before changing DNS settings.',
  refused:
    'If the configured endpoint is wrong, correct it. If the expected service is stopped, have its owner start it after checking why it stopped.',
  timeout:
    'Use the affected-versus-working comparison to identify the failing dependency or network path. Restore that dependency with its owner; increasing a timeout alone does not fix the cause.',
  permission:
    'If the execution identity lacks intended access, have the resource owner grant only the required permission. Do not make the entire directory world-writable.',
  port: 'If a duplicate instance owns the port, arrange to stop that duplicate after identifying it. Otherwise assign a nonconflicting port and update its clients together.',
  missing:
    'Restore the required artifact from the approved build or correct the verified path. Do not create a blank substitute for a missing configuration or data file.',
  'db-auth':
    'If the application uses an obsolete secret, update its approved secret reference through the normal credential process. Do not paste the password into the incident.',
  'db-pool':
    'If aggregate pool sizes exceed capacity, coordinate smaller pools. If connections are leaking, fix their release path. Do not terminate arbitrary database sessions.',
  watchdog:
    'A kernel lockup needs device-specific investigation. Preserve the trace and compare the failing driver or firmware with a known-good build; arrange a controlled rollback with the device owner if the evidence supports it.',
};

export const playbooks = [
  {
    id: 'mac-meeting-mic',
    title: 'People cannot hear me in a meeting',
    category: 'application',
    platform: 'macOS',
    meaning:
      'A muted microphone, the wrong input, or app access can produce the same symptom. Record what you see before changing anything.',
    checks: [
      'Check the meeting mute button and any physical headset mute switch. Record which microphone the meeting app selected.',
      'Open System Settings → Sound → Input. Compare the intended input with the meeting app; record whether its level responds when you choose to speak.',
      'Review Privacy & Security → Microphone for the meeting app or browser. For a browser meeting, also review that site’s microphone permission.',
    ],
    fix: 'Select the intended input or correct an observed mute setting. If access is denied, review whether you trust the app before choosing to grant microphone access. If settings are managed or locked, ask IT with the exact message.',
    verify:
      'Use the meeting app’s test feature if available, then confirm someone can hear you in the original meeting. Record whether the intended microphone was used.',
    source: 'https://support.apple.com/en-au/guide/mac-help/-mchl211c911f/mac',
  },
  {
    id: 'mac-meeting-camera',
    title: 'My camera is blank in a meeting',
    category: 'application',
    platform: 'macOS',
    meaning:
      'A selected camera, app access, and a physical shutter are separate checks. A blank preview alone does not identify a hardware failure.',
    checks: [
      'Check the physical shutter or camera connection and the camera selected in the meeting app.',
      'Review Privacy & Security → Camera for the app or browser, and site permissions for a browser meeting.',
      'Record the exact preview error and whether another app is using the camera. Do not interrupt an ongoing call just to test.',
    ],
    fix: 'Correct an observed camera selection or closed shutter. Review access only for the app you intend to use. When you can leave other camera sessions safely, close them normally and retry the preview. If access is managed, contact IT.',
    verify:
      'In the original app, deliberately enable your camera preview and confirm the intended image appears. Record the result without attaching private images.',
    source: 'https://support.apple.com/en-au/guide/mac-help/-mchl211c911f/mac',
  },
  {
    id: 'mac-meeting-sharing',
    title: 'I cannot share my screen in a meeting',
    category: 'application',
    platform: 'macOS',
    meaning:
      'Meeting roles, the selected share target, and macOS capture access can independently prevent sharing.',
    checks: [
      'Record the exact sharing error and whether the meeting host allows participants to present.',
      'Check whether you selected a window or display in the meeting app’s sharing picker.',
      'Review Privacy & Security → Screen & System Audio Recording for the meeting app or browser; record its state without changing it.',
    ],
    fix: 'Ask the host for presenter access if needed. If macOS access is denied, decide whether to grant it to the trusted meeting app. Follow any relaunch prompt when you can leave the call safely. Share only the window you intend; do not enable remote-control Screen Sharing in General → Sharing for this issue.',
    verify:
      'Share a harmless test window in the original meeting and ask a participant to confirm they can see it. Stop sharing afterward and record the result.',
    source: 'https://support.apple.com/en-au/guide/mac-help/-mchl211c911f/mac',
  },
  ...guides.map((g) => ({
    ...g,
    platform: 'Application / service',
    fix: fixes[g.id],
  })),
  {
    id: 'windows-printer',
    title: 'Windows printer will not print',
    category: 'application',
    platform: 'Windows',
    meaning:
      'Check the printer connection and queue before changing drivers or shared printer settings.',
    checks: [
      'Confirm the printer is powered on and connected to this PC or the intended network.',
      'Check whether the intended printer is selected and whether jobs are stuck in its queue.',
      'Run the printer troubleshooter in Windows Get Help and record its result.',
    ],
    fix: 'Follow the specific remedy offered by the printer troubleshooter. If the printer itself is unresponsive, arrange a restart with anyone sharing it. Driver or sharing changes need the printer owner’s involvement.',
    verify:
      'Print a test page, then print the original document from the application that failed.',
    source:
      'https://support.microsoft.com/en-US/Windows/Hardware/printer/fix-printer-connection-and-printing-problems-in-windows',
  },
  {
    id: 'mac-printer',
    title: 'Mac printer will not print',
    category: 'application',
    platform: 'macOS',
    meaning:
      'A queue or connection issue can prevent printing even when the document looks normal.',
    checks: [
      'Check the printer connection and whether this Mac and a network printer are on the intended network.',
      'Open the printer queue and check whether it is paused or shows a failed job.',
      'Try another document to distinguish a document problem from a printer problem.',
    ],
    fix: 'Resume a paused queue if appropriate. If one of your own jobs is blocking the queue, cancel that job and resend it. Record the result before considering removal or a printing-system reset.',
    verify: 'Print the original document successfully from the same Mac.',
    source: 'https://support.apple.com/en-euro/guide/mac-help/mh14002/mac',
  },
  {
    id: 'windows-network',
    title: 'Windows cannot connect to the internet',
    category: 'network',
    platform: 'Windows',
    meaning:
      'First distinguish a single-site problem from a wider connection problem.',
    checks: [
      'Try a second known website and record whether one site or all sites fail.',
      'Check whether another device on the same network can connect.',
      'Run Network and Internet troubleshooting in Windows Get Help and record its findings.',
    ],
    fix: 'Apply the relevant recommendation from Get Help after reviewing its effect. If multiple devices fail, take the findings to the network owner; changing this PC may not resolve the outage.',
    verify: 'Reopen the original site and repeat the action that failed.',
    source:
      'https://support.microsoft.com/en-gb/windows/windows-troubleshooters-1c8cf7ce-0388-4ed3-985d-a305432ae702',
  },
  {
    id: 'windows-audio',
    title: 'Windows has no sound',
    category: 'application',
    platform: 'Windows',
    meaning:
      'Identify whether the issue affects one app, one output device, or all audio.',
    checks: [
      'Check mute and volume in the affected app and on the output device.',
      'Check whether sound is being sent to the intended speakers or headset.',
      'Run the audio troubleshooter in Windows Get Help and record its findings.',
    ],
    fix: 'Select the intended output and correct any mute setting you find. If sound still fails, follow the audio troubleshooter’s relevant recommendation.',
    verify:
      'Play audio in the original app through the intended speakers or headset.',
    source:
      'https://support.microsoft.com/en-gb/windows/windows-troubleshooters-1c8cf7ce-0388-4ed3-985d-a305432ae702',
  },
];

export function captureSummary(evidence: string) {
  if (!evidence.startsWith('Source: Chrome user-triggered capture;'))
    return null;
  const rows = evidence
    .split('\n')
    .filter((line) =>
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|OTHER) /.test(line),
    );
  const actions = rows.filter(
    (line) => !/^GET \/state — HTTP [23]\d\d /.test(line),
  );
  const failures = actions.filter((line) =>
    /HTTP [45]\d\d|network failure/i.test(line),
  );
  return {
    background:
      rows.length -
      actions.length +
      Number(
        evidence.match(
          /^(\d+) successful background checks omitted\.$/m,
        )?.[1] || 0,
      ),
    actions,
    failures,
    message:
      actions.length === 0
        ? 'Only background checks were captured. Your Save action was not recorded. Start a new capture, submit a request within one minute, then stop and send.'
        : failures.length
          ? 'A request failed. This is a symptom; the browser cannot establish the server’s root cause.'
          : 'Requests were captured, but none reported an HTTP or network failure. Describe what went wrong on screen before choosing a fix.',
  };
}
