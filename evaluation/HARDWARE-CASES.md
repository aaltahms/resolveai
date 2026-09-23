# Three additional Mac cases

Added battery charging, sound output, and external-display checks to the existing four flows. All seven run at http://resolveai.localhost:4318/ with the numeric loopback fallback retained.

| Case | Read-only observation | What is not established |
| --- | --- | --- |
| Battery not charging | Fixed `pmset -g batt`: current source, percentage, charging state | Battery health, adapter wattage, temperature, or why charging paused |
| No sound | Fixed `system_profiler SPAudioDataType -json -detailLevel mini`: output-device names and default flag | Mute, volume, audible playback, per-app routing, or speaker condition |
| External display missing | Fixed `system_profiler SPDisplaysDataType -json -detailLevel mini`: display names, recognized connection types, online flags | A visible picture, cable failure, adapter compatibility, or which unlisted monitor was expected |

Battery checks have a three-second deadline; the two inventory commands have eight-second deadlines. Output is capped at 256 KiB. The API returns only selected fields: no battery IDs, display serial numbers, microphone names, device UIDs, or raw inventories. Empty and unrecognized inventories remain inconclusive. A device’s presence is never treated as proof of a working speaker or screen. No output selection, charging settings, recording, playback, screenshots, or other device changes are performed.

## Validation

- Full automated suite: **83 tests passed**, including earlier repair and access regressions.
- New fixtures cover charging, charged, battery power, paused charging, absent battery percentage, unknown states, malformed JSON, absent/default/ambiguous audio outputs, built-in/external/unknown display connections, online flags, privacy filtering, denied access, timeouts, unsupported hosts, and concurrent-check sharing.
- Changed diagnostic modules and tests passed lint; whitespace checks passed. Full-project lint now passes after the later cleanup.
- Read-only live smoke passed all seven endpoints, cross-origin rejection for each endpoint, unknown route rejection, GET rejection, and `/lab` availability.
- All three new flows were exercised in the real browser at 1280px and 390px widths. Rechecks showed the previous finding; optional evidence opened correctly. The narrow page width matched the 390px viewport without horizontal overflow.
- The live battery readings changed from charging to battery power between runs. Audio identified the MacBook Air Speakers as default; display inventory listed only the built-in panel. These are snapshots, not user-reported faults or proof of a fix. No faults were deliberately introduced.
- The short guide and in-app guide now explain the new cases.

## Guidance references

The suggested manual checks follow Apple’s guidance while keeping causes conditional:

- [Battery status says Not Charging](https://support.apple.com/en-euro/guide/mac-help/mh20876/mac)
- [Optimized Battery Charging](https://support.apple.com/en-euro/102338)
- [Internal speakers are not working](https://support.apple.com/en-la/102411)
- [External display is dark or low resolution](https://support.apple.com/en-gb/102501)
- [Connecting external displays](https://support.apple.com/en-au/guide/mac-help/mchl7c7ebe08/mac)
