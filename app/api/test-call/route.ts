// Quick test endpoint — call this to verify Vapi works with a known-good phone number
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { vapiApiKey, phoneNumberId, testPhone } = await req.json()

    if (!vapiApiKey || !phoneNumberId || !testPhone) {
      return NextResponse.json({ error: 'Need vapiApiKey, phoneNumberId, testPhone' }, { status: 400 })
    }

    // Normalize phone
    const digits = testPhone.replace(/\D/g, '')
    const e164 = digits.length === 10 ? '+1' + digits
               : digits.length === 11 && digits[0] === '1' ? '+' + digits
               : testPhone.startsWith('+') ? testPhone : '+' + digits

    const body = {
      phoneNumberId,
      customer: { number: e164, name: 'Test Call' },
      assistant: {
        firstMessage: 'This is a test call from SEO Prospector. Everything is working correctly. Goodbye.',
        model: { provider: 'openai', model: 'gpt-4o-mini', systemPrompt: 'You are a test assistant. Say the first message and end the call.' },
        voice: { provider: '11labs', voiceId: 'pNInz6obpgDQGcFmaJgB' },
        maxDurationSeconds: 30,
      },
    }

    console.log('Test call body:', JSON.stringify({ phoneNumberId: phoneNumberId.slice(0,8)+'...', e164, rawPhone: testPhone }))

    const resp = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vapiApiKey}` },
      body: JSON.stringify(body),
    })

    const data = await resp.json()
    return NextResponse.json({ ok: resp.ok, status: resp.status, e164Sent: e164, vapiResponse: data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
