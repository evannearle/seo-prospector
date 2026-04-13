import type { Lead, CallRecord, AnalyticsData, LeadStatus } from './types'
import { SIGNALS } from './types'

export function computeAnalytics(leads: Lead[], calls: CallRecord[]): AnalyticsData {
  const totalLeads = leads.length
  const totalCalls = calls.length
  const answered = calls.filter((c) => ['answered', 'booked', 'not-interested', 'callback'].includes(c.outcome))
  const booked = calls.filter((c) => c.outcome === 'booked' || c.status === 'voicemail' && false)
  const bookedReal = calls.filter((c) => c.outcome === 'booked')
  const voicemail = calls.filter((c) => c.outcome === 'voicemail')

  const answerRate = totalCalls > 0 ? Math.round((answered.length / totalCalls) * 100) : 0
  const bookingRate = totalCalls > 0 ? Math.round((bookedReal.length / totalCalls) * 100) : 0
  const voicemailRate = totalCalls > 0 ? Math.round((voicemail.length / totalCalls) * 100) : 0
  const avgScore = totalLeads > 0 ? Math.round((leads.reduce((s, l) => s + l.score, 0) / totalLeads) * 10) / 10 : 0

  // Calls by day (last 30 days)
  const dayMap: Record<string, { calls: number; answered: number; booked: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dayMap[key] = { calls: 0, answered: 0, booked: 0 }
  }
  calls.forEach((c) => {
    const key = c.startedAt.slice(0, 10)
    if (dayMap[key]) {
      dayMap[key].calls++
      if (['answered', 'booked', 'not-interested', 'callback'].includes(c.outcome)) dayMap[key].answered++
      if (c.outcome === 'booked') dayMap[key].booked++
    }
  })
  const callsByDay = Object.entries(dayMap).map(([date, v]) => ({ date, ...v }))

  // Signal breakdown
  const sigCount: Record<string, number> = {}
  leads.forEach((l) => (l.signals || []).forEach((s) => { sigCount[s] = (sigCount[s] || 0) + 1 }))
  const signalBreakdown = Object.entries(sigCount)
    .map(([signal, count]) => ({ signal: SIGNALS[signal]?.label || signal, count, pct: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Score distribution
  const scoreBuckets = [
    { range: '8–10', min: 8, max: 10 },
    { range: '6–7', min: 6, max: 7 },
    { range: '4–5', min: 4, max: 5 },
    { range: '1–3', min: 1, max: 3 },
  ]
  const scoreDistribution = scoreBuckets.map(({ range, min, max }) => ({
    range,
    count: leads.filter((l) => l.score >= min && l.score <= max).length,
  }))

  // Status breakdown
  const statusLabels: Record<LeadStatus, string> = { new: 'New', called: 'Called', noans: 'No answer', booked: 'Booked', skip: 'Skipped' }
  const stCount: Record<string, number> = {}
  leads.forEach((l) => { const s = l.status || 'new'; stCount[s] = (stCount[s] || 0) + 1 })
  const statusBreakdown = Object.entries(stCount).map(([status, count]) => ({ status: statusLabels[status as LeadStatus] || status, count }))

  // Niche breakdown
  const nicheMap: Record<string, { count: number; scoreSum: number }> = {}
  leads.forEach((l) => {
    const n = l.niche || 'unknown'
    if (!nicheMap[n]) nicheMap[n] = { count: 0, scoreSum: 0 }
    nicheMap[n].count++; nicheMap[n].scoreSum += l.score
  })
  const nicheBreakdown = Object.entries(nicheMap).map(([niche, { count, scoreSum }]) => ({
    niche, count, avgScore: Math.round((scoreSum / count) * 10) / 10,
  })).sort((a, b) => b.count - a.count)

  const topProspects = [...leads].sort((a, b) => b.score - a.score).slice(0, 5)
  const recentCalls = [...calls].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 10)

  return { totalLeads, totalCalls, answerRate, bookingRate, voicemailRate, avgScore, callsByDay, signalBreakdown, scoreDistribution, statusBreakdown, nicheBreakdown, topProspects, recentCalls }
}
