// Apple Push Notification service helpers for daily-jobs (league alerts sent from the server).
// Keys live in Admin → Integrations: apns_key_p8, apns_key_id, apns_team_id.
// deno-lint-ignore-file no-explicit-any
const BUNDLE_ID = "co.please.tourstar";
const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function apnsJwt(p8: string, keyId: string, teamId: string) {
  const pem = p8.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: keyId })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(sig)}`;
}

async function sendOne(jwt: string, env: "production" | "sandbox", token: string, payload: unknown) {
  const r = await fetch(`${HOSTS[env]}/3/device/${token}`, {
    method: "POST",
    headers: { authorization: `bearer ${jwt}`, "apns-topic": BUNDLE_ID, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (r.status === 200) return { ok: true as const };
  const reason = ((await r.json().catch(() => ({}))) as { reason?: string }).reason ?? `HTTP ${r.status}`;
  return { ok: false as const, status: r.status, reason };
}

/** Send one alert to every iPhone a player has registered. Returns how many devices got it (0 if push isn't set up). */
export async function pushToUser(svc: any, userId: string, alert: { title: string; body: string; link?: string }, jwtCache: { jwt?: string | null }) {
  if (jwtCache.jwt === undefined) {
    const keys = await Promise.all(["apns_key_p8", "apns_key_id", "apns_team_id"].map((n) => svc.rpc("get_secret", { p_name: n }).then((r: any) => r.data as string | null)));
    try { jwtCache.jwt = keys.every(Boolean) ? await apnsJwt(keys[0]!, keys[1]!.trim(), keys[2]!.trim()) : null; } catch { jwtCache.jwt = null; }
  }
  if (!jwtCache.jwt) return 0;
  const { data: devices } = await svc.from("push_devices").select("token, apns_env").eq("user_id", userId).eq("platform", "ios");
  const payload = { aps: { alert: { title: alert.title, body: alert.body }, sound: "default" }, link: alert.link };
  let ok = 0;
  for (const d of (devices ?? []) as { token: string; apns_env: string | null }[]) {
    const r = await sendOne(jwtCache.jwt, d.apns_env === "sandbox" ? "sandbox" : "production", d.token, payload);
    if (r.ok) ok++;
    else if (r.status === 410 || r.reason === "Unregistered") await svc.from("push_devices").delete().eq("token", d.token);
  }
  return ok;
}
