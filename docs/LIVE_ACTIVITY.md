# Live Status (iOS Live Activity)

Zona can show a **Live Status** surface on the iPhone **Lock Screen** and
**Dynamic Island**: unread count, latest source name, and latest alert title.

## User experience

1. Open **Settings → Notifications → Live Status** and turn it on.
2. When the inbox has unread alerts and the app is running (or becomes active),
   a Live Activity starts with Zona colors and monogram.
3. Marking alerts read (or **Read all**) ends the activity.
4. Turning Live Status off ends the activity immediately.

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

## Implementation

| Piece | Role |
| --- | --- |
| `expo-live-activity` | Config plugin + ActivityKit bridge (SDK 54 path; package archived upstream in favor of newer `expo-widgets` on later SDKs). |
| `zona/src/lib/live-activity.ts` | Preference storage, start/update/stop, soft failures. |
| `zona/src/components/LiveActivitySync.tsx` | Mirrors unread + latest notification into the activity. |
| `zona/assets/liveActivity/` | Monogram assets (`zona_mark`, `zona_island`); keep each **under 4 KB**. |
| Settings | Local AsyncStorage flag `zona.live_activity_enabled`. |

Deep link: activity config uses scheme path `/` or `/notification/{id}` via
the app `scheme` (`zona`).

## Rebuild after enabling

```sh
cd zona
npx eas-cli build --platform ios --profile preview --non-interactive
```

Install the new IPA, enable **Live Status**, send a test alert, open the app,
then check Lock Screen / Dynamic Island.
