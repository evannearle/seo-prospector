// Background scheduler — checks every minute if a run is due
import { schedulerState, notifyScheduler } from './globalState'
import type { ScheduledRun } from './globalState'

function getNextRun(s: ScheduledRun): Date {
  const now = new Date()
  const target = new Date()
  target.setHours(s.timeHH, s.timeMM, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 1) // move to tomorrow if past

  if (s.schedule === 'weekdays') {
    while ([0, 6].includes(target.getDay())) target.setDate(target.getDate() + 1) // skip weekends
  }
  return target
}

function isDue(s: ScheduledRun): boolean {
  if (!s.enabled) return false
  const now = new Date()
  const last = s.lastRan ? new Date(s.lastRan) : null

  // Has it already run in this minute window?
  if (last) {
    const elapsed = now.getTime() - last.getTime()
    if (elapsed < 60 * 1000) return false
  }

  const isWeekend = [0, 6].includes(now.getDay())
  if (s.schedule === 'weekdays' && isWeekend) return false

  // Check if we're within the target minute window
  const target = new Date()
  target.setHours(s.timeHH, s.timeMM, 0, 0)
  const diff = Math.abs(now.getTime() - target.getTime())
  return diff < 60 * 1000 // within 1 minute of scheduled time
}

export function startScheduler() {
  if (schedulerState.timerHandle) return // already running
  loadSchedules()

  schedulerState.timerHandle = setInterval(async () => {
    let fired = false
    for (const s of schedulerState.schedules) {
      if (!isDue(s)) continue
      fired = true
      const idx = schedulerState.schedules.findIndex(x => x.id === s.id)
      schedulerState.schedules[idx].lastRan = new Date().toISOString()
      schedulerState.schedules[idx].nextRun = getNextRun(s).toISOString()
      saveSchedules()
      notifyScheduler()

      if (s.type === 'calls') {
        const cfg = JSON.parse(localStorage.getItem('seo_prospector_settings_v1') || '{}')
        if (cfg.vapiApiKey) {
          const { startCallRunner } = await import('./callRunner')
          startCallRunner(cfg.vapiApiKey)
        }
      }
    }
    if (fired) notifyScheduler()
  }, 30 * 1000) // check every 30 seconds
}

export function stopScheduler() {
  if (schedulerState.timerHandle) {
    clearInterval(schedulerState.timerHandle)
    schedulerState.timerHandle = null
  }
}

export function addSchedule(s: Omit<ScheduledRun, 'id' | 'nextRun'>) {
  const schedule: ScheduledRun = {
    ...s,
    id: `sched_${Date.now()}`,
    nextRun: getNextRun(s as ScheduledRun).toISOString(),
  }
  schedulerState.schedules.push(schedule)
  saveSchedules()
  notifyScheduler()
  return schedule
}

export function removeSchedule(id: string) {
  schedulerState.schedules = schedulerState.schedules.filter(s => s.id !== id)
  saveSchedules()
  notifyScheduler()
}

export function toggleSchedule(id: string) {
  const idx = schedulerState.schedules.findIndex(s => s.id === id)
  if (idx >= 0) {
    schedulerState.schedules[idx].enabled = !schedulerState.schedules[idx].enabled
    schedulerState.schedules[idx].nextRun = getNextRun(schedulerState.schedules[idx]).toISOString()
    saveSchedules()
    notifyScheduler()
  }
}

const SCHED_KEY = 'seo_prospector_schedules_v1'

function loadSchedules() {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(SCHED_KEY)
    if (raw) schedulerState.schedules = JSON.parse(raw)
  } catch {}
}

function saveSchedules() {
  if (typeof window === 'undefined') return
  localStorage.setItem(SCHED_KEY, JSON.stringify(schedulerState.schedules))
}
