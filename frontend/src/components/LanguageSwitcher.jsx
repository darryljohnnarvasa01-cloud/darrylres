import { Languages } from 'lucide-react'
import { SUPPORTED_LANGUAGES, useI18n } from '../lib/i18n'

function LanguageSwitcher({ className = '' }) {
  const { language, setLanguage } = useI18n()

  return (
    <label
      className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-navy shadow-sm ${className}`}
    >
      <Languages className="h-4 w-4 text-info" />
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        className="bg-transparent text-xs font-semibold text-navy outline-none"
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
      >
        {SUPPORTED_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default LanguageSwitcher
