'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { UserIcon, EyeIcon, EyeOffIcon, LockIcon, ClockIcon, SparklesIcon } from '@/components/Icons'
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

// Check if player is Bedrock (has BR_ prefix)
function isBedrock(minecraftName: string): boolean {
  return minecraftName.startsWith('BR_')
}

// Get clean name (remove BR_ prefix for Bedrock)
function getCleanName(minecraftName: string): string {
  if (isBedrock(minecraftName)) {
    return minecraftName.substring(3)
  }
  return minecraftName
}

// Get avatar URL based on platform
function getAvatarUrl(minecraftName: string, size: number): string {
  const cleanName = getCleanName(minecraftName)
  // mc-heads.net works for both Java and Bedrock usernames
  return `https://mc-heads.net/avatar/${cleanName}/${size}`
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

// 3D Skin Viewer Component
function SkinViewer3D({ minecraftName }: { minecraftName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<import('skinview3d').SkinViewer | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [skinUrl, setSkinUrl] = useState<string | null>(null)

  // Fetch skin URL based on platform
  useEffect(() => {
    const fetchSkinUrl = async () => {
      const isBedrockPlayer = isBedrock(minecraftName)
      const cleanName = getCleanName(minecraftName)
      
      if (isBedrockPlayer) {
        // Bedrock: Use GeyserMC API
        try {
          // Step 1: Get XUID from gamertag
          const xuidResponse = await fetch(`https://api.geysermc.org/v2/xbox/xuid/${cleanName}`)
          if (xuidResponse.ok) {
            const xuidData = await xuidResponse.json()
            if (xuidData.xuid) {
              // Step 2: Get skin texture ID from XUID
              const skinResponse = await fetch(`https://api.geysermc.org/v2/skin/${xuidData.xuid}`)
              if (skinResponse.ok) {
                const skinData = await skinResponse.json()
                if (skinData.texture_id) {
                  setSkinUrl(`https://textures.minecraft.net/texture/${skinData.texture_id}`)
                  return
                }
              }
            }
          }
        } catch (error) {
          logger.error(`Error fetching Bedrock skin: ${error}`)
        }
        // Fallback to mc-heads.net
        setSkinUrl(`https://mc-heads.net/skin/${cleanName}`)
      } else {
        // Java: Use mc-heads.net directly
        setSkinUrl(`https://mc-heads.net/skin/${cleanName}`)
      }
    }

    fetchSkinUrl()
  }, [minecraftName])

  useEffect(() => {
    if (!skinUrl) return

    let mounted = true

    const initViewer = async () => {
      if (!canvasRef.current) return

      try {
        const skinview3d = await import('skinview3d')
        
        if (!mounted || !canvasRef.current) return

        // Clean up existing viewer
        if (viewerRef.current) {
          viewerRef.current.dispose()
        }

        viewerRef.current = new skinview3d.SkinViewer({
          canvas: canvasRef.current,
          width: 280,
          height: 400,
          skin: skinUrl,
        })

        // Configure viewer - VERY BRIGHT lighting
        viewerRef.current.zoom = 0.9
        viewerRef.current.globalLight.intensity = 3.0  // Very bright
        viewerRef.current.cameraLight.intensity = 2.0   // Very bright camera light

        // Add idle animation
        viewerRef.current.animation = new skinview3d.IdleAnimation()
        viewerRef.current.animation.speed = 0.5

        // Set initial rotation
        viewerRef.current.playerObject.rotation.y = -0.3

        setIsLoaded(true)
      } catch (error) {
        logger.error(`Error initializing skin viewer: ${error}`)
      }
    }

    initViewer()

    return () => {
      mounted = false
      if (viewerRef.current) {
        viewerRef.current.dispose()
        viewerRef.current = null
      }
    }
  }, [skinUrl])

  return (
    <div className="skin-viewer-container">
      <canvas 
        ref={canvasRef} 
        className={`skin-canvas ${isLoaded ? 'loaded' : ''}`}
      />
      {!isLoaded && (
        <div className="skin-loader">
          <div className="skin-loader-spinner" />
          <span>กำลังโหลดโมเดล...</span>
        </div>
      )}
      <div className="skin-glow" />
    </div>
  )
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUuid, setShowUuid] = useState(false)
  const router = useRouter()
  const currentUserRef = useRef<string | null>(null)

  const fetchProfile = useCallback(async (minecraftName: string) => {
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
  }, [])

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
  }, [router, fetchProfile])

  if (loading) {
    return <SkeletonProfilePage />
  }

  if (!user || !profile) {
    return (
      <div className="empty-state">
        <UserIcon size={48} className="opacity-50 mb-4" />
        <p>ไม่พบข้อมูลผู้เล่น</p>
      </div>
    )
  }

  const isBedrockPlayer = isBedrock(user.minecraftName)

  return (
    <div className="profile-page">
      {/* Page Header - Simple without box */}
      <div className="profile-header-title">
        <UserIcon size={22} />
        <h1>โปรไฟล์ผู้เล่น</h1>
      </div>

      {/* Main Content */}
      <div className="profile-main-grid">
        {/* Left - 3D Model */}
        <div className="profile-3d-section">
          <div className="model-card">
            <div className="model-header">
              <SparklesIcon size={18} />
              <span>ตัวละครของคุณ</span>
            </div>
            <SkinViewer3D minecraftName={user.minecraftName} />
            <div className="model-hint">
              ลากเพื่อหมุนดูตัวละคร
            </div>
          </div>
        </div>

        {/* Right - Info Cards */}
        <div className="profile-info-section">
          {/* Profile Card */}
          <div className="info-card profile-card-main">
            <div className="profile-identity">
              <div className="avatar-wrapper">
                <Image
                  src={getAvatarUrl(user.minecraftName, 80)}
                  alt="Minecraft Head"
                  width={80}
                  height={80}
                  className="avatar-image"
                  loading="eager"
                  priority
                  unoptimized
                />
                <div className="avatar-glow" />
              </div>
              <div className="identity-info">
                <div className="display-name">
                  {profile.displayName ? (
                    <MinecraftColoredText text={profile.displayName} />
                  ) : (
                    user.minecraftName
                  )}
                </div>
                <div className="username-row">
                  <span className="username">{user.minecraftName}</span>
                  {isBedrockPlayer && (
                    <span className="platform-badge bedrock">
                      Bedrock
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* UUID Card */}
          <div className="info-card">
            <div className="info-card-header">
              <div className="info-label">
                <LockIcon size={16} />
                <span>UUID</span>
              </div>
              <button 
                className="toggle-btn"
                onClick={() => setShowUuid(!showUuid)}
              >
                {showUuid ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                {showUuid ? 'ซ่อน' : 'แสดง'}
              </button>
            </div>
            <div className="uuid-value">
              {showUuid ? (
                profile.playerUuid || 'ไม่พบ UUID'
              ) : (
                '••••••••-••••-••••-••••-••••••••••••'
              )}
            </div>
          </div>

          {/* Activity Card */}
          <div className="info-card activity-card">
            <div className="activity-header">
              <ClockIcon size={18} />
              <span>ข้อมูลการเล่น</span>
            </div>
            <div className="activity-grid">
              <div className="activity-item">
                <div className="activity-label">เวลาเล่นรวม</div>
                <div className="activity-value highlight">
                  {formatPlayTime(profile.totalPlayTime)}
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-label">เข้าสู่ระบบล่าสุด</div>
                <div className="activity-value">
                  {formatTimestamp(profile.lastLoginTime)}
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-label">ออกจากระบบล่าสุด</div>
                <div className="activity-value">
                  {formatTimestamp(profile.lastLogoffTime)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Styles - Black & White Theme */}
      <style jsx>{`
        .profile-page {
          max-width: 1100px;
          margin: 0 auto;
        }

        .profile-header-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 2rem;
          color: #ffffff;
        }

        .profile-header-title h1 {
          font-size: 1.375rem;
          font-weight: 600;
          color: #ffffff;
        }

        .profile-main-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 1.5rem;
          align-items: start;
        }

        /* 3D Section */
        .profile-3d-section {
          position: sticky;
          top: 1rem;
        }

        .model-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1.25rem;
          overflow: hidden;
          position: relative;
        }

        .model-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.05) 0%, transparent 60%);
          pointer-events: none;
        }

        .model-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 0.75rem;
          position: relative;
          z-index: 1;
        }

        .model-hint {
          text-align: center;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 0.75rem;
          position: relative;
          z-index: 1;
        }

        /* Info Section */
        .profile-info-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .info-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1.25rem;
          transition: all 0.3s ease;
        }

        .info-card:hover {
          border-color: rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
        }

        /* Profile Main Card */
        .profile-card-main {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .profile-identity {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }

        .avatar-wrapper {
          position: relative;
          flex-shrink: 0;
        }

        .avatar-wrapper :global(.avatar-image) {
          border-radius: 16px;
          position: relative;
          z-index: 1;
        }

        .avatar-glow {
          position: absolute;
          inset: -4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          opacity: 0.5;
          filter: blur(8px);
          animation: pulse-glow 3s ease-in-out infinite;
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.5; }
        }

        .identity-info {
          flex: 1;
          min-width: 0;
        }

        .display-name {
          font-size: 1.375rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.375rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .username-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .username {
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .platform-badge {
          padding: 0.125rem 0.5rem;
          border-radius: 6px;
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .platform-badge.bedrock {
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        /* UUID Card */
        .info-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .info-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.6);
        }

        .toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          color: #ffffff;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .toggle-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .uuid-value {
          font-family: 'SF Mono', 'Menlo', monospace;
          font-size: 0.8125rem;
          color: rgba(255, 255, 255, 0.8);
          word-break: break-all;
          line-height: 1.5;
          padding: 0.75rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        /* Activity Card */
        .activity-card {
          background: rgba(255, 255, 255, 0.03);
        }

        .activity-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        .activity-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .activity-item {
          text-align: center;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.2s ease;
        }

        .activity-item:hover {
          border-color: rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.05);
        }

        .activity-label {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 0.5rem;
        }

        .activity-value {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #ffffff;
        }

        .activity-value.highlight {
          color: #ffffff;
          font-size: 1.125rem;
        }

        /* Responsive */
        @media (max-width: 900px) {
          .profile-main-grid {
            grid-template-columns: 1fr;
          }

          /* Hide 3D model on mobile */
          .profile-3d-section {
            display: none;
          }

          .activity-grid {
            grid-template-columns: 1fr;
          }

          .activity-item {
            padding: 0.875rem;
          }
        }

        @media (max-width: 480px) {
          /* Keep profile identity horizontal like desktop */
          .profile-identity {
            flex-direction: row;
            text-align: left;
            gap: 1rem;
          }

          .username-row {
            justify-content: flex-start;
          }

          .avatar-wrapper :global(.avatar-image) {
            width: 64px !important;
            height: 64px !important;
          }

          .display-name {
            font-size: 1.125rem;
          }
        }
      `}</style>

      <style jsx global>{`
        .skin-viewer-container {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }

        .skin-canvas {
          opacity: 0;
          transition: opacity 0.5s ease;
          cursor: grab;
          max-width: 100%;
        }

        .skin-canvas:active {
          cursor: grabbing;
        }

        .skin-canvas.loaded {
          opacity: 1;
        }

        .skin-loader {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.875rem;
        }

        .skin-loader-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .skin-glow {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 120px;
          height: 20px;
          background: radial-gradient(ellipse, rgba(255, 255, 255, 0.2), transparent 70%);
          filter: blur(10px);
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
