// Global mutable refs that survive tab switches and React re-renders
// The key insight: React state resets when a component unmounts (tab switch).
// We store everything that must persist in module-level refs.

export type ScanStatus = 'idle' | 'running' | 'paused' | 'done'
export type CallStatus2 = 'idle' | 'running' | 'paused' | 'done'

// ── Scan state ────────────────────────────────────────────────────────────────
export const scanState = {
  status: 'idle' as ScanStatus,
  pauseRequested: false,
  stopRequested: false,
  log: [] as { cls: string; msg: string }[],
  pct: 0,
  currentLocation: '',
  currentBiz: '',
  results: [] as import('./types').Lead[],
  savedCount: 0,
  listeners: new Set<() => void>(),
}

export function notifyScan() { scanState.listeners.forEach(fn => fn()) }

// ── Call queue state ──────────────────────────────────────────────────────────
import type { Lead, TranscriptLine } from './types'

export type QueueItemStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed'
export type QueueItemOutcome = 'pending' | 'answered' | 'voicemail' | 'no-answer' | 'booked' | 'not-interested' | 'callback'

export interface GlobalQueueItem {
  leadId: string
  lead: Lead
  status: QueueItemStatus
  outcome: QueueItemOutcome
  callId?: string
  startedAt?: string
  endedAt?: string
  duration?: number
  recordingUrl?: string
  transcript?: TranscriptLine[]
  error?: string
}

export const callState = {
  status: 'idle' as CallStatus2,
  pauseRequested: false,
  stopRequested: false,
  queue: [] as GlobalQueueItem[],
  listeners: new Set<() => void>(),
}

export function notifyCall() { callState.listeners.forEach(fn => fn()) }

// ── Helpers ───────────────────────────────────────────────────────────────────
export function addToCallQueue(lead: Lead) {
  if (callState.queue.find(q => q.leadId === lead.id)) return
  callState.queue.push({ leadId: lead.id, lead, status: 'queued', outcome: 'pending' })
  notifyCall()
}

export function updateQueueItem(leadId: string, updates: Partial<GlobalQueueItem>) {
  const idx = callState.queue.findIndex(q => q.leadId === leadId)
  if (idx >= 0) {
    callState.queue[idx] = { ...callState.queue[idx], ...updates }
    notifyCall()
  }
}
