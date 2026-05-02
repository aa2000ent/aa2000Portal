import { useState, useRef, useEffect } from 'react'

export type CustomSelectOption = { value: string; label: string }

type CustomSelectProps = {
  value: string
  onChange: (value: string) => void
  options: CustomSelectOption[]
  placeholder: string
  'aria-label': string
  className?: string
  /** When false, hide the empty/placeholder option (e.g. for modal role/status) */
  allowEmpty?: boolean
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  'aria-label': ariaLabel,
  className = '',
  allowEmpty = true,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedLabel = value ? options.find((o) => o.value === value)?.label ?? value : placeholder

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div className={`custom-select ${open ? 'dropdown-open' : ''} ${className}`.trim()} ref={ref}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        id={`${ariaLabel.replace(/\s/g, '-')}-trigger`}
      >
        <span className="custom-select-value">{selectedLabel}</span>
        <svg className="custom-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <ul
          className="custom-select-dropdown"
          role="listbox"
          aria-labelledby={`${ariaLabel.replace(/\s/g, '-')}-trigger`}
        >
          {allowEmpty && (
            <li
              role="option"
              aria-selected={value === ''}
              className={`custom-select-option ${value === '' ? 'selected' : ''}`}
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              {placeholder}
            </li>
          )}
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className={`custom-select-option ${value === opt.value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
