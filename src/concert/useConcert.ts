import { create } from "zustand";
import type { ActionResult } from "../game/store";

/** While a concert is on screen, event/celebration overlays wait their turn. */
export const useConcert = create<{ result: ActionResult | null; show: (r: ActionResult) => void; close: () => void }>((set) => ({
  result: null,
  show: (result) => set({ result }),
  close: () => set({ result: null }),
}));
