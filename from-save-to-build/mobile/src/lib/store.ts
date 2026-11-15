import { create } from 'zustand';
// Lightweight UI state that should survive navigation: marketplace filters.
export interface MarketFilters { category: string; device: string; country: string; duration: string; stage: string; beginner: boolean; reward: string }
export const emptyFilters: MarketFilters = { category: '', device: '', country: '', duration: '', stage: '', beginner: false, reward: '' };
export const useMarketFilters = create<{ filters: MarketFilters; set: (patch: Partial<MarketFilters>) => void; reset: () => void }>((set) => ({
  filters: emptyFilters, set: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })), reset: () => set({ filters: emptyFilters }),
}));
