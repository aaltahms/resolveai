// Reduce OS output to the fields needed by the UI. Never return raw inventories,
// battery identifiers, display serial numbers, microphone names, or device UIDs.
const label = (value) =>
  typeof value === 'string'
    ? Array.from(value)
        .filter((char) => char.charCodeAt(0) >= 32)
        .join('')
        .slice(0, 100)
    : 'Unnamed device';
function inventory(text, key) {
  try {
    const value = JSON.parse(text)?.[key];
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
export function parseBattery(text) {
  const source = text.match(
    /Now drawing from '(AC Power|Battery Power|UPS Power)'/,
  )?.[1];
  if (!source) return null;
  const match = text.match(/(\d{1,3})%;\s*([^;\n]+)/);
  if (!match) return { source, percent: null, state: null };
  const percent = Number(match[1]);
  if (percent > 100) return null;
  const value = match[2].trim().toLowerCase();
  const state = [
    'charging',
    'discharging',
    'charged',
    'not charging',
    'finishing charge',
  ].includes(value)
    ? value
    : null;
  return { source, percent, state };
}
export function parseAudio(text) {
  const data = inventory(text, 'SPAudioDataType');
  if (!data) return null;
  const devices = data.flatMap((group) =>
    Array.isArray(group?._items) ? group._items : [],
  );
  return devices
    .filter(
      (d) =>
        d &&
        typeof d === 'object' &&
        (Number(d.coreaudio_device_output) > 0 ||
          d.coreaudio_default_audio_output_device === 'spaudio_yes'),
    )
    .slice(0, 30)
    .map((d) => ({
      name: label(d._name),
      isDefault: d.coreaudio_default_audio_output_device === 'spaudio_yes',
    }));
}
export function parseDisplays(text) {
  const data = inventory(text, 'SPDisplaysDataType');
  if (!data) return null;
  const devices = data.flatMap((gpu) =>
    Array.isArray(gpu?.spdisplays_ndrvs) ? gpu.spdisplays_ndrvs : [],
  );
  return devices
    .filter((d) => d && typeof d === 'object')
    .slice(0, 20)
    .map((d) => ({
      name: label(d._name),
      connection:
        d.spdisplays_connection_type === 'spdisplays_internal' ||
        String(d.spdisplays_display_type).startsWith('spdisplays_built-in')
          ? 'built-in'
          : [
                'spdisplays_displayport',
                'spdisplays_hdmi',
                'spdisplays_dvi',
                'spdisplays_vga',
                'spdisplays_thunderbolt',
              ].includes(d.spdisplays_connection_type)
            ? 'external'
            : 'unknown',
      online:
        d.spdisplays_online === 'spdisplays_yes'
          ? true
          : d.spdisplays_online === 'spdisplays_no'
            ? false
            : null,
    }));
}
const unavailable = (thing, where) => ({
  title: `${thing} could not be read`,
  explanation:
    'macOS returned no usable reading. A restricted launcher, incomplete inventory, or an unsupported output format can cause this; it is not a passed check.',
  next: `Open ${where} to inspect it directly, then try this check again. ResolveAI does not request extra access or change settings.`,
});
export function interpretBattery(battery) {
  if (!battery)
    return unavailable('Battery status', 'System Settings → Battery');
  if (battery.percent === null)
    return {
      title: 'No battery percentage was returned',
      explanation: `macOS reports ${battery.source}, but did not return a battery percentage. A desktop Mac may have no internal battery; this result alone cannot confirm that.`,
      next: 'If this is a laptop, open System Settings → Battery and check its status. If it is a desktop Mac, this laptop charging check does not apply.',
    };
  const explanation = `Battery level: ${battery.percent}%. Power source: ${battery.source}. `;
  if (battery.state === 'charging' || battery.state === 'finishing charge')
    return {
      title: 'Your battery is charging now',
      explanation:
        explanation +
        'The OS reports charging at this moment. This does not measure charging speed or rule out an intermittent problem.',
      next: 'Leave the charger connected and recheck in a few minutes. If the level continues to fall during use, review Battery settings and whether the adapter supplies enough power for your Mac.',
    };
  if (battery.state === 'charged')
    return {
      title: 'macOS reports the battery is charged',
      explanation:
        explanation +
        'No further charging may be needed right now. This is not a battery-health test.',
      next: 'Check the Battery menu for any charge limit or charging message. Recheck when the level changes if charging still seems wrong.',
    };
  if (battery.source === 'Battery Power')
    return {
      title: 'Your Mac is running on battery power',
      explanation:
        explanation +
        'An external power source is not being used in this snapshot. This does not identify a faulty adapter or port.',
      next: 'If you expected charging, check the charger connection and wall outlet. Use a compatible charger and cable, reconnect them, then check again.',
    };
  if (battery.state === 'not charging' || battery.state === 'discharging')
    return {
      title: 'External power is present, but the battery is not charging',
      explanation:
        explanation +
        'Charging can pause because of battery-management settings, temperature, or limited available power. This check cannot tell which applies.',
      next: 'Open System Settings → Battery and read the charging message. Check the charger and cable. Recheck after a few minutes; do not assume the battery needs replacing from this result alone.',
    };
  return {
    title: 'Battery level is available; charging state is unclear',
    explanation:
      explanation + 'The reported charging state was not recognized.',
    next: 'Read the Battery menu or System Settings → Battery for the current charging message, then check again.',
  };
}
export function interpretAudio(outputs) {
  if (outputs === null)
    return unavailable('Audio inventory', 'System Settings → Sound → Output');
  if (!outputs.length)
    return {
      title: 'No audio output devices were listed',
      explanation:
        'The inventory did not list a usable output device. Device access restrictions or incomplete OS data may also produce an empty list; this does not prove a hardware failure.',
      next: 'Open System Settings → Sound → Output. If the device you want is missing there too, check its connection or power. Recheck after reconnecting your intended speakers or headphones.',
    };
  const defaults = outputs.filter((d) => d.isDefault);
  return {
    title:
      defaults.length === 1
        ? `Sound is directed to ${defaults[0].name}`
        : 'Audio devices are visible; the default output is unclear',
    explanation:
      defaults.length === 1
        ? 'macOS lists this device as its default output. An app may choose another output. This check does not read mute or volume, play sound, or verify that you can hear it.'
        : 'Output devices were listed, but exactly one default could not be identified. This is not proof that audio is working.',
    next: 'Open System Settings → Sound → Output and confirm the device you intend to use. Check mute and output volume, then play something familiar yourself. If only one app is silent, check that app’s volume or output selection. Recheck after changing your selection.',
  };
}
export function interpretDisplays(displays) {
  if (!displays?.length)
    return unavailable('Display inventory', 'System Settings → Displays');
  const external = displays.filter((d) => d.connection === 'external');
  const unknown = displays.some((d) => d.connection === 'unknown');
  if (external.length)
    return {
      title: 'macOS lists an external display',
      explanation: `${external.length} external display(s) appear in the inventory. Being listed does not prove that the panel is showing a picture or that it is the display you expected.`,
      next: 'Compare the device names in Evidence and limitations with your expected display. Check the monitor’s power, input source, and brightness. Open System Settings → Displays to review the arrangement, then recheck after reconnecting if needed.',
    };
  return {
    title: unknown
      ? 'Displays are listed, but their connection type is unclear'
      : 'Only a built-in display was identified',
    explanation: unknown
      ? 'The inventory includes a display whose connection type this check does not recognize. It may be external or virtual; ResolveAI will not guess.'
      : 'No external display was identified in this snapshot. This cannot tell whether a cable, adapter, monitor, compatibility limit, or incomplete OS inventory is responsible.',
    next: 'Check the external monitor’s power and selected input. Check the cable and adapter connections, then open System Settings → Displays. Confirm that your Mac and adapter support the display setup you want, and recheck after reconnecting.',
  };
}
export function hardwareResult(kind, raw) {
  const parsers = {
    battery: parseBattery,
    audio: parseAudio,
    displays: parseDisplays,
  };
  if (!parsers[kind]) throw Error('Unknown hardware check');
  const data = raw.ok ? parsers[kind](raw.text) : null;
  const evidence = [];
  if (!raw.ok) evidence.push(raw.reason || 'The read-only OS check failed.');
  if (kind === 'battery' && data)
    evidence.push(
      `Power: ${data.source}; battery: ${data.percent === null ? 'unavailable' : data.percent + '%'}; charging state: ${data.state || 'unavailable'}.`,
      'No battery health, capacity, adapter wattage, or temperature measurement was made.',
    );
  if (kind === 'audio' && data) {
    for (const d of data)
      evidence.push(`${d.name}${d.isDefault ? ' — default output' : ''}`);
    evidence.push(
      'Only output device labels and default-output flags are retained. No microphone recording, device IDs, volume changes, or sound playback.',
    );
  }
  if (kind === 'displays' && data) {
    for (const d of data)
      evidence.push(
        `${d.name} — ${d.connection} connection; OS online flag: ${d.online === null ? 'unavailable' : d.online ? 'yes' : 'no'}.`,
      );
    evidence.push(
      'No screenshots, serial numbers, window contents, or changes to display settings. Unrecognized connections are marked unknown.',
    );
  }
  if (data === null && raw.ok)
    evidence.push('The OS output format was not recognized.');
  return {
    ...{
      battery: interpretBattery,
      audio: interpretAudio,
      displays: interpretDisplays,
    }[kind](data),
    evidence,
    checkedAt: new Date().toISOString(),
  };
}
