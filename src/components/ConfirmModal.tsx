
import React from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  content?: React.ReactNode
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  isDestructive?: boolean
}

export default function ConfirmModal({
  isOpen,
  title,
  content,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  onConfirm,
  onCancel,
  isDestructive = false
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay z-[10000]" onClick={onCancel}>
      <div 
        className="modal max-w-[400px] w-full animate-[slideUp_0.3s_ease-out]" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
        </div>
        
        {content && (
          <div className="mb-6 text-muted-foreground whitespace-pre-line">
            {content}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button 
            className="btn bg-transparent border border-border text-foreground" 
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button 
            className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`} 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
