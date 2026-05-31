'use client'

interface AdminToggleProps {
  title: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/**
 * AdminToggle — switch toggle reusable สำหรับ admin
 * ใช้แทน switch-toggle/switch-handle เดิมที่เขียนซ้ำทุกหน้า
 */
export default function AdminToggle({ title, description, checked, onChange }: AdminToggleProps) {
  return (
    <div className="admin-toggle-row">
      <div className="admin-toggle-info">
        <span className="admin-toggle-title">{title}</span>
        {description && <span className="admin-toggle-desc">{description}</span>}
      </div>
      <button
        type="button"
        className={`admin-toggle-switch ${checked ? 'active' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="admin-toggle-knob" />
      </button>
    </div>
  )
}
