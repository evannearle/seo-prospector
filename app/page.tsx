'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import dynamic from 'next/dynamic'

const ProspectorTab = dynamic(() => import('@/components/ProspectorTab'), { ssr: false })
const LeadsTab      = dynamic(() => import('@/components/LeadsTab'),      { ssr: false })
const PhoneTab      = dynamic(() => import('@/components/PhoneTab'),      { ssr: false })
const AnalyticsTab  = dynamic(() => import('@/components/AnalyticsTab'),  { ssr: false })
const SettingsTab   = dynamic(() => import('@/components/SettingsTab'),   { ssr: false })

type TabId = 'prospector' | 'leads' | 'phone' | 'analytics' | 'settings'

export default function Home() {
  const [active, setActive]         = useState<TabId>('prospector')
  const [phoneQueue, setPhoneQueue] = useState<string[]>([])
  const leads = useStore(s => s.leads)

  const tabs: { id: TabId; label: string; count?: number; color?: string }[] = [
    { id: 'prospector', label: 'Prospector' },
    { id: 'leads',      label: 'Saved Leads',     count: leads.length,      color: '#16a34a' },
    { id: 'phone',      label: 'AI Phone System', count: phoneQueue.length, color: '#2563eb' },
    { id: 'analytics',  label: 'Analytics' },
    { id: 'settings',   label: 'Settings' },
  ]

  const tabStyle = (id: TabId): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 7, padding: '12px 18px',
    fontSize: 12, fontWeight: 600,
    color: active === id ? '#18181b' : '#9ca3af',
    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
    borderBottom: active === id ? '2px solid #18181b' : '2px solid transparent',
    background: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#f6f6f4' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#fff', borderBottom: '1px solid #e4e4e0', padding: '0 20px', flexShrink: 0 }}>
        {tabs.map(({ id, label, count, color }) => (
          <button key={id} onClick={() => setActive(id)} style={tabStyle(id)}>
            {label}
            {count !== undefined && count > 0 && (
              <span style={{ background: color || '#16a34a', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, minWidth: 16, textAlign: 'center' }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panels */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {active === 'prospector' && <div style={{ display: 'flex', height: '100%' }}><ProspectorTab /></div>}
        {active === 'leads'      && <div style={{ display: 'flex', height: '100%' }}><LeadsTab onSendToPhone={ids => { setPhoneQueue(q => Array.from(new Set([...q, ...ids]))); setActive('phone') }} /></div>}
        {active === 'phone'      && <div style={{ display: 'flex', height: '100%' }}><PhoneTab queueIds={phoneQueue} onQueueChange={setPhoneQueue} /></div>}
        {active === 'analytics'  && <div style={{ display: 'flex', height: '100%' }}><AnalyticsTab /></div>}
        {active === 'settings'   && <div style={{ display: 'flex', height: '100%' }}><SettingsTab /></div>}
      </div>
    </div>
  )
}
