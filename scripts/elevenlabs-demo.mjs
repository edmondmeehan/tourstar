// Make a TourStar test clip with ElevenLabs: a 30-second song and a stadium announcer intro.
//
//   node --env-file=.env.local scripts/elevenlabs-demo.mjs
//   node --env-file=.env.local scripts/elevenlabs-demo.mjs --genre rock --title "Velvet Skyline" --artist "Neon Kid"
//
// The SDK reads ELEVENLABS_API_KEY from the environment (.env.local); the key is never in the code.
// Files land in ./elevenlabs-demo/ (git-ignored). Uses ElevenLabs credits: ~30s of music + one short voice line.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const genre = arg("genre", "pop");
const title = arg("title", "Basement Dreams");
const artist = arg("artist", "Neon Kid");

// Same style recipe the game's server uses (supabase/functions/ai-song).
const STYLES = {
  pop: ["pop", "catchy hook", "bright synths", "upbeat", "polished production", "lead vocals", "radio-ready"],
  rap: ["hip hop", "hard-hitting 808s", "confident rap vocals", "trap hi-hats", "punchy bass", "swagger", "modern"],
  rock: ["rock", "driving electric guitars", "live drums", "anthemic chorus", "gritty vocals", "arena energy", "big"],
  rnb: ["r&b", "smooth vocals", "warm keys", "groovy bass", "late-night vibe", "silky harmonies", "soulful"],
  electronic: ["electronic", "dance", "four-on-the-floor", "big synth drop", "club energy", "euphoric", "pulsing"],
  country: ["country", "acoustic guitar", "pedal steel", "storytelling vocals", "heartland", "warm", "singalong"],
  metal: ["heavy metal", "distorted guitars", "double kick drums", "powerful vocals", "aggressive", "epic", "loud"],
  indie: ["indie", "jangly guitars", "lo-fi warmth", "dreamy", "heartfelt vocals", "intimate", "nostalgic"],
};
const styles = STYLES[genre] ?? STYLES.pop;

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY isn't set. Run with: node --env-file=.env.local scripts/elevenlabs-demo.mjs");
  process.exit(1);
}

const client = new ElevenLabsClient();
mkdirSync("elevenlabs-demo", { recursive: true });

async function toBuffer(audio) {
  // compose()/convert() return a web ReadableStream (or a Node stream in older SDKs).
  if (typeof audio?.getReader === "function") return Buffer.from(await new Response(audio).arrayBuffer());
  const chunks = [];
  for await (const c of audio) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

console.log(`🎸 Composing a 30s ${genre} song, "${title}"… (this can take up to a minute)`);
const song = await client.music.compose({
  prompt: `A ${styles.join(", ")} song called "${title}" about chasing a dream from a tiny basement to sold-out stadiums. Big singalong chorus that repeats the title.`,
  musicLengthMs: 30000,
  modelId: "music_v2_5",
});
const songFile = `elevenlabs-demo/${slug(title)}.mp3`;
writeFileSync(songFile, await toBuffer(song));
console.log(`✅ Song saved: ${songFile}`);

console.log(`🎤 Recording the stadium announcer for ${artist}…`);
const intro = await client.textToSpeech.convert("onwK4e9ZLuTAKqWW03F9", { // Daniel (authoritative)
  text: `[excited] Ladies and gentlemen... are you ready?! Please welcome to the stage... ${artist}!`,
  modelId: "eleven_v4",
  voiceSettings: { stability: 0.35, similarityBoost: 0.8 },
});
const introFile = `elevenlabs-demo/announcer-${slug(artist)}.mp3`;
writeFileSync(introFile, await toBuffer(intro));
console.log(`✅ Announcer saved: ${introFile}`);
console.log("Open them with:  open elevenlabs-demo");
