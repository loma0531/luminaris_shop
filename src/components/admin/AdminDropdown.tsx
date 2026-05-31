'use client'

import { useState, useRef, useEffect } from 'react'

interface DropdownOption {
  value: string
  label: string
}

interface AdminDropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  placeholder?: string
}

/**
 * AdminDropdown — custom dropdown reusable
 * ใช้แทน dropdown logic + ref + handleClickOutside ที่เขียนซ้ำทุกหน้า
 */
export default function AdminDropdown({ value, options, onChange, placeholder = 'เลือก' }: AdminDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedLabel = options.find(o => o.value === value)?.label || placeholder

  return (
    <div className="custom-dropdown w-full" ref={ref}>
      <button
        type="button"
        className={`dropdown-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedLabel}</span>
        <div className="dropdown-arrow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      <div className={`dropdown-menu ${isOpen ? 'open' : ''}`} style={{ zIndex: 100 }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`dropdown-item ${value === opt.value ? 'selected' : ''}`}
            onClick={() => {
              onChange(opt.value)
              setIsOpen(false)
            }}
          >
            <span>{opt.label}</span>
            {value === opt.value && (
              <div className="item-check">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
