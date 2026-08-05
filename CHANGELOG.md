# Changelog

All notable changes to Zona are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) structure and intends
to use semantic application versions. Build numbers are managed by EAS.

## [0.0.12] - 2026-08-05 (re-released 2026-08-06)

### Added

- Save your Zona with an email address and password, then sign back in on
  another phone and pick up where you left off.
- Started privately as a guest? Add an email and password whenever you are
  ready, without losing your sources or history.
- New email addresses are confirmed with a short code sent to your inbox
  before they can protect your account.

### Fixed

- Setting a password on a guest account now works for later sign-in: Zona
  confirms the email first (as Supabase requires), then attaches the password
  after the code check instead of dropping it.
- Opening or returning to Zona no longer leaves the inbox or sources list
  stuck on a spinning indicator; a refresh that stalls now steps aside so the
  latest content can load.
- Quiet hours in Settings now lines up with the other notification rows
  (same label, description, and spacing as the switches above it).
- Inbox filter chips no longer nudge the whole row when you tap them;
  Save/Clear stay reserved in place and chip size stays fixed.
- Password sign-in now explains a wrong password or an unconfirmed email in
  your language and offers to send a new confirmation code, instead of
  showing raw server messages.
- Creating an account with an email that already has one now asks you to sign
  in instead of sending you to wait for a code that never arrives.
- The Account screen's email and password cards no longer share one email
  field, and an account that already signs in with email sees "Change
  password" for its current address instead of a silent email change.
- The delivery card no longer claims an alert is still delivering once it has
  already landed in the inbox.
- Zona Relay reconnects silently every 5 seconds after a disconnect instead of
  showing raw error text under the relay status.

### Changed

- Inbox loading states now show skeleton placeholder rows that mirror the
  notification-card layout instead of a centered spinner, keeping the existing
  accessibility loading announcement intact.
- Source filter chips order revoked sources after active ones so active
  senders stay reachable and revoked chips cannot displace them when the row
  is capped.

## [0.0.11] - 2026-08-02

### Changed

- Choose a clean black-and-white Minimalist look or a dark Neon look alongside
  Zona's four familiar themes.
- Sources and their access keys now use clearer names throughout Zona, so it is
  easier to know whether you are managing a sender or one credential for it.
- Delivery health now says when a phone push service accepted an alert without
  implying that the phone displayed it or somebody read it.
- The delivery details on an alert and the Settings "Device delivery" section
  now require app version 0.0.10 or later; older clients never render them.
  Durable inbox acceptance, queued delivery, retry, and private operator
  diagnostics remain in place.
- Settings now says "Clear cache" plainly, and the confirmation dialog uses the
  same wording.
- Quiet hours now line up cleanly with the rest of Settings and automatically
  follow the phone's time zone, with no time-zone field to manage.

### Fixed

- Switching themes now repaints the navigation header, the tab bar, the notch
  area, and neutral inbox cards; those areas kept the previous palette before.
- Live Status on the Lock Screen now uses the theme color you picked instead of
  always showing the default green.
- Test alerts now follow the same quiet-hours, retry, and delivery-status path
  as every other alert, avoiding a second competing send path.
- Turning off the iOS widget feature now stops Zona from writing new widget
  snapshots; Apple Shortcuts are identified correctly as part of the installed
  app version.

## [0.0.10] - 2026-08-02

### Added

- Find any alert by its message, category, urgency, or source, then save the
  views you return to most.
- Pin the alerts that still need you, mark one unread for later, and fold
  repeated messages into one calmer inbox row.
- Protect focus time with quiet hours for the whole account or a schedule for
  one especially busy source. Every alert still waits safely in the inbox.
- See when each source last spoke, how busy it has been today, and whether phone
  push services accepted its recent alerts.
- Start with a three-step first-alert guide and ready-to-copy examples for AI
  agents, cURL, PowerShell, and GitHub Actions.
- Keep an eye on unread work from an iPhone Home Screen or Lock Screen widget,
  and use Zona from Apple Shortcuts.
- Copy a safe diagnostic summary when support needs to understand the app,
  phone, push, account, and current settings.

### Changed

- Important labels are easier to read, small controls are easier to tap, and
  source actions adapt more naturally to narrow phones and larger text.
- “Check for a quick update” now says exactly what it does: it installs
  compatible fixes, while full app versions still arrive through TestFlight or
  the App Store.

## [0.0.9] - 2026-08-01

### Added

- Open an alert to see whether no phone was targeted, delivery is still moving,
  a phone service accepted it, or every target needs attention—without claiming
  that a provider receipt proves somebody saw the alert.
