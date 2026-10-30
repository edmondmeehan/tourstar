// Remembers whether the player has opened How to Play (per device), so the menu can point new players to it.
import { create } from "zustand";

const KEY = "ts_help_seen";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return true; } };

export const useHelpSeen = create<{ seen: boolean; markSeen: () => void }>((set) => ({
  seen: read(),
  markSeen: () => { try { localStorage.setItem(KEY, "1"); } catch { /* private mode: just hide for now */ } set({ seen: true }); },
}));
