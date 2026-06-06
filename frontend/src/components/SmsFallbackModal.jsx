/**
 * SMS Fallback Modal - Lazy-loaded component for offline SOS
 * Shows when user triggers SOS while offline
 */
import { useState, useCallback, useEffect } from 'react'
import {
  WifiOff,
  MessageSquare,
  Copy,
  Check,
  AlertTriangle,
  X,
  Phone,
  ChevronDown,
  Clock,
  MapPin,
  Share2,
} from 'lucide-react'

function SmsFallbackModal({
  isOpen,
  onClose,
  latitude,
  longitude,
  onCopyMessage,
  onOpenSms,
  emergencyContacts,
  timestamp,
  trackingUrl,
}) {
  const [selectedContact, setSelectedContact] = useState(emergencyContacts[0] || null)
  const [copied, setCopied] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const formattedTime = new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const message = `EMERGENCY SOS - Location: ${latitude.toFixed(6)},${longitude.toFixed(6)} - Time: ${formattedTime} - Track: ${trackingUrl || 'RescueLink App'}`

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      onCopyMessage?.()
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = message
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        onCopyMessage?.()
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Copy failed
      }
      document.body.removeChild(textArea)
    }
  }, [message, onCopyMessage])

  const handleSmsClick = useCallback(() => {
    if (!selectedContact) return

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const separator = isIOS ? '&' : '?'
    const smsUrl = `sms:${selectedContact.number}${separator}body=${encodeURIComponent(message)}`

    onOpenSms?.(smsUrl)
  }, [selectedContact, message, onOpenSms])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return

    const handleClick = (e) => {
      if (!e.target.closest('[data-dropdown]')) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [isDropdownOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-panel p-6 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <WifiOff className="h-7 w-7 text-amber-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-navy">You are offline</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use SMS as a backup to notify responders
          </p>
        </div>

        {/* Warning banner */}
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Emergency backup mode</p>
              <p className="text-xs text-amber-700">
                Your SOS is queued and will auto-send when connection returns. Use SMS as immediate backup.
              </p>
            </div>
          </div>
        </div>

        {/* Location info */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-slate-500">
            <MapPin className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Your Location</span>
          </div>
          <p className="mt-1 font-mono text-sm text-navy">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </p>
          <div className="mt-2 flex items-center gap-2 text-slate-500">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Time</span>
          </div>
          <p className="mt-1 text-sm text-navy">{formattedTime}</p>
        </div>

        {/* Contact selector */}
        <div className="mb-4" data-dropdown>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Emergency Contact
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy/10">
                  <Phone className="h-4 w-4 text-navy" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-navy">{selectedContact?.name}</p>
                  <p className="text-xs text-slate-500">{selectedContact?.number}</p>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && emergencyContacts.length > 1 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg">
                {emergencyContacts.map((contact) => (
                  <button
                    key={contact.number}
                    type="button"
                    onClick={() => {
                      setSelectedContact(contact)
                      setIsDropdownOpen(false)
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy/10">
                      <Phone className="h-4 w-4 text-navy" />
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${contact.number === selectedContact?.number ? 'text-navy' : 'text-slate-700'}`}>
                        {contact.name}
                      </p>
                      <p className="text-xs text-slate-500">{contact.number}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Message preview */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-slate-500">
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Message Preview</span>
          </div>
          <p className="font-mono text-xs leading-relaxed text-slate-700">{message}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleSmsClick}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 font-semibold text-white shadow-lg shadow-navy/20 transition hover:bg-slate-800"
          >
            <MessageSquare className="h-5 w-5" />
            Open SMS App
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-navy transition hover:border-slate-300"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-success" />
                  <span className="text-success">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Message
                </>
              )}
            </button>

            {navigator.share && (
              <button
                type="button"
                onClick={() => {
                  navigator.share({
                    title: 'Emergency SOS',
                    text: message,
                  }).catch(() => {
                    // User cancelled or share failed
                  })
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-navy transition hover:border-slate-300"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          If SMS fails, copy the message and send manually
        </p>
      </div>
    </div>
  )
}

export default SmsFallbackModal
