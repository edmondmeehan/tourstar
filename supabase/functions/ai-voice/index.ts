// Voice lines with ElevenLabs Text to Speech, cached in Storage so each line is only paid for once.
//  kind "mo"    → Mo the manager's tutorial lines (fixed text, shared by everyone, no sign-in needed)
//  kind "intro" → the stadium announcer introducing the player's artist name (signed-in players)
// The ElevenLabs key comes from Supabase Vault and never leaves the server.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ElevenLabsClient } from "npm:@elevenlabs/elevenlabs-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MO_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George: warm, friendly
const ANNOUNCER_VOICE = "onwK4e9ZLuTAKqWW03F9"; // Daniel: big and authoritative
const VERSION = "v1"; // bump to re-record every line

/** Must match the tutorial steps in src/components/Coach.tsx. */
const MO_LINES = [
  "Hey! I'm Mo, your new manager. Right now you're playing to Mom's laundry. Let's change that.",
  "First stop: your first gig. Tap Tour, down below.",
  "The open mic is free. Hit the road, pick your songs, then get on stage. When the notes hit the line... tap!",
  "The crowd's waiting. Get back out there and finish your show.",
  "[excited] That's your first show! You earned points. Save them for real merch and VIP prizes. Now let's make some music. Tap Album.",
  "Drop a free mixtape, or a single. Every release joins your setlist, and earns royalties while you're away.",
  "You're officially an artist. Every day: claim your reward, finish your quests, and collect your royalties. See you at the top!",
];

const cleanName = (n: unknown) => String(n ?? "").replace(/[^\p{L}\p{N} '&.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);

async function sha(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(d.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function toBytes(audio: unknown): Promise<Uint8Array> {
  if (audio && typeof (audio as ReadableStream).getReader === "function") return new Uint8Array(await new Response(audio as ReadableStream).arrayBuffer());
  const chunks: Uint8Array[] = [];
  for await (const c of audio as AsyncIterable<Uint8Array>) chunks.push(c);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: flag } = await svc.from("app_public_config").select("value").eq("key", "ai_voice_enabled").maybeSingle();
  if (flag?.value !== "true") return json({ error: "AI voices are switched off right now." }, 403);

  const body = await req.json().catch(() => ({}));
  let text: string, voice: string, cacheKey: string, path: string, kind: "mo" | "intro";
  let userId: string | null = null;

  if (body.kind === "mo") {
    const step = Number(body.step);
    if (!Number.isInteger(step) || step < 0 || step >= MO_LINES.length) return json({ error: "Unknown line." }, 400);
    kind = "mo"; text = MO_LINES[step]; voice = MO_VOICE;
    cacheKey = `mo:${VERSION}:${step}`; path = `voice/mo/${VERSION}-${step}.mp3`;
  } else if (body.kind === "intro") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who } = await svc.auth.getUser(token);
    if (!who?.user) return json({ error: "Sign in for a personal stadium intro." }, 401);
    userId = who.user.id;
    const name = cleanName(body.name);
    if (!name) return json({ error: "Missing artist name." }, 400);
    kind = "intro"; voice = ANNOUNCER_VOICE;
    text = `[excited] Ladies and gentlemen... are you ready?! Please welcome to the stage... ${name}!`;
    const h = await sha(`${VERSION}|${name.toLowerCase()}`);
    cacheKey = `intro:${h}`; path = `voice/intro/${h}.mp3`;
  } else {
    return json({ error: "Unknown kind." }, 400);
  }

  const publicUrl = () => svc.storage.from("ai-audio").getPublicUrl(path).data.publicUrl;
  // Already recorded? Hand back the saved file (free).
  const { data: hit } = await svc.from("ai_generations").select("id").eq("cache_key", cacheKey).eq("status", "ok").maybeSingle();
  if (hit) return json({ url: publicUrl(), cached: true });

  if (userId) {
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await svc.from("ai_generations").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("kind", "intro").gte("created_at", since);
    if ((count ?? 0) >= 5) return json({ error: "That's enough intros for today. Try again tomorrow." }, 429);
  }

  const { data: key } = await svc.rpc("get_secret", { p_name: "elevenlabs_api_key" });
  if (!key) return json({ error: "AI voices aren't connected yet." }, 503);

  try {
    const client = new ElevenLabsClient({ apiKey: key as string });
    const audio = await client.textToSpeech.convert(voice, {
      text,
      modelId: "eleven_v4",
      voiceSettings: kind === "intro" ? { stability: 0.35, similarityBoost: 0.8 } : { stability: 0.5, similarityBoost: 0.75 },
    });
    const up = await svc.storage.from("ai-audio").upload(path, await toBytes(audio), { contentType: "audio/mpeg", upsert: true });
    if (up.error) throw up.error;
    const ins = await svc.from("ai_generations").insert({ user_id: userId, kind, cache_key: cacheKey, path, detail: text.slice(0, 200) });
    // Two players racing for the same line is fine: the second insert hits the unique key and we still return the file.
    void ins;
    return json({ url: publicUrl(), cached: false });
  } catch (e) {
    const err = e as { statusCode?: number; body?: unknown; message?: string };
    await svc.from("ai_generations").insert({ user_id: userId, kind, status: "failed", detail: JSON.stringify(err.body ?? err.message ?? "").slice(0, 300) });
    return json({ error: err.statusCode === 401 ? "The AI voice key isn't valid." : "Couldn't record that line right now." }, 502);
  }
});
