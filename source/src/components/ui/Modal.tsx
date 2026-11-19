import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  size = 'md',
}: {
  title: string
  /** Second line under the title, e.g. "Manu Kumar · RE-00004" (reference popups) */
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  size?: 'md' | 'lg'
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={`relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl ${size === 'lg' ? 'max-w-xl' : 'max-w-md'}`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="font-display text-xl font-semibold text-slate-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
