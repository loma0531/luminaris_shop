'use client'

import { useState, useEffect, useCallback } from 'react'
import { WalletIcon, ChartIcon, CalendarDayIcon, CalendarWeekIcon, CalendarMonthIcon } from '@/components/Icons'
import { adminFetch } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'

type Period = 'daily' | 'weekly' | 'monthly'

interface SalesData {
  label: string
  amount: number
  count: number
}

interface SalesResponse {
  period: Period
  data: SalesData[]
  summary: {
    totalAmount: number
    totalCount: number
  }
}

// Skeleton for loading state
function SkeletonChart() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 200, padding: '1rem 0' }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            flex: 1,
            height: `${30 + Math.random() * 70}%`,
            borderRadius: '0.25rem 0.25rem 0 0',
          }}
        />
      ))}
    </div>
  )
}

// Bar Chart component
function BarChart({ data, maxHeight = 250 }: { data: SalesData[]; maxHeight?: number }) {
  if (data.length === 0) {
    return (
      <div style={{ 
        height: maxHeight, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: 'var(--muted-foreground)'
      }}>
        ไม่มีข้อมูล
      </div>
    )
  }

  const maxAmount = Math.max(...data.map(d => d.amount), 1)

  return (
    <div style={{ height: maxHeight, display: 'flex', flexDirection: 'column' }}>
      {/* Chart area */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'flex-end', 
        gap: '0.25rem',
        paddingBottom: '2rem',
        position: 'relative',
      }}>
        {data.map((item, index) => {
          const heightPercent = (item.amount / maxAmount) * 100
          return (
            <div
              key={index}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                justifyContent: 'flex-end',
              }}
            >
              {/* Tooltip on hover */}
              <div
                style={{
                  width: '100%',
                  maxWidth: 40,
                  height: `${Math.max(heightPercent, 2)}%`,
                  background: item.amount > 0 
                    ? 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)' 
                    : 'var(--border)',
                  borderRadius: '0.25rem 0.25rem 0 0',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                  position: 'relative',
                }}
                title={`${item.label}: ฿${item.amount.toLocaleString()} (${item.count} ครั้ง)`}
              />
              {/* Label */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                fontSize: '0.625rem',
                color: 'var(--muted-foreground)',
                whiteSpace: 'nowrap',
              }}>
                {item.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function SalesPage() {
  const [period, setPeriod] = useState<Period>('daily')
  const [data, setData] = useState<SalesResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/sales?period=${period}`)
      const json = await res.json()
      setData(json)
    } catch (error) {
      logger.error(`Error fetching sales: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchSales()
  }, [fetchSales])

  const periodConfig: Record<Period, { label: string; icon: React.ReactNode; description: string }> = {
    daily: { 
      label: 'รายวัน', 
      icon: <CalendarDayIcon size={16} />,
      description: '00:00 - 23:59 (อัพเดททุกชั่วโมง)'
    },
    weekly: { 
      label: 'รายสัปดาห์', 
      icon: <CalendarWeekIcon size={16} />,
      description: 'เริ่มจากวันจันทร์ (อัพเดททุกวัน)'
    },
    monthly: { 
      label: 'รายเดือน', 
      icon: <CalendarMonthIcon size={16} />,
      description: 'เริ่มจากต้นเดือน (อัพเดททุกวัน)'
    },
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
        สรุปยอดเติมเงิน
      </h1>

      {/* Period Selector */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}>
        {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
          <button
            key={p}
            className={`btn ${period === p ? 'btn-primary' : ''}`}
            onClick={() => setPeriod(p)}
            style={{ 
              minWidth: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            {periodConfig[p].icon}
            {periodConfig[p].label}
          </button>
        ))}
      </div>

      {/* Period Description */}
      <div style={{ 
        fontSize: '0.875rem', 
        color: 'var(--muted-foreground)', 
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        {periodConfig[period].icon}
        {periodConfig[period].description}
      </div>

      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
            ยอดเติมเงินรวม
          </div>
          {loading ? (
            <div className="skeleton" style={{ width: '60%', height: '1.75rem' }} />
          ) : (
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#22c55e' }}>
              ฿{data?.summary.totalAmount.toLocaleString() || 0}
            </div>
          )}
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
            จำนวนการเติมเงิน
          </div>
          {loading ? (
            <div className="skeleton" style={{ width: '50%', height: '1.75rem' }} />
          ) : (
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
              {data?.summary.totalCount.toLocaleString() || 0} ครั้ง
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ 
          fontSize: '1rem', 
          fontWeight: 600, 
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <ChartIcon size={20} />
          กราฟยอดเติมเงิน{periodConfig[period].label}
        </h2>
        
        {loading ? (
          <SkeletonChart />
        ) : (
          <BarChart data={data?.data || []} />
        )}
      </div>

      {/* Data Table */}
      {!loading && data && data.data.length > 0 && (
        <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
          <h2 style={{ 
            fontSize: '1rem', 
            fontWeight: 600, 
            marginBottom: '1rem',
          }}>
            รายละเอียด
          </h2>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>ช่วงเวลา</th>
                  <th style={{ textAlign: 'right' }}>ยอดเงิน</th>
                  <th style={{ textAlign: 'right' }}>จำนวนครั้ง</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((item, index) => (
                  <tr key={index}>
                    <td>{item.label}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', fontWeight: 500 }}>
                      ฿{item.amount.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
