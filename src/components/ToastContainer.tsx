
'use client'

import React from 'react'
import { useToast } from '@/context/ToastContext'
import { CheckCircleIcon, CloseIcon, AlertIcon, ClockIcon } from '@/components/Icons'

const toastStyles = {
  success: {
    icon: <CheckCircleIcon size={24} className="text-success" />, 
    title: 'ดำเนินการสำเร็จ',
  },
  error: {
    icon: <AlertIcon size={24} className="text-error" />,
    title: 'เกิดข้อผิดพลาด',
  },
  info: {
    icon: <ClockIcon size={24} className="text-primary" />,
    title: 'กำลังดำเนินการ',
  },
  warning: {
    icon: <AlertIcon size={24} className="text-warning" />, 
    title: 'คำเตือน',
  },
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-card bg-card border border-border rounded-xl p-4 flex items-center gap-4 min-w-[300px] max-w-[400px] shadow-2xl relative pointer-events-auto animate-[toastSlideIn_0.3s_ease-out_forwards]"
        >
          {/* Close Button */}
          <button
            onClick={() => removeToast(toast.id)}
            className="absolute top-2 right-2 bg-transparent border-none text-muted-foreground cursor-pointer p-1"
          >
            <CloseIcon size={14} />
          </button>

          {/* Icon */}
          <div className="flex-shrink-0">
            {toastStyles[toast.type].icon}
          </div>

          {/* Content */}
          <div className="flex-1 text-foreground">
            <h3 className="m-0 text-base font-semibold leading-snug">
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
