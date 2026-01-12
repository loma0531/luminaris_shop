'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { QuestionIcon } from '@/components/Icons'
import { apiFetch } from '@/lib/apiFetch'
import { logger } from '@/lib/logger'


export default function LoginPage() {
  const [playerName, setPlayerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Verify player exists via RCON using seen command
      const verifyRes = await apiFetch('/api/rcon/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName }),
      })
      
      const verifyData = await verifyRes.json()
      
      if (!verifyData.success) {
        setError(verifyData.error || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง')
        setLoading(false)
        return
      }

      if (!verifyData.hasPlayed) {
        setError('ไม่พบผู้เล่นนี้ในเซิร์ฟเวอร์ กรุณาเข้าเล่นอย่างน้อย 1 ครั้งก่อน')
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

      // Store user in localStorage
      localStorage.setItem('user', JSON.stringify(user))
      
      // Redirect to shop
      router.push('/shop')
    } catch (err) {
      logger.error(`Login error: ${err}`)
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-[400px] w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-2xl font-semibold mb-2">
            Luminaris Shop
          </div>
          <p className="text-muted-foreground">
            เข้าสู่ระบบด้วยชื่อผู้เล่น Minecraft
          </p>
        </div>

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
            />
          </div>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading || !playerName.trim()}
          >
            {loading ? (
              <>
                <div className="spinner w-4 h-4" />
                กำลังตรวจสอบ...
              </>
            ) : (
              'เข้าสู่ระบบ'
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-border flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <QuestionIcon size={16} />
          ต้องเป็นผู้เล่นที่เคยเข้าเซิร์ฟเวอร์เท่านั้น
        </div>

        <div className="mt-4 text-center">
          <Link href="/shop" className="btn btn-outline w-full">
            ดูสินค้าก่อนโดยไม่ต้องเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  )
}

