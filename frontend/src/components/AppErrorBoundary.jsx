import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ErrorBoundary } from 'react-error-boundary'

function AppErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel px-4 py-8">
      <section
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-danger/20 bg-white p-6 text-center shadow-card"
      >
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-navy">Workspace needs a refresh</h1>
        <p className="mt-2 text-sm text-slate-600">
          A screen-level error interrupted this view. Your session is still intact.
        </p>
        {error?.message && (
          <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">{error.message}</p>
        )}
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white hover:bg-[#bc1f34]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reload view
        </button>
      </section>
    </div>
  )
}

function AppErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      FallbackComponent={AppErrorFallback}
      onReset={() => {
        window.location.reload()
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

export default AppErrorBoundary
