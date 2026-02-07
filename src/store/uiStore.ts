import { create } from 'zustand';

interface UIStore {
  openCartOnLoad: boolean;
  setOpenCartOnLoad: (value: boolean) => void;
  isCartDrawerOpen: boolean;
  setCartDrawerOpen: (value: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  openCartOnLoad: false,
  setOpenCartOnLoad: (value: boolean) => set({ openCartOnLoad: value }),
  isCartDrawerOpen: false,
  setCartDrawerOpen: (value: boolean) => set({ isCartDrawerOpen: value }),
}));
