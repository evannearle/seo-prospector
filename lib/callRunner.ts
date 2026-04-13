// Background call runner — lives outside React, survives tab switches
// Called from PhoneTab, continues even when user navigates away

import { callState, updateQueueItem, notifyCall } from './globalState'
import type { GlobalQueueItem } from './globalState'

let runnerActive = false

export async function startCallRunner(apiKey: string) {
  if (runnerActive) return
  runnerActive = true
  callState.status = 'running'
  callState.stopRequested = false
  callState.pauseRequested = false
  notifyCall()

  const waiting = callState.queue.filter(q => q.status === 'queued')

  for (const item of waiting) {
    if (callState.stopRequested) break

    // Pause loop
    while (callState.pauseRequested && !callState.stopRequested) {
      await sleep(500)
    }
    if (callState.stopRequested) break

    updateQueueItem(item.leadId, { status: 'ringing', startedAt: new Date().toISOString() })

    try {
      const resp = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: item.lead, config: getConfig() }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Vapi error')

      const callId = data.id || data.callId || data.call_id
      updateQueueItem(item.leadId, { status: 'in-progress', callId, startedAt: new Date().toISOString() })

      // Poll for completion
      if (callId) await pollCall(callId, item.leadId, apiKey)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      updateQueueItem(item.leadId, { status: 'failed', outcome: 'no-answer', error: msg })
    }

    // Delay between calls
    const delaySecs = getConfig().delayBetweenCallsSeconds || 3
    if (!callState.stopRequested) await sleep(delaySecs * 1000)
  }

  callState.status = callState.stopRequested ? 'idle' : 'done'
  runnerActive = false
  notifyCall()
}

export function pauseCallRunner()  { callState.pauseRequested = true;  callState.status = 'paused'; notifyCall() }
export function resumeCallRunner() { callState.pauseRequested = false; callState.status = 'running'; notifyCall() }
export function stopCallRunner()   { callState.stopRequested = true; callState.pauseRequested = false; callState.status = 'idle'; runnerActive = false; notifyCall() }

async function pollCall(callId: string, leadId: string, apiKey: string) {
  const maxWait = 3 * 60 * 1000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    await sleep(5000)
    if (callState.stopRequested) return
    try {
      const resp = await fetch(`/api/calls?callId=${callId}&apiKey=${apiKey}`)
      const data = await resp.json()
      if (data.status === 'ended') {
        const transcript = (data.artifact?.transcript || []).map((t: { role: string; message?: string; content?: string }) => ({
          role: t.role === 'assistant' ? 'ai' : 'human',
          text: t.message || t.content || ''
        }))
        const recordingUrl = data.artifact?.recordingUrl || null
        const outcome = inferOutcome(data.analysis?.summary || JSON.stringify(transcript))
        const dur = data.endedAt && data.startedAt
          ? Math.round((new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime()) / 1000)
          : undefined
        updateQueueItem(leadId, { status: 'completed', outcome, endedAt: new Date().toISOString(), duration: dur, recordingUrl, transcript })
        return
      }
      if (data.status === 'failed') {
        updateQueueItem(leadId, { status: 'failed', outcome: 'no-answer' })
        return
      }
    } catch { /* keep polling */ }
  }
}

function inferOutcome(text: string) {
  const t = text.toLowerCase()
  if (t.includes('book') || t.includes('schedule') || t.includes('calendly')) return 'booked' as const
  if (t.includes('not interested') || t.includes('no thank')) return 'not-interested' as const
  if (t.includes('call back') || t.includes('try again')) return 'callback' as const
  if (t.includes('voicemail')) return 'voicemail' as const
  if (t.length > 100) return 'answered' as const
  return 'no-answer' as const
}

function getConfig() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('seo_prospector_settings_v1')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
