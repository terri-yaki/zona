# Zona mobile app (Expo SDK 56)

## Configure

1. Copy `.env.example` to `.env` and add the Supabase project URL and public
   publishable key. A local `.env` is already ignored by Git.
2. The iOS bundle identifier (`com.terriyaki.zona`) and the linked EAS
   project (`terriyaki/zona`) are already configured in `app.json`.
3. Enable anonymous sign-ins in Supabase Authentication → Sign In / Providers.
   To test account recovery, also enable email and manual identity linking;
   configure Apple, Google, or GitHub in Supabase before those buttons appear.

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
require a physical device and an EAS development, preview, or production build;
Expo Go cannot receive remote pushes. Android builds also require the push
transport setup in `../docs/ANDROID_PUSH.md`.

## Build for TestFlight

```sh
npx eas-cli login
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

Follow EAS prompts to create or select the App Store Connect app, distribution
certificate, provisioning profile, and APNs key. Test anonymous sign-in and
push behavior in the actual TestFlight build before relying on it for alerts.