- See account usage for recent alerts, retained inbox items, sources, active
  keys, phones, attachments, and attachment storage in one place.

### Changed

- Pull requests now rebuild and test a disposable database, check row isolation,
  validate Edge Function contracts, and lint the OpenAPI description before a
  release can move forward.

## [0.0.8] - 2026-07-30

### Added

- Protect your Zona with any recovery method enabled by the service—email,
  Apple, Google, or GitHub—and pick up your sources and recent inbox on another
  phone. Methods that are not configured stay hidden.
- Give scripts and agents their own labelled access keys, replace one safely,
  and keep the same source name, sound, filters, and history.
- See and remove phones that should no longer have access to your Zona.
- Pick a color theme that suits you — Meadow, Ocean, Sunset, or Violet —
  from Settings.
- Sensitive account changes, like unlinking a sign-in method or moving your
  Zona to another phone, now ask for a recent sign-in proof before they go
  through.

### Changed

- Opening Zona or coming back to it always checks the server for new alerts
  and sources; saved copies still paint first while the refresh lands.
- What's New now always asks the server for the latest content instead of
  trusting a fresh-enough saved copy.
- Push delivery runs through a durable queue, so a temporary hiccup retries
  instead of dropping the alert.

## [0.0.7] - 2026-07-29

### Added

- Open Zona and your recent alerts are already waiting, with less time spent on
  loading screens.
- Recent alerts remain available when the connection drops, then Zona quietly
  catches up when you are back online.
- Saved inboxes stay separate for each account and leave the phone when that
  account signs out.
- Settings shows how much space Zona is using and lets you clear saved content
  whenever you choose.

### Changed

- Zona refreshes and reconciles saved alerts quietly after the first screen is
  already useful.

## [0.0.6] - 2026-07-28

### Added

- Helpful in-app notices can explain maintenance or an important update at the
  moment it matters.
- What's New can show only the highlights intended for the current phone,
  language, and release without erasing older history.

### Changed

- Selected presentation can be adjusted safely as the service grows, while
  privacy, account deletion, source revocation, and access checks remain
  permanently available.
- Source, inbox, and settings loading use a more consistent service foundation.

## [0.0.5] - 2026-07-26

### Added

- Alerts can carry low, medium, high, or critical urgency, shown with green,
  yellow, orange, or red accents; ordinary alerts remain clean and white.

### Fixed

- Account deletion now revokes every source and access key before removing the
  account, and verifies that the account is truly gone before signing out.
- Image attachments work from both Windows PowerShell 5.1 and PowerShell 7.

## [0.0.4] - 2026-07-26

### Added

- Zona now supports Android! Android builds can register with Expo through
  FCM, receive source-aware notifications, and keep each source on its own
  native notification channel.

### Changed

- Android screens, sheets, keyboard behavior, system bars, bottom tabs, and
  shared icons now follow Android safe areas and Material conventions.
- Per-source sound controls are platform-native: Android opens that source's
  notification-channel settings, while iOS keeps the bundled ringtone picker.

### Fixed

- Missing Android push configuration now produces a useful setup message
  instead of exposing a raw native initialization error.

## [0.0.3] - 2026-07-26

### Added

- Choose from 66 familiar iPhone tones so different sources are easier to
  recognize before opening Zona.
- Read friendly release highlights inside the app.

### Changed

- Account deletion asks twice before permanently removing data.

## [0.0.2] - 2026-07-24

### Added

- Use Zona in English or Traditional Chinese.
- Give each computer its own sound, attach an image for context, and keep unread
  work visible through iOS Live Status while the app can update it.

### Changed

- Common account and inbox actions spend less time behind loading screens.

## [0.0.1] - 2026-07-20

### Added

- Private Expo Router iPhone prototype on Expo SDK 54.
- Supabase email magic-link authentication, row-level security, realtime inbox,
  source creation/rename/revocation, iPhone push registration, and seven-day
  cleanup migration.
- Direct per-source notification ingestion with hashed credentials, source-name
  snapshots, bounded payload validation, per-source rate limiting, durable-first
  storage, best-effort Expo push, and delivery-attempt logging.
- Source and unread filters, notification detail/read/delete flows, and basic
  Node.js and PowerShell sender examples.

### Changed

- Replaced the original .NET Windows companion, loopback listener, and
  QR/manual pairing-code plan with direct hosted API calls using independent
  source credentials. See ADR 0001.

### Limitations

- This version is a pre-production prototype and has not completed the release
  evidence required by `docs/PRD.md` and `docs/RELEASE.md`.
