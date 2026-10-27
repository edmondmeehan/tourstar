import type { Delta, LockoutKind } from "./types";

export interface Outcome {
  p: number; // relative weight
  bad?: boolean; // managers/security reduce the weight of bad outcomes
  text: string;
  effects: Delta;
  lockout?: { kind: LockoutKind; minutes: number; bail?: number };
}

export interface Choice {
  label: string;
  outcomes: Outcome[];
}

export interface GameEvent {
  id: string;
  title: string;
  emoji: string;
  text: string;
  kind: "scandal" | "party" | "sponsor" | "opportunity" | "drama";
  minLevel?: number;
  choices: Choice[];
}

export const EVENTS: GameEvent[] = [
  {
    id: "afterparty",
    title: "Afterparty Invite",
    emoji: "🥂",
    kind: "party",
    text: "A famous DJ invites you to a penthouse afterparty. It's 2am and you have a sound check at noon.",
    choices: [
      {
        label: "Go wild",
        outcomes: [
          { p: 5, text: "Legendary night. Photos everywhere.", effects: { hype: 12, fame: 30, health: -12, relationships: 5 } },
          { p: 2, bad: true, text: "Cops raid the party. You spend the night in a cell.", effects: { hype: 15, credibility: -8, health: -10 }, lockout: { kind: "jail", minutes: 10, bail: 2000 } },
        ],
      },
      { label: "One drink, then home", outcomes: [{ p: 1, text: "Smart. You network and leave early.", effects: { relationships: 5, hype: 3 } }] },
      { label: "Stay in", outcomes: [{ p: 1, text: "You sleep 10 hours. Glorious.", effects: { health: 8, energy: 10 } }] },
    ],
  },
  {
    id: "energy-sponsor",
    title: "Sponsorship Offer",
    emoji: "🥤",
    kind: "sponsor",
    text: "GLOWJUICE energy drink wants you in a commercial. The pay is great, the drink is… neon.",
    choices: [
      { label: "Take the bag", outcomes: [{ p: 1, text: "The check clears. Some fans call you a sellout.", effects: { cash: 3000, credibility: -6, fame: 25 } }] },
      { label: "Negotiate creative control", outcomes: [
        { p: 3, text: "They let you direct it. It's actually art.", effects: { cash: 1800, credibility: 3, hype: 6 } },
        { p: 2, bad: true, text: "They walk away. Oh well.", effects: { credibility: 2 } },
      ] },
      { label: "Pass", outcomes: [{ p: 1, text: "Integrity intact.", effects: { credibility: 5 } }] },
    ],
  },
  {
    id: "leaked-dms",
    title: "Leaked DMs",
    emoji: "📱",
    kind: "scandal",
    text: "Someone leaked your DMs roasting another artist. The internet has screenshots.",
    choices: [
      { label: "Apologize publicly", outcomes: [{ p: 1, text: "Mature move. The story dies fast.", effects: { credibility: 2, hype: -3 } }] },
      { label: "Double down", outcomes: [
        { p: 3, text: "The beef trends for a week. Streams spike.", effects: { hype: 15, fame: 40, credibility: -8 } },
        { p: 2, bad: true, text: "You're cancelled. Brands pull out.", effects: { hype: 5, credibility: -15, fans: -50 }, lockout: { kind: "cancelled", minutes: 8 } },
      ] },
      { label: "Say nothing", outcomes: [{ p: 1, text: "Silence. The internet moves on… mostly.", effects: { hype: -2, credibility: -2 } }] },
    ],
  },
  {
    id: "mom-call",
    title: "Mom's Calling",
    emoji: "📞",
    kind: "drama",
    text: "Mom wants you home for Sunday dinner. Your manager wants you at a radio interview.",
    choices: [
      { label: "Go to dinner", outcomes: [{ p: 1, text: "Lasagna heals the soul.", effects: { relationships: 15, health: 5, hype: -2 } }] },
      { label: "Do the interview", outcomes: [{ p: 1, text: "Great interview. Mom's a little hurt.", effects: { fame: 30, hype: 5, relationships: -10 } }] },
    ],
  },
  {
    id: "stage-dive",
    title: "Stage Dive?",
    emoji: "🤸",
    kind: "opportunity",
    text: "The crowd is going nuts. The front row is begging you to dive.",
    choices: [
      { label: "Dive!", outcomes: [
        { p: 4, text: "They catch you. Iconic.", effects: { hype: 12, fans: 120, fame: 20 } },
        { p: 1, bad: true, text: "They do not catch you. Ouch.", effects: { health: -25, hype: 8 } },
      ] },
      { label: "Play it cool", outcomes: [{ p: 1, text: "Solid set. Nobody gets hurt.", effects: { credibility: 2 } }] },
    ],
  },
  {
    id: "producer-offer",
    title: "Hot Producer",
    emoji: "🎛️",
    kind: "opportunity",
    text: "A chart-topping producer offers a session — for a price.",
    choices: [
      { label: "Pay $2,000", outcomes: [{ p: 1, text: "The beat is ridiculous. Credibility up.", effects: { cash: -2000, credibility: 8, hype: 6 } }] },
      { label: "Offer a co-write instead", outcomes: [
        { p: 1, text: "They're into it. Collab of the year?", effects: { credibility: 5, fame: 20 } },
        { p: 1, bad: true, text: "They ghost you.", effects: {} },
      ] },
      { label: "Make your own beats", outcomes: [{ p: 1, text: "DIY forever.", effects: { credibility: 3, energy: -5 } }] },
    ],
  },
  {
    id: "rehab-intervention",
    title: "Intervention",
    emoji: "🛋️",
    kind: "drama",
    minLevel: 2,
    text: "Your crew sits you down. They say the partying has gone too far.",
    choices: [
      { label: "Check into rehab", outcomes: [{ p: 1, text: "You take time to get well.", effects: { health: 40, relationships: 15, hype: -10 }, lockout: { kind: "rehab", minutes: 6 } }] },
      { label: "Promise to slow down", outcomes: [
        { p: 2, text: "You actually do. Proud of you.", effects: { health: 10, relationships: 5 } },
        { p: 1, bad: true, text: "You don't. Collapse backstage.", effects: { health: -20 }, lockout: { kind: "rehab", minutes: 10 } },
      ] },
    ],
  },
  {
    id: "label-feud",
    title: "Label Wants Changes",
    emoji: "🧾",
    kind: "drama",
    minLevel: 2,
    text: "Your label wants you to swap your sound for whatever's trending on TikTok.",
    choices: [
      { label: "Go along with it", outcomes: [{ p: 1, text: "Streams up, soul down.", effects: { fame: 40, credibility: -10, cash: 1500 } }] },
      { label: "Refuse", outcomes: [
        { p: 3, text: "They respect it. Barely.", effects: { credibility: 8 } },
        { p: 2, bad: true, text: "You're dropped from the label!", effects: { credibility: 6, hype: -5 }, lockout: { kind: "dropped", minutes: 5 } },
      ] },
    ],
  },
  {
    id: "viral-dance",
    title: "Viral Dance",
    emoji: "🕺",
    kind: "opportunity",
    text: "Kids are making a dance to your song. Do you jump on the trend?",
    choices: [
      { label: "Post your own version", outcomes: [
        { p: 3, text: "10M views. Wild.", effects: { hype: 15, fans: 400, fame: 30 } },
        { p: 1, bad: true, text: "Cringe. Brutal comments.", effects: { hype: -5, credibility: -4 } },
      ] },
      { label: "Repost the best fan videos", outcomes: [{ p: 1, text: "Fans love the love.", effects: { relationships: 6, fans: 200, hype: 6 } }] },
    ],
  },
  {
    id: "hotel-trash",
    title: "Hotel Room",
    emoji: "🏨",
    kind: "scandal",
    text: "The band wants to trash the hotel room like it's 1977.",
    choices: [
      { label: "Rock and roll!", outcomes: [
        { p: 2, text: "The legend grows. The bill arrives.", effects: { hype: 10, cash: -3000, credibility: 4 } },
        { p: 2, bad: true, text: "Hotel presses charges. Handcuffs.", effects: { hype: 12, cash: -1000 }, lockout: { kind: "jail", minutes: 12, bail: 5000 } },
      ] },
      { label: "Order room service instead", outcomes: [{ p: 1, text: "Club sandwiches all around.", effects: { relationships: 5, cash: -150 } }] },
    ],
  },
  {
    id: "charity",
    title: "Charity Gig",
    emoji: "🎗️",
    kind: "opportunity",
    text: "A local children's hospital asks if you'll play a free show.",
    choices: [
      { label: "Absolutely", outcomes: [{ p: 1, text: "Best show of your life. Not a dry eye.", effects: { credibility: 8, relationships: 10, fame: 25, energy: -10 } }] },
      { label: "Send merch instead", outcomes: [{ p: 1, text: "Nice gesture.", effects: { cash: -300, relationships: 3 } }] },
    ],
  },
  {
    id: "paparazzi",
    title: "Paparazzi",
    emoji: "📸",
    kind: "scandal",
    minLevel: 3,
    text: "A photographer gets in your face outside a restaurant.",
    choices: [
      { label: "Smile and wave", outcomes: [{ p: 1, text: "Great photo. Very wholesome.", effects: { fame: 15, hype: 3 } }] },
      { label: "Grab the camera", outcomes: [
        { p: 1, text: "Video goes viral. People are on your side.", effects: { hype: 12, fame: 30 } },
        { p: 2, bad: true, text: "Assault charge. Night in jail.", effects: { credibility: -10, hype: 10 }, lockout: { kind: "jail", minutes: 15, bail: 10000 } },
      ] },
    ],
  },
  {
    id: "ex-song",
    title: "Your Ex Wrote a Song",
    emoji: "💔",
    kind: "drama",
    text: "Your ex just released a breakup song clearly about you. It's charting.",
    choices: [
      { label: "Clap back with a diss track", outcomes: [{ p: 1, text: "The internet is eating. Popcorn emojis everywhere.", effects: { hype: 14, fame: 35, relationships: -10 } }] },
      { label: "Take the high road", outcomes: [{ p: 1, text: "Classy. Fans respect it.", effects: { credibility: 6, relationships: 4 } }] },
    ],
  },
  {
    id: "brand-deal-big",
    title: "Sneaker Collab",
    emoji: "👟",
    kind: "sponsor",
    minLevel: 4,
    text: "A sneaker giant wants your signature shoe.",
    choices: [
      { label: "Design it yourself", outcomes: [{ p: 1, text: "Sold out in 11 minutes.", effects: { cash: 40000, hype: 10, fame: 150, energy: -10 } }] },
      { label: "Just license your name", outcomes: [{ p: 1, text: "Easy money, mid shoe.", effects: { cash: 60000, credibility: -8 } }] },
    ],
  },
  {
    id: "burnout",
    title: "Running on Empty",
    emoji: "🥱",
    kind: "drama",
    text: "You haven't slept properly in weeks. Your voice is cracking.",
    choices: [
      { label: "Cancel a week of shows", outcomes: [{ p: 1, text: "Rest. Fans understand.", effects: { health: 25, energy: 20, hype: -5, cash: -500 } }] },
      { label: "Push through", outcomes: [
        { p: 2, text: "You make it. Barely.", effects: { health: -15, credibility: 3 } },
        { p: 1, bad: true, text: "You collapse on stage. Hospital, then rehab.", effects: { health: -10 }, lockout: { kind: "rehab", minutes: 8 } },
      ] },
    ],
  },
];
