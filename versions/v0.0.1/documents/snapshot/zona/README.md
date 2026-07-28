# Zona iPhone app (Expo SDK 54)

## Configure

1. Copy `.env.example` to `.env` and add the Supabase project URL and public
   publishable key. A local `.env` is already ignored by Git.
2. Change `ios.bundleIdentifier` in `app.json` to an identifier owned by your
   Apple Developer account.
3. Run `eas init` and replace `REPLACE_WITH_EAS_PROJECT_ID` in `app.json` with
   the resulting project ID.
4. Enable anonymous sign-ins in Supabase Authentication → Sign In / Providers.

## Develop and verify

```sh
npm install
npm run typecheck
npm run lint
npm test
npx expo start --clear
```

Expo Go can test authentication, source management, inbox synchronization, and
the sending API. Tap **Not now** during notification onboarding. Push tokens
require a physical iPhone and an EAS development, preview, or production build;
Expo Go cannot receive remote pushes.

## Build for TestFlight

```sh
npx eas-cli login
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

Follow EAS prompts to create or select the App Store Connect app, distribution
certificate, provisioning profile, and APNs key. Test anonymous sign-in and
push behavior in the actual TestFlight build before relying on it for alerts.
