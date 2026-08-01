# Writing Zona updates for people

Zona's in-app changelog is a tiny product story, not a development log. A
reader should understand why an update makes their day better without knowing
how the app is built.

The standard is the classic product-language move from "storage capacity" to
"a thousand songs in your pocket": translate the implementation into an
outcome a person can picture.

## Shape of a release

Use one short title, one sentence of context, and one to four cards. Each card
should contain one benefit.

1. Lead with what the person can now do or feel.
2. Use concrete everyday language: open, see, hear, choose, find, keep, share.
3. Keep the promise proportional. Do not say instant, guaranteed, or never
   unless the product can prove it in every supported condition.
4. Mention a limitation only when it helps someone use the feature correctly.
5. Leave unfinished work and invisible foundations out of the in-app story.

## Translate the benefit, not the sentence

English and Traditional Chinese should express the same idea naturally; they
do not need identical word order. Use full-width Chinese punctuation, including
`，` and `。`. A continuing Chinese sentence uses a comma in the middle, not a
full stop.

## Words that belong elsewhere

Schema, migration, RPC, RLS, cache invalidation, bootstrap, dependency,
refactor, kill switch, payload, and framework belong in `CHANGELOG.md`, pull
requests, or engineering documentation. They do not belong in What's New.

| Engineering fact | User-facing story |
| --- | --- |
| Persistent stale-while-revalidate cache | Your recent inbox is ready as soon as you open Zona. |
| Runtime feature flags and release policy | Helpful notices arrive at the right moment. |
| Android safe-area handling | Zona now feels at home on Android. |
| Per-source notification channel | Give every source its own sound. |

## v0.0.6 reference

Use this release as the baseline for future tone:

- **Zona fits the way you work**
- Helpful notices arrive at the right moment, while the controls you count on
  stay close at hand.
- **Clearer guidance when it matters:** Zona can share timely service notices
  and point you toward an update when one is important.
- **A steadier everyday experience:** Quiet improvements keep your inbox and
  essential controls feeling dependable.

The implementation includes runtime controls, release policies, targeted
announcements, and database compatibility work. None of those mechanisms is
the headline because the person using Zona benefits from the experience, not
the machinery.

## Final check

Before publishing, ask:

- Can a non-technical friend understand every line on the first read?
- Does every card answer "what is better for me?"
- Is the copy honest about what ships in this version?
- Are both languages natural and correctly punctuated?
- Is there only one Latest release?

