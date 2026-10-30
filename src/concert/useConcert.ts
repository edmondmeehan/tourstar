import { create } from "zustand";
import type { PendingShow } from "../game/setlist";
import { unlockAudio } from "../lib/fx";

/** While a concert is on screen (open), event/celebration overlays wait their turn. */
export const useConcert = create<{ open: boolean; show: PendingShow | null; start: (s: PendingShow) => void; close: () => void }>((set) => ({
  open: false,
  show: null,
  start: (show) => { unlockAudio(); set({ open: true, show }); },
  close: () => set({ open: false, show: null }),
}));
