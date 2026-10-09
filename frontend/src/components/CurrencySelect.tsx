// Dropdown of major world currencies (ISO 4217). A value outside the list (e.g. saved earlier) is still shown.
const MAJOR_CURRENCIES: [code: string, name: string][] = [
  ['USD', 'US dollar'],
  ['EUR', 'Euro'],
  ['INR', 'Indian rupee'],
  ['GBP', 'British pound'],
  ['JPY', 'Japanese yen'],
  ['CNY', 'Chinese yuan'],
  ['AUD', 'Australian dollar'],
  ['CAD', 'Canadian dollar'],
  ['CHF', 'Swiss franc'],
  ['HKD', 'Hong Kong dollar'],
  ['SGD', 'Singapore dollar'],
  ['AED', 'UAE dirham'],
  ['SAR', 'Saudi riyal'],
  ['KRW', 'South Korean won'],
  ['NZD', 'New Zealand dollar'],
  ['SEK', 'Swedish krona'],
  ['NOK', 'Norwegian krone'],
  ['DKK', 'Danish krone'],
  ['BRL', 'Brazilian real'],
  ['MXN', 'Mexican peso'],
  ['ZAR', 'South African rand'],
  ['THB', 'Thai baht'],
  ['MYR', 'Malaysian ringgit'],
  ['IDR', 'Indonesian rupiah'],
]

export function CurrencySelect({
  value,
  onChange,
  exclude,
  label,
}: {
  value: string
  onChange: (code: string) => void
  exclude?: string // e.g. the other half of the toggle pair
  label?: string
}) {
  const known = MAJOR_CURRENCIES.some(([c]) => c === value)
  return (
    <select className="cur-select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {!known && value && <option value={value}>{value}</option>}
      {MAJOR_CURRENCIES.filter(([c]) => c !== exclude).map(([code, name]) => (
        <option key={code} value={code}>
          {code} · {name}
        </option>
      ))}
    </select>
  )
}
