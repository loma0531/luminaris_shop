'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { WalletIcon, ClockIcon } from '@/components/Icons'
import { apiFetch } from '@/lib/apiFetch'
import { SkeletonStatsPage } from '@/components/Skeleton'
import { logger } from '@/lib/logger'

interface LeaderboardEntry {
  minecraftName: string
  total: number
  count: number
}

interface Transaction {
  minecraftName: string
  amount: number
  date: string
}

interface StatsData {
  totalAmount: number
  totalCount: number
  leaderboard: LeaderboardEntry[]
  recentTransactions: Transaction[]
}

// Trophy icon component
const TrophyRankIcon = ({ rank }: { rank: number }) => {
  const colors: Record<number, string> = {
    1: '#ffd700', // Gold
    2: '#c0c0c0', // Silver
    3: '#cd7f32', // Bronze
  }
  
  if (rank > 3) return <span style={{ fontWeight: 600 }}>{rank}</span>
  
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill={colors[rank]} stroke={colors[rank]} strokeWidth="1">
      <path d="M6 9H4V5h16v4h-2m-2 4v4H8v-4c-3 0-3-3-3-3V6h14v4s0 3-3 3zm-2 10H8v-2H6v2h12v-2h-2v2h-4z"/>
    </svg>
  )
}

// Helper to get skin name (remove BR_ prefix for Bedrock players)
function getSkinName(minecraftName: string): string {
  if (minecraftName.startsWith('BR_')) {
    return minecraftName.substring(3)
  }
  return minecraftName
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/api/stats')
      const json = await res.json()
      setData(json)
    } catch (error) {
      logger.error(`Error fetching stats: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <SkeletonStatsPage />
  }

  if (!data) {
    return (
      <div className="empty-state">
        <WalletIcon size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
        <p>ไม่สามารถโหลดข้อมูลได้</p>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 600, 
        marginBottom: '1.5rem', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem' 
      }}>
        <WalletIcon size={24} />
        สถิติการเติมเงิน
      </h1>

      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '2rem' 
      }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
            ยอดเติมเงินรวม
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#22c55e' }}>
            ฿{data.totalAmount.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
            จำนวนการเติมเงิน
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            {data.totalCount.toLocaleString()} ครั้ง
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '1.5rem' 
      }}>
        {/* Leaderboard */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h2 style={{ 
            fontSize: '1rem', 
            fontWeight: 600, 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            🏆 อันดับผู้เติมเงินสูงสุด
          </h2>
          
          {data.leaderboard.length === 0 ? (
            <p style={{ color: 'var(--muted-foreground)', textAlign: 'center', padding: '2rem 0' }}>
              ยังไม่มีข้อมูล
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.leaderboard.map((entry, index) => (
                <div 
                  key={entry.minecraftName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    background: index < 3 ? 'var(--muted)' : 'transparent',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ width: 24, textAlign: 'center' }}>
                    <TrophyRankIcon rank={index + 1} />
                  </div>
                  <Image
                    src={`https://mc-heads.net/avatar/${getSkinName(entry.minecraftName)}/24`}
                    alt="Head"
                    width={24}
                    height={24}
                    style={{ borderRadius: '0.25rem' }}
                    unoptimized
                  />
                  <span style={{ flex: 1, fontWeight: 500 }}>{entry.minecraftName}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: '#22c55e' }}>
                      ฿{entry.total.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                      {entry.count} ครั้ง
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h2 style={{ 
            fontSize: '1rem', 
            fontWeight: 600, 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <ClockIcon size={18} />
            การเติมเงินล่าสุด
          </h2>
          
          {data.recentTransactions.length === 0 ? (
            <p style={{ color: 'var(--muted-foreground)', textAlign: 'center', padding: '2rem 0' }}>
              ยังไม่มีข้อมูล
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.recentTransactions.map((tx, index) => (
                <div 
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0',
                    borderBottom: index < data.recentTransactions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <Image
                    src={`https://mc-heads.net/avatar/${getSkinName(tx.minecraftName)}/20`}
                    alt="Head"
                    width={20}
                    height={20}
                    style={{ borderRadius: '0.25rem' }}
                    unoptimized
                  />
                  <span style={{ flex: 1, fontSize: '0.875rem' }}>{tx.minecraftName}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 500, color: '#22c55e', fontSize: '0.875rem' }}>
                      +฿{tx.amount.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
                      {new Date(tx.date).toLocaleDateString('th-TH', { 
                        day: 'numeric', 
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
