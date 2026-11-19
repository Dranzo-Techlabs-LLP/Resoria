import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, X } from 'lucide-react'

interface ToastMsg {
  id: number
  title: string
  message?: string
}
const Ctx = createContext<{ show: (title: string, message?: string) => void } | undefined>(undefined)

/** Bottom-right toasts that close themselves after 5 seconds (change sheet: booking success toast). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const seq = useRef(0)
  const close = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const show = useCallback((title: string, message?: string) => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, title, message }])
    setTimeout(() => close(id), 5000)
  }, [close])
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2 print:hidden" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-ink px-4 py-3.5 text-white shadow-xl">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#8cc7a3]" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{t.title}</div>
              {t.message && <div className="mt-0.5 text-sm text-white/80">{t.message}</div>}
            </div>
            <button onClick={() => close(t.id)} aria-label="Dismiss" className="text-white/60 hover:text-white"><X size={16} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
