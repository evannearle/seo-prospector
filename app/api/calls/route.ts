import { NextRequest, NextResponse } from 'next/server'

// ── Calendly ─────────────────────────────────────────────────────────────────
async function getCalendlyUser(token: string) {
  const r = await fetch('https://api.calendly.com/users/me', { headers: { Authorization: `Bearer ${token}` } })
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
    return (await r.json()).collection?.find((e: { scheduling_url: string; uri: string }) =>
      e.scheduling_url?.includes(slug || '')
    )?.uri || null
  } catch { return null }
}
async function getAvailableSlots(token: string, uri: string) {
  const start = new Date()
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  const r = await fetch(
    `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(uri)}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return ((await r.json()).collection || []).slice(0, 3) as { start_time: string }[]
}
function formatSlots(slots: { start_time: string }[]) {
  return slots.map((s, i) => {
    const dt = new Date(s.start_time)
    return `${i + 1}) ${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }).join('\n')
}

// ── Natural signal descriptions ───────────────────────────────────────────────
const SIGNAL_NATURAL: Record<string, string> = {
  fewReviews:         'only [COUNT] Google reviews',
  lowRating:          'a [RATING]-star rating on Google',
  noWebsite:          'no website linked on your Google listing',
  noPhone:            'no phone number on your Google listing',
  noHours:            'no business hours listed on Google',
  fewPhotos:          'only a handful of photos on your profile',
  noSchema:           'no structured data on your website',
  noMeta:             'missing meta descriptions on your site',
  noMobile:           'a website that is not mobile-friendly',
  noSSL:              'no HTTPS security on your website',
  noCityMention:      'your city name barely appears on your own website',
  slowSite:           'a slow-loading website',
  outrankedOnReviews: 'competitors with way more reviews than you',
  lowEngagement:      'low review count and a rating that could hurt you',
  chainDominates:     'national chains dominating your local results',
}
function naturalSigLabel(key: string, lead: { reviews?: number; rating?: number }): string {
  return (SIGNAL_NATURAL[key] || key)
    .replace('[COUNT]', String(lead?.reviews || ''))
    .replace('[RATING]', lead?.rating ? lead.rating.toFixed(1) : '')
}

