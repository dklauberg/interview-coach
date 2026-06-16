import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Report, SavedSession, SessionConfig, Turn } from "./types";

interface State {
  profile: string;
  config: SessionConfig | null;
  turns: Turn[];
  report: Report | null;
  sessions: SavedSession[];

  setProfile: (p: string) => void;
  startSession: (config: SessionConfig) => void;
  addTurn: (turn: Turn) => void;
  setReport: (report: Report) => void;
  saveCurrentSession: () => void;
  resetActive: () => void;
  deleteSession: (id: string) => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      profile: "",
      config: null,
      turns: [],
      report: null,
      sessions: [],

      setProfile: (p) => set({ profile: p }),

      startSession: (config) =>
        set({ config, turns: [], report: null, profile: config.profile }),

      addTurn: (turn) => set({ turns: [...get().turns, turn] }),

      setReport: (report) => set({ report }),

      saveCurrentSession: () => {
        const { config, turns, report, sessions } = get();
        if (!config) return;
        const saved: SavedSession = {
          id: `${Date.now()}`,
          profile: config.profile,
          createdAt: Date.now(),
          config,
          // strip ephemeral audio URLs before persisting
          turns: turns.map(({ audioUrl, ...rest }) => rest),
          report: report ?? undefined,
        };
        set({ sessions: [saved, ...sessions] });
      },

      resetActive: () => set({ config: null, turns: [], report: null }),

      deleteSession: (id) =>
        set({ sessions: get().sessions.filter((s) => s.id !== id) }),
    }),
    {
      name: "interview-coach",
      // don't persist ephemeral audio blobs
      partialize: (s) => ({
        profile: s.profile,
        config: s.config,
        turns: s.turns.map(({ audioUrl, ...rest }) => rest),
        report: s.report,
        sessions: s.sessions,
      }),
    },
  ),
);
