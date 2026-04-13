'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lead, CallRecord, LeadStatus } from './types'

interface Store {
  leads: Lead[]
  calls: CallRecord[]

  // Leads
  addLeads: (leads: Lead[]) => void
  upsertLead: (lead: Lead) => void
  updateLeadStatus: (id: string, status: LeadStatus) => void
  deleteLead: (id: string) => void
  clearLeads: () => void

  // Calls
  addCall: (call: CallRecord) => void
  updateCall: (id: string, updates: Partial<CallRecord>) => void
  clearCalls: () => void
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      leads: [],
      calls: [],

      addLeads: (incoming) => set((state) => {
        const existingIds = new Set(state.leads.map((l) => l.placeId))
        const novel = incoming
          .filter((l) => !existingIds.has(l.placeId))
          .map((l) => ({ ...l, savedAt: l.savedAt || new Date().toISOString(), status: l.status || 'new' as LeadStatus }))
        return { leads: [...state.leads, ...novel] }
      }),

      upsertLead: (lead) => set((state) => {
        const idx = state.leads.findIndex((l) => l.placeId === lead.placeId)
        if (idx >= 0) {
          const next = [...state.leads]
          next[idx] = { ...next[idx], ...lead }
          return { leads: next }
        }
        return { leads: [...state.leads, { ...lead, savedAt: lead.savedAt || new Date().toISOString() }] }
      }),

      updateLeadStatus: (id, status) => set((state) => ({
        leads: state.leads.map((l) => (l.id === id ? { ...l, status } : l)),
      })),

      deleteLead: (id) => set((state) => ({
        leads: state.leads.filter((l) => l.id !== id),
      })),

      clearLeads: () => set({ leads: [] }),

      addCall: (call) => set((state) => ({ calls: [call, ...state.calls] })),

      updateCall: (id, updates) => set((state) => ({
        calls: state.calls.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      })),

      clearCalls: () => set({ calls: [] }),
    }),
    { name: 'seo-prospector-v3' }
  )
)
