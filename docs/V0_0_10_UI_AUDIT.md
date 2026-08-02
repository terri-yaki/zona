# v0.0.10 UI/UX audit

Audit date: 2026-08-01
Scope: sign-in, inbox, notification detail, sources, access keys, settings,
account, runtime banners, and the new App Status screen on iOS and Android.

## Findings and resolutions

| Severity | Finding | Resolution |
| --- | --- | --- |
| Critical | The sign-in screen used large decorative floating circles that added visual noise without helping the task. | Removed both ornaments; brand, promise, and sign-in actions now carry the hierarchy. |
| Major | Three source actions were forced onto one row, so localized labels and larger text could collide or clip. | Actions now wrap with sensible minimum widths while keeping destructive actions visually distinct. |
| Major | Several badges and uppercase labels used 8–10 point text, below a comfortable mobile reading size. | Core badges and section labels now use 11–12 point text with adjusted padding. |
| Major | The source rename icon and runtime-banner dismiss control had undersized visual targets. | Both now provide at least a 44-point target; banner links use the same minimum height. |
| Major | Conditional Settings rows could leave a divider at the beginning of a group after a remote control hid the previous row. | Dividers are derived from the visible rows instead of fixed positions. |
| Major | A remotely hidden inbox filter could remain active in the data query. | Queries now use only currently visible filter state; hidden filters cannot silently narrow results. |
| Minor | A growing source list had no quick way to find one sender. | Added a localized, case-insensitive search with a clear action and dedicated no-results state. |
| Minor | Delivery/control health existed but was difficult for a user to understand. | Added App Status with plain-language states, a manual refresh, capacity, app details, and a validated support link. |

## Design checks

- No fake operating-system chrome, decorative gradient text, floating glass
  cards, marketing-page grids, or remote arbitrary UI definitions were added.
- Existing Meadow, Ocean, Sunset, and Violet theme tokens remain the source of
  color. Severity candy colors still communicate alert urgency; normal content
  remains neutral.
- Destructive account/source/key actions remain reachable regardless of
  presentation controls.
- New user-facing strings exist in English and Traditional Chinese.

## Remaining release evidence

- Capture screenshots at 320, 375, and 430 point widths on both platforms.
- Repeat primary flows with the largest supported text size and screen reader.
- Verify copy/share sheets and App Status support linking on physical iPhone and
  Android hardware.
