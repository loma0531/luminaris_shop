'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import Cropper, { ReactCropperElement } from 'react-cropper'
import 'cropperjs/dist/cropper.css'
import { 
  CloseIcon, 
  UploadIcon, 
  CheckIcon,
  FlipHIcon,
  FlipVIcon,
  RotateIcon,
  LinkIcon,
  ResetIcon,
  ZoomInIcon,
  ZoomOutIcon,
  CropIcon,
  MoveIcon
} from './Icons'
import { logger } from '@/lib/logger'

interface ImageEditorProps {
  initialImage?: string
  onImageChange: (imageUrl: string) => void
  onUploadStart?: () => void
  onUploadEnd?: () => void
}

export default function ImageEditor({
  initialImage,
  onImageChange,
  onUploadStart,
  onUploadEnd
}: ImageEditorProps) {
  const [, setOriginalFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>(initialImage || '')
  const [isEditing, setIsEditing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlInputValue, setUrlInputValue] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  
  // Cropper state
  const cropperRef = useRef<ReactCropperElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scaleX, setScaleX] = useState(1)
  const [scaleY, setScaleY] = useState(1)
  const [dragMode, setDragMode] = useState<'crop' | 'move'>('move')

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    setError(null)
    
    if (!file || !file.type) {
        setError('เกิดข้อผิดพลาดในการเลือกไฟล์')
        return
    }

    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพ')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)')
      return
    }

    setOriginalFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setIsEditing(true)
    setShowUrlInput(false)
    setUrlInputValue('')
    setScaleX(1)
    setScaleY(1)
    setDragMode('move')
  }, [])

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
    e.target.value = ''
  }, [handleFileSelect])

  // Editor actions
  const onRotate = () => {
    const cropper = cropperRef.current?.cropper
    if (cropper) {
      // Smart rotate: Reset view first to ensure image doesn't fall off edge
      const currentData = cropper.getData()
      const newRotation = (currentData.rotate + 90) % 360
      
      cropper.reset()
      cropper.rotateTo(newRotation)
      
      // Restore drag mode to move for better UX
      setDragMode('move')
    }
  }

  const onFlipH = () => {
    const cropper = cropperRef.current?.cropper
    if (cropper) {
      const newScaleX = scaleX === 1 ? -1 : 1
      cropper.scaleX(newScaleX)
      setScaleX(newScaleX)
    }
  }

  const onFlipV = () => {
    const cropper = cropperRef.current?.cropper
    if (cropper) {
      const newScaleY = scaleY === 1 ? -1 : 1
      cropper.scaleY(newScaleY)
      setScaleY(newScaleY)
    }
  }

  const onReset = () => {
    const cropper = cropperRef.current?.cropper
    if (cropper) {
      cropper.reset()
      setScaleX(1)
      setScaleY(1)
      setDragMode('move')
    }
  }

  const onZoomIn = () => {
    const cropper = cropperRef.current?.cropper
    if (cropper) {
      cropper.zoom(0.1)
    }
  }

  const onZoomOut = () => {
    const cropper = cropperRef.current?.cropper
    if (cropper) {
      cropper.zoom(-0.1)
    }
  }

  const toggleDragMode = () => {
    setDragMode(prev => prev === 'crop' ? 'move' : 'crop')
  }

  // Upload processed image
  const onSave = async () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return

    setIsUploading(true)
    onUploadStart?.()
    setError(null)

    try {
      // Get the processed image blob
      const blob = await new Promise<Blob | null>((resolve) => {
        cropper.getCroppedCanvas({
          width: 800,
          height: 450,
          imageSmoothingQuality: 'high'
        }).toBlob(resolve, 'image/webp', 0.9)
      })

      if (!blob) throw new Error('Failed to process image')

      const formData = new FormData()
      formData.append('file', blob, 'image.webp')
      
      const sessionToken = localStorage.getItem('admin_session')
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {

          'Authorization': sessionToken ? `Bearer ${sessionToken}` : '',
        },
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await response.json()
      
      if (previewUrl && previewUrl.startsWith('blob:') && previewUrl !== initialImage) {
        URL.revokeObjectURL(previewUrl)
      }
      
      setPreviewUrl(data.imageUrl)
      onImageChange(data.imageUrl)
      
      // Exit editing mode
      setIsEditing(false)
      setOriginalFile(null)
      
    } catch (err) {
      logger.error(`Upload error: ${err}`)
      setError(err instanceof Error ? err.message : 'อัพโหลดไม่สำเร็จ')
    } finally {
      setIsUploading(false)
      onUploadEnd?.()
    }
  }

  const handleRemove = useCallback(() => {
    if (previewUrl && previewUrl.startsWith('blob:') && previewUrl !== initialImage) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl('')
    setOriginalFile(null)
    setIsEditing(false)
    setShowUrlInput(false)
    setUrlInputValue('')
    onImageChange('')
  }, [previewUrl, initialImage, onImageChange])

  // URL handling
  const handleUrlSubmit = useCallback(() => {
    if (urlInputValue.trim()) {
        // Safe remove old preview if it was a blob
        if (previewUrl && previewUrl.startsWith('blob:') && previewUrl !== initialImage) {
            URL.revokeObjectURL(previewUrl)
        }
        
      setPreviewUrl(urlInputValue.trim())
      onImageChange(urlInputValue.trim())
      setShowUrlInput(false)
    }
  }, [urlInputValue, onImageChange, previewUrl, initialImage])

  // Cleanup
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:') && previewUrl !== initialImage) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl, initialImage])

  // Handle paste event for clipboard images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't handle if we're in URL input mode or already editing
      if (showUrlInput) return
      
      const items = e.clipboardData?.items
      if (!items) return
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            handleFileSelect(file)
            break
          }
        }
      }
    }
    
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [showUrlInput, handleFileSelect])

  return (
    <div className="image-editor">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />
      
      {!previewUrl && !showUrlInput ? (
        <div 
          className={`image-editor-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadIcon size={40} />
          <p>ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
          <span className="image-editor-hint">หรือกด Ctrl+V เพื่อวางรูปจาก clipboard</span>
          <span className="image-editor-hint mt-1">รองรับ: JPG, PNG, WebP, GIF (สูงสุด 10MB)</span>
        </div>
      ) : showUrlInput ? (
        <div className="image-editor-url-mode">
          <div className="image-editor-url-header">
            <LinkIcon size={20} />
            <span>ใส่ URL รูปภาพ</span>
          </div>
          <div className="image-editor-url-form">
            <input
              type="text"
              className="input"
              placeholder="https://example.com/image.png"
              value={urlInputValue}
              onChange={(e) => setUrlInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              autoFocus
            />
            <button 
              type="button" 
              className="image-editor-btn image-editor-btn-primary"
              onClick={handleUrlSubmit}
              disabled={!urlInputValue.trim()}
            >
              <CheckIcon size={16} />
              ใช้ URL
            </button>
          </div>
          <button 
            type="button" 
            className="image-editor-btn"
            onClick={() => setShowUrlInput(false)}
          >
            ← กลับไปอัพโหลดไฟล์
          </button>
        </div>
      ) : (
        <div className="image-editor-preview-container">
          {isEditing ? (
            <div className="cropper-wrapper">
              <Cropper
                ref={cropperRef}
                className="h-[400px] w-full"
                initialAspectRatio={16 / 9}
                aspectRatio={16 / 9}
                preview=".img-preview"
                src={previewUrl}
                viewMode={1}
                guides={true}
                minCropBoxHeight={10}
                minCropBoxWidth={10}
                background={true}
                responsive={true}
                autoCropArea={1}
                checkOrientation={false}
                dragMode={dragMode}
              />
            </div>
          ) : (
             <div className="image-editor-preview">
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img 
                 src={previewUrl} 
                 alt="Preview" 
                 className="max-w-full max-h-[300px] object-contain"
               />
             </div>
          )}

          {/* Toolbar */}
          {isEditing && (
            <div className="image-editor-toolbar">
              <div className="image-editor-toolbar-group">
                <button 
                  type="button" 
                  className={`image-editor-btn ${dragMode === 'move' ? 'image-editor-btn-active' : ''}`}
                  onClick={toggleDragMode} 
                  title={dragMode === 'move' ? "เปลี่ยนเป็นโหมดตัดภาพ (Crop)" : "เปลี่ยนเป็นโหมดเลื่อนภาพ (Move)"}
                >
                  {dragMode === 'move' ? <MoveIcon size={18} /> : <CropIcon size={18} />}
                </button>
                <div className="divider-vertical" />
                <button type="button" className="image-editor-btn" onClick={onRotate} title="หมุน 90°">
                  <RotateIcon size={18} />
                </button>
                <button type="button" className="image-editor-btn" onClick={onFlipH} title="กลับซ้าย-ขวา">
                  <FlipHIcon size={18} />
                </button>
                <button type="button" className="image-editor-btn" onClick={onFlipV} title="กลับบน-ล่าง">
                  <FlipVIcon size={18} />
                </button>
                <button type="button" className="image-editor-btn" onClick={onZoomIn} title="ขยาย">
                   <ZoomInIcon size={18} />
                </button>
                <button type="button" className="image-editor-btn" onClick={onZoomOut} title="ย่อ">
                   <ZoomOutIcon size={18} />
                </button>
                <button type="button" className="image-editor-btn" onClick={onReset} title="รีเซ็ต">
                  <ResetIcon size={18} />
                </button>
              </div>

              <div className="image-editor-toolbar-actions">
                <button 
                  type="button" 
                  className="image-editor-btn" 
                  onClick={handleRemove}
                  disabled={isUploading}
                >
                  ยกเลิก
                </button>
                <button 
                  type="button" 
                  className="image-editor-btn image-editor-btn-primary" 
                  onClick={onSave}
                  disabled={isUploading}
                >
                   {isUploading ? <span className="spinner-small" /> : <CheckIcon size={16} />}
                   {isUploading ? ' กำลังบันทึก...' : ' บันทึกรูป'}
                </button>
              </div>
            </div>
          )}

           {/* View Mode Toolbar */}
           {!isEditing && (
            <div className="image-editor-toolbar">
               <div className="image-editor-toolbar-group">
                 <button type="button" className="image-editor-btn" onClick={() => fileInputRef.current?.click()}>
                   <UploadIcon size={16} /> เปลี่ยนรูป
                 </button>
                 <button type="button" className="image-editor-btn" onClick={() => setShowUrlInput(true)}>
                   <LinkIcon size={16} /> ใช้ URL
                 </button>
               </div>
               <button type="button" className="image-editor-btn image-editor-btn-danger" onClick={handleRemove}>
                 <CloseIcon size={16} /> ลบรูป
               </button>
            </div>
           )}
        </div>
      )}

      {/* URL Option if empty */}
      {!previewUrl && !showUrlInput && (
        <div className="image-editor-or-divider">
          <span>หรือ</span>
          <button type="button" className="image-editor-btn" onClick={() => setShowUrlInput(true)}>
            <LinkIcon size={16} /> ใช้ URL รูปภาพ
          </button>
        </div>
      )}

      {error && <div className="image-editor-error">{error}</div>}

      <style jsx global>{`
        /* Override cropper css mostly for dark mode integration if needed */
        .cropper-bg {
          background-repeat: repeat;
        }
        .cropper-point {
          background-color: var(--primary);
        }
      `}</style>

      <style jsx>{`
        .image-editor { width: 100%; }
        .image-editor-dropzone {
          border: 2px dashed var(--border);
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
          background: var(--muted);
          transition: all 0.2s;
        }
        .image-editor-dropzone:hover, .image-editor-dropzone.dragging {
          border-color: var(--primary);
          background: rgba(var(--primary-rgb), 0.05);
        }
        .image-editor-preview-container {
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          background: var(--card);
        }
        .image-editor-preview {
          background: #1a1a1a;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 200px;
        }
        .image-editor-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          background: var(--card);
          border-top: 1px solid var(--border);
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .image-editor-toolbar-group { display: flex; gap: 0.375rem; }
        .image-editor-toolbar-actions { display: flex; gap: 0.5rem; }
        
        .divider-vertical {
          width: 1px;
          background: var(--border);
          margin: 0 0.25rem;
          height: 24px;
          align-self: center;
        }

        .image-editor-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.375rem;
          padding: 0.5rem;
          font-size: 0.8125rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--background);
          color: var(--foreground);
          cursor: pointer;
          min-width: 36px;
          min-height: 36px;
        }
        .image-editor-btn:hover:not(:disabled) {
           background: var(--muted);
           border-color: var(--foreground);
        }
        .image-editor-btn-active {
          background: var(--primary);
          color: var(--primary-foreground);
          border-color: var(--primary);
        }
        .image-editor-btn-active:hover:not(:disabled) {
           background: var(--primary);
           opacity: 0.9;
        }
        .image-editor-btn-primary {
          background: var(--primary);
          color: var(--primary-foreground);
          border-color: var(--primary);
          padding: 0.5rem 1rem;
        }
        .image-editor-btn-primary:hover:not(:disabled) {
          opacity: 0.9;
          background: var(--primary);
        }
        .image-editor-btn-danger {
           color: #ef4444;
           border-color: rgba(239, 68, 68, 0.3);
           padding: 0.5rem 1rem;
        }
        .image-editor-btn-danger:hover {
           background: rgba(239, 68, 68, 0.1);
           border-color: #ef4444;
        }
        .image-editor-url-mode {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem;
          background: var(--card);
        }
        .image-editor-url-header {
           display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;
        }
        .image-editor-url-form {
           display: flex; gap: 0.5rem; margin-bottom: 1rem;
        }
        .image-editor-url-form .input { flex: 1; }
        .image-editor-error {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #ef4444;
        }
        .image-editor-or-divider {
           display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem;
        }
        .spinner-small {
           width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.75s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
