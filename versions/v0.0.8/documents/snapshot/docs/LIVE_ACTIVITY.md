# Live Status (iOS Live Activity)

Zona can show a **Live Status** surface on the iPhone **Lock Screen** and
**Dynamic Island**: unread count, latest source name, and latest alert title.

## User experience

1. Open **Settings → Notifications → Live Status** and turn it on (saved on your
   Zona account via `app_options.live_activity_enabled`).
2. When the inbox has unread alerts and the app is running (or becomes active),
   a Live Activity starts: a deep-green glance card showing `N unread · latest
   alert title`, the source, and an "updated Xm" recency line, with the Zona
   monogram on the left.
3. Marking alerts read (or **Read all**) ends the activity.
4. Turning Live Status off ends the activity immediately.

There is intentionally **no countdown**: earlier builds showed an 8-hour
session timer (an Apple lifetime artifact) across the Lock Screen strip and
every Dynamic Island region, which read as "something expires" and pushed the
unread count into a subtitle. Activities started by older builds restart once
to pick up the current theme.

Default is **off** so a new preview install does not surprise you with Lock
Screen chrome.

## Limits (v1)

| Topic | Behavior |
| --- | --- |
| Platform | **iOS only** (iOS 16.2+ for ActivityKit). Android/web are no-ops. |
| Binary | Requires a **development / preview / production** native build. **Not Expo Go.** |
| Updates | **App-driven** while JS can run (open app, Realtime, mark read). If the app is **killed**, the activity may stay stale until the next launch. |
| Lifetime | Session timer about **8 hours** (Apple Live Activity limit). Next open can restart if still unread and enabled. |
| OTA | Shipping or changing the Live Activity **native target** needs a new IPA. Pure JS tweaks to sync logic can OTA after that binary exists. |

Remote ActivityKit push updates (refresh while killed) are **out of scope** for v1.

## Planned design upgrade (needs one new IPA)

The current presentation is the maximum the stock `expo-live-activity`
template allows from JS. The full redesign — a right-side unread-count rail on
the Lock Screen card, an unread-count pill in the Dynamic Island
compact/minimal regions, an "updated … ago" line, and a chip-backed monogram
asset — requires adding `count` / `sourceName` / `updatedAt` fields to the
extension's `ContentState` and custom SwiftUI regions via a patch-package
patch on the package's Swift templates (3 files). That is a native-target
change, so it ships with the next IPA, not OTA. Design board:
[live-activity-redesign.png](live-activity-redesign.png).

## Implementation

| Piece | Role |
| --- | --- |
| `expo-live-activity` | Config plugin + ActivityKit bridge used by the current SDK 56 build; guarded at runtime because the native module is optional and the package is archived upstream in favor of `expo-widgets`. Listed as unmaintained in RN Directory and excluded in `package.json` `expo.doctor.reactNativeDirectoryCheck`. |
| `zona/src/lib/live-activity.ts` | Preference storage, start/update/stop, soft failures. |
| `zona/src/lib/live-activity-presentation.ts` | Pure, unit-tested state/config builders (count-led title, recency subtitle, brand palette). No RN imports. |
| `zona/src/components/LiveActivitySync.tsx` | Mirrors unread + latest notification into the activity. |
| `zona/assets/liveActivity/icon.png` | App icon resized for ActivityKit (from `assets/icon.png`); keep **under 4 KB**. |
| Settings | Server-backed `app_options.live_activity_enabled` (default off). Runtime activity id stays on-device. |

Deep link: activity config uses scheme path `/` or `/notification/{id}` via
the app `scheme` (`zona`).

## Rebuild after enabling (required)

**OTA cannot add Live Activities.** The system toggle and Lock Screen surface
only appear after installing an IPA whose **native binary** was built with the
`expo-live-activity` plugin (commits after `aae1572`).

```sh
cd zona

# First Live Activity build needs an interactive terminal (one time) so EAS can
# create a provisioning profile for the extension:
#   com.terriyaki.zona.LiveActivity
# Non-interactive CI fails until that profile exists on the Expo account.
npx eas-cli build --platform ios --profile preview --clear-cache
```

When EAS says the scheme has multiple targets (**Zona** + **LiveActivity**),
allow it to generate credentials for **both** (same distribution cert is fine).

1. Install the **new** IPA from the Expo build page (delete the old Zona app
   first if install fails). **OTA is not enough.**
2. Open Zona once (so iOS registers the app).
3. Check **iPhone Settings → Apps → Zona** (iOS 18+) or **Settings → Zona**.
   You should see **Live Activities** there — that row is from Apple, not from
   our in-app switch.
4. In **Zona → Settings → Live Status**, turn the feature on.
5. Ensure there is at least one **unread** alert; open the app so JS can start
   the activity. Then check Lock Screen / Dynamic Island.

If **Live Activities** is missing under the app in iPhone Settings, the phone
is still on an older binary (pre–Live Activity). Confirm the IPA commit is after
`aae1572` / includes `expo-live-activity`, then reinstall.
