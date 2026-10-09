// Renders a form from a pydantic JSON schema (a flavour's Config or Reading model), so adding a field in
// backend/app/flavours/<key>.py is enough to get it in the UI. Supports: string, date, number/Decimal,
// integer, enum (Literal), boolean, and Optional[...] of those.

export interface JsonSchema {
  properties?: Record<string, PropSchema>
  required?: string[]
}

interface PropSchema {
  type?: string
  format?: string
  enum?: string[]
  anyOf?: PropSchema[]
  title?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  maxLength?: number
}

export type FormValues = Record<string, string | boolean>

type Kind = 'text' | 'date' | 'number' | 'integer' | 'enum' | 'boolean'

function resolve(p: PropSchema): { kind: Kind; options?: string[] } {
  const branches = p.anyOf ? p.anyOf.filter((b) => b.type !== 'null') : [p]
  if (branches.some((b) => b.enum)) return { kind: 'enum', options: branches.find((b) => b.enum)!.enum }
  if (branches.some((b) => b.type === 'number')) return { kind: 'number' } // Decimal = number | string
  const b = branches[0] ?? {}
  if (b.type === 'integer') return { kind: 'integer' }
  if (b.type === 'boolean') return { kind: 'boolean' }
  if (b.format === 'date') return { kind: 'date' }
  return { kind: 'text' }
}

/** Initial form values: existing values, else schema defaults. */
export function initialValues(schema: JsonSchema | null, existing: Record<string, unknown> = {}): FormValues {
  const out: FormValues = {}
  for (const [k, p] of Object.entries(schema?.properties ?? {})) {
    const v = existing[k] ?? p.default
    out[k] = typeof v === 'boolean' ? v : v === null || v === undefined ? '' : String(v)
  }
  return out
}

/** Form values → JSON body: blanks become null (omitted if not required), numbers stay strings for Decimal. */
export function toPayload(schema: JsonSchema | null, values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, p] of Object.entries(schema?.properties ?? {})) {
    const v = values[k]
    if (v === '' || v === undefined) {
      if (!schema?.required?.includes(k)) out[k] = null
      continue
    }
    out[k] = resolve(p).kind === 'integer' && typeof v === 'string' ? Number(v) : v
  }
  return out
}

export function missingRequired(schema: JsonSchema | null, values: FormValues): string[] {
  return (schema?.required ?? []).filter((k) => values[k] === '' || values[k] === undefined)
}

export function SchemaForm({
  schema,
  values,
  onChange,
}: {
  schema: JsonSchema | null
  values: FormValues
  onChange: (v: FormValues) => void
}) {
  const props = Object.entries(schema?.properties ?? {})
  if (props.length === 0) return null
  return (
    <>
      {props.map(([key, p]) => {
        const { kind, options } = resolve(p)
        const required = schema?.required?.includes(key)
        const label = `${p.title ?? key}${required ? ' *' : ''}`
        const set = (v: string | boolean) => onChange({ ...values, [key]: v })
        const value = values[key] ?? ''
        if (kind === 'boolean')
          return (
            <label key={key} className="check" title={p.description}>
              <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />
              {label}
            </label>
          )
        return (
          <label key={key}>
            {label}
            {kind === 'enum' ? (
              <select value={String(value)} onChange={(e) => set(e.target.value)}>
                {!required && <option value="">—</option>}
                {options!.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type={kind === 'date' ? 'date' : kind === 'text' ? 'text' : 'number'}
                step={kind === 'integer' ? 1 : 'any'}
                min={p.minimum}
                max={p.maximum}
                maxLength={p.maxLength}
                value={String(value)}
                onChange={(e) => set(e.target.value)}
              />
            )}
            {p.description && <span className="hint">{p.description}</span>}
          </label>
        )
      })}
    </>
  )
}
