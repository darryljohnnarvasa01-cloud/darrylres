import { useCallback, useEffect, useMemo, useState } from 'react'

export const LANGUAGE_STORAGE_KEY = 'rescuelink_language'
export const LANGUAGE_CHANGED_EVENT = 'rescuelink:language-changed'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'tl', label: 'Tagalog', shortLabel: 'TL' },
  { code: 'ceb', label: 'Cebuano', shortLabel: 'CEB' },
]

const FALLBACK_LANGUAGE = 'en'

export const TRANSLATIONS = {
  en: {},
  tl: {
    Report: 'Ulat',
    Emergency: 'Emerhensiya',
    Fire: 'Sunog',
    Flood: 'Baha',
    Medical: 'Medikal',
    Crime: 'Krimen',
    Accident: 'Aksidente',
    Submit: 'Ipasa',
    Cancel: 'Kanselahin',
    SOS: 'SOS',
    'Evacuation Center': 'Sentro ng Ebakwasyon',
    Status: 'Katayuan',
    Pending: 'Nakabinbin',
    Verified: 'Naberipika',
    Resolved: 'Nalutas',
  },
  ceb: {
    Report: 'Taho',
    Emergency: 'Emerhensiya',
    Fire: 'Sunog',
    Flood: 'Baha',
    Medical: 'Medikal',
    Crime: 'Krimen',
    Accident: 'Aksidente',
    Submit: 'Isumite',
    Cancel: 'Kanselahon',
    SOS: 'SOS',
    'Evacuation Center': 'Sentro sa Ebakwasyon',
    Status: 'Kahimtang',
    Pending: 'Naghulat',
    Verified: 'Napamatud-an',
    Resolved: 'Nasulbad',
  },
}

export function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.some((item) => item.code === language) ? language : FALLBACK_LANGUAGE
}

export function getStoredLanguage() {
  if (typeof window === 'undefined') {
    return FALLBACK_LANGUAGE
  }

  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY))
  } catch {
    return FALLBACK_LANGUAGE
  }
}

export function setStoredLanguage(language) {
  const normalizedLanguage = normalizeLanguage(language)

  if (typeof window === 'undefined') {
    return normalizedLanguage
  }

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage)
  } catch {
    // Language selection should never block the emergency workflow.
  }

  window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, {
    detail: { language: normalizedLanguage },
  }))

  return normalizedLanguage
}

export function t(key, language = getStoredLanguage()) {
  if (!key) {
    return ''
  }

  const normalizedLanguage = normalizeLanguage(language)

  return TRANSLATIONS[normalizedLanguage]?.[key] ?? TRANSLATIONS[FALLBACK_LANGUAGE]?.[key] ?? key
}

export function useLanguage() {
  const [language, setLanguageState] = useState(getStoredLanguage)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const syncLanguage = (event) => {
      if (event?.detail?.language) {
        setLanguageState(normalizeLanguage(event.detail.language))
        return
      }

      setLanguageState(getStoredLanguage())
    }

    const syncStorageLanguage = (event) => {
      if (event.key === LANGUAGE_STORAGE_KEY) {
        setLanguageState(normalizeLanguage(event.newValue))
      }
    }

    window.addEventListener(LANGUAGE_CHANGED_EVENT, syncLanguage)
    window.addEventListener('storage', syncStorageLanguage)

    return () => {
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, syncLanguage)
      window.removeEventListener('storage', syncStorageLanguage)
    }
  }, [])

  const setLanguage = useCallback((nextLanguage) => {
    setLanguageState(setStoredLanguage(nextLanguage))
  }, [])

  return { language, setLanguage }
}

export function useI18n() {
  const { language, setLanguage } = useLanguage()
  const translate = useCallback((key) => t(key, language), [language])

  return useMemo(
    () => ({ language, setLanguage, t: translate }),
    [language, setLanguage, translate],
  )
}
