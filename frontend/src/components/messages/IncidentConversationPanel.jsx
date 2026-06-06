import { Loader2, MessageCircle, Send, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { parseApiError } from '../../lib/errorUtils'

function formatMessageTime(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function IncidentConversationPanel({
  incidentId,
  recipient,
  mode = 'staff',
  initiallyOpen = false,
  className = '',
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(initiallyOpen)
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const readRequestsRef = useRef(new Set())

  useEffect(() => {
    if (initiallyOpen) {
      setOpen(true)
    }
  }, [initiallyOpen])

  const markIncomingMessagesRead = useCallback((nextMessages) => {
    if (!user?.id) {
      return
    }

    nextMessages
      .filter((message) => message.recipient?.id === user.id && !message.read_at)
      .forEach((message) => {
        if (readRequestsRef.current.has(message.id)) {
          return
        }

        readRequestsRef.current.add(message.id)
        api.patch(`/api/v1/messages/messages/${message.id}/read`).catch(() => {
          readRequestsRef.current.delete(message.id)
        })
      })
  }, [user?.id])

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) {
      return
    }

    const response = await api.get(`/api/v1/messages/conversations/${conversationId}`, {
      params: { per_page: 50 },
      cache: false,
    })
    const payload = response.data?.data ?? {}
    const nextMessages = payload.messages?.data ?? []

    setConversation(payload.conversation ?? null)
    setMessages(nextMessages)
    markIncomingMessagesRead(nextMessages)
  }, [markIncomingMessagesRead])

  const ensureConversation = useCallback(async () => {
    if (!incidentId) {
      return null
    }

    setError('')

    if (mode === 'staff') {
      if (!recipient?.id) {
        setError('No citizen account is linked to this incident.')
        return null
      }

      const response = await api.post('/api/v1/messages/conversations', {
        incident_id: incidentId,
        recipient_id: recipient.id,
      })
      const nextConversation = response.data?.data?.conversation ?? null

      setConversation(nextConversation)
      await loadMessages(nextConversation?.id)

      return nextConversation
    }

    const response = await api.get('/api/v1/messages/conversations', {
      params: { incident_id: incidentId, per_page: 1 },
      cache: false,
    })
    const nextConversation = response.data?.data?.conversations?.data?.[0] ?? null

    setConversation(nextConversation)
    setMessages([])

    if (nextConversation?.id) {
      await loadMessages(nextConversation.id)
    }

    return nextConversation
  }, [incidentId, loadMessages, mode, recipient?.id])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    let active = true

    const load = async () => {
      setLoading(true)
      try {
        await ensureConversation()
      } catch (loadError) {
        if (active) {
          const parsed = parseApiError(loadError)
          setError(parsed.message)
          if (mode === 'staff') {
            toast.error(parsed.message)
          }
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [ensureConversation, mode, open])

  useEffect(() => {
    if (!open || !conversation?.id) {
      return undefined
    }

    const timer = window.setInterval(() => {
      loadMessages(conversation.id).catch(() => {
        // Polling failures should not interrupt the incident workflow.
      })
    }, 10000)

    return () => window.clearInterval(timer)
  }, [conversation?.id, loadMessages, open])

  const handleSend = async (event) => {
    event.preventDefault()
    const body = draft.trim()

    if (!body || sending) {
      return
    }

    setSending(true)
    setError('')

    try {
      const activeConversation = conversation ?? await ensureConversation()

      if (!activeConversation?.id) {
        setError('No active conversation is available yet.')
        return
      }

      const response = await api.post(`/api/v1/messages/conversations/${activeConversation.id}/messages`, {
        body,
      })
      const nextMessage = response.data?.data?.message

      setDraft('')
      if (nextMessage) {
        setMessages((current) => [...current, nextMessage])
      }
      await loadMessages(activeConversation.id)
    } catch (sendError) {
      const parsed = parseApiError(sendError)
      setError(parsed.message)
      toast.error(parsed.message)
    } finally {
      setSending(false)
    }
  }

  const buttonLabel = mode === 'staff' ? 'Message Citizen' : 'Responder Messages'
  const emptyLabel = mode === 'staff'
    ? 'No messages yet. Send the first update to the citizen.'
    : 'No responder messages yet.'
  const conversationHref = mode === 'staff'
    ? `/staff/incidents/${incidentId}?conversation=1`
    : `/my-reports?incident=${incidentId}&conversation=1`

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-info">In-app messages</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">
            {mode === 'staff' ? (recipient?.full_name ?? 'Citizen thread') : 'Responder thread'}
          </h2>
        </div>
        {open ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-navy transition hover:border-info hover:text-info"
          >
            <X className="h-4 w-4" />
            Close
          </button>
        ) : (
          <Link
            to={conversationHref}
            onClick={(event) => {
              if (mode === 'staff' && !recipient?.id) {
                event.preventDefault()
                return
              }

              setOpen(true)
            }}
            aria-disabled={mode === 'staff' && !recipient?.id}
            tabIndex={mode === 'staff' && !recipient?.id ? -1 : undefined}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-navy transition hover:border-info hover:text-info ${
              mode === 'staff' && !recipient?.id ? 'pointer-events-none cursor-not-allowed opacity-50' : ''
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            {buttonLabel}
          </Link>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center rounded-xl border border-slate-200 bg-panel">
              <Loader2 className="h-5 w-5 animate-spin text-danger" />
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              <div className="max-h-72 min-h-32 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-panel p-3">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">{emptyLabel}</p>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender?.id === user?.id

                    return (
                      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          mine
                            ? 'bg-info text-white'
                            : 'border border-slate-200 bg-white text-slate-700'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          <p className={`mt-1 text-[11px] ${mine ? 'text-white/80' : 'text-slate-400'}`}>
                            {formatMessageTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {(mode === 'staff' || conversation?.id) && (
                <form className="flex items-end gap-2" onSubmit={handleSend}>
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Message</span>
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={2}
                      maxLength={2000}
                      className="form-input min-h-12 resize-none"
                      placeholder="Type a message..."
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-danger text-white hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Send message"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default IncidentConversationPanel
