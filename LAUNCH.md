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
- ✅ Website: tourstarapp.com is the splash page + waitlist; the game is at /play, hidden behind a coming-soon screen until Admin → Admins → Website → "Open the game to everyone" (admins can always play).
- ✅ Legal entities: TourStar, LLC runs the game (privacy, terms, raffle sponsor, footer); Please and Thank You, Inc. fulfills rewards and prizes. Contact: help@please.co.
- ✅ AI audio (ElevenLabs): AI songs for releases, Mo's voice, stadium announcer. Admin → AI audio.
- ✅ Waitlist referrals + emails: invite links move people up the list (rewards at launch: 1 friend +500 ⭐, 3 = Founding Fan badge + 1,500 ⭐, 10 = 5 launch-raffle tickets). Welcome email and announcements via Resend in Admin → Beta signups. **Still to build before launch: grant those referral rewards when someone creates an account with their waitlist email.**
- ✅ Admin → Economy: points outstanding, their dollar value, what you owe, prize cost vs. revenue per active player, alerts. Enter your cost on each reward (Rewards store → Edit) for the dollar figures.
- ✅ Monetization: TourStar VIP subscription ($4.99/mo or $39.99/yr), AI song packs, cash packs. Money never buys points or raffle entries; only the first 12 shows/releases a day earn points, for everyone.

> Have a lawyer review /privacy, /terms and each raffle's official rules before prizes go out. NY and FL require registration and a bond for sweepstakes with more than $5,000 in prizes. List ElevenLabs as a processor in /privacy, confirm TourStar, LLC's mailing address, and ask your accountant how to book outstanding points.

## 1. Apple Developer account (1–2 days)
1. Enroll at developer.apple.com/programs as an organization: TourStar, LLC ($99/yr). The App Store will list this as the seller. You'll need a D-U-N-S number (free, can take a few days).
2. In Certificates, IDs & Profiles → Identifiers, register the App ID `co.please.tourstar` with **Sign in with Apple** checked.
3. Create a **Services ID** (e.g. `co.please.tourstar.web`) with Sign in with Apple, domain `vtpgrxavyspadmubfwtb.supabase.co`, return URL `https://vtpgrxavyspadmubfwtb.supabase.co/auth/v1/callback`.
4. Keys → create a key with **Sign in with Apple**, download the `.p8` and note the Key ID and your Team ID.

## 2. Supabase sign-in setup (15 min)
Supabase → tourstar → Authentication:
1. **URL Configuration**: Site URL `https://tourstarapp.com/play`. Redirect URLs: `https://tourstarapp.com/**`, `https://tourstar-snowy.vercel.app/**`, `co.please.tourstar://**`, `http://localhost:5173/**`.
2. **Providers → Apple**: enable, set Client IDs to `co.please.tourstar,co.please.tourstar.web` (the native app and the web), and fill in the Team ID, Key ID and `.p8` key from step 1.
3. **Providers → Google**: create an OAuth client in Google Cloud Console (Web application, redirect `https://vtpgrxavyspadmubfwtb.supabase.co/auth/v1/callback`) and paste the ID and secret.
4. **Emails → SMTP**: connect a real sender (e.g. Resend, Postmark or Google Workspace) from an address like hello@tourstarapp.com. The built-in sender only allows a few emails an hour.

## 3. App Store Connect (30 min)
1. My Apps → New App: iOS, name **TourStar**, bundle ID `co.please.tourstar`, SKU `tourstar`.
2. **Subscriptions** (Monetization → Subscriptions): create a subscription group **TourStar VIP** with:

| Product ID | Type | Price |
|---|---|---|
| `co.please.tourstar.vip_monthly` | Auto-renewable subscription, 1 month | $4.99 |
| `co.please.tourstar.vip_yearly` | Auto-renewable subscription, 1 year | $39.99 |

3. **In-App Purchases** (Monetization → In-App Purchases):

| Product ID | Type | Price |
|---|---|---|
| `co.please.tourstar.ai_songs_5` | Consumable | $2.99 |
| `co.please.tourstar.ai_songs_15` | Consumable | $6.99 |
| `co.please.tourstar.cash_small` | Consumable | $2.99 |
| `co.please.tourstar.cash_large` | Consumable | $9.99 |

   Each needs a display name, a description and a review screenshot (a screenshot of the Premium screen is fine). Subscriptions also need the Terms of Use link (`https://tourstarapp.com/terms`) in the app description or as a custom EULA.
4. Agreements, Tax & Banking: sign the Paid Apps agreement and add bank and tax info. Purchases don't work until this is done.

> Money never buys reward points or raffle entries. VIP speeds up energy, but only the first 12 shows/releases a day earn points (Admin → Balance), for everyone.

## 4. RevenueCat (15 min)
1. Sign up at revenuecat.com and create a project called **TourStar**. Add an **App Store** app with bundle ID `co.please.tourstar` and an App Store Connect API key (RevenueCat walks you through it).
2. **Entitlements**: create one entitlement, `vip`, and attach both VIP subscriptions to it.
3. Products: import all 6 products. The AI song packs and cash packs need no entitlement.
4. The public iOS SDK key (`appl_…`) is already saved in Admin → Integrations. If it changes, update it there; no rebuild needed.
5. **Webhook** (needed for AI song packs, VIP's extra songs and the Economy tab's revenue): make up a long random password and save it in Admin → Integrations → "RevenueCat · webhook password". Then RevenueCat → Integrations → Webhooks: URL `https://vtpgrxavyspadmubfwtb.supabase.co/functions/v1/revenuecat-webhook`, Authorization header = that same password.

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
TourStar is a music career game. Reward points are earned only by playing and cannot be purchased. They can be redeemed for physical merchandise and experiences fulfilled by Please and Thank You, Inc., or used for raffle tickets. Each raffle also offers a free daily entry (no purchase necessary), shows official rules in the app, and states that Apple is not a sponsor (guideline 5.3). Demo account: (create one and put it here).

## 7. Android (later)
Google Play Console ($25 one-time) → new app `co.please.tourstar`, the same 6 products (2 subscriptions + 4 consumables), a RevenueCat Play app, `VITE_REVENUECAT_ANDROID_KEY`, then `npm run android` and upload an AAB to internal testing.
