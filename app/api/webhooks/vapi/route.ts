import { NextRequest, NextResponse } from 'next/server'

// Vapi webhook event types:
// speech-update, transcript, function-call, hang, end-of-call-report, status-update

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message } = body
    if (!message) return NextResponse.json({ ok: true })

    const { type, call, artifact, transcript } = message

    console.log('Vapi webhook:', type, 'callId:', call?.id, 'status:', call?.status)

    // Store call state in KV if configured (optional — app works without it)
    if (process.env.KV_REST_API_URL && call?.id) {
      try {
        const { kv } = await import('@vercel/kv')
        const key = `call:${call.id}`
        const existing = ((await kv.get(key)) || {}) as Record<string, unknown>

        const update: Record<string, unknown> = {
          vapiCallId: call.id,
          updatedAt: new Date().toISOString(),
        }

        if (type === 'end-of-call-report') {
          update.status = 'completed'
          update.endedAt = call.endedAt || new Date().toISOString()
          update.duration = call.duration
          update.recordingUrl = artifact?.recordingUrl || null
          update.transcript = parseTranscript(artifact?.transcript)
          update.outcome = inferOutcome(artifact?.transcript)
        }

        if (type === 'transcript' && transcript) {
          // Accumulate live transcript lines
          const existing_transcript = (existing.transcript as any[] || [])
          const newLine = {
            role: transcript.role === 'assistant' ? 'ai' : 'human',
            text: transcript.transcript || transcript.text || '',
          }
          if (newLine.text) {
            update.transcript = [...existing_transcript, newLine]
          }
        }

        if (type === 'status-update') {
          update.status = call.status
        }

        await kv.set(key, { ...existing, ...update }, { ex: 60 * 60 * 24 * 30 })
      } catch (kvErr) {
        console.error('KV error:', kvErr)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Vapi webhook error:', err)
    return NextResponse.json({ ok: false }, { status: 200 }) // Always 200 so Vapi doesn't retry
  }
}

function parseTranscript(raw: unknown): { role: string; text: string }[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .map((item: any) => ({
        role: item.role === 'assistant' ? 'ai' : 'human',
        text: item.content || item.message || item.text || '',
      }))
      .filter(l => l.text)
  }
  if (typeof raw === 'string') {
    return raw.split('\n').filter(Boolean).map(line => {
      const isAI = line.startsWith('AI:') || line.startsWith('Assistant:')
      return {
        role: isAI ? 'ai' : 'human',
        text: line.replace(/^(AI:|Human:|Assistant:|User:)\s*/, '').trim(),
      }
    }).filter(l => l.text)
  }
  return []
}

function inferOutcome(transcript: unknown): string {
  const t = (typeof transcript === 'string' ? transcript : JSON.stringify(transcript || '')).toLowerCase()
  if (t.includes('book') || t.includes('schedule') || t.includes('calendly') || t.includes('appointment')) return 'booked'
  if (t.includes('not interested') || t.includes('no thank') || t.includes("don't need")) return 'not-interested'
  if (t.includes('call back') || t.includes('try again') || t.includes('better time')) return 'callback'
  if (t.includes('voicemail') || t.includes('leave a message')) return 'voicemail'
  if (t.length > 100) return 'answered'
  return 'no-answer'
}
