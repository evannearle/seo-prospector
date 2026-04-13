import { NextRequest, NextResponse } from 'next/server'

// Vapi sends webhooks for: call-started, call-ended, transcript, recording-ready
// We store them in KV if available, else just return 200

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message } = body

    if (!message) return NextResponse.json({ ok: true })

    const { type, call, artifact } = message

    // Build the update payload
    const update: Record<string, unknown> = {
      vapiCallId: call?.id,
      updatedAt: new Date().toISOString(),
    }

    if (type === 'end-of-call-report') {
      update.status = 'completed'
      update.endedAt = new Date().toISOString()
      update.duration = call?.duration
      update.recordingUrl = artifact?.recordingUrl || null
      update.transcript = artifact?.transcript
        ? parseVapiTranscript(artifact.transcript)
        : []
      update.outcome = inferOutcome(artifact?.transcript || '')
    }

    if (type === 'transcript') {
      update.transcript = parseVapiTranscript(artifact?.transcript || '')
    }

    // Try Vercel KV if available
    if (process.env.KV_REST_API_URL) {
      const { kv } = await import('@vercel/kv')
      const callKey = `call:${call?.id}`
      const existing = (await kv.get(callKey) || {}) as Record<string, unknown>
      await kv.set(callKey, { ...existing, ...update }, { ex: 60 * 60 * 24 * 30 }) // 30 day TTL
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Vapi webhook error:', err)
    return NextResponse.json({ ok: false }, { status: 200 }) // Always 200 to Vapi
  }
}

function parseVapiTranscript(raw: string | { role: string; content: string }[]) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((item) => ({ role: item.role === 'assistant' ? 'ai' : 'human', text: item.content }))
  }
  // Plain text fallback
  return raw.split('\n').filter(Boolean).map((line: string) => {
    const isAI = line.startsWith('AI:') || line.startsWith('Assistant:')
    return { role: isAI ? 'ai' : 'human', text: line.replace(/^(AI:|Human:|Assistant:|User:)\s*/, '') }
  })
}

function inferOutcome(transcript: string): string {
  const t = (typeof transcript === 'string' ? transcript : JSON.stringify(transcript)).toLowerCase()
  if (t.includes('book') || t.includes('schedule') || t.includes('calendly') || t.includes('appointment')) return 'booked'
  if (t.includes('not interested') || t.includes('no thank') || t.includes('don\'t need')) return 'not-interested'
  if (t.includes('call back') || t.includes('try again') || t.includes('better time')) return 'callback'
  if (t.includes('voicemail') || t.includes('leave a message')) return 'voicemail'
  if (t.length > 100) return 'answered'
  return 'no-answer'
}
