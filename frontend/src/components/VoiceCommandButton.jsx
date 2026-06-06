import { Loader2, Mic, MicOff } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const INCIDENT_KEYWORDS = [
  { type: 'fire', keywords: ['fire', 'flame', 'smoke', 'burning', 'sunog'] },
  { type: 'medical', keywords: ['medical', 'ambulance', 'injury', 'injured', 'heart', 'fainted', 'doctor', 'hospital'] },
  { type: 'crime', keywords: ['crime', 'robbery', 'theft', 'assault', 'violence', 'threat', 'police'] },
  { type: 'flood', keywords: ['flood', 'flooding', 'overflow', 'water rising', 'baha'] },
  { type: 'accident', keywords: ['accident', 'crash', 'collision', 'vehicle', 'motorcycle', 'car'] },
]

function getSpeechRecognition() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

function parseIncidentType(transcript) {
  const normalized = transcript.toLowerCase()
  const match = INCIDENT_KEYWORDS.find((incidentType) =>
    incidentType.keywords.some((keyword) => normalized.includes(keyword)),
  )

  return match?.type ?? 'other'
}

function descriptionForTranscript(transcript) {
  const cleaned = transcript.trim()

  if (cleaned.length >= 20) {
    return cleaned
  }

  return `Voice report: ${cleaned}. Please add more details before submitting.`
}

function VoiceCommandButton() {
  const { role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const recognitionRef = useRef(null)
  const transcriptRef = useRef('')
  const [isListening, setIsListening] = useState(false)

  const hidden = useMemo(() => {
    if (role === 'admin' || role === 'staff') {
      return true
    }

    return location.pathname.startsWith('/admin') || location.pathname.startsWith('/staff')
  }, [location.pathname, role])

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  const startListening = () => {
    const SpeechRecognition = getSpeechRecognition()

    if (!SpeechRecognition) {
      toast.error('Voice reporting is not supported by this browser. Use the report form instead.')
      return
    }

    if (isListening) {
      stopListening()
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    transcriptRef.current = ''
    recognitionRef.current = recognition

    recognition.onstart = () => {
      setIsListening(true)
      toast('Listening for your emergency report...')
    }

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()

      transcriptRef.current = transcript
    }

    recognition.onerror = (event) => {
      setIsListening(false)
      toast.error(event.error === 'not-allowed'
        ? 'Microphone permission was denied.'
        : 'Unable to capture voice input. Please try again or use the report form.')
    }

    recognition.onend = () => {
      setIsListening(false)
      const transcript = transcriptRef.current.trim()

      if (!transcript) {
        toast.error('No voice report was captured.')
        return
      }

      const type = parseIncidentType(transcript)
      const searchParams = new URLSearchParams({
        type,
        description: descriptionForTranscript(transcript),
        source: 'voice',
      })

      navigate(`/report?${searchParams.toString()}`)
      toast.success('Voice report added to the emergency form.')
    }

    try {
      recognition.start()
    } catch {
      setIsListening(false)
      toast.error('Voice reporting is already active. Please wait a moment and try again.')
    }
  }

  if (hidden) {
    return null
  }

  const isLandingPage = location.pathname === '/'
  const positionClass = isLandingPage
    ? 'right-4 top-20 h-12 w-12 lg:bottom-5 lg:right-5 lg:top-auto lg:h-14 lg:w-14'
    : 'bottom-5 right-5 h-14 w-14'

  return (
    <button
      type="button"
      onClick={startListening}
      className={`fixed z-[1100] inline-flex items-center justify-center rounded-full bg-danger text-white shadow-card transition hover:bg-[#bc1f34] focus:outline-none focus:ring-4 focus:ring-danger/20 ${positionClass}`}
      aria-label={isListening ? 'Stop voice command reporting' : 'Start voice command reporting'}
      title={isListening ? 'Stop voice reporting' : 'Voice report'}
    >
      {isListening ? (
        <span className="relative inline-flex">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/40" />
          <Loader2 className="relative h-6 w-6 animate-spin" />
        </span>
      ) : getSpeechRecognition() ? (
        <Mic className="h-6 w-6" />
      ) : (
        <MicOff className="h-6 w-6" />
      )}
    </button>
  )
}

export default VoiceCommandButton
