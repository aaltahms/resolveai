# Printing and external storage checks

Printing adds three workflows: missing configured printer, unfinished queue, and wrong default destination. All query localhost CUPS only. Queue counts never imply a stuck job or a successful physical print. Default selection can differ between the checker and an app.

Printer validation: parser, partial-data, privacy, unsupported-platform, and shared-request tests passed. A clearly labeled isolated browser fixture exercised printer selection, rechecking, and narrow layouts. On the development Mac the local scheduler was unavailable and no system default was reported; real printing and physical printer recovery were not validated. No jobs or printer settings were changed.

External storage adds two workflows: missing drive and inability to save. Fixed read-only diskutil commands list external entries; up to 16 OS-provided identifiers are inspected, with strict identifier validation. Built-in plutil converts plist output. Each command has a two-second deadline. Disk images are excluded, unknown/internal classification is not silently treated as external storage, and incomplete inventories are labeled. Only selected volume metadata is returned, never mount paths, identifiers, or UUIDs. Write flags do not prove app or user write access. No mounting, writing, repair, erase, or permission changes occur.

Drive tests cover missing and malformed observations, empty inventories, unknown flags, disk-image filtering, private-field projection, and bounded identifier selection. Physical external-drive recovery remains unvalidated: the development Mac's observed external entry was an installer disk image.

References: [CUPS lpstat](https://openprinting.github.io/cups/doc/man-lpstat.html), [Apple Disk Utility device view](https://support.apple.com/guide/disk-utility/view-all-devices-or-only-volumes-dskud6b39edb/mac).
