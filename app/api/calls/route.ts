import { NextRequest, NextResponse } from 'next/server'

// ── Calendly helpers ──────────────────────────────────────────────────────────

async function getCalendlyUser(token: string) {
  const r = await fetch('https://api.calendly.com/users/me', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const d = await r.json()
  return d.resource
}

async function getCalendlyAvailability(token: string, eventTypeUri: string) {
  const start = new Date()
  const end   = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  const url = `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const d = await r.json()
  return (d.collection || []).slice(0, 3) as { start_time: string }[]
}

async function getEventTypeUri(token: string, calendlyUrl: string): Promise<string | null> {
  try {
    const user = await getCalendlyUser(token)
    const orgUri = user.current_organization
    const slug = calendlyUrl.split('/').pop()
    const r = await fetch(`https://api.calendly.com/event_types?organization=${encodeURIComponent(orgUri)}&active=true&count=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await r.json()
    const et = (d.collection || []).find((e: { scheduling_url: string; uri: string }) =>
      e.scheduling_url?.includes(slug || '')
    )
    return et?.uri || null
  } catch { return null }
}

function formatSlots(slots: { start_time: string }[]): string {
  return slots.map((s, i) => {
    const dt = new Date(s.start_time)
    return `Option ${i+1}: ${dt.toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'})} at ${dt.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', hour12:true})}`
  }).join('\n')
}

// ── Signal label map ──────────────────────────────────────────────────────────

function signalLabel(key: string): string {
  const labels: Record<string, string> = {
    fewReviews:          'under 25 Google reviews',
    lowRating:           'a rating below 4.0 stars',
    noWebsite:           'no website on your Google profile',
    noPhone:             'no phone number listed on Google',
    noHours:             'no business hours on Google',
    fewPhotos:           'very few profile photos',
    noSchema:            'no schema markup on your website',
    noMeta:              'missing meta description',
    noMobile:            'your site not being mobile-friendly',
    noSSL:               'no HTTPS on your website',
    noCityMention:       'your city not mentioned on your website',
    slowSite:            'a slow website load time',
    outrankedOnReviews:  'competitors having far more reviews than you',
    lowEngagement:       'very low review engagement',
    chainDominates:      'national chains dominating your local results',
  }
  return labels[key] || key
}

