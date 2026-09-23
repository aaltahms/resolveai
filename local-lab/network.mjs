import os from 'node:os';
import { Resolver } from 'node:dns/promises';
import https from 'node:https';

export function reach(host, transport = https, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const request = transport.request(
      { hostname: host, method: 'HEAD', path: '/', timeout: timeoutMs },
      (response) => {
        response.resume();
        clearTimeout(deadline);
        resolve({
          host,
          ok: true,
          detail: `Secure connection received an HTTP ${response.statusCode} response.`,
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('Timed out')));
    const deadline = setTimeout(
      () => request.destroy(new Error('Timed out')),
      timeoutMs + 1000,
    );
    request.on('error', () => {
      clearTimeout(deadline);
      resolve({
        host,
        ok: false,
        detail: 'A secure connection could not be completed.',
      });
    });
    request.end();
  });
}

export function interpretNetwork({ connected, dns, sites }) {
  if (sites.length === 2 && sites.every((site) => site.ok))
    return {
      title: 'Your Mac can reach the internet',
      explanation:
        'Both test websites answered over a secure connection. A problem with one app or website may still exist.',
      next: 'Try the website or app that was failing. If it still fails, try it in a private browser window. If only that site fails, the issue may be specific to that site, browser, or app.',
    };
  if (!sites.length || !dns.length)
    return {
      title: 'Connection checks are incomplete',
      explanation:
        'Some expected results are missing. Missing evidence cannot confirm a working connection.',
      next: 'Run the checks again. If this continues, restart the local service.',
    };
  if (connected === false)
    return {
      title: 'Your Mac may not be connected to a network',
      explanation:
        'No active external network address was found, and the internet checks did not all succeed.',
      next: 'Open System Settings → Network. Connect to your Wi-Fi network or check your Ethernet cable, then run these checks again.',
    };
  if (
    dns.length === 2 &&
    dns.every((check) => !check.ok) &&
    !sites.some((site) => site.ok)
  )
    return {
      title: 'Website address lookups are failing',
      explanation:
        'Neither test website name could be looked up. This can happen with DNS trouble, a disconnected router, or a restricted network.',
      next: 'Check whether another device on the same Wi-Fi can browse. If this is public Wi-Fi, open a browser and look for its sign-in page. Reconnect to the network and check again.',
    };
  return {
    title: sites.some((site) => site.ok)
      ? 'Your connection works for some websites'
      : 'Secure browsing checks failed',
    explanation:
      'The checks could not establish every secure connection. These results alone cannot identify a router, VPN, firewall, or website as the cause.',
    next: 'Try the same websites in your browser and check another device on this network. If you use a VPN, check its connection status. Run the checks again after reconnecting.',
  };
}

let running;
export function checkNetwork({
  interfaces = os.networkInterfaces,
  connect = reach,
  lookup,
} = {}) {
  if (running) return running;
  running = (async () => {
    let connected = null;
    try {
      connected = Object.values(interfaces())
        .flat()
        .some(
          (item) =>
            item &&
            !item.internal &&
            item.address &&
            !item.address.startsWith('169.254.') &&
            !item.address.startsWith('fe80:'),
        );
    } catch {
      /* Preserve unavailable rather than claiming disconnected. */
    }
    const hosts = ['example.com', 'www.apple.com'];
    const resolver = new Resolver({ timeout: 2000, tries: 1 });
    const [dns, sites] = await Promise.all([
      Promise.all(
        hosts.map(async (host) => {
          try {
            await (lookup ? lookup(host) : resolver.resolve4(host));
            return { host, ok: true };
          } catch {
            return { host, ok: false };
          }
        }),
      ),
      Promise.all(hosts.map((host) => connect(host))),
    ]);
    const result = { connected, dns, sites };
    return {
      ...result,
      ...interpretNetwork(result),
      checkedAt: new Date().toISOString(),
    };
  })().finally(() => {
    running = undefined;
  });
  return running;
}
