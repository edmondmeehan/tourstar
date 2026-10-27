# TourStar

A music career game: take an artist from Mom's basement to global superstar.
Rebuilt from the Lovable prototype (tourstar-ideas.lovable.app) as a codebase you own.

## Run it

```bash
npm install
npm run dev      # play in a browser at http://localhost:5173
npm run build    # production build in dist/
```

## Run it on your iPhone (Capacitor)

The `ios/` and `android/` folders are real native projects that wrap the game.
iOS uses Swift Package Manager, so you don't need CocoaPods.

1. Install **Xcode** from the Mac App Store and open it once to accept the license.
2. In this folder:
   ```bash
   npm install
   npm run ios        # builds the game, copies it into ios/, opens Xcode
   ```
3. In Xcode, select the **App** target → **Signing & Capabilities** → choose your Apple developer team.
   Change the Bundle Identifier if `co.please.tourstar` is taken in your account.
4. Plug in your iPhone (or pick a simulator) and press **Run** ▶.

After changing game code, run `npm run ios` again (or `npm run sync` and press Run in Xcode).

Android: install Android Studio, then `npm run android`.

Native extras: real haptics through the Taptic Engine, saves stored in native app storage
(Capacitor Preferences, which iOS won't purge like browser storage), dark status bar, portrait lock,
app icon and splash screen (regenerate from `assets/` with `npx capacitor-assets generate`),
and the Android back button.

## Accounts & cloud save (Supabase)

Players start as guests (saved on the device). After their first gig they're offered an account;
they can also sign in or create one from **Account** or the Create screen. Once signed in, the career,
settings and purchases sync to the `saves` table automatically (2s after each change, and on launch).
Signing in on a device that has a different career asks which one to keep. A pill in the header shows
GUEST / CONFIRM EMAIL / SAVING / SYNCED / OFFLINE.

- Project: **tourstar** in the Tourstar Supabase org (`vtpgrxavyspadmubfwtb`, us-east-1). Keys are in `.env`
  (the publishable key is meant to ship in apps; row-level security means players can only read and write their own save).
- Table `public.saves` (one row per player, JSON game state, with `artist_name` and `fame` columns for future leaderboards/admin).
- Edge function `delete-account` lets players delete their account in-app (Apple requires this).
- Screens: `/login` (sign up, sign in, forgot password, Apple, Google), `/auth/callback`, `/reset-password`.
- On iPhone/Android, Apple/Google sign-in and email links come back through the `co.please.tourstar://` deep link.

### One-time setup in the Supabase dashboard (Authentication section)

1. **URL Configuration → Redirect URLs**, add:
   - `co.please.tourstar://**`
   - `http://localhost:5173/**`
   - your web URL when you deploy it, e.g. `https://play.tourstar.app/**` (also set it as the **Site URL**)
2. **Sign In / Providers → Apple**: enable, then fill in your Services ID, Team ID, Key ID and the .p8 key
   from developer.apple.com (Certificates, IDs & Profiles → Identifiers → a Services ID with "Sign in with Apple",
   return URL `https://vtpgrxavyspadmubfwtb.supabase.co/auth/v1/callback`).
3. **Sign In / Providers → Google**: enable, then paste the OAuth Client ID and Secret from Google Cloud Console
   (APIs & Services → Credentials → OAuth client, type "Web application",
   authorized redirect URI `https://vtpgrxavyspadmubfwtb.supabase.co/auth/v1/callback`).
4. Optional: **Emails → SMTP** with your own sender (e.g. hello@please.co). The built-in sender is rate-limited
   to a few emails an hour, fine for testing, not for launch.

Email/password works as soon as step 1 is done. Apple and Google buttons show an error until steps 2–3 are done.

## Admin (`/admin`)

Open `/admin` in the web build (or **Account → Open admin** once you're an admin). Access is limited to the
`admins` table; eddie@please.co becomes the first admin automatically on first sign-in with a confirmed email.
Every admin query is also enforced in the database (row-level security + admin-only functions).

| Tab | What it does |
|---|---|
| Insights | Players today / in range (by device, guests included), accounts, cloud saves, gigs, releases; daily charts; level, genre and activity breakdowns |
| Players | Search signed-in players; level, fame, fans, cash, gigs, releases, purchases, last sync |
| Finance | Placeholder until RevenueCat; counts simulated purchases |
| Marketing | Send banner or pop-up announcements with an optional button to any screen; turn off / delete |
| Balance | Live tuning: energy speed, gig/release payouts, fame gains, event rate, daily rewards, rename cost, starting cash |
| Events & gifts | Fire any random event, or gift stats (cash, energy, fame…) to all players, once each |
| Rewards store | Add/edit real goods players redeem with points (cost, level gate, stock, per-player limit, sizes, shipping). Review redemptions and move them through Pending → Approved → Shipped → Delivered; Rejected refunds the points |
| Raffles | Create raffles (ticket price in points, level gate, ticket cap, free daily entry, official rules), track entrants/tickets, close early, draw a weighted random winner |
| Orders | Distribution orders (empty until Stripe checkout is on) |
| Traffic | New players by source (`?utm_source=` tags, referrers, App/Play Store) and platform |
| AI music | Status of the built-in synth, ElevenLabs and Replicate |
| Admins | Add (invite by email) or remove admins; the last admin can't be removed |

Players pick up announcements, balance changes, events and gifts on launch and every 5 minutes.
Analytics events (first_open, session_start, career_created, gig, release, level_up, daily_claim, lockout,
sign_in, premium_purchase) are batched from the app every 10s into `analytics_events`.

Code: `src/admin/*` (lazy-loaded, so players never download it), `src/lib/live.ts` (analytics + live-ops in the game),
`src/game/config.ts` (balance defaults and limits). SQL: `supabase/migrations/`.

## Points, rewards and raffles

Players earn reward points by playing only (they can never be bought): gigs by grade (S 40, A 25, B 15, C 8, D 3, +5 sellout, +3 fan request),
releases (10 + quality/10), daily claims (10 + 2 per streak day up to 7) and level-ups (100 × level). Admin → Balance → Reward points scales all of it.
Points earned live in the save (`career.pointsEarned`); spending is recorded in Supabase (`reward_redemptions`, `raffle_entries`) through the
`redeem_reward` and `enter_raffle` functions, which check level, stock, limits and balance and lock per player so points can't be spent twice.
Store → Rewards / Raffles need an account; the Shop tab (game-cash boosts) works for guests.

Raffles follow sweepstakes basics: points aren't purchasable, a free daily entry, official rules on every raffle, and "Apple is not a sponsor"
(App Store guideline 5.3). Get legal review of the rules before running real prizes; NY and FL require registration and bonding over $5,000 in prizes.

## Hosted preview

`npm run build:preview` makes one self-contained HTML file (used for the claude.ai preview page). Accounts are switched off in that build because the preview page can't reach Supabase.

Deploys as a static site (Vercel, Netlify, Cloudflare Pages). On Vercel, add a rewrite of
`/(.*)` to `/index.html` so deep links like `/tour` work.

## Phase 1 (this build): core game

- **Title** `/` arcade start screen: PRESS START (tap / Enter / Space) with a flash, synth blip and vibration
- **Create** `/create`: name, 8 genres, 9 personas (each changes starting stats), optional theme song
- **Stats**: Fame, Credibility, Hype, Cash, Health, Relationships, Energy, Fans. Fame sets 7 levels (Basement Act to Legend)
- **Energy** refills in real time (1 per 36s, 2× with Remove Timers)
- **Home** `/dashboard`: stats, level progress, gossip ticker, mood, daily reward and streak (3/7/14/30), rename (first free, then $50K)
- **Tour** `/tour`: 7 tour sizes from Open Mic to Stadium Encore. Every gig plays a **live concert scene** (Phaser): light show and LED wall on the beat, a crowd sized to attendance, pyro, a live fan counter, then the results card
- **Album** `/album`: Single, Mixtape, EP, LP with an optional generated song that's saved to the Locker
- **Label** `/label`: 4 labels, each with its own boost, cut and advance
- **Crew** `/management`: manager and stylist tiers, tour bus, lighting, pyro, security
- **Store** `/store`: Please & Thank You store (VIP, merch, records, tickets, wellness)
- **Stats** `/summary`: legacy score, career path, Retire & Start Over
- **Locker** `/locker`: play/pause all, loop, drag to reorder (long-press on phones)
- **Rivals** `/rivals`: weekly chart that resets Monday, Beef / Collab, rewards by rank
- **Releases**, **Career Log**, **Distribution** (Stripe disabled), **Premium** (simulated), **Account** (membership, purchases, sound/vibration, reset)
- **Random events** with choices; **lockouts** (jail with bail, rehab, dropped, cancelled); milestone celebrations

Saves to `localStorage` (keys `tourstar-career`, `tourstar-settings`, `tourstar-membership`).

### Music
Songs are procedural chiptune tracks generated from `(seed, genre)` in `src/lib/chiptune.ts`.
The service picker and "type the service name to confirm" flow already list ElevenLabs and Replicate.
They fall back to the built-in synth until they're connected.

## Phase 2 (next)

1. **Supabase**: auth (email/password, Google, Apple, forgot/reset password) and a `careers` table for cloud save, plus the synced / waiting-on-email pill
2. **Admin** `/admin`: Insights, Finance (RevenueCat), Marketing (announcements), balance tuning, event triggers, orders, traffic sources, AI music status, admin list
3. **Announcements**: banner and pop-up driven by the admin
4. **AI music**: an edge function calling ElevenLabs, with Replicate as a fallback. Store `audioUrl` on `Song`
5. **Payments**: Stripe for distribution; RevenueCat / StoreKit for real in-app purchases

## Code map

```
src/game/data.ts      all balance tables (levels, tours, releases, labels, crew, store, rivals)
src/game/events.ts    random events and outcomes
src/game/engine.ts    pure helpers (levels, chart, mood, formatting)
src/game/store.ts     zustand store, all game actions
src/game/settings.ts  sound/vibration settings + membership (simulated IAP)
src/lib/fx.ts         sfx + vibration
src/lib/chiptune.ts   procedural song generator/player
src/lib/native.ts     Capacitor: haptics, native storage, status bar, splash, back button
src/concert/*         Phaser concert scene + overlay (lazy-loaded)
src/lib/cloud.ts      Supabase auth + cloud save sync
src/lib/live.ts       analytics, announcements, live balance, events/gifts
src/game/config.ts    live balance defaults + limits
src/admin/*           admin tool
src/pages/Login.tsx   sign up / sign in / reset password screens
src/pages/*           one file per screen
```

Original art: drop `bg-hero.jpg` and `tourstar-logo-cover.png` from the Lovable project into `public/`
if you'd rather use them than the SVG skyline (`HeroBackdrop.tsx`) and text logo.
