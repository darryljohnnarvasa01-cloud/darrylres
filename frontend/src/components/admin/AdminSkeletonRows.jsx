import { memo } from 'react'

const AdminSkeletonRows = memo(function AdminSkeletonRows({ rows = 5, className = 'h-14' }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className={`admin-skeleton-block ${className}`.trim()} />
      ))}
    </div>
  )
})

export default AdminSkeletonRows
