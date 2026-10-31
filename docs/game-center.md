# Game Center setup (App Store Connect)

TourStar mirrors its own achievements and two leaderboards into Game Center. The game sends progress automatically after shows and when the app goes to the background. Set these up once in **App Store Connect → TourStar → Services (or Features) → Game Center**, then add Game Center to the app version under "Game Center" before submitting.

## 1. Turn it on
1. developer.apple.com → Certificates, IDs & Profiles → Identifiers → `co.please.tourstar`: make sure **Game Center** is checked (it usually is by default).
2. The app's entitlements already include Game Center (`ios/App/App/App.entitlements`).
3. App Store Connect → TourStar → the version you're submitting → **Game Center**: turn it on and add the leaderboards and achievements below.

## 2. Leaderboards (Classic, "Best score", Integer, high to low)
| Leaderboard ID | Name | Score format |
|---|---|---|
| `co.please.tourstar.fame` | All-Time Fame | Integer (e.g. "1,234,567 fame") |
| `co.please.tourstar.networth` | Net Worth | Money, whole dollars (e.g. "$12,500,000") |

## 3. Achievements (28, 975 of 1,000 points)
For each one: Achievement ID as below, reference name = the name, points as listed, "Hidden" off, "Achievable more than once" off. Description (pre-earned and earned) = the text. Image: 512×512 or 1024×1024 PNG (the emoji on a TourStar-colored square works; I can make these).

| Achievement ID | Name | Description | Points |
|---|---|---|---|
| `co.please.tourstar.ach.gig1` | 🎤 First Night | Play your first show. | 15 |
| `co.please.tourstar.ach.gig25` | 🚐 Road Dog | Play 25 shows. | 30 |
| `co.please.tourstar.ach.gig100` | 🛣️ Never Stops Touring | Play 100 shows. | 55 |
| `co.please.tourstar.ach.sell1` | 🎟️ Sold Out | Sell out a show. | 15 |
| `co.please.tourstar.ach.sell25` | 🔥 Hottest Ticket in Town | Sell out 25 shows. | 55 |
| `co.please.tourstar.ach.hards` | 💀 Flawless on Hard | Get an S on Hard. | 30 |
| `co.please.tourstar.ach.hards10` | 👑 Hard Mode Royalty | Get 10 S grades on Hard. | 55 |
| `co.please.tourstar.ach.drum5` | 🥁 In the Pocket | Pass 5 Drum School lessons with an A or S. | 30 |
| `co.please.tourstar.ach.drumall` | 🎖️ Drum School Graduate | Pass every Drum School lesson with an A or S. | 55 |
| `co.please.tourstar.ach.rel1` | 💿 Debut | Drop your first release. | 15 |
| `co.please.tourstar.ach.rel10` | 📀 Discography | Drop 10 releases. | 30 |
| `co.please.tourstar.ach.songs10` | 🎶 Songwriter | Have 10 songs of your own. | 30 |
| `co.please.tourstar.ach.lv3` | ⭐ Opening Act | Reach level 3. | 15 |
| `co.please.tourstar.ach.lv5` | 🌟 Headliner | Reach level 5. | 30 |
| `co.please.tourstar.ach.lv7` | 🏛️ Legend | Reach level 7. | 55 |
| `co.please.tourstar.ach.fans100k` | 🙌 100K Fans | Reach 100,000 fans. | 30 |
| `co.please.tourstar.ach.million` | 💰 Millionaire | Earn $1,000,000 from shows. | 55 |
| `co.please.tourstar.ach.home` | 🏰 Moved On Up | Move into a mansion. | 30 |
| `co.please.tourstar.ach.worth10m` | 💎 Eight Figures | Reach a net worth of $10 million. | 30 |
| `co.please.tourstar.ach.mogul` | 🏷️ Mogul | Sign 3 acts to your own label. | 55 |
| `co.please.tourstar.ach.giveback` | 💗 Giving Back | Play a benefit show. | 15 |
| `co.please.tourstar.ach.label` | 🏷️ Signed | Sign with a record label. | 15 |
| `co.please.tourstar.ach.streak7` | 📅 Week Streak | Claim your daily reward 7 days in a row. | 30 |
| `co.please.tourstar.ach.streak30` | 🗓️ Month Streak | Claim your daily reward 30 days in a row. | 55 |
| `co.please.tourstar.ach.offers5` | 📞 Promoter's Favorite | Take 5 promoter gig offers. | 30 |
| `co.please.tourstar.ach.league1` | ⬆️ Moving Up | Get promoted in your weekly league. | 30 |
| `co.please.tourstar.ach.league6` | 🏟️ Stadium League | Reach the top league division. | 55 |
| `co.please.tourstar.ach.event1` | 🎪 Special Engagement | Earn a tour event collectible. | 30 |

Adding a new achievement to the game later: add it in App Store Connect with `co.please.tourstar.ach.<id>` and it starts reporting automatically.

