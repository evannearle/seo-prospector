import { NextRequest, NextResponse } from 'next/server'

// ── Signal labels ─────────────────────────────────────────────────────────────
const SIG_LABELS: Record<string, string> = {
  fewReviews:          'under 25 Google reviews',
  lowRating:           'a rating below 4.0 stars',
  noWebsite:           'no website linked on your Google profile',
  noPhone:             'no phone number listed on Google',
  noHours:             'no business hours on your Google listing',
  fewPhotos:           'fewer than 5 photos on your Google profile',
  noSchema:            'no structured data markup on your website',
  noMeta:              'missing meta description on your website',
  noMobile:            'your website is not mobile-friendly',
  noSSL:               'your website is not secured with HTTPS',
  noCityMention:       'your city name is not mentioned on your website',
  slowSite:            'your website loads slowly',
  outrankedOnReviews:  'a competitor has 3x more Google reviews than you',
  lowEngagement:       'very low review engagement on your profile',
  chainDominates:      'a national chain is dominating your local search results',
}

// ── Calendly helpers ──────────────────────────────────────────────────────────
async function getCalendlyUser(token: string) {
  const r = await fetch('https://api.calendly.com/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return (await r.json()).resource
}

async function getEventTypeUri(token: string, calendlyUrl: string): Promise<string | null> {
  try {
    const user = await getCalendlyUser(token)
    const slug = calendlyUrl.split('/').pop()
    const r = await fetch(`https://api.calendly.com/event_types?organization=${encodeURIComponent(user.current_organization)}&active=true&count=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await r.json()
    const et = (d.collection || []).find((e: { scheduling_url: string; uri: string }) =>
      e.scheduling_url?.includes(slug || '')
    )
    return et?.uri || null
  } catch { return null }
}

async function getAvailableSlots(token: string, eventTypeUri: string) {
  const start = new Date()
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  const url = `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const d = await r.json()
  return ((d.collection || []) as { start_time: string }[]).slice(0, 3)
}

function formatSlots(slots: { start_time: string }[]): string {
  return slots.map((s, i) => {
    const dt = new Date(s.start_time)
    return `Option ${i + 1}: ${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }).join('\n')
}

// ── POST — dispatch a Vapi call ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { lead, config } = await req.json()
    const {
      vapiApiKey, phoneNumberId,
      agencyName, callerName, callerTitle, callerEmail,
      bookingLink, calendlyToken,
      callGoal, noAnswerBehavior,
      pitchFocus, valueProposition, offerLine,
      maxCallDurationSeconds, voiceId, aiTemperature,
    } = config

    if (!vapiApiKey)    return NextResponse.json({ error: 'Missing Vapi API key' },         { status: 400 })
    if (!phoneNumberId) return NextResponse.json({ error: 'Missing Vapi Phone Number ID' }, { status: 400 })
    if (!lead?.phone)   return NextResponse.json({ error: 'Lead has no phone number' },     { status: 400 })

    const niche   = lead.niche || 'business'
    const city    = (lead.addr || '').split(',')[0] || 'your area'
    const bizName = lead.name || 'your business'
    const signals = (lead.signals || []) as string[]

    // Build a specific, prioritised list of problems found
    const problems = signals
      .map((s: string) => SIG_LABELS[s])
      .filter(Boolean)

    const topProblem  = problems[0] || 'low Google visibility'
    const allProblems = problems.length > 1
      ? problems.slice(0, -1).join(', ') + ', and ' + problems[problems.length - 1]
      : topProblem

    const reviewCount = lead.reviews > 0 ? lead.reviews : null
    const rating      = lead.rating  > 0 ? lead.rating  : null

    // ── Calendly slot fetching ────────────────────────────────────────────────
    let slotsText = ''
    let bookingScript = ''

    if (calendlyToken && bookingLink) {
      try {
        const eventTypeUri = await getEventTypeUri(calendlyToken, bookingLink)
        if (eventTypeUri) {
          const slots = await getAvailableSlots(calendlyToken, eventTypeUri)
          if (slots.length) {
            slotsText = formatSlots(slots)
            bookingScript = `
When they agree to a call, say:
"I have a few slots open this week — let me grab them for you."
Then read these options:
${slotsText}

Ask: "Which of those works for you?"

When they pick one, confirm: "Perfect — I've booked you in for [their time]. You'll get a calendar invite shortly. Our SEO specialist will walk you through exactly what we found and how we'd fix it. Talk soon!"`
          }
        }
      } catch { /* continue without Calendly */ }
    }

    if (!slotsText && bookingLink) {
      bookingScript = `When they agree, say: "Let me send you a link right now to grab a time that works — it takes 30 seconds." Then share: ${bookingLink}`
    }

    if (!bookingScript) {
      bookingScript = `When they agree, take their name and best callback time and let them know a specialist will reach out to confirm.`
    }

    // ── Value prop + offer ────────────────────────────────────────────────────
    const vp = valueProposition ||
      `We've helped ${niche}s just like yours go from invisible on Google to dominating the local map pack — bringing in more calls without spending a dollar on ads.`

    const offer = offerLine ||
      `I'd love to set up a quick 15-minute intro call with one of our SEO specialists. They'll walk you through exactly what we found and what it would take to fix it — no commitment, just clarity.`

    // ── Main pitch block based on goal ────────────────────────────────────────
    let pitchBlock = ''
    if (callGoal === 'qualify') {
      pitchBlock = `First, ask: "Quick question — are you currently doing anything to improve your Google rankings locally?"

Listen to their answer, then bridge: "That's interesting — I ask because I was specifically looking at ${bizName} on Google and noticed ${allProblems}. For a ${niche} in ${city}, those issues are typically costing you 5 to 15 inbound calls a month."`
    } else if (callGoal === 'soft') {
      pitchBlock = `Keep it low-pressure: "I put together a quick audit on ${bizName} and spotted a few things — ${allProblems}. I'd love to just email you what I found, zero strings attached. Would that be okay?"`
    } else {
      pitchBlock = `Deliver the pitch: "The reason I'm calling is I was specifically looking at ${bizName} on Google, and I noticed ${allProblems}.${reviewCount ? ` You currently have ${reviewCount} reviews` : ''}${rating ? ` and a ${rating} star rating` : ''} — most of the ${niche}s ranking in the top 3 in ${city} have significantly more. Those gaps are why you're not showing up when people search.

${vp}"`
    }

    // ── Full system prompt ────────────────────────────────────────────────────
    const systemPrompt = `You are ${callerName}, a ${callerTitle || 'local SEO specialist'} at ${agencyName}. You are making a professional outbound call to ${bizName}, a ${niche} in ${city}.

CRITICAL CONTEXT — you researched this business BEFORE calling. You found these SPECIFIC problems on their Google profile:
${problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}

These are real, specific findings — not generic claims. Reference them by name. Be specific.

---

OPENING:
"Hi, may I please speak with the owner or manager?"

[If asked who you are before being transferred]: "This is ${callerName} from ${agencyName} — it's a quick call about ${bizName}'s Google presence."

---

PITCH:
${pitchBlock}

---

THE ASK:
"${offer}"

${bookingScript}

---

OBJECTION HANDLING:
"Not interested" → "Completely understand. Would it be okay if I at least emailed you the audit? You can look it over whenever — zero obligation.${callerEmail ? ` My email is ${callerEmail}.` : ''}"

"We already have someone doing SEO" → "That's great — out of curiosity, are you showing up in the top 3 on Google Maps when someone searches for ${niche}s in ${city}? I noticed ${topProblem}, which is unusual if someone's actively working on it."

"How much does it cost?" → "The intro call is completely free — it's just 15 minutes with one of our specialists who'll show you exactly what we found and what fixing it would look like. No pitch, no pressure."

"Call me back later / not a good time" → "Of course — when's a better time? I want to make sure I have your full audit ready when we talk."

"We don't have the budget" → "Totally fair. The call itself is free — our specialist can actually show you which fixes you can do yourself for nothing. Would that still be worth 15 minutes?"

---

VOICEMAIL SCRIPT (if no answer):
"Hi, this is ${callerName} from ${agencyName}. I was doing some research on ${niche}s in ${city} and specifically looked at ${bizName} on Google. I noticed ${topProblem}${problems.length > 1 ? ` and a couple of other things` : ''} that are likely costing you calls. I'd love to share what I found — it only takes 15 minutes. Give me a call back${callerEmail ? ` or shoot me an email at ${callerEmail}` : ''}${bookingLink ? `, or grab a time at ${bookingLink}` : ''}. Talk soon!"

---

RULES:
- Always be warm, confident, and specific — never robotic or scripted-sounding
- The goal is ONE thing: book an intro call with a specialist, not to close a deal
- Never make up data. Only reference what you actually found (listed above)
- If they give a firm no twice, thank them graciously and end the call
- Max call length: ${maxCallDurationSeconds || 600} seconds`

    // ── Vapi request ──────────────────────────────────────────────────────────
    const body = {
      phoneNumberId,
      customer: { number: lead.phone, name: bizName },
      assistantOverrides: {
        firstMessage: `Hi, may I please speak with the owner or manager of ${bizName}?`,
        systemPrompt,
        model: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          temperature: aiTemperature ?? 0.7,
        },
        voice: {
          provider: '11labs',
          voiceId: voiceId || 'pNInz6obpgDQGcFmaJgB',
        },
        recordingEnabled: true,
        transcriptPlan: { enabled: true },
        endCallFunctionEnabled: true,
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: maxCallDurationSeconds || 600,
      },
      metadata: {
        leadId:   lead.id,
        leadName: bizName,
        niche, city,
        signals:  signals.join(','),
        problems: problems.join(' | '),
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

    return NextResponse.json({ callId: data.id, status: data.status, availableSlots: slotsText, problemsFound: problems })

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
  return NextResponse.json(await resp.json())
}
