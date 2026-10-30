// App version for the title screen, Account and crash reports.
// In the iPhone app: the App Store version and the Xcode build number (what TestFlight shows).
// On the web: the date and time the site was built.
import { create } from "zustand";
import { App } from "@capacitor/app";
import { isNative } from "./native";

export const useVersion = create<{ version: string | null; build: string | null }>(() => ({ version: null, build: null }));

let started = false;
export function loadVersion() {
  if (started) return;
  started = true;
  if (!isNative) return;
  void App.getInfo().then((i) => useVersion.setState({ version: i.version, build: i.build })).catch(() => {});
}

/** Short label, e.g. "v1.0 (14)" in the app or "web 2026-10-30 13:55" on the site. */
export function versionLabel(v: { version: string | null; build: string | null }) {
  return v.version ? `v${v.version} (${v.build})` : `web ${__BUILD__}`;
}
