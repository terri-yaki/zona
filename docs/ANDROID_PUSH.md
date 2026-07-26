# Android push setup

Zona uses Expo Push Service, with Firebase Cloud Messaging (FCM) underneath on
Android. `google-services.json` identifies the Android app inside the native
build; an FCM V1 service-account key lets Expo deliver pushes to that Firebase
project. These are separate credentials and both are required.

The Android package is `com.terriyaki.zona`. A build made before adding Firebase
configuration cannot be repaired with an OTA update; install a newly built APK
or AAB after completing this setup.

## 1. Create the Firebase Android app

1. Open Firebase Console and select or create the Firebase project used for
   Zona.
2. Add an Android app with package name `com.terriyaki.zona`.
3. Download its `google-services.json`.

For local native builds, place that file at `zona/google-services.json`. It is
gitignored. Do not commit it.

For EAS builds, upload it as a file environment variable in every environment
you build from:

```powershell
cd zona
npx eas-cli env:set development --name GOOGLE_SERVICES_JSON --type file --visibility secret --value C:\path\to\google-services.json
npx eas-cli env:set preview --name GOOGLE_SERVICES_JSON --type file --visibility secret --value C:\path\to\google-services.json
npx eas-cli env:set production --name GOOGLE_SERVICES_JSON --type file --visibility secret --value C:\path\to\google-services.json
```

`app.config.js` reads the EAS file path from `GOOGLE_SERVICES_JSON`, falling
back to the local gitignored file.

## 2. Upload the FCM V1 server credential

Create a Firebase service-account JSON key with permission to send FCM messages,
then upload it through EAS:

```powershell
cd zona
npx eas-cli credentials --platform android
```

Choose the Android push-notification / FCM V1 service-account option and upload
the JSON key when prompted. This server credential belongs in EAS credentials,
not in the app, `.env`, Supabase, or Git.

## 3. Deploy Android-aware relay changes

From the repository root, link the intended Supabase project if needed, then
apply the migration and deploy the three changed functions:

```powershell
npx supabase db push
npx supabase functions deploy register-push-token
npx supabase functions deploy notify
npx supabase functions deploy test-source
```

The migration permits `android` in `push_devices.platform`. The functions keep
the actual platform when registering and use Android's default or silent
notification channels. Existing iOS per-source custom tones are unchanged;
Android currently falls back to the system default for those iOS-only tones.

## 4. Make and install a new Android build

Development APK:

```powershell
cd zona
npx eas-cli build --platform android --profile development
```

Install that APK on a physical Android device, start the development server with
`npx expo start --dev-client`, and scan/open the development URL. For a standalone
internal test that does not need Metro, build the `preview` profile instead.

## 5. Verify end to end

1. Open Zona and allow notifications. Android 13 and newer asks at runtime.
2. In Settings, confirm **Zona relay** says **Registered**.
3. Create or open an API key and send its test alert.
4. Confirm the alert appears both as a system notification and in the inbox.
5. Put Zona in the background and repeat using `examples/send-notification.ps1`.

If the app reports that Firebase is not configured, inspect the build profile's
EAS environment and rebuild. If registration succeeds but delivery fails,
check the FCM V1 credential in EAS and the Expo ticket stored in
`private.push_delivery_logs`.
