// Native (Capacitor) integrations. Everything here no-ops gracefully in a normal browser.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App as CapApp } from "@capacitor/app";
import type { StateStorage } from "zustand/middleware";

export const isNative = Capacitor.isNativePlatform();

/** Durable key/value storage: native Preferences on device (survives iOS storage purges), localStorage on web. */
export const gameStorage: StateStorage = isNative
  ? {
      getItem: async (name) => (await Preferences.get({ key: name })).value,
      setItem: async (name, value) => { await Preferences.set({ key: name, value }); },
      removeItem: async (name) => { await Preferences.remove({ key: name }); },
    }
  : {
      getItem: (name) => { try { return localStorage.getItem(name); } catch { return null; } },
      setItem: (name, value) => { try { localStorage.setItem(name, value); } catch { /* storage blocked */ } },
      removeItem: (name) => { try { localStorage.removeItem(name); } catch { /* storage blocked */ } },
    };

/** Native haptic tap. strength: 0.5 low, 1 med, 1.8 high (from settings). Returns false on web. */
export function nativeHaptic(strength: number, pattern: number[]) {
  if (!isNative) return false;
  const style = strength >= 1.5 ? ImpactStyle.Heavy : strength >= 1 ? ImpactStyle.Medium : ImpactStyle.Light;
  const pulses = Math.max(1, Math.ceil(pattern.length / 2));
  let delay = 0;
  for (let i = 0; i < pulses; i++) {
    window.setTimeout(() => { void Haptics.impact({ style }); }, delay);
    delay += (pattern[i * 2] ?? 30) + (pattern[i * 2 + 1] ?? 0);
  }
  return true;
}

/** One-time native setup: dark status bar, Android back button, hide splash once the save has loaded. */
export function initNative(onBack: () => boolean) {
  if (!isNative) return;
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  if (Capacitor.getPlatform() === "android") {
    void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    void CapApp.addListener("backButton", () => { if (!onBack()) void CapApp.exitApp(); });
  }
}

export function hideSplash() {
  if (isNative) void SplashScreen.hide().catch(() => {});
}
