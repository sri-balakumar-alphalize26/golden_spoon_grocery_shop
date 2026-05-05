import { create } from "zustand";

const useNetworkErrorStore = create((set, get) => ({
  visible: false,
  title: "",
  message: "",
  onRetry: null,
  onCancel: null,
  reconnectTick: 0,
  show: ({ title, message, onRetry, onCancel }) =>
    set({ visible: true, title, message, onRetry, onCancel }),
  hide: () =>
    set({ visible: false, title: "", message: "", onRetry: null, onCancel: null }),
  bumpReconnect: () => set({ reconnectTick: get().reconnectTick + 1 }),
}));

export default useNetworkErrorStore;
