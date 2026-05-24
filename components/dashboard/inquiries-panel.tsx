'use client'

import React from 'react'

interface Inquiry {
  id: string
  full_name: string
  email: string
  country: string
  case_type_label: string
  urgency: string
  status: string
  archived_at: string | null
  order_id: string | null
  created_at: string
}

export function InquiriesPanel() {
  const [inquiries, setInquiries] = React.useState<Inquiry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [archivedFilter, setArchivedFilter] = React.useState('all')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [selected, setSelected] = React.useState<Inquiry | null>(null)
  const limit = 50

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (statusFilter !== 'all') p.set('status', statusFilter)
    if (archivedFilter !== 'all') p.set('archived', archivedFilter)
    if (search.trim()) p.set('q', search.trim())
    p.set('page', String(page))
    p.set('limit', String(limit))
    try {
      const r = await fetch(`/api/support/inquiries?${p}`, { credentials: 'same-origin' })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Failed to load')
      setInquiries(d.inquiries || [])
      setTotal(d.total || 0)
    } catch (e: any) {
      setError(e.message || 'Failed to load inquiries')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, archivedFilter, search, page])

  React.useEffect(() => { load() }, [load])

  const loadDetail = async (id: string) => {
    try {
      const r = await fetch(`/api/support/inquiries/${id}`, { credentials: 'same-origin' })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Failed')
      setSelected(d.inquiry || null)
    } catch (e: any) {
      setError(e.message || 'Failed to load detail')
    }
  }

  return (
    <div style={{ padding: '24px 28px 60px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Inquiries</h1>
        <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>
          Read-only view of all client inquiries across the platform.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="claimed">Claimed</option>
          <option value="engaged">Engaged</option>
          <option value="converted">Converted</option>
          <option value="archived">Archived</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={archivedFilter}
          onChange={(e) => { setArchivedFilter(e.target.value); setPage(1) }}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }}
        >
          <option value="all">All</option>
          <option value="true">Archived only</option>
          <option value="false">Active only</option>
        </select>

        <input
          type="text"
          placeholder="Search case type or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, minWidth: 220 }}
        />

        <button
          onClick={load}
          style={{ padding: '6px 14px', borderRadius: 8, background: '#3C3B6E', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>Loading inquiries…</div>
      ) : inquiries.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
          {search ? 'No inquiries match your search.' : 'No inquiries found.'}
        </div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Submitted</th>
                <th style={{ padding: '10px 12px' }}>Client</th>
                <th style={{ padding: '10px 12px' }}>Country</th>
                <th style={{ padding: '10px 12px' }}>Case type</th>
                <th style={{ padding: '10px 12px' }}>Urgency</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Order</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inq) => (
                <tr
                  key={inq.id}
                  onClick={() => loadDetail(inq.id)}
                  style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer', transition: 'background 120ms' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{new Date(inq.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 12px' }}>{inq.full_name || inq.email}</td>
                  <td style={{ padding: '10px 12px' }}>{inq.country?.toUpperCase()}</td>
                  <td style={{ padding: '10px 12px' }}>{inq.case_type_label}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: inq.urgency === 'high' ? '#FEF2F2' : inq.urgency === 'low' ? '#F3F4F6' : '#FFFBEB',
                      color: inq.urgency === 'high' ? '#B91C1C' : inq.urgency === 'low' ? '#4B5563' : '#92400E',
                    }}>{inq.urgency}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: inq.status === 'archived' ? '#F3F4F6' : inq.status === 'converted' ? '#FFFBEB' : '#EFF6FF',
                      color: inq.status === 'archived' ? '#4B5563' : inq.status === 'converted' ? '#92400E' : '#1E40AF',
                    }}>{inq.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{inq.order_id ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * limit >= total}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, cursor: page * limit >= total ? 'not-allowed' : 'pointer', opacity: page * limit >= total ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              width: 'min(560px, 100vw)',
              height: '100vh',
              background: '#fff',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
              padding: '24px 28px',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Inquiry detail</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div><strong>ID:</strong> {selected.id.slice(0, 8)}</div>
              <div><strong>Client:</strong> {selected.full_name || selected.email}</div>
              <div><strong>Country:</strong> {selected.country?.toUpperCase()}</div>
              <div><strong>Case type:</strong> {selected.case_type_label}</div>
              <div><strong>Urgency:</strong> {selected.urgency}</div>
              <div><strong>Status:</strong> {selected.status}</div>
              <div><strong>Submitted:</strong> {new Date(selected.created_at).toLocaleString()}</div>
              {selected.archived_at && <div><strong>Archived:</strong> {new Date(selected.archived_at).toLocaleString()}</div>}
              {selected.order_id && <div><strong>Order:</strong> {selected.order_id.slice(0, 8)}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
