// Push notifications sent from the server (Admin → Notifications): presales, new drops, events.
// The phone registers with Apple, and we store its device token so the server can reach it.
// Asked together with the reminder notifications (after the first show), never on first launch.
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { isNative } from "./native";
import { supabase, useCloud } from "./cloud";

let token: string | null = null;
let started = false;

async function save() {
  if (!token || !supabase) return;
  await supabase.rpc("register_push", { p_token: token, p_platform: Capacitor.getPlatform() === "android" ? "android" : "ios" });
}

/** Register for server push if the player allowed notifications. Safe to call more than once. */
export async function enablePush() {
  if (!isNative) return;
  try {
    const perm = await PushNotifications.checkPermissions();
    const status = perm.receive === "prompt" ? (await PushNotifications.requestPermissions()).receive : perm.receive;
    if (status === "granted") await PushNotifications.register();
  } catch { /* push not available on this build */ }
}

/** Stop server push (Account → notifications off). */
export async function disablePush() {
  if (!isNative || !supabase) return;
  if (token) await supabase.rpc("unregister_push", { p_token: token });
  try { await PushNotifications.unregister(); } catch { /* ignore */ }
  token = null;
}

/** Listen for the device token and for taps. `go` opens an in-app page. */
export function startPush(go: (path: string) => void) {
  if (started || !isNative) return;
  started = true;
  void PushNotifications.addListener("registration", (t) => { token = t.value; void save(); });
  void PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const link = (a.notification.data as { link?: string } | undefined)?.link;
    if (link && link.startsWith("/")) go(link);
  });
  // Re-attach the device to the account after signing in, so VIP / presale messages reach it.
  useCloud.subscribe((s, p) => { if (s.session?.user.id !== p.session?.user.id) void save(); });
  // Already allowed earlier? Register quietly on launch to refresh the token.
  void PushNotifications.checkPermissions().then((p) => { if (p.receive === "granted") void PushNotifications.register(); }).catch(() => {});
}
