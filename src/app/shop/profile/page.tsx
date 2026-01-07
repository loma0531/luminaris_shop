'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { UserIcon, PackageIcon, EyeIcon, EyeOffIcon, WalletIcon, LockIcon, ClockIcon } from '@/components/Icons'
import { MinecraftColoredText } from '@/lib/minecraftColors'
import { apiFetch } from '@/lib/apiFetch'
import { logger } from '@/lib/logger'
import { SkeletonProfilePage } from '@/components/Skeleton'

interface User {
  id: string
  minecraftName: string
}

interface ProfileData {
  displayName: string | null
  balance: number
  playerUuid: string | null
  jobs: string[]
  lastLoginTime: number | null
  lastLogoffTime: number | null
  totalPlayTime: number | null
}

// Helper to get skin name (remove BR_ prefix for Bedrock players)
function getSkinName(minecraftName: string): string {
  if (minecraftName.startsWith('BR_')) {
    return minecraftName.substring(3)
  }
  return minecraftName
}

// Format timestamp (milliseconds) to readable date
function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Format play time (milliseconds) to hours/minutes
function formatPlayTime(ms: number | null): string {
  if (!ms) return '-'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remainHours = hours % 24
    return `${days} วัน ${remainHours} ชม.`
  }
  return `${hours} ชม. ${minutes} นาที`
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUuid, setShowUuid] = useState(false)
  const router = useRouter()
  const currentUserRef = useRef<string | null>(null)

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      router.push('/shop')
      return
    }
    
    const userObj = JSON.parse(storedUser) as User
    
    // Check if user changed - reset and fetch new data
    if (currentUserRef.current !== userObj.minecraftName) {
      currentUserRef.current = userObj.minecraftName
      setUser(userObj)
      setProfile(null)
      setLoading(true)
      setShowUuid(false)
      fetchProfile(userObj.minecraftName)
    }
  }, [router])

  const fetchProfile = async (minecraftName: string) => {
    try {
      const res = await apiFetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minecraftName }),
      })
      const data = await res.json()
      
      if (data.profile) {
        setProfile(data.profile)
      }
    } catch (error) {
      logger.error(`Error fetching profile: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <SkeletonProfilePage />
  }

  if (!user || !profile) {
    return (
      <div className="empty-state">
        <UserIcon size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
        <p>ไม่พบข้อมูลผู้เล่น</p>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ 
        fontSize: '1.375rem', 
        fontWeight: 600, 
        marginBottom: '1.5rem', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem' 
      }}>
        <UserIcon size={22} />
        โปรไฟล์
      </h1>

      {/* 2 Column Layout - Equal Height */}
      <div className="profile-grid-2col" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '1rem',
        maxWidth: '900px',
        alignItems: 'start',
      }}>
        {/* Left Column - Main Info */}
        <div className="card" style={{ 
          display: 'flex', 
          flexDirection: 'column',
          padding: '1.25rem',
        }}>
          {/* Profile Header */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.875rem',
            marginBottom: '1rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border)',
          }}>
            <Image
              src={`https://mc-heads.net/avatar/${getSkinName(user.minecraftName)}/56`}
              alt="Minecraft Head"
              width={56}
              height={56}
              style={{ borderRadius: '0.5rem' }}
              unoptimized
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontSize: '1rem', 
                fontWeight: 600, 
                marginBottom: '0.125rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {profile.displayName ? (
                  <MinecraftColoredText text={profile.displayName} />
                ) : (
                  user.minecraftName
                )}
              </div>
              <div style={{ 
                fontSize: '0.75rem', 
                color: 'var(--muted-foreground)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}>
                {user.minecraftName}
                {user.minecraftName.startsWith('BR_') && (
                  <span style={{
                    padding: '0.0625rem 0.25rem',
                    background: '#3b82f6',
                    color: '#fff',
                    borderRadius: '0.1875rem',
                    fontSize: '0.5625rem',
                    fontWeight: 600,
                  }}>
                    Bedrock
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {/* Balance */}
            <div className="profile-stat-card-v2">
              <div className="profile-stat-label-v2">
                <WalletIcon size={14} />
                ยอดเงินในเกม
              </div>
              <div className="profile-stat-value-v2" style={{ color: '#22c55e' }}>
                {profile.balance.toLocaleString()} บาท
              </div>
            </div>

            {/* Jobs */}
            <div className="profile-stat-card-v2">
              <div className="profile-stat-label-v2">
                <PackageIcon size={14} />
                อาชีพ
              </div>
              <div style={{ marginTop: '0.375rem' }}>
                {profile.jobs.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {profile.jobs.map((job, index) => (
                      <span key={index} className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                        {job}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--muted-foreground)', fontSize: '0.8125rem' }}>
                    ยังไม่มีอาชีพ
                  </span>
                )}
              </div>
            </div>

            {/* UUID */}
            <div className="profile-stat-card-v2">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="profile-stat-label-v2">
                  <LockIcon size={14} />
                  UUID
                </div>
                <button 
                  className="btn btn-sm"
                  onClick={() => setShowUuid(!showUuid)}
                  style={{ 
                    padding: '0.1875rem 0.375rem', 
                    fontSize: '0.6875rem',
                    gap: '0.25rem',
                    minHeight: 'unset',
                  }}
                >
                  {showUuid ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                  {showUuid ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>
              <div style={{ 
                marginTop: '0.375rem',
                fontFamily: 'monospace',
                fontSize: '0.6875rem',
                color: 'var(--muted-foreground)',
                wordBreak: 'break-all',
                lineHeight: 1.4,
              }}>
                {showUuid ? (
                  profile.playerUuid || 'ไม่พบ UUID'
                ) : (
                  '••••••••-••••-••••-••••-••••••••••••'
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Activity Info */}
        <div className="card" style={{ 
          display: 'flex', 
          flexDirection: 'column',
          padding: '1.25rem',
        }}>
          <div style={{ 
            height: '76px',
            marginBottom: '1rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <ClockIcon size={16} />
            <span style={{ fontSize: '0.9375rem', fontWeight: 600 }}>ข้อมูลการเล่น</span>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {/* Total Play Time */}
            <div className="profile-stat-card-v2">
              <div className="profile-stat-label-v2">เวลาเล่นรวม</div>
              <div className="profile-stat-value-v2">
                {formatPlayTime(profile.totalPlayTime)}
              </div>
            </div>

            {/* Last Login */}
            <div className="profile-stat-card-v2">
              <div className="profile-stat-label-v2">เข้าสู่ระบบล่าสุด</div>
              <div className="profile-stat-value-v2-sm">
                {formatTimestamp(profile.lastLoginTime)}
              </div>
            </div>

            {/* Last Logoff */}
            <div className="profile-stat-card-v2">
              <div className="profile-stat-label-v2">ออกจากระบบล่าสุด</div>
              <div className="profile-stat-value-v2-sm">
                {formatTimestamp(profile.lastLogoffTime)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Stack columns */}
      <style jsx>{`
        @media (max-width: 640px) {
          div[style*="gridTemplateColumns: 'repeat(2, 1fr)'"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
