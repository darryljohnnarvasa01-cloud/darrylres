import { create } from 'zustand'

export const useStaffOperationsStore = create((set) => ({
  activeStatus: '',
  page: 1,
  setActiveStatus: (activeStatus) => set({ activeStatus, page: 1 }),
  setPage: (page) =>
    set((state) => ({
      page: typeof page === 'function' ? page(state.page) : page,
    })),
}))
