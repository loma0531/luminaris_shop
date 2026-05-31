'use client'

import { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  required?: boolean
  hint?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * FormField — wrapper สำหรับ label + input + hint
 * ใช้แทนการเขียน <div className="form-group"><label>...</label><input/></div> ซ้ำๆ
 */
export default function FormField({ label, required, hint, children, className = '' }: FormFieldProps) {
  return (
    <div className={`form-field ${className}`}>
      <label className="field-label">
        {label}
        {required && <span className="required">*</span>}
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}
