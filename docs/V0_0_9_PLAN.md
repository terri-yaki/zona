# Zona v0.0.9 — Trust and visibility

Status: approved working scope. The customer changelog below is a draft and
must remain unpublished until the release evidence is complete.

## Outcome

Close the two visible gaps left by v0.0.8 and turn the existing test assets
into enforced release gates. This release does not add a new authentication
factor, merge two protected accounts, or introduce payments.

## Review of the v0.0.8 baseline

- The app, Deno, and TypeScript baselines are green: 105 mobile tests and 41
  shared Edge Function tests pass, and TypeScript reports no errors.
- `get_account_usage()` already returns owner-scoped counts and limits, and
  `account-usage.ts` already validates the response. No screen calls it.
- Push jobs, retries, Expo tickets, and receipts are recorded in the private
  schema. No authenticated read model or notification-detail UI exists.
- CI runs mobile and shared Deno checks. It does not start a disposable
  Supabase stack or run the four SQL/RLS suites under `supabase/tests`.
- The sender API guide still describes `pushAccepted` as an Expo ticket count.
  The durable queue now returns compatibility fields plus `pushQueued`, so the
  documented response contract must be corrected before release.
- The v0.0.8 archive points to the pre-audit implementation commit. Refresh its
  manifests so it identifies the code and migrations that produced the shipped
  build, without rewriting historical migrations.

## PR 1 — Account usage

- Add a typed `getAccountUsage()` data function over the existing RPC.
- Render a Usage card in Account with sources, active keys, phones, retained
  alerts, attachments, attachment storage, and 24-hour/7-day alert volume.
- Show server limits beside a count only when the limit is meaningful.
- Fetch usage with the other Account requests, keep the screen responsive, and
  give the card its own retry/error state.
- Add English and Traditional Chinese copy plus parser, loading, error, zero,
  and large-number tests.

Acceptance: a signed-in owner sees only their own counts; a failed usage call
does not hide account or session controls; guest and protected accounts work.

## PR 2 — Push delivery visibility

- Add an authenticated, owner-scoped RPC that summarizes private push jobs for
  one notification. Do not grant table access to `private.push_delivery_jobs`.
- Return only presentation-safe fields: aggregate state, targeted phone count,
  confirmed-by-provider count, failed count, last update time, and a bounded
  public reason. Never expose tokens, ticket IDs, worker leases, raw provider
  messages, or another owner's rows.
- Present four honest states in notification detail:
  - `Not sent`: push was disabled or no eligible phone was targeted.
  - `Queued`: waiting, retrying, or awaiting a provider receipt.
  - `Sent`: APNs or FCM accepted at least one push; this is not proof the phone
    displayed it.
  - `Needs attention`: every targeted delivery ended in a permanent failure;
    offer a concise next action when one is safe.
- If phones have mixed outcomes, lead with success and show the count summary.
- Add a small per-source seven-day summary only after detail-state behavior is
  stable; it is optional for this release.
- Correct `API.md`, `openapi.yaml`, the runbook, and the test plan to describe
  enqueueing and receipt semantics accurately.

Acceptance: two users cannot query each other's delivery state; zero-device,
mixed-device, retry, receipt-unknown, permanent-failure, and expired-notification
cases are tested; UI wording never claims the person saw the notification.

## PR 3 — CI release gate

- Extend CI with the official Supabase CLI action and a disposable local stack.
- Apply the complete migration history, run `supabase test db`, and run database
  linting at error level.
- Exercise authenticated Edge Function requests against the local stack and
  validate status codes and response bodies against `docs/openapi.yaml`.
- Keep pure Deno tests as the fast job; make the integration job independently
  visible and required before merge.
- Upload concise failure evidence without secrets or notification contents.

Acceptance: a broken migration, cross-owner RLS leak, RPC grant regression, or
documented response mismatch fails the pull request.

## Release gate — physical iPhone

Record TestFlight evidence for foreground, background, and terminated delivery;
sound enabled/disabled; previews enabled/hidden; attachment open; queued-to-sent
refresh; failure wording; two sources; and two phones where available. The
matrix records device, iOS version, build number, time, expected result, actual
result, and evidence link. Blank evidence is a failed gate.

## Deferred

- Passkeys and MFA move to v0.1.0 with provider configuration, recovery rules,
  step-up policy, enrollment/removal UX, and lockout testing.
- Protected-account merge also needs a new ADR, dual fresh proof, conflict
  preview, idempotent commit, recovery, and support tooling. It should not share
  the v0.0.9 delivery migration.

## Customer changelog draft

### Know where every alert stands

See how Zona is being used and follow each alert from your source to the phone
service, with a clear heads-up when something needs attention.

- **Your Zona at a glance.** See your sources, phones, recent alerts, and saved
  attachments together in Account.
- **No more guessing.** Open an alert to see whether it is waiting, sent to the
  phone service, or needs your attention.

Traditional Chinese:

### 每則通知，進度一目了然

你可以查看 Zona 的使用情況，亦可追蹤每則通知由來源送往手機服務的進度，如有問題需要處理，Zona 會清楚提醒你。

- **Zona 使用情況一覽。** 在帳戶頁面集中查看來源、手機、近期通知及已儲存的附件。
- **毋須再猜測。** 打開通知即可查看它正在等候、已送往手機服務，還是需要你處理。
