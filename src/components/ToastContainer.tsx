
'use client'

import React from 'react'
import { useToast } from '@/context/ToastContext'
import { CheckCircleIcon, CloseIcon, AlertIcon, ClockIcon } from '@/components/Icons'

const toastStyles = {
  success: {
    icon: <CheckCircleIcon size={24} style={{ color: 'var(--success)' }} />, 
    title: 'ดำเนินการสำเร็จ',
  },
  error: {
    icon: <AlertIcon size={24} style={{ color: 'var(--error)' }} />,
    title: 'เกิดข้อผิดพลาด',
  },
  info: {
    icon: <ClockIcon size={24} style={{ color: 'var(--primary)' }} />,
    title: 'กำลังดำเนินการ',
  },
  warning: {
    icon: <AlertIcon size={24} style={{ color: 'var(--warning)' }} />, 
    title: 'คำเตือน',
  },
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-card"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            minWidth: '300px',
            maxWidth: '400px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            pointerEvents: 'auto',
            animation: 'toastSlideIn 0.3s ease-out forwards',
          }}
        >
          {/* Close Button */}
          <button
            onClick={() => removeToast(toast.id)}
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <CloseIcon size={14} />
          </button>

          {/* Icon */}
          <div style={{ flexShrink: 0 }}>
            {toastStyles[toast.type].icon}
          </div>

          {/* Content */}
          <div style={{ flex: 1, color: 'var(--foreground)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 }}>
              {toast.message}
            </h3>
          </div>
        </div>
      ))}
      <style jsx global>{`
        @keyframes toastSlideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
