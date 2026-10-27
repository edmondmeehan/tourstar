# TourStar launch checklist

What's already built is marked ✅. Everything else needs your accounts, in this order.

## 0. Already done in the code
- ✅ Points anti-cheat: the server credits only realistic point gains (500/hr + 1,500 burst) and spends only verified points. Held points show in Admin → Rewards store → Points review.
- ✅ Real in-app purchases (RevenueCat) on the Premium screen, plus Restore purchases. The web shows "available in the app".
- ✅ Native Sign in with Apple on iPhone (Face ID sheet), Google via browser. The entitlement is already in the Xcode project.
- ✅ Reminder notifications on the device: energy full, royalties full, streak, new quests. Asked after the first show; toggle in Account.
- ✅ tourstarapp.com/privacy, /terms, /support, linked from the splash page, Account, Premium and raffles.
- ✅ Account deletion in the app (Apple requires this).
- ✅ Admin → Integrations: paste API keys (RevenueCat public keys go to the app; Resend/Anthropic/ElevenLabs/Replicate/RevenueCat secret keys are encrypted in Supabase Vault, with a Test button). The RevenueCat iOS key is already saved there.
- ✅ Vercel Web Analytics on the website. Turn it on in Vercel → tourstar → Analytics → Enable.

> Have a lawyer review /privacy, /terms and each raffle's official rules before prizes go out. NY and FL require registration and a bond for sweepstakes with more than $5,000 in prizes.

## 1. Apple Developer account (1–2 days)
1. Enroll at developer.apple.com/programs as an organization: TourStar, LLC ($99/yr). The App Store will list this as the seller. You'll need a D-U-N-S number (free, can take a few days).
2. In Certificates, IDs & Profiles → Identifiers, register the App ID `co.please.tourstar` with **Sign in with Apple** checked.
3. Create a **Services ID** (e.g. `co.please.tourstar.web`) with Sign in with Apple, domain `vtpgrxavyspadmubfwtb.supabase.co`, return URL `https://vtpgrxavyspadmubfwtb.supabase.co/auth/v1/callback`.
4. Keys → create a key with **Sign in with Apple**, download the `.p8` and note the Key ID and your Team ID.

## 2. Supabase sign-in setup (15 min)
Supabase → tourstar → Authentication:
1. **URL Configuration**: Site URL `https://tourstarapp.com`. Redirect URLs: `https://tourstarapp.com/**`, `https://tourstar-snowy.vercel.app/**`, `co.please.tourstar://**`, `http://localhost:5173/**`.
2. **Providers → Apple**: enable, set Client IDs to `co.please.tourstar,co.please.tourstar.web` (the native app and the web), and fill in the Team ID, Key ID and `.p8` key from step 1.
3. **Providers → Google**: create an OAuth client in Google Cloud Console (Web application, redirect `https://vtpgrxavyspadmubfwtb.supabase.co/auth/v1/callback`) and paste the ID and secret.
4. **Emails → SMTP**: connect a real sender (e.g. Resend, Postmark or Google Workspace) from an address like hello@tourstarapp.com. The built-in sender only allows a few emails an hour.

## 3. App Store Connect (30 min)
1. My Apps → New App: iOS, name **TourStar**, bundle ID `co.please.tourstar`, SKU `tourstar`.
2. **In-App Purchases** (Monetization → In-App Purchases). Create exactly these product IDs:

| Product ID | Type | Price |
|---|---|---|
| `co.please.tourstar.remove_timers` | Non-consumable | $4.99 |
| `co.please.tourstar.premium_pass` | Non-consumable | $9.99 |
| `co.please.tourstar.vip_badge` | Non-consumable | $1.99 |
| `co.please.tourstar.cash_small` | Consumable | $2.99 |
| `co.please.tourstar.cash_large` | Consumable | $9.99 |

   Each needs a display name, a description and a review screenshot (a screenshot of the Premium screen is fine).
3. Agreements, Tax & Banking: sign the Paid Apps agreement and add bank and tax info. Purchases don't work until this is done.

