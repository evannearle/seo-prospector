// Background call runner — lives outside React, survives tab switches
import { callState, updateQueueItem, notifyCall } from './globalState'

let runnerActive = false

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
  // Only pick up items that are queued and past their retryAfter time
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
      if (!resp.ok) throw new Error(data.error || `Vapi error ${resp.status}`)

      const callId = data.id || data.callId || data.call_id
      updateQueueItem(item.leadId, { status: 'in-progress', callId })

      if (callId) await pollCall(callId, item.leadId, apiKey)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      updateQueueItem(item.leadId, { status: 'failed', outcome: 'no-answer', error: msg })
    }

    // Auto-push booked leads to CRM
    const completed = callState.queue.find(q => q.leadId === item.leadId)
    if (completed?.outcome === 'booked' && !completed.crmPushed) {
      await pushToCRM(completed)
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

async function pushToCRM(item: typeof callState.queue[0]) {
  const cfg = buildConfig()
  const webhookUrl = cfg.crmWebhookUrl
  if (!webhookUrl) return
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event:       'call.booked',
        timestamp:   new Date().toISOString(),
        lead: {
          name:     item.lead.name,
          phone:    item.lead.phone,
          address:  item.lead.addr,
          website:  item.lead.website,
          niche:    item.lead.niche,
          score:    item.lead.score,
          signals:  item.lead.signals,
          mapsUrl:  item.lead.mapsUrl,
        },
        call: {
          id:          item.callId,
          outcome:     item.outcome,
          duration:    item.duration,
          startedAt:   item.startedAt,
          endedAt:     item.endedAt,
          recordingUrl: item.recordingUrl,
          retryCount:  item.retryCount || 0,
        },
      }),
    })
    updateQueueItem(item.leadId, { crmPushed: true })
  } catch (e) {
    console.error('CRM push failed:', e)
  }
}

export function pauseCallRunner()  { callState.pauseRequested = true;  callState.status = 'paused';  notifyCall() }
export function resumeCallRunner() { callState.pauseRequested = false; callState.status = 'running'; notifyCall() }
export function stopCallRunner()   { callState.stopRequested = true; callState.pauseRequested = false; callState.status = 'idle'; runnerActive = false; notifyCall() }

export async function retryNoAnswers() {
  const { requeueNoAnswer } = await import('./globalState')
  const cfg = buildConfig()
  const delayMins = cfg.retryDelayMinutes || 60
  const count = requeueNoAnswer(delayMins)
  if (count > 0) {
    const apiKey = cfg.vapiApiKey
    if (apiKey) startCallRunner(apiKey)
  }
  return count
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
      maxCallDurationSeconds:  raw.maxCallDurationSeconds || 600,
      voiceId:                 raw.voiceId || 'pNInz6obpgDQGcFmaJgB',
      aiTemperature:           raw.aiTemperature || 0.7,
      delayBetweenCallsSeconds: raw.delayBetweenCallsSeconds || 3,
      retryDelayMinutes:       raw.retryDelayMinutes || 60,
      crmWebhookUrl:           raw.crmWebhookUrl || '',
    }
  } catch { return {} }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
