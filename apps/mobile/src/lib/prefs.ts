import { create } from 'zustand';
import { DEFAULT_FILL_DELAY_MS } from './theme';
import { storage } from './storage';

const KEY = 'formcast.prefs';

export interface Prefs {
  fillDelayMs: number;
  showTranscript: boolean;
  vibrateOnFill: boolean;
  /** Streams a recorded demo script instead of the microphone. */
  demoVoice: boolean;
  micPrimed: boolean;
}

const defaults: Prefs = { fillDelayMs: DEFAULT_FILL_DELAY_MS, showTranscript: true, vibrateOnFill: false, demoVoice: false, micPrimed: false };

interface PrefsState extends Prefs {
  hydrate: () => Promise<void>;
  update: (patch: Partial<Prefs>) => void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...defaults,
  async hydrate() {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      set({ ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) });
    } catch {
      // keep defaults
    }
  },
  update(patch) {
    set(patch);
    const { hydrate: _h, update: _u, ...prefs } = { ...get(), ...patch };
    void storage.set(KEY, JSON.stringify(prefs));
  },
}));
