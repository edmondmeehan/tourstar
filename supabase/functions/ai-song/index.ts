// Generates a real AI song clip for a player's release with ElevenLabs Music.
// The ElevenLabs key comes from Supabase Vault (admin → Integrations → ElevenLabs) and never
// leaves the server. The prompt is built here from fixed style lists, so players can't send
// arbitrary prompts. Limits: on/off switch + daily cap per player (admin → AI music).
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

const STYLES: Record<string, string[]> = {
  pop: ["pop", "catchy hook", "bright synths", "upbeat", "polished production", "lead vocals", "radio-ready"],
  rap: ["hip hop", "hard-hitting 808s", "confident rap vocals", "trap hi-hats", "punchy bass", "swagger", "modern"],
  rock: ["rock", "driving electric guitars", "live drums", "anthemic chorus", "gritty vocals", "arena energy", "big"],
  rnb: ["r&b", "smooth vocals", "warm keys", "groovy bass", "late-night vibe", "silky harmonies", "soulful"],
  electronic: ["electronic", "dance", "four-on-the-floor", "big synth drop", "club energy", "euphoric", "pulsing"],
  country: ["country", "acoustic guitar", "pedal steel", "storytelling vocals", "heartland", "warm", "singalong"],
  metal: ["heavy metal", "distorted guitars", "double kick drums", "powerful vocals", "aggressive", "epic", "loud"],
  indie: ["indie", "jangly guitars", "lo-fi warmth", "dreamy", "heartfelt vocals", "intimate", "nostalgic"],
};
const MOOD: Record<string, string> = {
  underdog: "hopeful and determined, an against-the-odds anthem",
  party: "a euphoric party anthem",
  chaos: "wild, unpredictable, chaotic energy",
  plant: "slick and radio-ready",
  prodigy: "virtuosic with an intricate arrangement",
  heartthrob: "romantic and swoon-worthy",
  grinder: "hungry and gritty, about working your way up",
  recluse: "moody and introspective",
  viral: "an instantly catchy, meme-able hook",
};
const LENGTH: Record<string, number> = { single: 30000, mixtape: 30000, ep: 30000, lp: 45000 };

/** Keep titles to plain words so they can't smuggle instructions into the prompt. */
const cleanTitle = (t: unknown) => String(t ?? "").replace(/[^\p{L}\p{N} '&!?.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40) || "Untitled";

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

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await svc.auth.getUser(token);
  const user = who?.user;
  if (!user) return json({ error: "Sign in to record AI songs." }, 401);

  const { data: cfg } = await svc.from("app_public_config").select("key, value").in("key", ["ai_music_enabled", "ai_music_daily_limit"]);
  const conf = Object.fromEntries((cfg ?? []).map((r) => [r.key, r.value]));
  if (conf.ai_music_enabled !== "true") return json({ error: "AI songs are switched off right now." }, 403);
  const limit = Math.max(0, Number(conf.ai_music_daily_limit ?? 3) || 0);
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await svc.from("ai_generations").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("kind", "song").eq("status", "ok").gte("created_at", since);
  if ((count ?? 0) >= limit) return json({ error: `You've recorded ${limit} AI songs today. Your studio time resets tomorrow.` }, 429);

  const body = await req.json().catch(() => ({}));
  const genre = STYLES[body.genre] ? body.genre : "pop";
  const mood = MOOD[body.persona] ?? "uplifting";
  const kind = LENGTH[body.kind] ? body.kind : "single";
  const title = cleanTitle(body.title);
  const songId = String(body.songId ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 40) || crypto.randomUUID();

  const { data: key } = await svc.rpc("get_secret", { p_name: "elevenlabs_api_key" });
  if (!key) return json({ error: "AI songs aren't connected yet." }, 503);

  try {
    const client = new ElevenLabsClient({ apiKey: key as string });
    const audio = await client.music.compose({
      prompt: `A ${STYLES[genre].join(", ")} song called "${title}", ${mood}. Big singalong chorus that repeats the title.`,
      musicLengthMs: LENGTH[kind],
      modelId: "music_v2_5",
    });
    const bytes = await toBytes(audio);
    const path = `songs/${user.id}/${songId}.mp3`;
    const up = await svc.storage.from("ai-audio").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (up.error) throw up.error;
    await svc.from("ai_generations").insert({ user_id: user.id, kind: "song", path, detail: `${genre} · ${kind} · ${title}` });
    const { data: pub } = svc.storage.from("ai-audio").getPublicUrl(path);
    return json({ url: pub.publicUrl, title });
  } catch (e) {
    const err = e as { statusCode?: number; body?: unknown; message?: string };
    const detail = JSON.stringify(err.body ?? err.message ?? "").slice(0, 300);
    await svc.from("ai_generations").insert({ user_id: user.id, kind: "song", status: "failed", detail });
    const friendly = err.statusCode === 401 ? "The AI music key isn't valid." : err.statusCode === 429 ? "The studio is busy. Try again in a minute." : "The AI studio couldn't record this one.";
    return json({ error: friendly }, 502);
  }
});