// ── Build system prompt ───────────────────────────────────────────────────────
function buildSystemPrompt(p: {
  callerName: string; callerTitle: string; agencyName: string; callerEmail: string
  niche: string; city: string; bizName: string; reviews: number; rating: number
  sig1: string; sig2: string; allSigs: string[]
  callGoal: string; noAnswerBehavior: string
  valueProposition: string; offerLine: string
  bookingLink: string; slotsText: string; hasCalendly: boolean
  maxDurationSeconds: number
}): string {

  const reviewObs = p.reviews > 0
    ? p.reviews < 15 ? `only ${p.reviews} reviews on Google`
      : p.reviews < 25 ? `just ${p.reviews} Google reviews`
      : `${p.reviews} reviews`
    : 'not many reviews on Google'
  const ratingObs = p.rating > 0 && p.rating < 4.2 ? ` and a ${p.rating.toFixed(1)}-star average` : ''
  const findings = `${reviewObs}${ratingObs}, plus ${p.sig2}`

  const bookClose = p.hasCalendly && p.slotsText
    ? `Read out times naturally: "${p.slotsText}" — ask "any of those work for you?" When they pick one say "perfect, sending the invite now."`
    : p.bookingLink
    ? `Say "let me shoot you a link right now" and give them: ${p.bookingLink}`
    : `Nail down a specific day and time before you get off the call.`

  return `## Who you are

You are ${p.callerName}, a ${p.callerTitle} at ${p.agencyName}. You make outbound calls to local business owners to share something specific you found about their Google presence and see if they want help fixing it.

You are NOT a robotic sales bot. You talk like a real person. Relaxed, conversational, a little casual. You say things like "yeah", "totally", "honestly", "I hear you" — not "I understand your concern." You speak in short sentences. You pause. You listen. You go off-script when the conversation calls for it.

Your ONE job on this call: get them to agree to a 15-minute discovery call with ${p.agencyName}. Not to close a deal. Just to get the meeting.

## The business you are calling

Business: ${p.bizName}
Type: ${p.niche}
Location: ${p.city}
What you found: ${findings}
All issues: ${p.allSigs.join(', ')}

You looked this up before calling. Reference it like a person would — naturally, not like reading a report.

## Voice and persona

- Casual and warm, but not fake or over-the-top
- Confident without being pushy
- Sound curious and genuinely interested in their situation
- Use their business name naturally during the call — it signals you actually looked them up
- Speak the way people text: short, direct, real
- Never use phrases like: "I understand your concern", "As per my research", "I have identified", "That is a great question"
- DO use: "yeah", "totally", "honestly", "I hear you", "makes sense", "for sure", "look"

## Conversation flow

### Opening — pattern interrupt, never "how are you today"

"Hey, is the owner or manager around?"

[Connected — take a breath, then:]

"Hey — so I'll keep this super short. My name's ${p.callerName}, I was actually just looking up ${p.niche}s in ${p.city} on Google and I came across ${p.bizName}. I found something I think you'd want to know about — you got like 60 seconds?"

### After they say yes — lead with what you found, be specific

"So I was looking at your Google listing and — ${findings}. For a ${p.niche} in ${p.city} right now, that's basically what keeps you off the first page when someone nearby searches."

[Pause. Don't fill the silence. Let it land.]

"I've helped other ${p.niche}s in similar spots get into the top 3 on Maps — more calls coming in, nothing extra on ads. ${p.valueProposition}"

### Before asking for the meeting — get a small yes first

"Can I ask — do you even know where ${p.bizName} shows up right now when someone in ${p.city} searches for a ${p.niche}?"

[They say no — this is normal]

"Yeah that's super common. Would it be helpful if I just showed you exactly where you stand and what it'd take to move up?"

### The ask

"${p.offerLine}"

${bookClose}

### Booking close — two options, never yes/no

Never: "Do you want to book?" (they can say no)
Always: "Would earlier in the week or a bit later work better for you?" → then give two specific times.

"Perfect — you'll get the calendar invite in the next couple minutes."

## Handling automated systems and gatekeepers

### Voicemail
If you reach voicemail, leave this and hang up:
"Hey, this is ${p.callerName} from ${p.agencyName}. I was looking at ${p.bizName} on Google — noticed ${p.sig1}, which is probably costing you a few calls a week. Worth a quick chat. Give me a ring back or grab a time online. Talk soon."

### Automated phone trees / IVR
If you hit an automated system pressing options:
- Press options to reach a live person (receptionist, office, front desk)
- If asked for a name or company: "${p.callerName}, ${p.agencyName}"
- If transferred to someone new, start fresh: "Hey, I was trying to reach whoever handles the business side of things — is that you?"

### Receptionist / Gatekeeper
Be friendly, not salesy. Treat them like a person.
"Hey, I'm trying to reach whoever handles the marketing or online presence side — do you know who the right person would be?"
If they push back: "Totally fair — I just found something on their Google listing I thought they'd want to know about. Would it be okay if I called back when they're around?"

### Owner says they're busy
"Totally, I'll be quick — literally 30 seconds. Found something on your Google listing that's probably costing you calls every week. Worth knowing about even if we never work together. You good for just a quick sec?"

## Objection handling — stay casual, never defensive

### "Not interested"
"Yeah, totally fair. Can I ask — do you know roughly how many people search for a ${p.niche} in ${p.city} every month?"
[Still no] → "No worries at all. Can I just shoot you a quick email with what I found? Zero pitch, just the info."

### "We already have someone doing SEO"
"Oh nice — are they actively managing your Google Business Profile? I ask because I noticed ${p.sig1} and that's usually something that gets caught pretty quickly."
[Pause] → "Might just be worth a quick second look. Happy to show you what I found and you can decide from there."

### "How much does it cost?"
"The call is totally free — no strings. If after seeing what I found you want to talk numbers, great. But that's completely up to you."

### "Just email me"
"Yeah for sure — what's the best address?" [Get it] "Perfect. And just so I can make it specific to you — what's the main challenge right now around getting new customers?" [Qualify while you have them]

### "I'm not the decision maker"
"Oh gotcha — who would be the right person to talk to? Even just a first name helps."

### "Call me back another time"
"Sure, when exactly works? I want to make sure I've got everything pulled up when we chat." [Get a specific time — don't accept vague]

### "We're not doing anything with marketing right now"
"Yeah, makes sense — is that more of a timing thing or a budget thing?"
[Timing] → "Totally. I can actually show you what the issue is for free — costs nothing and at least you'll know what you're dealing with when the time's right."
[Budget] → "Honestly the audit is free. And a lot of what I find is fixable without spending a ton. Might be worth knowing."

## Reading the room

- If they sound rushed → "I'll be super fast, promise. One thing I found on your listing —"
- If they sound curious → slow down, go deeper on what you found
- If they seem skeptical → "Look, I get it. I'd be skeptical too. I'm not asking you to do anything — just show you what I found."
- If they go off-topic → go with it briefly, then bring it back: "Ha yeah, for sure. Anyway — back to why I called..."
- If they say something funny → laugh, be a human

## Graceful exit — never burn a bridge

After two genuine attempts and still a no:
"I totally get it. Look, I'll send you a quick summary of what I found anyway — just so you've got it when the timing makes sense. Best email?"
[Get it if possible]
"Thanks for picking up. Good luck with everything."

## Hard rules

- Max call length: ${Math.round(p.maxDurationSeconds / 60)} minutes — wrap up before you hit it
- If they ask for your email: ${p.callerEmail}
- Never make up specific pricing — redirect to the discovery call
- Never promise rankings or guaranteed results
- If they ask what company you're with: "${p.agencyName} — we do local SEO and Google Maps optimization for ${p.niche}s"
- If they're aggressive or hostile: "Totally fair, I'll let you go. Have a good one." [End call]
- If nobody picks up after 30 seconds of ringing: ${p.noAnswerBehavior === 'voicemail' ? 'leave the voicemail above' : 'hang up, no voicemail'}`
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lead, config } = body

    // Detailed validation with specific error messages for debugging
    const validationErrors: string[] = []
    if (!config?.vapiApiKey)    validationErrors.push('vapiApiKey is missing or empty')
    if (!config?.phoneNumberId) validationErrors.push('phoneNumberId is missing or empty (this should map from vapiPhoneNumberId in settings)')
    if (!lead?.phone)           validationErrors.push(`lead.phone is missing (lead: ${lead?.name || 'unknown'})`)

    if (validationErrors.length > 0) {
      console.error('Calls API validation failed:', validationErrors)
      console.error('Config received:', JSON.stringify({
        hasVapiKey: !!config?.vapiApiKey,
        vapiKeyPrefix: config?.vapiApiKey?.slice(0, 8) + '...',
        hasPhoneId: !!config?.phoneNumberId,
        phoneIdValue: config?.phoneNumberId,
        leadPhone: lead?.phone,
        leadName: lead?.name,
      }))
      return NextResponse.json({
        error: validationErrors[0],
        allErrors: validationErrors,
        debug: {
          hasVapiApiKey: !!config?.vapiApiKey,
          hasPhoneNumberId: !!config?.phoneNumberId,
          phoneNumberIdValue: config?.phoneNumberId || null,
          hasLeadPhone: !!lead?.phone,
          configKeys: config ? Object.keys(config) : [],
        }
      }, { status: 400 })
    }

    const {
      vapiApiKey, phoneNumberId,
      agencyName = 'our agency', callerName = 'the team',
      callerTitle = 'Local SEO Specialist', callerEmail = '',
      bookingLink = '', calendlyToken = '',
      callGoal = 'book', noAnswerBehavior = 'voicemail',
      valueProposition = "We have helped local businesses just like yours go from invisible on Google to showing up in the top 3 on Maps, bringing in more calls without spending a dollar on ads.",
      offerLine = "I would love to set up a quick 15-minute call so we can walk through exactly what I found and what it would take to fix it.",
      maxCallDurationSeconds = 600,
      callModel = 'gpt-4o-mini',
      voiceProvider = 'vapi',
      voiceId = 'elliot',
      voiceSpeed = 1.1,
      voiceStability = 0.45,
      voiceSimilarityBoost = 0.75,
      voiceOptimizeLatency = 3,
      aiTemperature = 0.7,
    } = config

    const niche   = lead.niche || 'business'
    // Extract city correctly from Google Places formatted_address
    // Format: "123 Main St, Farmingdale, NY 11735, USA" -> city = "Farmingdale"
    function extractCity(addr: string): string {
      if (!addr) return 'your area'
      const parts = addr.split(',').map((p: string) => p.trim())
      // Find the state segment (2-letter code, possibly with zip)
      const stateIdx = parts.findIndex((p: string) => /^[A-Z]{2}(\s+\d{5})?$/.test(p))
      if (stateIdx > 0) return parts[stateIdx - 1]
      // Fallback: second-to-last part (before country)
      if (parts.length >= 3) return parts[parts.length - 3]
      return parts[0] || 'your area'
    }
    const city = extractCity(lead.addr || '')
    const bizName = lead.name || 'your business'
    const reviews = lead.reviews || 0
    const rating  = lead.rating  || 0

    // Robust E.164 normalization — handles all Google Maps phone formats
    function toE164(raw: string): string {
      if (!raw) return ''
      // Strip everything except digits and leading +
      const stripped = raw.trim()
      // Already E.164
      if (/^\+1\d{10}$/.test(stripped)) return stripped
      // Strip all non-digits
      const digits = stripped.replace(/\D/g, '')
      if (digits.length === 10) return '+1' + digits          // (516) 555-1234
      if (digits.length === 11 && digits[0] === '1') return '+' + digits  // 1-516-555-1234
      if (digits.length > 10) return '+' + digits             // international, best effort
      return '+1' + digits  // fallback
    }
    const rawPhone = lead.phone || ''
    const e164Phone = toE164(rawPhone)
    console.log('Phone normalization:', JSON.stringify({ rawPhone, e164Phone, leadName: lead.name }))
    const sigs    = (lead.signals || []).map((k: string) => naturalSigLabel(k, { reviews, rating }))
    const sig1    = sigs[0] || 'low Google visibility'
    const sig2    = sigs[1] || 'an incomplete Google profile'

    // Fetch Calendly slots
    let slotsText = ''
    if (calendlyToken && bookingLink) {
      try {
        const etUri = await getEventTypeUri(calendlyToken, bookingLink)
        if (etUri) {
          const slots = await getAvailableSlots(calendlyToken, etUri)
          if (slots.length) slotsText = formatSlots(slots)
        }
      } catch { /* fall back to link */ }
    }

    const systemPrompt = buildSystemPrompt({
      callerName, callerTitle, agencyName, callerEmail,
      niche, city, bizName, reviews, rating,
      sig1, sig2, allSigs: sigs,
      callGoal, noAnswerBehavior, valueProposition, offerLine,
      bookingLink, slotsText, hasCalendly: !!(calendlyToken && bookingLink && slotsText),
      maxDurationSeconds: maxCallDurationSeconds,
    })

    console.log('Dispatching Vapi call:', JSON.stringify({
      phoneNumberId: phoneNumberId?.slice(0, 8) + '...',
      rawPhone: lead.phone,
      e164Phone,
      bizName,
      vapiKeyPrefix: vapiApiKey.slice(0, 8) + '...',
    }))

    // Vapi transient assistant — inline assistant object per official docs
    // Endpoint: /call (not /call/phone)
    // Model systemPrompt goes directly in assistant.model, not messages array
    const vapiBody = {
      phoneNumberId,
      customer: {
        number: e164Phone,
        name: bizName,
        numberE164CheckEnabled: false,
      },
      assistant: {
        firstMessage: `Hi, is the owner or manager around?`,
        model: {
          provider: 'openai',           // openai-compatible provider format
          model: callModel,
          systemPrompt,
          temperature: aiTemperature,
        },
        voice: voiceProvider === '11labs' ? {
          provider: '11labs',
          voiceId,
          speed: voiceSpeed,
          stability: voiceStability,
          similarityBoost: voiceSimilarityBoost,
          optimizeStreamingLatency: voiceOptimizeLatency,
        } : {
          // Vapi native voices (elliot, savannah, etc.) or other providers
          // don't support 11labs-specific params
          provider: voiceProvider,
          voiceId,
        },
        recordingEnabled: true,
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: maxCallDurationSeconds,
        backgroundDenoisingEnabled: true,
      },
      metadata: { leadId: lead.id, leadName: bizName, niche, city, signals: lead.signals?.join(',') },
    }

    const resp = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vapiApiKey}` },
      body: JSON.stringify(vapiBody),
    })

    const data = await resp.json()

    if (!resp.ok) {
      console.error('Vapi error:', resp.status, 'sent phone:', e164Phone, 'raw:', rawPhone, 'error:', JSON.stringify(data))
      return NextResponse.json({
        error: data.message || `Vapi error ${resp.status}`,
        vapiError: data,
        hint: resp.status === 400
          ? 'Check that your phoneNumberId is the ID from Vapi dashboard (not the raw phone number), and that your API key is correct.'
          : resp.status === 401
          ? 'Vapi API key is invalid or expired.'
          : undefined
      }, { status: resp.status })
    }

    console.log('Vapi call dispatched successfully:', data.id, 'status:', data.status)
    return NextResponse.json({ callId: data.id, status: data.status, ...data })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Calls route exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── GET — poll status ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('callId')
  const apiKey = req.nextUrl.searchParams.get('apiKey')
  if (!callId || !apiKey) return NextResponse.json({ error: 'Missing callId or apiKey params' }, { status: 400 })

  const resp = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await resp.json()

  if (!resp.ok) {
    console.error('Vapi poll error:', resp.status, JSON.stringify(data))
  }

  return NextResponse.json(data)
}