// ── POST — dispatch a call ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { lead, config } = await req.json()
    const { vapiApiKey, phoneNumberId, agencyName, callerName, bookingLink, calendlyToken, callGoal, noAnswerBehavior } = config

    if (!vapiApiKey)     return NextResponse.json({ error: 'Missing Vapi API key' },          { status: 400 })
    if (!phoneNumberId)  return NextResponse.json({ error: 'Missing phone number ID' },        { status: 400 })
    if (!lead?.phone)    return NextResponse.json({ error: 'Lead has no phone number' },       { status: 400 })

    const niche = lead.niche || 'business'
    const city  = (lead.addr || '').split(',')[0] || 'your area'
    const sig1  = lead.signals?.[0] ? signalLabel(lead.signals[0]) : 'low Google visibility'
    const sig2  = lead.signals?.[1] ? signalLabel(lead.signals[1]) : 'incomplete Google profile'

    // ── Fetch Calendly availability if token provided ──────────────────────────
    let availabilityScript = ''
    let slotsText = ''

    if (calendlyToken && bookingLink) {
      try {
        const eventTypeUri = await getEventTypeUri(calendlyToken, bookingLink)
        if (eventTypeUri) {
          const slots = await getCalendlyAvailability(calendlyToken, eventTypeUri)
          if (slots.length) {
            slotsText = formatSlots(slots)
            availabilityScript = `
When the prospect agrees to a meeting, read them these exact available times:
${slotsText}

Ask: "Which of those works best for you?" When they pick one, confirm it by saying:
"Perfect — I've got you down for [their chosen time]. You'll receive a calendar invite at the email address you use most. Looking forward to it!"

The booking will be automatically confirmed in our system.`
          }
        }
      } catch { /* Calendly fetch failed — continue without auto-booking */ }
    }

    if (!slotsText && bookingLink) {
      availabilityScript = `When the prospect agrees to a meeting, say: "I'll send you a link right now to grab a time that works for you — it only takes 30 seconds." Then share: ${bookingLink}`
    }

    // ── Build goal instruction ────────────────────────────────────────────────
    const goalInstruction =
      callGoal === 'book'
        ? `Your goal is to pitch your local SEO services and book a discovery call. ${availabilityScript}`
        : callGoal === 'qualify'
        ? `First ask if they are currently doing anything to improve their Google rankings. Based on their answer, explain what you found and offer a free audit, then try to book a call. ${availabilityScript}`
        : `Your goal is to offer a completely free, no-obligation SEO audit. Be very low pressure. If they show interest, ${availabilityScript || `share this link: ${bookingLink || 'your calendar link'}`}`

    const vmInstruction =
      noAnswerBehavior === 'voicemail'
        ? `If you reach voicemail, leave this message: "Hi, this is ${callerName} from ${agencyName}. I was researching ${niche}s in ${city} and found ${lead.name} on Google. I noticed ${sig1} — that's likely costing you calls every week. I'd love to share a free audit I put together. Give me a call back or visit ${bookingLink || 'our website'}. Talk soon!"`
        : `If you reach voicemail, hang up politely without leaving a message.`

    const systemPrompt = `You are ${callerName}, a friendly and professional local SEO specialist at ${agencyName}. You are making an outbound call to ${lead.name}, a ${niche} business in ${city}.

IMPORTANT CONTEXT — you found these specific issues with their Google presence:
1. ${sig1}
2. ${sig2}
${lead.signals?.slice(2).map((s: string, i: number) => `${i+3}. ${signalLabel(s)}`).join('\n') || ''}

These are REAL issues hurting their local search ranking. Reference them specifically — do not be generic.

YOUR GOAL: ${goalInstruction}

OBJECTION HANDLING:
- "Not interested" → "I completely understand. Would it be okay if I sent you a quick summary of what I found? No strings attached."
- "We already have someone" → "That's great — out of curiosity, are you currently ranking in the top 3 on Google Maps for ${niche}s in ${city}? I ask because I noticed ${sig1.toLowerCase()}."
- "Call me back later" → "Of course — when is the best time? I want to make sure I have your audit ready."
- "How much does it cost?" → "The audit is completely free. If after seeing it you want to work together, we can talk about that — but there's zero obligation."

TONE: Conversational, confident, specific. Never robotic. Keep it under 3 minutes if possible. If they say a firm no, thank them graciously and hang up.

${vmInstruction}`

    // ── Build Vapi request body ───────────────────────────────────────────────
    const body = {
      phoneNumberId,
      customer: { number: lead.phone, name: lead.name },
      assistantOverrides: {
        firstMessage: `Hi, may I please speak with the owner or manager of ${lead.name}?`,
        systemPrompt,
        model: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          temperature: 0.7,
        },
        voice: {
          provider: '11labs',
          voiceId: 'pNInz6obpgDQGcFmaJgB',
        },
        recordingEnabled: true,
        transcriptPlan: { enabled: true },
        endCallFunctionEnabled: true,
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 600,
      },
      metadata: {
        leadId:   lead.id,
        leadName: lead.name,
        niche,
        city,
        signals:  lead.signals?.join(','),
        availableSlots: slotsText || 'none',
      },
    }

    const resp = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vapiApiKey}` },
      body: JSON.stringify(body),
    })

    const data = await resp.json()
    if (!resp.ok) return NextResponse.json({ error: data.message || 'Vapi error', details: data }, { status: resp.status })

    return NextResponse.json({ callId: data.id, status: data.status, availableSlots: slotsText, ...data })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── GET — poll call status ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('callId')
  const apiKey = req.nextUrl.searchParams.get('apiKey')
  if (!callId || !apiKey) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const resp = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await resp.json()
  return NextResponse.json(data)
}
