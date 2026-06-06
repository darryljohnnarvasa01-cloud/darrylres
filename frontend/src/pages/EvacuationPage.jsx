import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import EvacuationNavigator from '../components/maps/EvacuationNavigator'
import { t } from '../lib/i18n'

function EvacuationPage() {
  return (
    <div className="flex min-h-screen flex-col bg-panel">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-navy hover:border-danger hover:text-danger"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <div>
            <h1 className="font-heading text-xl italic text-navy">{t('Evacuation Center')}s</h1>
            <p className="text-xs text-slate-500">Find the nearest safe evacuation center.</p>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <EvacuationNavigator />
      </main>
    </div>
  )
}

export default EvacuationPage
