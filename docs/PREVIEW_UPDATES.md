# Preview updates (users + developers)

Most efficient path for **internal preview** installs of Zona.

## For users

| Situation | What you do |
| --- | --- |
| Everyday JS/UI fix | Open the app. Zona checks the release channel while launching and applies a compatible update on the next launch. |
| Settings → **Check for a quick update** | Manually check, download, and restart into a compatible OTA update now. |
| New notification sounds / Live Activity / native change | Install a **new preview IPA** from the Expo build link (one-time). |

No Metro server and no computer required for OTA installs.

## For developers

| You changed… | Ship with |
| --- | --- |
| Screens, styles, hooks, most TS/JS | `npx eas-cli update --channel preview --message "…"` |
| `app.json` plugins, new `.wav` sounds, Live Activity, native deps, SDK | `npx eas-cli build --platform ios --profile preview` |
| Supabase only | `supabase db push` / function deploy (no app binary) |

```sh
cd zona

# JS OTA (after a preview binary that includes expo-updates is installed)
npx eas-cli update --channel preview --message "Describe the change"

# Full preview binary (native / first OTA-capable install)
npx eas-cli build --platform all --profile preview --non-interactive
```

CI: `.github/workflows/preview-ota.yml` publishes iOS and Android bundles to
the preview channel when `main` changes update-safe app code. Native
configuration, dependencies/lockfiles, plugins, widgets, notification sounds,
and app icons are excluded because those changes require a new signed binary.
Manual dispatch is reserved for an operator who has reviewed the same native
boundary.

**Required GitHub secret:** `EXPO_TOKEN`  
Create at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens), then add under the repo **Settings → Secrets and variables → Actions**. Without it the OTA workflow exits with code 1 (the Node.js deprecation notice in the log is only a warning).

## Rules

1. **OTA only applies** to binaries built with the same `runtimeVersion` (policy: `appVersion` → currently `0.0.10`) and channel `preview`.
2. Bumping `expo.version` requires a **new preview build** before OTA works again for that version.
3. New bundled iOS notification sounds require a **new native build** (they are not OTA assets).
4. Live Status (Live Activity) requires a **new native build** the first time the plugin ships; see `docs/LIVE_ACTIVITY.md`.
5. Development client + Metro remains the fast coding loop; preview OTA is for “ship without my PC.”

## Production note

Production App Store / TestFlight policy is separate. Preview OTA is approved for internal iteration; production OTA remains a release-process decision (see `RELEASE.md`).
