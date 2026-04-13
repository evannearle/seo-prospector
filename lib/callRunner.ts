// Background call runner — lives outside React, survives tab switches
// Writes to BOTH the in-memory global callState AND the persistent Zustand store
import { callState, updateQueueItem, notifyCall } from './globalState'
import type { CallRecord } from './types'

let runnerActive = false

// Get store imperatively (no hooks — this is a non-React module)
function getStore() {
  // Dynamic import to avoid circular deps; useStore.getState() is the Zustand API
  if (typeof window === 'undefined') return null
  try {
    // Access via the module cache — Zustand stores are singletons
    const { useStore } = require('./store')
    return useStore.getState()
  } catch { return null }
}

function persistCall(call: CallRecord) {
  const store = getStore()
  if (!store) return
  // Check if already exists (from a previous partial run)
  const existing = store.calls.find((c: CallRecord) => c.id === call.id)
  if (existing) {
    store.updateCall(call.id, call)
  } else {
    store.addCall(call)
  }
  // Also update lead status in the persistent store
  if (call.outcome === 'booked') store.updateLeadStatus(call.leadId, 'booked')
  else if (call.outcome === 'no-answer' || call.outcome === 'voicemail') store.updateLeadStatus(call.leadId, 'noans')
  else if (call.status === 'completed') store.updateLeadStatus(call.leadId, 'called')
}

export async function startCallRunner(apiKey: string) {
  if (runnerActive) return
  runnerActive = true
  callState.status = 'running'
  callState.stopRequested = false
  callState.pauseRequested = false
  notifyCall()

  await processQueue(apiKey)

  callState.status = callState.stopRequested ? 'idle' : 'done'
  runnerActive = false
  notifyCall()
}

async function processQueue(apiKey: string) {
  const getReady = () => callState.queue.filter(q =>
    q.status === 'queued' &&
    (!q.retryAfter || new Date(q.retryAfter) <= new Date())
  )

  let waiting = getReady()
  while (waiting.length > 0 && !callState.stopRequested) {
    const item = waiting[0]

    while (callState.pauseRequested && !callState.stopRequested) await sleep(500)
    if (callState.stopRequested) break

    updateQueueItem(item.leadId, { status: 'ringing', startedAt: new Date().toISOString() })

    const callRecord: CallRecord = {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      leadId:   item.lead.id,
      leadName: item.lead.name,
      phone:    item.lead.phone || '',
      status:   'in-progress',
      outcome:  'pending',
      startedAt: new Date().toISOString(),
    }

    try {
      const cfg = buildConfig()
      if (!cfg.vapiApiKey)    throw new Error('Missing Vapi API key — check Settings')
      if (!cfg.phoneNumberId) throw new Error('Missing Vapi Phone Number ID — check Settings')

      const resp = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: item.lead, config: cfg }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `Vapi error ${resp.status}: ${data.hint || ''}`)

      const callId = data.id || data.callId || data.call_id
      const listenUrl  = data.monitor?.listenUrl  || null
      const controlUrl = data.monitor?.controlUrl || null
      callRecord.vapiCallId = callId
      updateQueueItem(item.leadId, { status: 'in-progress', callId, listenUrl, controlUrl })

      // Persist initial record immediately
      persistCall(callRecord)

      // Poll Vapi until call ends
      if (callId) {
        const result = await pollCall(callId, item.leadId, apiKey)
        callRecord.status      = 'completed'
        callRecord.outcome     = result.outcome
        callRecord.endedAt     = result.endedAt
        callRecord.duration    = result.duration
        callRecord.recordingUrl = result.recordingUrl || undefined
        callRecord.transcript  = result.transcript
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      callRecord.status  = 'failed'
      callRecord.outcome = 'no-answer'
      callRecord.endedAt = new Date().toISOString()
      updateQueueItem(item.leadId, { status: 'failed', outcome: 'no-answer', error: msg })
    }

    // Persist final state to store (creates or updates)
    persistCall(callRecord)

    // Update queue item with final outcome
    updateQueueItem(item.leadId, {
      status:      callRecord.status as any,
      outcome:     callRecord.outcome as any,
      endedAt:     callRecord.endedAt,
      duration:    callRecord.duration,
      recordingUrl: callRecord.recordingUrl,
      transcript:  callRecord.transcript,
    })

    // Auto-push to CRM and email on booking
    const queueItem = callState.queue.find(q => q.leadId === item.leadId)
    if (queueItem?.outcome === 'booked') {
      await Promise.allSettled([
        pushToCRM(queueItem, callRecord),
        sendEmailAlert(queueItem, callRecord),
      ])
    }

    const delaySecs = buildConfig().delayBetweenCallsSeconds || 3
    if (!callState.stopRequested) await sleep(delaySecs * 1000)
    waiting = getReady()
  }
}

