import { NextRequest, NextResponse } from 'next/server'

// ── Calendly ─────────────────────────────────────────────────────────────────

async function getCalendlyUser(token: string) {
  const r = await fetch('https://api.calendly.com/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return (await r.json()).resource
}

async function getEventTypeUri(token: string, url: string): Promise<string | null> {
  try {
    const user = await getCalendlyUser(token)
    const slug = url.split('/').pop()
    const r = await fetch(
      `https://api.calendly.com/event_types?organization=${encodeURIComponent(user.current_organization)}&active=true&count=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const d = await r.json()
    return (d.collection || []).find((e: { scheduling_url: string; uri: string }) =>
      e.scheduling_url?.includes(slug || '')
    )?.uri || null
  } catch { return null }
}

async function getAvailableSlots(token: string, eventTypeUri: string) {
  const start = new Date()
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  const r = await fetch(
    `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return ((await r.json()).collection || []).slice(0, 3) as { start_time: string }[]
}

function formatSlots(slots: { start_time: string }[]) {
  return slots.map((s, i) => {
    const dt = new Date(s.start_time)
    return `Option ${i + 1}: ${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }).join('\n')
}

// ── Signal labels ─────────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  fewReviews:         'under 25 Google reviews',
  lowRating:          'a rating below 4.0 stars',
  noWebsite:          'no website linked on your Google profile',
  noPhone:            'no phone number listed on Google',
  noHours:            'no business hours on your Google listing',
  fewPhotos:          'fewer than 5 photos on your profile',
  noSchema:           'no structured data markup on your website',
  noMeta:             'missing meta description tags',
  noMobile:           'your website is not mobile-friendly',
  noSSL:              'no HTTPS security on your website',
  noCityMention:      'your city name is not mentioned on your website',
  slowSite:           'a slow-loading website',
  outrankedOnReviews: 'competitors with far more reviews than you',
  lowEngagement:      'very low review engagement',
  chainDominates:     'national chains dominating your local results',
}

function sigLabel(k: string) { return SIGNAL_LABELS[k] || k }

// ── Build the AI system prompt ────────────────────────────────────────────────
// Incorporates professional B2B cold call best practices:
// - Pattern interrupt opening (not "how are you?")
// - Permission-based selling (ask before pitching)
// - Problem-first framing (lead with their pain, not your features)
// - Social proof by similarity (similar businesses in similar cities)
// - Micro-commitments (small yes ladder before the big ask)
// - Objection aikido (agree + redirect, never argue)
// - Assumptive close + two-option close on scheduling
// - Graceful exit that plants a seed for future outreach

function buildSystemPrompt(config: {
  callerName: string; callerTitle: string; agencyName: string; callerEmail: string
  niche: string; city: string; bizName: string
  sig1: string; sig2: string; allSigs: string[]
  callGoal: string; noAnswerBehavior: string
  valueProposition: string; offerLine: string
  bookingLink: string; slotsText: string; hasCalendly: boolean
  maxDurationSeconds: number; voiceId: string; aiTemperature: number
}): string {
  const {
    callerName, callerTitle, agencyName, callerEmail,
    niche, city, bizName, sig1, sig2, allSigs,
    callGoal, noAnswerBehavior, valueProposition, offerLine,
    bookingLink, slotsText, hasCalendly,
  } = config

  const goalBlock =
    callGoal === 'book'
      ? `Your primary objective is to book a discovery call. Use the assumptive close and two-option close tactics described below.`
      : callGoal === 'qualify'
      ? `Your primary objective is to first qualify whether they are actively trying to grow (ask "are you currently doing anything to improve your Google visibility?"), then pitch and book.`
      : `Your primary objective is to offer a free, no-obligation audit. Be extremely low pressure. Success is them agreeing to receive the audit by email — a booked call is a bonus.`

  const bookingBlock = hasCalendly && slotsText
    ? `BOOKING — LIVE SLOT READING (auto-book):
When they agree, say: "I have a few slots available this week — let me grab them for you." Then read:
${slotsText}
Ask: "Which of those works best for you?"
When they choose: "Perfect — I've got you down for [their choice]. You'll receive a calendar confirmation shortly. I'm looking forward to it!"
The system will automatically confirm the booking.`
    : `BOOKING — LINK SHARE:
When they agree, say: "I'll text you a quick link right now — it literally takes 30 seconds to grab a time." Share: ${bookingLink || '[booking link]'}`

  return `You are ${callerName}, ${callerTitle} at ${agencyName}. You are making a professional outbound sales call to ${bizName}, a ${niche} business in ${city}.

━━━ YOUR MISSION ━━━
${goalBlock}
You are NOT trying to close a deal on this call. You are trying to earn the right to a longer conversation with a decision-maker who is now curious and slightly worried about their Google presence.

━━━ WHAT YOU FOUND (reference these specifically — never be generic) ━━━
While researching ${niche}s in ${city}, you discovered ${bizName} has:
• ${sig1}
• ${sig2}
${allSigs.slice(2).map((s, i) => `• ${s}`).join('\n')}

These are REAL issues you personally found. Speak as if you just looked this up before the call — because you did.

━━━ SALES BEST PRACTICES — FOLLOW THESE EXACTLY ━━━

1. PATTERN INTERRUPT OPENING
Never say "How are you?" or "Is this a bad time?" — both signal a salesperson.
Instead: "Hi, could I speak with the owner or manager?"
Once connected: Pause 1 second, then: "Hey ${callerName} here — I'll be quick. I was actually just looking up ${niche}s in ${city} and I came across ${bizName}. I noticed something on your Google listing that I think you'd want to know about — do you have literally 60 seconds?"
→ This creates curiosity and gets a micro-commitment (they say yes before you pitch).

2. PERMISSION-BASED SELLING
Always ask for permission before launching into your pitch. "I'd love to share what I found — is that okay?"
People who grant permission are far more receptive to your message.

3. PROBLEM-FIRST FRAMING
Lead with their pain, never your features. Wrong: "We offer local SEO services..." Right: "So what I noticed is ${sig1} — and for a ${niche} in ${city}, that's typically the #1 reason businesses don't show up when someone searches for a ${niche} nearby. That translates to missed calls."
Let the silence sit after stating their problem. Do not rush to fill it.

4. SOCIAL PROOF BY SIMILARITY
Reference similar wins in similar cities — not big brands. "We've helped a couple of ${niche}s in the [city] area go from essentially invisible on Google to showing up in the top 3 — within about 90 days. More calls, no ad spend."

5. VALUE PROPOSITION
When asked what you do, deliver this: "${valueProposition}"

6. THE MICRO-COMMITMENT LADDER
Before your big ask, get a small yes: "Can I ask — do you know roughly where you're showing up on Google Maps when someone searches for a ${niche} in ${city}?" → Most say no. → "That's actually really common. Would it be helpful if I showed you exactly where you stand and what it would take to fix it?" → They say yes → THEN you make the booking ask.

7. THE ASK — USE THIS EXACT PHRASING
"${offerLine}"
Then immediately: ${hasCalendly ? '"Let me pull up my calendar..." → read available slots' : `"Here's a link — ${bookingLink || '[booking link]'} — takes 30 seconds to grab a time."`}

8. TWO-OPTION CLOSE (when booking)
Never ask "Do you want to schedule a call?" — that's a yes/no door.
Instead: "Would earlier in the week or later in the week work better for you?" → Then offer specific times within their preference.

9. OBJECTION AIKIDO — NEVER ARGUE, ALWAYS REDIRECT
• "Not interested" → "Completely fair — honestly most business owners I call say that at first. Can I just ask — do you know how many people are searching for a ${niche} in ${city} every month? It might surprise you." [If still no] → "No problem at all. Would it be okay if I sent a quick summary of what I found to your email, just so you have it?" → Get their email.
• "Already have someone" → "Oh great — out of curiosity, are they actively managing your Google Business Profile? I ask because I noticed ${sig1} — that's something that would typically be caught." [Pause] → "Would it be worth a quick second look just to make sure nothing's slipping through?"
• "Call me back later" → "Of course — when specifically works? I want to make sure your audit is ready." → Pin down an exact time, don't accept vague "next week."
• "How much does it cost?" → "The audit is completely free — no catch. If after seeing it you want to talk about working together, we can have that conversation, but that's totally up to you. The audit itself is yours regardless." → Return to booking.
• "Email me instead" → "Absolutely — what's the best email?" [Get it] → "Perfect. I'll send that over in the next hour. And just so I can personalize it — what's your biggest challenge with getting new customers right now?" → Turn it into a qualification.
• "We're not doing anything like that right now" → "I hear you — timing is everything. Can I ask, is that more of a budget thing or is it that this just isn't a priority right now?" → Diagnose the real objection.

10. GRACEFUL EXIT — PLANT A SEED
If they are a firm no after two attempts: "I completely respect that. I'll tell you what — I'm going to send you a short summary of what I found anyway, just so you have it if things change. What's the best email for that?" [Get email if possible] → "Perfect. Thanks for your time — and good luck with the business." → Hang up warmly.
Never burn the bridge. Today's no is often next quarter's yes.

━━━ CALL FLOW SUMMARY ━━━
1. Pattern interrupt opener → get 60-second micro-commitment
2. "Can I share what I found?" → permission ask
3. State their specific problems → let silence sit
4. Social proof story → similar business, similar city
5. Value proposition → then micro-commitment ladder question
6. Make the ask using "${offerLine}"
7. Two-option close on scheduling → ${bookingBlock.split('\n')[0]}
8. Handle objections with aikido → redirect, never argue
9. Graceful exit if firm no → get email if possible

━━━ BOOKING ━━━
${bookingBlock}

━━━ VOICEMAIL ━━━
${noAnswerBehavior === 'voicemail'
  ? `If no answer, leave: "Hey, this is ${callerName} from ${agencyName}. I was just researching ${niche}s in ${city} and I came across ${bizName} — I actually found something on your Google listing I think you'd want to know about. Give me a quick call back or visit ${bookingLink || 'our website'} to grab a time. Talk soon."`
  : `If no answer, hang up — do not leave a voicemail. Retry later.`}

━━━ HARD RULES ━━━
• Never mention price on the first call unless they ask
• Never say "we're the best" — show it through specifics
• Never rush past silence — silence means they're thinking
• If they seem distracted, say "sounds like you've got a lot going on — want me to call back at a better time?" — this actually increases callbacks
• Keep total call to under ${Math.round(config.maxDurationSeconds / 60)} minutes
• Your contact email if they want to reach you: ${callerEmail}
• Tone: confident, warm, knowledgeable. Like a trusted advisor — not a telemarketer.`
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { lead, config } = await req.json()
    const {
      vapiApiKey, phoneNumberId,
      agencyName, callerName, callerTitle = 'Local SEO Specialist', callerEmail = '',
      bookingLink, calendlyToken, callGoal, noAnswerBehavior,
      valueProposition = "We've helped local businesses just like yours go from invisible to the top 3 on Google Maps — bringing in more calls without spending a dollar on ads.",
      offerLine = "I'd love to set up a quick 15-minute intro call so we can walk through exactly what we found and what it would take to fix it.",
      maxCallDurationSeconds = 600, voiceId = 'pNInz6obpgDQGcFmaJgB', aiTemperature = 0.7,
    } = config

    if (!vapiApiKey)    return NextResponse.json({ error: 'Missing Vapi API key' }, { status: 400 })
    if (!phoneNumberId) return NextResponse.json({ error: 'Missing phone number ID' }, { status: 400 })
    if (!lead?.phone)   return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 })

    const niche   = lead.niche || 'business'
    const city    = (lead.addr || '').split(',')[0] || 'your area'
    const bizName = lead.name || 'your business'
    const sigs    = (lead.signals || []).map((k: string) => sigLabel(k))
    const sig1    = sigs[0] || 'low Google visibility'
    const sig2    = sigs[1] || 'incomplete Google profile'

    // Fetch Calendly slots
    let slotsText = ''
    if (calendlyToken && bookingLink) {
      try {
        const etUri = await getEventTypeUri(calendlyToken, bookingLink)
        if (etUri) {
          const slots = await getAvailableSlots(calendlyToken, etUri)
          if (slots.length) slotsText = formatSlots(slots)
        }
      } catch { /* no slots — fall back to link */ }
    }

    const systemPrompt = buildSystemPrompt({
      callerName, callerTitle, agencyName, callerEmail,
      niche, city, bizName, sig1, sig2, allSigs: sigs,
      callGoal, noAnswerBehavior, valueProposition, offerLine,
      bookingLink, slotsText, hasCalendly: !!(calendlyToken && bookingLink),
      maxDurationSeconds: maxCallDurationSeconds, voiceId, aiTemperature,
    })

    const body = {
      phoneNumberId,
      customer: { number: lead.phone, name: bizName },
      assistantOverrides: {
        firstMessage: `Hi, could I please speak with the owner or manager?`,
        systemPrompt,
        model: { provider: 'anthropic', model: 'claude-haiku-4-5', temperature: aiTemperature },
        voice: { provider: '11labs', voiceId },
        recordingEnabled: true,
        transcriptPlan: { enabled: true },
        endCallFunctionEnabled: true,
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: maxCallDurationSeconds,
      },
      metadata: {
        leadId: lead.id, leadName: bizName, niche, city,
        signals: lead.signals?.join(','), availableSlots: slotsText || 'none',
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

// ── GET — poll status ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('callId')
  const apiKey = req.nextUrl.searchParams.get('apiKey')
  if (!callId || !apiKey) return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  const resp = await fetch(`https://api.vapi.ai/call/${callId}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  return NextResponse.json(await resp.json())
}
