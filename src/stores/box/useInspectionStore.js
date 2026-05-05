import { create } from 'zustand';

const useInspectionStore = create((set) => ({
    inspectedIds: [],
    addInspectedId: (id) => set((state) => ({ inspectedIds: [...state.inspectedIds, id] })),
    resetInspectedIds: () => set({ inspectedIds: [] }),
}));

export default useInspectionStore