## 4. RevenueCat (15 min)
1. Sign up at revenuecat.com and create a project called **TourStar**. Add an **App Store** app with bundle ID `co.please.tourstar` and an App Store Connect API key (RevenueCat walks you through it).
2. **Entitlements**: create `remove_timers`, `premium_pass`, `vip_badge` and attach the matching product to each.
3. Products: import all 5 products. The cash packs need no entitlement.
4. The public iOS SDK key (`appl_…`) is already saved in Admin → Integrations. If it changes, update it there; no rebuild needed.
5. Optional: RevenueCat → Integrations → Webhooks, so the admin Finance tab can show revenue later.

## 5. Build and TestFlight (1 hour)
1. On your Mac: `cd ~/tourstar-v2/tourstar && npm install && npm run ios`.
2. In Xcode: select the **App** target → Signing & Capabilities → choose your team. "Sign in with Apple" should already be listed. Pick "Any iOS Device", then Product → Archive → Distribute App → App Store Connect.
3. In App Store Connect → TestFlight, add yourself and testers. Install TestFlight on your iPhone and play: tap timing, sound, haptics, reminders, sign-in, and a Sandbox purchase.

## 6. App Store listing
- **Name:** TourStar
- **Subtitle (30):** Play the show. Become a legend.
- **Promotional text:** Every gig is a show you play. Tap to the beat, build your setlist, and win real VIP experiences and merch.
- **Description:**
  From Mom's basement to global superstar. TourStar is the music career game where you play every show.

  PLAY THE SHOW: notes fall in time with your own songs. Tap the beat, chain combos, and earn an S rank to send the crowd wild.
  BUILD YOUR SETLIST: open strong, save your hit for the closer, and play the song the fans are shouting for.
  RUN THE CAREER: release singles, EPs and albums, sign a label deal, hire your crew, and survive scandals, rivals and bad nights.
  CLIMB SEVEN LEVELS: from open mics to sold-out stadiums, Basement Act to Legend.
  WIN REAL PRIZES: earn reward points by playing and redeem them for real merch, records and VIP experiences from Please & Thank You. Enter weekly raffles for the big stuff (no purchase necessary).
  COME BACK DAILY: daily quests, streak rewards and royalties that pile up while you're away.

  Apple is not a sponsor of, and is not involved in, any TourStar raffle.
- **Keywords:** music,rhythm,tycoon,career,band,rockstar,concert,tour,idle,simulator,singer,fame
- **Category:** Games → Music (secondary: Simulation)
- **URLs:** Support `https://tourstarapp.com/support` · Marketing `https://tourstarapp.com` · Privacy `https://tourstarapp.com/privacy`
- **Age rating:** 12+ is likely (mild references to alcohol and partying in events). Answer "Contests: Yes" because of the raffles.
- **Screenshots:** 6.9" iPhone (1320×2868). Use the concert mid-show, an S-rank result, the setlist, Home with quests, and the rewards store.

### App Privacy ("nutrition label") answers
- **Contact info → Email address:** Yes. Used for app functionality, linked to the user, no tracking.
- **Contact info → Name, physical address, phone:** Yes (reward shipping only). App functionality, linked, no tracking.
- **User content → Other user content** (game save, artist name): app functionality, linked.
- **Identifiers → User ID:** app functionality, linked.
- **Purchases → Purchase history:** app functionality, linked.
- **Usage data → Product interaction:** analytics, *not* linked to identity, no tracking.
- **Tracking:** No (no ads, no cross-app tracking, so no ATT prompt needed).

### Notes for App Review (paste into "Notes")
TourStar is a music career game. Reward points are earned only by playing and cannot be purchased. They can be redeemed for physical merchandise and experiences fulfilled by Please and Thank You, LLC, or used for raffle tickets. Each raffle also offers a free daily entry (no purchase necessary), shows official rules in the app, and states that Apple is not a sponsor (guideline 5.3). Demo account: (create one and put it here).

## 7. Android (later)
Google Play Console ($25 one-time) → new app `co.please.tourstar`, the same 5 products, a RevenueCat Play app, `VITE_REVENUECAT_ANDROID_KEY`, then `npm run android` and upload an AAB to internal testing.
