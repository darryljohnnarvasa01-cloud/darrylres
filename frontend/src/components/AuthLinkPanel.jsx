function AuthLinkPanel({ title, url, description }) {
  if (!url) {
    return null
  }

  return (
    <div className="mt-4 rounded-xl border border-info/20 bg-blue-50 px-3 py-2 text-sm text-slate-600">
      <p className="font-medium text-navy">{title}</p>
      {description && <p className="mt-1">{description}</p>}
      <a href={url} className="mt-2 block break-all text-info hover:underline">
        {url}
      </a>
    </div>
  )
}

export default AuthLinkPanel
