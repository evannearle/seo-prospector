export interface Lead {
  id: string
  name: string
  addr: string
  phone: string | null
  website: string | null
  rating: number
  reviews: number
  photos: number
  hasHours: boolean
  mapsUrl: string
  placeId: string
  signals: string[]
  score: number
  niche: string
  status: LeadStatus
  savedAt: string
  webData?: WebAnalysis | null
  callHistory?: CallRecord[]
}

export type LeadStatus = 'new' | 'called' | 'noans' | 'booked' | 'skip'

export interface WebAnalysis {
  fetchOk: boolean
  noSSL: boolean
  noSchema: boolean | null
  noMeta: boolean | null
  noMobile: boolean | null
  noCityMention: boolean | null
  slowSite: boolean | null
}

export interface CallRecord {
  id: string
  leadId: string
  leadName: string
  phone: string
  status: CallStatus
  outcome: CallOutcome
  startedAt: string
  endedAt?: string
  duration?: number
  recordingUrl?: string
  transcript?: TranscriptLine[]
  vapiCallId?: string
  notes?: string
}

export type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'voicemail'
export type CallOutcome = 'pending' | 'answered' | 'voicemail' | 'no-answer' | 'booked' | 'not-interested' | 'callback'

export interface TranscriptLine {
  role: 'ai' | 'human'
  text: string
  timestamp?: number
}

export interface Signal {
  label: string
  color: 'r' | 'a' | 'b'
  pts: number
}

export const SIGNALS: Record<string, Signal> = {
  fewReviews:          { label: 'Under 25 reviews',        color: 'r', pts: 3 },
  lowRating:           { label: 'Rating < 4.0',             color: 'r', pts: 2 },
  noWebsite:           { label: 'No website',               color: 'r', pts: 3 },
  noPhone:             { label: 'No phone number',           color: 'r', pts: 2 },
  noHours:             { label: 'No hours listed',           color: 'r', pts: 2 },
  fewPhotos:           { label: 'Few photos',               color: 'r', pts: 1 },
  noSchema:            { label: 'No schema markup',          color: 'a', pts: 2 },
  noMeta:              { label: 'No meta description',       color: 'a', pts: 1 },
  noMobile:            { label: 'Not mobile-friendly',       color: 'a', pts: 2 },
  noSSL:               { label: 'No HTTPS',                  color: 'a', pts: 2 },
  noCityMention:       { label: 'City not on site',          color: 'a', pts: 1 },
  slowSite:            { label: 'Slow load',                 color: 'a', pts: 1 },
  outrankedOnReviews:  { label: 'Outranked 3x reviews',      color: 'b', pts: 2 },
  lowEngagement:       { label: 'Low engagement',            color: 'b', pts: 1 },
  chainDominates:      { label: 'National chain top 3',      color: 'b', pts: 3 },
}

export interface AnalyticsData {
  totalLeads: number
  totalCalls: number
  answerRate: number
  bookingRate: number
  voicemailRate: number
  avgScore: number
  callsByDay: { date: string; calls: number; answered: number; booked: number }[]
  signalBreakdown: { signal: string; count: number; pct: number }[]
  scoreDistribution: { range: string; count: number }[]
  statusBreakdown: { status: string; count: number }[]
  nicheBreakdown: { niche: string; count: number; avgScore: number }[]
  topProspects: Lead[]
  recentCalls: CallRecord[]
}
