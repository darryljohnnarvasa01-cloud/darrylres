import { ImagePlus, UploadCloud, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import BrandMark from '../components/BrandMark'
import { VALENCIA_BARANGAYS } from '../data/barangays'
import { api, ensureCsrfCookie } from '../lib/api'
import { parseApiError } from '../lib/errorUtils'

const initialForm = {
  full_name: '',
  email: '',
  password: '',
  password_confirmation: '',
  phone: '',
  barangay: '',
  address: '',
}

function RegisterPage() {
  const [form, setForm] = useState(initialForm)
  const [govIdFile, setGovIdFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const previewUrl = useMemo(() => {
    if (!govIdFile) {
      return null
    }

    return URL.createObjectURL(govIdFile)
  }, [govIdFile])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const setFieldValue = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleFileSelect = (file) => {
    if (!file) {
      return
    }

    setGovIdFile(file)
    setErrors((prev) => ({ ...prev, gov_id_image: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!govIdFile) {
      setErrors((prev) => ({ ...prev, gov_id_image: 'Government ID image is required.' }))
      return
    }

    setIsSubmitting(true)
    setErrors({})

    const payload = new FormData()

    Object.entries(form).forEach(([key, value]) => {
      payload.append(key, value)
    })
    payload.append('gov_id_image', govIdFile)

    try {
      await ensureCsrfCookie()
      await api.post('/api/v1/auth/register', payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      toast.success('Registration submitted! Wait for admin approval.')
      navigate('/login')
    } catch (error) {
      const parsed = parseApiError(error)
      setErrors(parsed.fields)
      toast.error(parsed.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDrop = (event) => {
    event.preventDefault()
    if (event.dataTransfer.files?.length > 0) {
      handleFileSelect(event.dataTransfer.files[0])
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel px-4 py-10">
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-8 shadow-card">
        <BrandMark />
        <h1 className="mt-6 text-center font-heading text-3xl italic text-navy">Create Account</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Register as a Valencia City resident to submit emergency reports.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">Full Name</label>
            <input
              className="form-input"
              value={form.full_name}
              onChange={(event) => setFieldValue('full_name', event.target.value)}
              placeholder="Juan Dela Cruz"
            />
            {errors.full_name && <p className="error-text">{errors.full_name}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              className="form-input"
              value={form.email}
              onChange={(event) => setFieldValue('email', event.target.value)}
              placeholder="name@email.com"
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              className="form-input"
              value={form.password}
              onChange={(event) => setFieldValue('password', event.target.value)}
              placeholder="At least 8 characters"
            />
            {errors.password && <p className="error-text">{errors.password}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Confirm Password</label>
            <input
              type="password"
              className="form-input"
              value={form.password_confirmation}
              onChange={(event) => setFieldValue('password_confirmation', event.target.value)}
              placeholder="Re-enter your password"
            />
            {errors.password_confirmation && (
              <p className="error-text">{errors.password_confirmation}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <input
              className="form-input"
              value={form.phone}
              onChange={(event) => setFieldValue('phone', event.target.value)}
              placeholder="09XXXXXXXXX"
            />
            {errors.phone && <p className="error-text">{errors.phone}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Barangay</label>
            <select
              className="form-input"
              value={form.barangay}
              onChange={(event) => setFieldValue('barangay', event.target.value)}
            >
              <option value="">Select barangay</option>
              {VALENCIA_BARANGAYS.map((barangay) => (
                <option key={barangay} value={barangay}>
                  {barangay}
                </option>
              ))}
            </select>
            {errors.barangay && <p className="error-text">{errors.barangay}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Full Address</label>
            <textarea
              className="form-input min-h-24 resize-none"
              value={form.address}
              onChange={(event) => setFieldValue('address', event.target.value)}
              placeholder="House No., Street, Purok, Valencia City"
            />
            {errors.address && <p className="error-text">{errors.address}</p>}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Government ID</label>
            <div
              className="rounded-xl border-2 border-dashed border-danger/40 bg-danger/5 p-4"
              onDrop={onDrop}
              onDragOver={(event) => event.preventDefault()}
            >
              {!previewUrl ? (
                <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                  <UploadCloud className="h-8 w-8 text-danger" />
                  <p className="text-sm text-navy">Drag and drop your ID or click to upload</p>
                  <p className="text-xs text-slate-500">JPEG / PNG up to 5MB</p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
                  />
                </label>
              ) : (
                <div className="relative mx-auto h-32 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <img src={previewUrl} alt="Government ID preview" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setGovIdFile(null)}
                    className="absolute right-2 top-2 rounded-full bg-white p-1 text-danger shadow"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            {govIdFile && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <ImagePlus className="h-4 w-4 text-danger" />
                {govIdFile.name}
              </div>
            )}
            {errors.gov_id_image && <p className="error-text">{errors.gov_id_image}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Register'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-danger">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default RegisterPage
