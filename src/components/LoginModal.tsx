'use client'

import { useState } from 'react'
import { GameControllerIcon, CloseIcon, QuestionIcon } from './Icons'
import { apiFetch } from '@/lib/apiFetch'
import { logger } from '@/lib/logger'


interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: { id: string; minecraftName: string }) => void
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [playerName, setPlayerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Verify player exists via RCON (using seen command)
      const verifyRes = await apiFetch('/api/rcon/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName }),
      })
      
      const verifyData = await verifyRes.json()
      
      if (!verifyData.success) {
        setError(verifyData.error || 'ไม่พบผู้เล่นนี้ในเซิร์ฟเวอร์ กรุณาตรวจสอบชื่อให้ถูกต้อง')
        setLoading(false)
        return
      }

      if (!verifyData.hasPlayed) {
        setError('ผู้เล่นนี้ไม่เคยเข้าเซิร์ฟเวอร์ กรุณาเข้าเล่นอย่างน้อย 1 ครั้งก่อน')
        setLoading(false)
        return
      }

      // Create or get user
      const userRes = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minecraftName: playerName }),
      })
      
      const user = await userRes.json()
      
      if (user.error) {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
        setLoading(false)
        return
      }

      // Store user in localStorage (including shopToken if present)
      localStorage.setItem('user', JSON.stringify(user))
      
      // Call success callback
      onSuccess(user)
    } catch (err) {
      logger.error(`Login error: ${err}`)
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GameControllerIcon size={24} />
            เข้าสู่ระบบ
          </h2>
          <button className="btn btn-icon" onClick={onClose} disabled={loading}>
            <CloseIcon size={20} />
          </button>
        </div>

        <p style={{ color: 'var(--muted-foreground)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          กรุณาใส่ชื่อ Minecraft ของคุณเพื่อดำเนินการต่อ
        </p>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">ชื่อผู้เล่น Minecraft</label>
            <input
              type="text"
              className="input"
              placeholder="กรอกชื่อผู้เล่นในเกม"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading || !playerName.trim()}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16 }} />
                กำลังตรวจสอบ...
              </>
            ) : (
              'เข้าสู่ระบบ'
            )}
          </button>
        </form>

        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem',
          color: 'var(--muted-foreground)',
        }}>
          <QuestionIcon size={16} />
          ต้องเป็นผู้เล่นที่เคยเข้าเซิร์ฟเวอร์เท่านั้น
        </div>
      </div>
    </div>
  )
}
