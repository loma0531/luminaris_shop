import { useState, useRef, useEffect } from 'react'

interface CustomTimePickerProps {
  value: string
  onChange: (val: string) => void
  options: string[]
  suffix?: string
  disabled?: boolean
  placeholder?: string
}

export default function CustomTimePicker({
  value,
  onChange,
  options,
  suffix = '',
  disabled = false,
  placeholder = 'เลือก'
}: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (val: string) => {
    onChange(val)
    setIsOpen(false)
  }

  const displayLabel = value ? `${value} ${suffix}`.trim() : placeholder

  return (
    <div className="custom-time-picker-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`time-picker-trigger ${isOpen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span>{displayLabel}</span>
        <svg className="arrow-icon" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {isOpen && (
        <div className="time-picker-dropdown">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`time-picker-option ${opt === value ? 'selected' : ''}`}
              onClick={() => handleSelect(opt)}
            >
              <span>{opt} {suffix}</span>
              {opt === value && (
                <svg className="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .custom-time-picker-wrapper {
          position: relative;
          width: 100%;
        }
        .time-picker-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: #0d0c0f;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 0.45rem 0.6rem;
          color: var(--foreground);
          font-family: monospace;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          outline: none;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          white-space: nowrap;
          min-width: 72px;
          gap: 0.25rem;
          line-height: 1.2;
          height: 34px;
        }
        :global(html[data-theme="light"]) .time-picker-trigger {
          background: #f4f4f5;
          border: 1px solid rgba(0, 0, 0, 0.12);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        }
        .time-picker-trigger:hover:not(.disabled) {
          border-color: var(--primary);
          background: #141316;
        }
        :global(html[data-theme="light"]) .time-picker-trigger:hover:not(.disabled) {
          background: #e4e4e7;
        }
        .time-picker-trigger.active {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
        }
        .time-picker-trigger.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .arrow-icon {
          transition: transform 0.2s ease;
          opacity: 0.7;
          color: var(--muted-foreground);
          flex-shrink: 0;
          margin-left: 0.25rem;
        }
        .time-picker-trigger.active .arrow-icon {
          transform: rotate(180deg);
          color: var(--primary);
        }
        .time-picker-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          max-height: 200px;
          overflow-y: auto;
          background: #060607; /* ทึบแสง สีเข้ม (Dark mode) */
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          z-index: 9999; /* มั่นใจว่าอยู่ด้านหน้าสุด */
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3);
          padding: 4px;
        }
        :global(html[data-theme="light"]) .time-picker-dropdown {
          background: #ffffff; /* ทึบแสง สีขาว (Light mode) */
          border: 1px solid rgba(0, 0, 0, 0.1);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        
        /* Custom Scrollbar */
        .time-picker-dropdown::-webkit-scrollbar {
          width: 5px;
        }
        .time-picker-dropdown::-webkit-scrollbar-track {
          background: transparent;
        }
        .time-picker-dropdown::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 999px;
        }
        .time-picker-dropdown::-webkit-scrollbar-thumb:hover {
          background: var(--primary);
        }

        .time-picker-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: transparent;
          border: none;
          border-radius: 6px;
          padding: 0.4rem 0.6rem;
          color: #e4e4e7; /* ตัวหนังสือสีอ่อนใน Dark mode */
          font-family: monospace;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
          white-space: nowrap;
        }
        :global(html[data-theme="light"]) .time-picker-option {
          color: #0d0c0f; /* ตัวหนังสือสีเข้มใน Light mode */
        }
        .time-picker-option:hover {
          background: rgba(34, 197, 94, 0.1);
          color: var(--primary);
        }
        .time-picker-option.selected {
          background: var(--primary);
          color: #ffffff !important;
          font-weight: bold;
        }
        .check-icon {
          flex-shrink: 0;
          margin-left: 0.5rem;
        }
      `}</style>
    </div>
  )
}