async function pollCall(callId: string, leadId: string, apiKey: string) {
  const maxWait = 3 * 60 * 1000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    await sleep(5000)
    if (callState.stopRequested) break
    try {
      const resp = await fetch(`/api/calls?callId=${callId}&apiKey=${apiKey}`)
      const data = await resp.json()
      if (data.status === 'ended' || data.status === 'completed') {
        const transcript = (data.artifact?.transcript || []).map((t: { role: string; message?: string; content?: string }) => ({
          role: t.role === 'assistant' ? 'ai' : 'human',
          text: t.message || t.content || ''
        }))
        const recordingUrl = data.artifact?.recordingUrl || null
        const outcome = inferOutcome(data.analysis?.summary || JSON.stringify(transcript))
        const dur = data.endedAt && data.startedAt
          ? Math.round((new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime()) / 1000)
          : undefined
        return { outcome, endedAt: data.endedAt || new Date().toISOString(), duration: dur, recordingUrl, transcript }
      }
      if (data.status === 'failed') {
        return { outcome: 'no-answer' as const, endedAt: new Date().toISOString(), duration: undefined, recordingUrl: null, transcript: [] }
      }
    } catch { /* keep polling */ }
  }
  return { outcome: 'no-answer' as const, endedAt: new Date().toISOString(), duration: undefined, recordingUrl: null, transcript: [] }
}

export function pauseCallRunner()  { callState.pauseRequested = true;  callState.status = 'paused';  notifyCall() }
export function resumeCallRunner() { callState.pauseRequested = false; callState.status = 'running'; notifyCall() }
export function stopCallRunner()   { callState.stopRequested = true; callState.pauseRequested = false; callState.status = 'idle'; runnerActive = false; notifyCall() }

export async function retryNoAnswers() {
  const { requeueNoAnswer } = await import('./globalState')
  const cfg = buildConfig()
  const count = requeueNoAnswer(cfg.retryDelayMinutes || 60)
  if (count > 0 && cfg.vapiApiKey) startCallRunner(cfg.vapiApiKey)
  return count
}

async function pushToCRM(item: typeof callState.queue[0], callRecord: CallRecord) {
  const cfg = buildConfig()
  if (!cfg.crmWebhookUrl) return
  try {
    await fetch(cfg.crmWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'call.booked', timestamp: new Date().toISOString(),
        lead: { name: item.lead.name, phone: item.lead.phone, address: item.lead.addr, website: item.lead.website, niche: item.lead.niche, score: item.lead.score, signals: item.lead.signals, mapsUrl: item.lead.mapsUrl },
        call: { id: callRecord.vapiCallId, outcome: callRecord.outcome, duration: callRecord.duration, startedAt: callRecord.startedAt, endedAt: callRecord.endedAt, recordingUrl: callRecord.recordingUrl, retryCount: item.retryCount || 0 },
      }),
    })
    updateQueueItem(item.leadId, { crmPushed: true })
  } catch (e) { console.error('CRM push failed:', e) }
}

async function sendEmailAlert(item: typeof callState.queue[0], callRecord: CallRecord) {
  const cfg = buildConfig()
  if (!cfg.emailAlertsEnabled || !cfg.alertEmail || !cfg.resendApiKey) return
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead: { name: item.lead.name, phone: item.lead.phone, addr: item.lead.addr, website: item.lead.website, niche: item.lead.niche, score: item.lead.score, signals: item.lead.signals, mapsUrl: item.lead.mapsUrl },
        call: { callId: callRecord.vapiCallId, outcome: callRecord.outcome, duration: callRecord.duration, recordingUrl: callRecord.recordingUrl, transcript: callRecord.transcript || [], retryCount: item.retryCount || 0 },
        config: { alertEmail: cfg.alertEmail, resendApiKey: cfg.resendApiKey, agencyName: cfg.agencyName || 'SEO Prospector', emailAlertsEnabled: cfg.emailAlertsEnabled },
      }),
    })
  } catch (e) { console.error('Email alert failed:', e) }
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

function buildConfig(): Record<string, any> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = JSON.parse(localStorage.getItem('seo_prospector_settings_v1') || '{}')
    return {
      vapiApiKey:              raw.vapiApiKey,
      phoneNumberId:           raw.vapiPhoneNumberId,
      agencyName:              raw.agencyName,
      callerName:              raw.callerName,
      callerTitle:             raw.callerTitle,
      callerEmail:             raw.callerEmail,
      bookingLink:             raw.calendlyEventUrl,
      calendlyToken:           raw.calendlyToken,
      callGoal:                raw.callGoal,
      noAnswerBehavior:        raw.noAnswerBehavior,
      valueProposition:        raw.valueProposition,
      offerLine:               raw.offerLine,
      callModel:               raw.callModel || 'gpt-4o-mini',
      maxCallDurationSeconds:  raw.maxCallDurationSeconds || 600,
      voiceId:                 raw.voiceId || 'pNInz6obpgDQGcFmaJgB',
      aiTemperature:           raw.aiTemperature || 0.7,
      delayBetweenCallsSeconds: raw.delayBetweenCallsSeconds || 3,
      retryDelayMinutes:       raw.retryDelayMinutes || 60,
      crmWebhookUrl:           raw.crmWebhookUrl || '',
      alertEmail:              raw.alertEmail || '',
      resendApiKey:            raw.resendApiKey || '',
      emailAlertsEnabled:      raw.emailAlertsEnabled !== false,
    }
  } catch { return {} }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
