import { ChevronDown, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { INCIDENT_TYPES } from '../../data/incidentTypes'

const STATUS_OPTIONS = [
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'under_assessment', label: 'Under Assessment' },
  { value: 'responding', label: 'Responding' },
  { value: 'resolved', label: 'Resolved' },
]

const SORT_OPTIONS = [
  { value: 'risk_score', label: 'Risk Score (Highest First)' },
  { value: 'risk_score_asc', label: 'Risk Score (Lowest First)' },
  { value: 'date', label: 'Date (Newest First)' },
  { value: 'date_asc', label: 'Date (Oldest First)' },
  { value: 'status', label: 'Status (A-Z)' },
]

function AiRiskFilterPanel({ filters, onFiltersChange, onReset }) {
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleFilterChange = (key, value) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const activeFilterCount = Object.values(filters).filter(v => v).length

  const sortParts = filters.sort_by ? filters.sort_by.split('_') : ['risk_score']
  const sortBy = sortParts[0] === 'risk' ? 'risk_score' : sortParts[0]
  const sortOrder = sortParts[sortParts.length - 1] === 'asc' ? 'asc' : 'desc'

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy hover:border-info hover:text-info"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters
        {activeFilterCount > 0 && (
          <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs font-bold text-white">
            {activeFilterCount}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="space-y-4 p-4">
            {/* Search */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Search
              </label>
              <input
                type="text"
                placeholder="Reference, description, location..."
                value={filters.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 focus:border-info focus:outline-none"
              />
            </div>

            {/* Incident Type */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Incident Type
              </label>
              <select
                value={filters.type || ''}
                onChange={(e) => handleFilterChange('type', e.target.value || null)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-info focus:outline-none"
              >
                <option value="">All Types</option>
                {INCIDENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Status
              </label>
              <select
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value || null)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-info focus:outline-none"
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  From
                </label>
                <input
                  type="date"
                  value={filters.from_date || ''}
                  onChange={(e) => handleFilterChange('from_date', e.target.value || null)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-info focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  To
                </label>
                <input
                  type="date"
                  value={filters.to_date || ''}
                  onChange={(e) => handleFilterChange('to_date', e.target.value || null)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-info focus:outline-none"
                />
              </div>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sort By
              </label>
              <select
                value={filters.sort_by || 'risk_score'}
                onChange={(e) => handleFilterChange('sort_by', e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-info focus:outline-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onReset}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 rounded-lg bg-info px-3 py-2 text-sm font-semibold text-white hover:bg-info-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AiRiskFilterPanel
