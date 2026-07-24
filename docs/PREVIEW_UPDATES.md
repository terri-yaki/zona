# Preview updates (users + developers)

Most efficient path for **internal preview** installs of Zona.

## For users

| Situation | What you do |
| --- | --- |
| Everyday JS/UI fix | Open the app. If prompted **Update available → Install**, tap Install. |
| Settings → **Check for app update** | Manual check anytime. |
| New notification sounds / native change | Install a **new preview IPA** from the Expo build link (one-time). |

No Metro server and no computer required for OTA installs.

## For developers

| You changed… | Ship with |
| --- | --- |
| Screens, styles, hooks, most TS/JS | `npx eas-cli update --channel preview --message "…"` |
| `app.json` plugins, new `.wav` sounds, native deps, SDK | `npx eas-cli build --platform ios --profile preview` |
| Supabase only | `supabase db push` / function deploy (no app binary) |

```sh
cd zona

# JS OTA (after a preview binary that includes expo-updates is installed)
npx eas-cli update --channel preview --message "Describe the change"

# Full preview binary (native / first OTA-capable install)
npx eas-cli build --platform ios --profile preview --non-interactive
```

CI (optional): `.github/workflows/preview-ota.yml` runs `eas update --channel preview` on pushes to `main` that touch `zona/` (requires repo secret `EXPO_TOKEN`).

## Rules

1. **OTA only applies** to binaries built with the same `runtimeVersion` (policy: `appVersion` → currently `1.0.0`) and channel `preview`.
2. Bumping `expo.version` requires a **new preview build** before OTA works again for that version.
3. New bundled iOS notification sounds require a **new native build** (they are not OTA assets).
4. Development client + Metro remains the fast coding loop; preview OTA is for “ship without my PC.”

## Production note

Production App Store / TestFlight policy is separate. Preview OTA is approved for internal iteration; production OTA remains a release-process decision (see `RELEASE.md`).
