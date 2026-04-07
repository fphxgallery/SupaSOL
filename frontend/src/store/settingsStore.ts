import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type PriorityFeeMode = 'none' | 'low' | 'medium' | 'high';

interface SettingsState {
  slippageBps: number;
  priorityFeeMode: PriorityFeeMode;
  setSlippageBps: (bps: number) => void;
  setPriorityFeeMode: (mode: PriorityFeeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      slippageBps: 50, // 0.5% default
      priorityFeeMode: 'medium',
      setSlippageBps: (slippageBps) => set({ slippageBps }),
      setPriorityFeeMode: (priorityFeeMode) => set({ priorityFeeMode }),
    }),
    { name: 'ftb-settings' }
  )
);
