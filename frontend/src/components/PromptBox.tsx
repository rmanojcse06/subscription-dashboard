import { useEffect, useState } from 'react'

const HINT = 'Please type here !'
const IDLE = 'Ask about your subscriptions…'
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Google-style search bar. On hover the placeholder types out HINT. Answering prompts (LLM) comes later. */
export function PromptBox() {
  const [value, setValue] = useState('')
  const [hover, setHover] = useState(false)
  const [typed, setTyped] = useState(0)
  const [note, setNote] = useState<string | null>(null)

  // Typewriter: reveal one character every 70 ms while hovered; reset when the pointer leaves.
  useEffect(() => {
    if (!hover) {
      setTyped(0)
      return
    }
    if (reducedMotion()) {
      setTyped(HINT.length)
      return
    }
    if (typed >= HINT.length) return
    const t = setTimeout(() => setTyped((n) => n + 1), 70)
    return () => clearTimeout(t)
  }, [hover, typed])

  const placeholder = hover ? HINT.slice(0, typed) + (typed < HINT.length ? '▌' : '') : IDLE

  return (
    <form
      className={`prompt${hover ? ' prompt-hover' : ''}`}
      role="search"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) setNote('Answering prompts is coming soon. Your question was not sent anywhere.')
      }}
    >
      <svg className="prompt-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(e) => { setValue(e.target.value); setNote(null) }}
        placeholder={placeholder}
        aria-label="Prompt"
      />
      {value && (
        <button type="button" className="prompt-clear" aria-label="Clear" onClick={() => { setValue(''); setNote(null) }}>
          ✕
        </button>
      )}
      {note && <p className="prompt-note" role="status">{note}</p>}
    </form>
  )
}
