# Firebase service choices for the onboarding demo

Researched 2026-09-12. Recommendation: the original choices are sufficient. Keep normal PNV conditional, Remote Config as the first optional extension, and defer Analytics/Crashlytics for this one-week personal learning project. Avoid adding services merely to increase the count.

## What the evidence says about developer usage

The selected services fit established Firebase development patterns. Firebase's official web codelab combines Authentication, Firestore, Storage and deployment; its samples cover Functions and the main mobile quality tools. A Google developer interview describes a production business using Auth, Hosting and Functions alongside Analytics and Crashlytics. These are concrete examples of relevance, not a quantitative adoption ranking. [Official web codelab](https://firebase.google.com/codelabs/firebase-web), [Firebase samples](https://firebase.google.com/docs/samples), [developer account](https://developers.google.com/community/stories/story-b5bb216d)

Firebase's Doodle case study describes using Crashlytics for stability and Remote Config to evaluate onboarding changes. This supports their practical role in an access-team demo. The case study is historical and does not establish current market share. I found no comparable current public per-service adoption dataset that would justify claiming these are the most-used Firebase services. [Doodle case study](https://firebase.google.com/case-studies/doodle)

PNV is the specialized, team-relevant part of this proposal. It should not be described as a universal or broadly available default authentication option.

## Keep, add, make conditional, or defer

| Service | Decision | Why it earns a place |
| --- | --- | --- |
| Authentication | Keep; core | Google + optional X/Twitter + linked phone SMS demonstrates identity continuity and real onboarding; these flows are now implemented in the web client |
| Firestore | Keep; core | Existing per-user journals, rules and live listeners provide a concrete sync story |
| Storage | Keep; core | Winner DB already uses actual chart images; removing it would weaken the product workflow |
| Hosting | Keep; core | Appropriate for this static HTML/JS website, HTTPS access and a demo/privacy URL |
| App Check | Keep; core | Shows app attestation alongside user authentication and owner authorization |
| Analytics | Deferred | Useful in a longer-lived product, but unnecessary instrumentation for this one-week learning demo |
| Normal PNV | Conditional | Excellent team alignment if a supported Android/carrier configuration is actually available |
| Functions | Keep for backend work | Firestore-triggered screenshot cleanup is now a concrete web need; PNV proof verification and custom-token issuance remain a future conditional use. Ordinary client CRUD still does not need a wrapper |
| Remote Config | First optional extension | Demonstrate controlled availability and fallback for the PNV rollout |
| Crashlytics | Defer | Only relevant if an Android companion is built and maintained beyond this demo |
| Cloud Messaging | Defer | Useful for opt-in journal review reminders, but no notification requirement exists yet |
| Performance Monitoring | Defer | Useful for a later latency investigation; initial funnel timing and logs already answer the demo questions |
| App Distribution / Test Lab | Optional development tooling | Useful for several mobile testers or a device matrix; not a necessary product feature |
| Realtime Database | Skip | Duplicates Firestore here; no presence or other distinct requirement |
| App Hosting | Skip | No server-rendered framework to host; regular Hosting fits the current site |
| SQL Connect / BigQuery | Skip | No relational backend or warehouse-scale analysis requirement |
| AI Logic / generative coach | Remove from scope | The user does not want AI functionality; preserve ordinary statistics |

The Hosting decision follows the app's static architecture. App Check's role is protection, not login or complete fraud prevention. [Hosting use cases](https://firebase.google.com/docs/hosting/use-cases), [App Check](https://firebase.google.com/docs/app-check)

## Why Analytics is deferred

Analytics is a common Firebase service, but it is not needed to prove this project's core learning goals. The one-week scope already has a clear, reviewable Auth → Firestore/Storage workflow; adding event design, DebugView and reporting would consume time without improving the access implementation.

If the project continues, add a small coarse access funnel later. Do not send phone numbers, authentication tokens, journal notes, trade details or screenshots to Analytics.

This answers a useful question for Firebase access leads: “Does the verification flow actually get users into their workspace, and where does it fail?” It adds more value than an unrelated notification or chatbot.

## Optional: Remote Config for the access flow

If the core works, add a narrow `pnv_enabled` flag and a consent-explainer version. SDK support detection still decides whether the device can use PNV. Default safely to an available sign-in method when configuration is missing. Apply new values between attempts so an active consent/verification flow is not interrupted. Rehearse fetch/activate behavior; it is not automatically an instantaneous push on every platform. [Remote Config](https://firebase.google.com/docs/remote-config), [loading strategies](https://firebase.google.com/docs/remote-config/loading)

The demo: turn off the PNV entry point remotely, refresh/activate as designed, and see SMS/Google remain usable without rebuilding. This is a client UX rollout control, not an authorization boundary. If a true emergency stop is required, the exchange backend must independently reject PNV requests through server-owned configuration. No client flag may relax verification or turn on a bypass.

## Future only: Crashlytics for Android

If this grows into a maintained Android companion, Crashlytics would be a sensible later addition for actual crashes and unexpected nonfatal failures. It is deferred now because this repository is a web-only, one-week learning project. No browser Crashlytics integration is proposed. [Supported Crashlytics platforms](https://firebase.google.com/docs/crashlytics)

Cloud Messaging is a sensible later addition if the product gains a genuine opt-in weekly review reminder. It adds notification permissions, token lifecycle and backend delivery work today, without improving the access demo. [FCM capabilities](https://firebase.google.com/docs/cloud-messaging)

## Live PNV feasibility and a complete fallback scope

Normal PNV remains in the architecture. SIM-less PNV is excluded as requested. Public coverage currently does not list India. Confirm the real Android device, SIM, location and production-enabled project before committing to that segment. An overseas SIM is not enough evidence that roaming verification will work. [Carrier support](https://firebase.google.com/docs/phone-number-verification/pricing), [production setup](https://firebase.google.com/docs/phone-number-verification/android/production-mode)

If live PNV works, demonstrate its consent flow and backend exchange, then the same UID's journal on mobile and desktop. If it does not, the completed demo remains Google + linked SMS phone auth, protected Firestore data, screenshot uploads and Hosting. Drop unused PNV Functions and the Android-only tools rather than presenting simulated carrier verification.

The standard web baseline is enough to demonstrate several common Firebase developer tasks. Its strength depends on execution: preserve the UID across sign-in methods, show cross-user denial, handle cancellation and retries, and measure the result. For access-team learning, depth in those flows is more valuable than expanding the service list.
