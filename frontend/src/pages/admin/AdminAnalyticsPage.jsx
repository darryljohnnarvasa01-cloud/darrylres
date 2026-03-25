import { ArrowUpDown, CalendarRange, Download, FileText, RefreshCw, Search, UserCircle2, X } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import AdminSidebar from '../../components/admin/AdminSidebar'
import StatusPill from '../../components/incident/StatusPill'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { getIncidentType } from '../../data/incidentTypes'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'

const TYPE_COLORS = {
  fire: '#D7263D',
  medical: '#1570EF',
  crime: '#7A5AF8',
  flood: '#0BA5EC',
  accident: '#F79009',
  other: '#98A2B3',
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_LABELS = Array.from({ length: 24 }, (_, index) => index)

function toDateInputValue(date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function startOfWeek(date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfMonth(date) {
  const next = new Date(date)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfYear(date) {
  const next = new Date(date)
  next.setMonth(0, 1)
  next.setHours(0, 0, 0, 0)
  return next
}

function analyticsFetcher([path, from, to]) {
  return api.get(path, { params: { from, to } }).then((response) => response.data?.data ?? {})
}

function csvCell(value) {
  const normalized = String(value ?? '').replace(/"/g, '""')
  return `"${normalized}"`
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

function formatHours(value) {
  return `${Number(value ?? 0).toFixed(2)} hrs`
}

function formatMinutes(value) {
  if (value === null || value === undefined) {
    return '-'
  }

  return `${Number(value).toFixed(1)} min`
}

function KpiCard({ label, value, helper }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-navy">{value}</p>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
    </article>
  )
}

function LoadingGrid({ blocks = 4 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: blocks }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-3xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <p className="text-base font-semibold text-navy">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  )
}

function SortableHeader({ label, sortKey, currentSort, onToggle }) {
  const active = currentSort.key === sortKey
  const direction = active ? currentSort.direction : null

  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] ${
        active ? 'text-navy' : 'text-slate-500'
      }`}
    >
      {label}
      <ArrowUpDown className={`h-3.5 w-3.5 ${direction === 'asc' ? 'rotate-180' : ''}`} />
    </button>
  )
}

function heatCellColor(count, maxCount) {
  if (!count) {
    return '#F8FAFC'
  }

  const intensity = 0.18 + ((count / maxCount) * 0.72)
  return `rgba(215, 38, 61, ${intensity.toFixed(2)})`
}

function AdminAnalyticsPage() {
  const { user, logout } = useAuth()
  const reportRef = useRef(null)
  const today = useMemo(() => new Date(), [])
  const initialFrom = useMemo(() => toDateInputValue(startOfMonth(today)), [today])
  const initialTo = useMemo(() => toDateInputValue(today), [today])
  const [draftFromDate, setDraftFromDate] = useState(initialFrom)
  const [draftToDate, setDraftToDate] = useState(initialTo)
  const [filters, setFilters] = useState({ from: initialFrom, to: initialTo })
  const [searchInput, setSearchInput] = useState('')
  const deferredSearch = useDeferredValue(searchInput)
  const [activeType, setActiveType] = useState('')
  const [riskSort, setRiskSort] = useState({ key: 'risk_score', direction: 'desc' })
  const [exportingPdf, setExportingPdf] = useState(false)

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(['/api/v1/admin/analytics/overview', filters.from, filters.to], analyticsFetcher, {
    revalidateOnFocus: true,
  })

  useEffect(() => {
    if (!error) {
      return
    }

    toast.error(parseApiError(error).message, {
      id: 'analytics-overview-error',
    })
  }, [error])

  const kpis = useMemo(() => data?.kpis ?? {}, [data])
  const responseTrend = useMemo(() => data?.response_time_trend ?? [], [data])
  const typeBreakdown = useMemo(() => data?.type_breakdown ?? [], [data])
  const riskRows = useMemo(() => data?.barangay_risk_rows ?? [], [data])
  const heatmapRows = useMemo(() => data?.time_of_day_heatmap ?? [], [data])
  const incidentRows = useMemo(() => data?.incident_rows ?? [], [data])

  useEffect(() => {
    if (!activeType) {
      return
    }

    if (!typeBreakdown.some((row) => row.type === activeType)) {
      setActiveType('')
    }
  }, [activeType, typeBreakdown])

  const filteredIncidentRows = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase()

    return incidentRows.filter((row) => {
      if (activeType && row.type !== activeType) {
        return false
      }

      if (!keyword) {
        return true
      }

      const typeLabel = getIncidentType(row.type).label.toLowerCase()
      return [
        row.reference_code,
        row.reporter_name,
        row.barangay,
        row.assigned_responder,
        row.status,
        typeLabel,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    })
  }, [activeType, deferredSearch, incidentRows])

  const sortedRiskRows = useMemo(() => {
    const rows = [...riskRows]
    const directionMultiplier = riskSort.direction === 'asc' ? 1 : -1

    rows.sort((left, right) => {
      const leftValue = left[riskSort.key]
      const rightValue = right[riskSort.key]

      if (typeof leftValue === 'string' || typeof rightValue === 'string') {
        return String(leftValue).localeCompare(String(rightValue)) * directionMultiplier
      }

      return (Number(leftValue) - Number(rightValue)) * directionMultiplier
    })

    return rows
  }, [riskRows, riskSort.direction, riskSort.key])

  const maxHeatCount = useMemo(() => Math.max(1, ...heatmapRows.map((row) => row.count ?? 0)), [heatmapRows])
  const heatmapByDay = useMemo(
    () => DAY_LABELS.map((label, index) => ({
      label,
      cells: HOUR_LABELS.map((hour) => heatmapRows.find((row) => row.day_index === index + 1 && row.hour === hour) ?? {
        day_index: index + 1,
        day_label: label,
        hour,
        count: 0,
      }),
    })),
    [heatmapRows],
  )

  const handlePreset = (preset) => {
    const now = new Date()
    const nextTo = toDateInputValue(now)
    let nextFrom = nextTo

    if (preset === 'week') {
      nextFrom = toDateInputValue(startOfWeek(now))
    }

    if (preset === 'month') {
      nextFrom = toDateInputValue(startOfMonth(now))
    }

    if (preset === 'year') {
      nextFrom = toDateInputValue(startOfYear(now))
    }

    setDraftFromDate(nextFrom)
    setDraftToDate(nextTo)
    setFilters({ from: nextFrom, to: nextTo })
    setActiveType('')
  }

  const applyFilters = () => {
    if (draftFromDate && draftToDate && draftFromDate > draftToDate) {
      toast.error('The start date must be before the end date.')
      return
    }

    setFilters({ from: draftFromDate, to: draftToDate })
    setActiveType('')
  }

  const handleRiskSort = (sortKey) => {
    setRiskSort((current) => ({
      key: sortKey,
      direction: current.key === sortKey && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const exportCsv = () => {
    const rows = [
      ['RescueLink Analytics Overview'],
      ['Date Range', `${filters.from} to ${filters.to}`],
      [],
      ['KPI Summary'],
      ['Metric', 'Value'],
      ['Avg. Time to Verify', formatHours(kpis.avg_verification_hours)],
      ['Avg. Time to Resolve', formatHours(kpis.avg_resolution_hours)],
      ['Incidents in Period', kpis.total_this_period ?? 0],
      ['Incidents in Previous Period', kpis.total_last_period ?? 0],
      ['Percent Change', `${kpis.pct_change ?? 0}%`],
      ['Active Responders', kpis.active_staff_count ?? 0],
      [],
      ['Response Time Trend'],
      ['Date', 'Avg Response Minutes', 'Incidents With Response'],
      ...responseTrend.map((row) => [row.date, row.avg_response_minutes ?? '', row.responded_count ?? 0]),
      [],
      ['Incident Type Breakdown'],
      ['Type', 'Count', 'Share %'],
      ...typeBreakdown.map((row) => [getIncidentType(row.type).label, row.count, row.share]),
      [],
      ['Barangay Risk Table'],
      ['Barangay', 'Total Incidents', 'Unresolved', 'Unresolved Rate %', 'Risk Score'],
      ...sortedRiskRows.map((row) => [row.barangay, row.total_incidents, row.unresolved_count, row.unresolved_rate, row.risk_score]),
      [],
      ['Time Of Day Heatmap'],
      ['Day', 'Hour', 'Incident Count'],
      ...heatmapRows.map((row) => [row.day_label, row.hour, row.count]),
      [],
      ['Incident Table'],
      ['Code', 'Type', 'Barangay', 'Reporter', 'Assigned Responder', 'Submitted At', 'Status', 'Response Minutes', 'Resolution Minutes'],
      ...filteredIncidentRows.map((row) => [
        row.reference_code,
        getIncidentType(row.type).label,
        row.barangay,
        row.reporter_name,
        row.assigned_responder ?? '',
        row.created_at,
        row.status,
        row.response_time_minutes ?? '',
        row.resolution_time_minutes ?? '',
      ]),
    ]

    downloadCsv(`rescuelink-analytics-${filters.from}-to-${filters.to}.csv`, rows)
    toast.success('CSV export generated.')
  }

  const exportPdf = async () => {
    if (!reportRef.current) {
      return
    }

    setExportingPdf(true)

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#FFFFFF',
      })

      const imageData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const imageWidth = pageWidth - margin * 2
      const imageHeight = (canvas.height * imageWidth) / canvas.width

      pdf.setFontSize(12)
      pdf.text('RescueLink - CDRRMO Valencia City', margin, 8)
      pdf.setFontSize(10)
      pdf.text(`Date range: ${filters.from} to ${filters.to}`, margin, 14)

      let heightLeft = imageHeight
      let position = 20
      pdf.addImage(imageData, 'PNG', margin, position, imageWidth, imageHeight)
      heightLeft -= pageHeight - position - margin

      while (heightLeft > 0) {
        pdf.addPage()
        const nextY = margin - (imageHeight - heightLeft)
        pdf.addImage(imageData, 'PNG', margin, nextY, imageWidth, imageHeight)
        heightLeft -= pageHeight - margin * 2
      }

      pdf.save(`rescuelink-analytics-${filters.from}-to-${filters.to}.pdf`)
      toast.success('PDF report generated.')
    } catch {
      toast.error('Unable to generate PDF report.')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />

      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Data Insights</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Advanced analytics</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Monitor response-time performance, incident concentration, barangay risk, and time-of-day surges from a single analytics console.
              </p>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <NotificationBell />
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5">
                <UserCircle2 className="h-5 w-5 text-slate-500" />
                <span className="text-xs font-semibold text-navy">{user?.full_name?.split(' ')[0]}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 pb-6 lg:px-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <CalendarRange className="h-4 w-4" />
                Date Range
              </div>
              <input
                type="date"
                className="form-input h-10 max-w-44 py-2 text-sm"
                value={draftFromDate}
                onChange={(event) => setDraftFromDate(event.target.value)}
              />
              <input
                type="date"
                className="form-input h-10 max-w-44 py-2 text-sm"
                value={draftToDate}
                onChange={(event) => setDraftToDate(event.target.value)}
              />
              <button type="button" onClick={() => handlePreset('today')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Today</button>
              <button type="button" onClick={() => handlePreset('week')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">This Week</button>
              <button type="button" onClick={() => handlePreset('month')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">This Month</button>
              <button type="button" onClick={() => handlePreset('year')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">This Year</button>
              <button type="button" onClick={applyFilters} className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white">
                Apply
              </button>
              <button
                type="button"
                onClick={() => mutate()}
                className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </section>

          {error ? (
            <EmptyState
              title="Unable to load analytics"
              description="The analytics feed did not return successfully. Refresh the page or retry once the backend is available."
            />
          ) : (
            <div ref={reportRef} className="space-y-5">
              {isLoading ? (
                <LoadingGrid />
              ) : (
                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label="Avg. Time to Verify" value={formatHours(kpis.avg_verification_hours)} />
                  <KpiCard label="Avg. Time to Resolve" value={formatHours(kpis.avg_resolution_hours)} />
                  <KpiCard
                    label="Period Volume"
                    value={kpis.total_this_period ?? 0}
                    helper={`${kpis.total_last_period ?? 0} in the previous period | ${kpis.pct_change ?? 0}% change`}
                  />
                  <KpiCard label="Active Responders" value={kpis.active_staff_count ?? 0} />
                </section>
              )}

              <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Response Time Trend</p>
                      <h2 className="mt-1 text-xl font-semibold text-navy">Last 30 days</h2>
                      <p className="mt-1 text-sm text-slate-500">Average minutes from incident submission to the first field-response status.</p>
                    </div>
                    <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                      {responseTrend.filter((row) => row.avg_response_minutes !== null).length} days with response data
                    </div>
                  </div>

                  <div className="mt-4">
                    {isLoading ? (
                      <div className="h-[300px] animate-pulse rounded-3xl bg-slate-100" />
                    ) : responseTrend.some((row) => row.avg_response_minutes !== null) ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={responseTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="label" minTickGap={12} />
                          <YAxis allowDecimals={false} />
                          <Tooltip
                            formatter={(value) => (value === null || value === undefined ? ['No response data', 'Avg Response'] : [`${value} min`, 'Avg Response'])}
                            labelFormatter={(value, payload) => payload?.[0]?.payload?.date ?? value}
                          />
                          <Line type="monotone" dataKey="avg_response_minutes" stroke="#1570EF" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} connectNulls={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState
                        title="No response timings yet"
                        description="The selected period does not yet contain incidents that progressed into field response states."
                      />
                    )}
                  </div>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Incident Type Breakdown</p>
                      <h2 className="mt-1 text-xl font-semibold text-navy">Drill-down donut</h2>
                      <p className="mt-1 text-sm text-slate-500">Click a segment or legend item to filter the incident table below by type.</p>
                    </div>
                    {activeType ? (
                      <button
                        type="button"
                        onClick={() => setActiveType('')}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        {getIncidentType(activeType).label}
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    {isLoading ? (
                      <div className="h-[300px] animate-pulse rounded-3xl bg-slate-100" />
                    ) : typeBreakdown.length ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={typeBreakdown}
                            dataKey="count"
                            nameKey="type"
                            innerRadius={72}
                            outerRadius={104}
                            paddingAngle={3}
                            onClick={(entry) => setActiveType((current) => (current === entry.type ? '' : entry.type))}
                          >
                            {typeBreakdown.map((entry) => (
                              <Cell
                                key={entry.type}
                                fill={TYPE_COLORS[entry.type] ?? '#98A2B3'}
                                stroke={activeType === entry.type ? '#0B1120' : '#FFFFFF'}
                                strokeWidth={activeType === entry.type ? 3 : 1}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, name, item) => [`${value} incidents`, getIncidentType(item.payload.type).label]} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState
                        title="No incident type data"
                        description="No incidents were recorded in the selected period, so the donut chart has nothing to break down."
                      />
                    )}
                  </div>

                  <div className="mt-3 grid gap-2">
                    {typeBreakdown.map((row) => (
                      <button
                        key={row.type}
                        type="button"
                        onClick={() => setActiveType((current) => (current === row.type ? '' : row.type))}
                        className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${
                          activeType === row.type ? 'border-navy bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[row.type] ?? '#98A2B3' }} />
                          <div>
                            <p className="text-sm font-semibold text-navy">{getIncidentType(row.type).label}</p>
                            <p className="text-xs text-slate-500">{row.share}% of selected incidents</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-navy">{row.count}</span>
                      </button>
                    ))}
                  </div>
                </article>
              </section>

              <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Barangay Risk Heatmap Table</p>
                      <h2 className="mt-1 text-xl font-semibold text-navy">Risk ranking</h2>
                      <p className="mt-1 text-sm text-slate-500">Risk Score = (total incidents x 0.6) + (unresolved x 0.4).</p>
                    </div>
                    <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                      {sortedRiskRows.length} barangays
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    {isLoading ? (
                      <div className="h-[300px] animate-pulse rounded-3xl bg-slate-100" />
                    ) : sortedRiskRows.length ? (
                      <table className="min-w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left">
                            <th className="px-2 py-3"><SortableHeader label="Barangay" sortKey="barangay" currentSort={riskSort} onToggle={handleRiskSort} /></th>
                            <th className="px-2 py-3"><SortableHeader label="Total" sortKey="total_incidents" currentSort={riskSort} onToggle={handleRiskSort} /></th>
                            <th className="px-2 py-3"><SortableHeader label="Unresolved" sortKey="unresolved_count" currentSort={riskSort} onToggle={handleRiskSort} /></th>
                            <th className="px-2 py-3"><SortableHeader label="Unresolved Rate" sortKey="unresolved_rate" currentSort={riskSort} onToggle={handleRiskSort} /></th>
                            <th className="px-2 py-3"><SortableHeader label="Risk Score" sortKey="risk_score" currentSort={riskSort} onToggle={handleRiskSort} /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRiskRows.map((row) => (
                            <tr key={row.barangay} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-2 py-3 font-semibold text-navy">{row.barangay}</td>
                              <td className="px-2 py-3 text-slate-600">{row.total_incidents}</td>
                              <td className="px-2 py-3 text-slate-600">{row.unresolved_count}</td>
                              <td className="px-2 py-3 text-slate-600">{row.unresolved_rate}%</td>
                              <td className="px-2 py-3">
                                <span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
                                  {row.risk_score}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <EmptyState
                        title="No barangay risk rows"
                        description="The selected period has no incidents to rank by risk yet."
                      />
                    )}
                  </div>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Time-of-Day Heatmap</p>
                      <h2 className="mt-1 text-xl font-semibold text-navy">Weekly incident rhythm</h2>
                      <p className="mt-1 text-sm text-slate-500">A 7 x 24 grid showing how incident volume changes by day and hour.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Fewer</span>
                      <div className="h-2 w-8 rounded-full bg-slate-100" />
                      <div className="h-2 w-8 rounded-full bg-danger/60" />
                      <span>More</span>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    {isLoading ? (
                      <div className="h-[300px] animate-pulse rounded-3xl bg-slate-100" />
                    ) : heatmapRows.length ? (
                      <div className="min-w-[860px]">
                        <div className="grid gap-1" style={{ gridTemplateColumns: '64px repeat(24, minmax(24px, 1fr))' }}>
                          <div />
                          {HOUR_LABELS.map((hour) => (
                            <div key={`hour-${hour}`} className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {hour}
                            </div>
                          ))}
                          {heatmapByDay.map((day) => (
                            <div key={day.label} className="contents">
                              <div className="flex items-center text-xs font-semibold text-slate-500">{day.label}</div>
                              {day.cells.map((cell) => (
                                <div
                                  key={`${day.label}-${cell.hour}`}
                                  title={`${day.label} ${cell.hour}:00 | ${cell.count} incidents`}
                                  className={`flex h-8 items-center justify-center rounded-md border text-[11px] font-semibold ${
                                    cell.count > 0 ? 'border-transparent text-white' : 'border-slate-200 text-slate-400'
                                  }`}
                                  style={{ backgroundColor: heatCellColor(cell.count, maxHeatCount) }}
                                >
                                  {cell.count || ''}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <EmptyState
                        title="No hourly pattern detected"
                        description="Once incidents exist in the selected period, the day-by-hour grid will highlight surge windows."
                      />
                    )}
                  </div>
                </article>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Incident Table</p>
                    <h2 className="mt-1 text-xl font-semibold text-navy">Filtered incident detail</h2>
                    <p className="mt-1 text-sm text-slate-500">The donut chart above drills this table down by type without any extra API request.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        className="w-56 border-none bg-transparent outline-none"
                        placeholder="Search code, barangay, reporter..."
                      />
                    </div>
                    {activeType ? (
                      <button
                        type="button"
                        onClick={() => setActiveType('')}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        Showing {getIncidentType(activeType).label}
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                      {filteredIncidentRows.length} rows
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  {isLoading ? (
                    <div className="h-[320px] animate-pulse rounded-3xl bg-slate-100" />
                  ) : filteredIncidentRows.length ? (
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                          <th className="px-2 py-3">Code</th>
                          <th className="px-2 py-3">Type</th>
                          <th className="px-2 py-3">Barangay</th>
                          <th className="px-2 py-3">Reporter</th>
                          <th className="px-2 py-3">Assigned</th>
                          <th className="px-2 py-3">Submitted</th>
                          <th className="px-2 py-3">Response</th>
                          <th className="px-2 py-3">Resolution</th>
                          <th className="px-2 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredIncidentRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-2 py-3 text-xs font-semibold text-navy">{row.reference_code}</td>
                            <td className="px-2 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${getIncidentType(row.type).chipClass}`}>
                                {getIncidentType(row.type).label}
                              </span>
                            </td>
                            <td className="px-2 py-3 text-slate-600">{row.barangay}</td>
                            <td className="px-2 py-3 text-slate-600">{row.reporter_name}</td>
                            <td className="px-2 py-3 text-slate-600">{row.assigned_responder ?? 'Unassigned'}</td>
                            <td className="px-2 py-3 text-slate-500">{formatDateTime(row.created_at)}</td>
                            <td className="px-2 py-3 text-slate-600">{formatMinutes(row.response_time_minutes)}</td>
                            <td className="px-2 py-3 text-slate-600">{formatMinutes(row.resolution_time_minutes)}</td>
                            <td className="px-2 py-3"><StatusPill status={row.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState
                      title="No incidents match the current filters"
                      description="Change the donut selection, search query, or date range to widen the analytics table."
                    />
                  )}
                </div>
              </section>
            </div>
          )}

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={exportPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                {exportingPdf ? 'Generating PDF...' : 'Generate PDF Report'}
              </button>
              {isValidating ? <p className="text-sm text-slate-500">Refreshing analytics...</p> : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default AdminAnalyticsPage
