// Global mutable refs that survive tab switches and React re-renders
import type { Lead, TranscriptLine } from './types'

export type ScanStatus  = 'idle' | 'running' | 'paused' | 'done'
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
  results: [] as Lead[],
  savedCount: 0,
  listeners: new Set<() => void>(),
}
export function notifyScan() { scanState.listeners.forEach(fn => fn()) }

// ── Call queue state ──────────────────────────────────────────────────────────
export type QueueItemStatus  = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed'
export type QueueItemOutcome = 'pending' | 'answered' | 'voicemail' | 'no-answer' | 'booked' | 'not-interested' | 'callback'

export interface GlobalQueueItem {
  leadId:       string
  lead:         Lead
  status:       QueueItemStatus
  outcome:      QueueItemOutcome
  callId?:      string
  startedAt?:   string
  endedAt?:     string
  duration?:    number
  recordingUrl?: string
  transcript?:  TranscriptLine[]
  error?:       string
  retryCount?:  number
  retryAfter?:  string
  crmPushed?:   boolean
  listenUrl?:   string | null   // Vapi WebSocket audio stream URL
  controlUrl?:  string | null   // Vapi control endpoint
}

export const callState = {
  status: 'idle' as CallStatus2,
  pauseRequested: false,
  stopRequested: false,
  queue: [] as GlobalQueueItem[],
  listeners: new Set<() => void>(),
}
export function notifyCall() { callState.listeners.forEach(fn => fn()) }

// ── Scheduler state ───────────────────────────────────────────────────────────
export interface ScheduledRun {
  id:        string
  type:      'scan' | 'calls'
  schedule:  'once' | 'daily' | 'weekdays'
  timeHH:    number   // 0–23
  timeMM:    number   // 0–59
  enabled:   boolean
  lastRan?:  string
  nextRun?:  string
  label:     string
}

export const schedulerState = {
  schedules: [] as ScheduledRun[],
  timerHandle: null as ReturnType<typeof setInterval> | null,
  listeners: new Set<() => void>(),
}
export function notifyScheduler() { schedulerState.listeners.forEach(fn => fn()) }

// ── Helpers ───────────────────────────────────────────────────────────────────
export function addToCallQueue(lead: Lead) {
  if (callState.queue.find(q => q.leadId === lead.id)) return
  callState.queue.push({ leadId: lead.id, lead, status: 'queued', outcome: 'pending', retryCount: 0 })
  notifyCall()
}

export function updateQueueItem(leadId: string, updates: Partial<GlobalQueueItem>) {
  const idx = callState.queue.findIndex(q => q.leadId === leadId)
  if (idx >= 0) {
    callState.queue[idx] = { ...callState.queue[idx], ...updates }
    notifyCall()
  }
}

export function requeueNoAnswer(delayMinutes = 60) {
  const retryAfter = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
  let count = 0
  callState.queue.forEach((item, idx) => {
    if (item.outcome === 'no-answer' || item.outcome === 'voicemail') {
      const retryCount = (item.retryCount || 0) + 1
      if (retryCount <= 3) { // max 3 retries
        callState.queue[idx] = { ...item, status: 'queued', outcome: 'pending', retryCount, retryAfter }
        count++
      }
    }
  })
  if (count > 0) notifyCall()
  return count
}
