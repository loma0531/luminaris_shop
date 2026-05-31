'use client'

import { ReactNode } from 'react'

interface SectionCardProps {
  title?: string
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * SectionCard — การ์ดแบ่งส่วนสำหรับหน้า Admin form
 * ใช้แทน <div className="card form-card"> เดิม
 */
export default function SectionCard({ title, icon, children, className = '' }: SectionCardProps) {
  return (
    <div className={`section-card ${className}`}>
      {title && (
        <h2 className="section-title">
          {icon && <span className="section-title-icon">{icon}</span>}
          {title}
        </h2>
      )}
      {children}
    </div>
  )
}
