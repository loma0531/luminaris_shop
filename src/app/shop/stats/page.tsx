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
  
  if (rank > 3) return <span className="font-semibold">{rank}</span>
  
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
        <WalletIcon size={48} className="opacity-50 mb-4" />
        <p>ไม่สามารถโหลดข้อมูลได้</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <WalletIcon size={24} />
        สถิติการเติมเงิน
      </h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-8">
        <div className="card p-5">
          <div className="text-sm text-muted-foreground mb-2">
            ยอดเติมเงินรวม
          </div>
          <div className="text-3xl font-bold text-success">
            ฿{data.totalAmount.toLocaleString()}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-muted-foreground mb-2">
            จำนวนการเติมเงิน
          </div>
          <div className="text-3xl font-bold">
            {data.totalCount.toLocaleString()} ครั้ง
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
        {/* Leaderboard */}
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            🏆 อันดับผู้เติมเงินสูงสุด
          </h2>
          
          {data.leaderboard.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              ยังไม่มีข้อมูล
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.leaderboard.map((entry, index) => (
                <div 
                  key={entry.minecraftName}
                  className={`flex items-center gap-3 p-3 rounded-lg ${index < 3 ? 'bg-muted' : ''}`}
                >
                  <div className="w-6 text-center">
                    <TrophyRankIcon rank={index + 1} />
                  </div>
                  <Image
                    src={`https://mc-heads.net/avatar/${getSkinName(entry.minecraftName)}/24`}
                    alt="Head"
                    width={24}
                    height={24}
                    className="rounded"
                  />
                  <span className="flex-1 font-medium">{entry.minecraftName}</span>
                  <div className="text-right">
                    <div className="font-semibold text-success">
                      ฿{entry.total.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {entry.count} ครั้ง
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <ClockIcon size={18} />
            การเติมเงินล่าสุด
          </h2>
          
          {data.recentTransactions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              ยังไม่มีข้อมูล
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.recentTransactions.map((tx, index) => (
                <div 
                  key={index}
                  className={`flex items-center gap-3 py-2 ${index < data.recentTransactions.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <Image
                    src={`https://mc-heads.net/avatar/${getSkinName(tx.minecraftName)}/20`}
                    alt="Head"
                    width={20}
                    height={20}
                    className="rounded"
                  />
                  <span className="flex-1 text-sm">{tx.minecraftName}</span>
                  <div className="text-right">
                    <div className="font-medium text-success text-sm">
                      +฿{tx.amount.toLocaleString()}
                    </div>
                    <div className="text-[0.6875rem] text-muted-foreground">
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
