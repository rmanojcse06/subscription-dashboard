import { useEffect, useRef, type ReactNode } from 'react'

/** Modal built on <dialog>: Esc and backdrop click close it. */
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog dialog-wide' : 'dialog'}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <header className="dialog-head">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
