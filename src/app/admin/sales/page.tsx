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
    <div className="flex items-end gap-2 h-[200px] py-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="skeleton flex-1 rounded-t"
          style={{
            height: `${30 + Math.random() * 70}%`,
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
      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
        ไม่มีข้อมูล
      </div>
    )
  }

  const maxAmount = Math.max(...data.map(d => d.amount), 1)

  return (
    <div className="flex flex-col" style={{ height: maxHeight }}>
      {/* Chart area */}
      <div className="flex-1 flex items-end gap-1 pb-8 relative">
        {data.map((item, index) => {
          const heightPercent = (item.amount / maxAmount) * 100
          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center h-full justify-end"
            >
              {/* Tooltip on hover */}
              <div
                className="w-full max-w-[40px] rounded-t cursor-pointer transition-opacity duration-150 relative"
                style={{
                  height: `${Math.max(heightPercent, 2)}%`,
                  background: item.amount > 0 
                    ? 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)' 
                    : 'var(--border)',
                }}
                title={`${item.label}: ฿${item.amount.toLocaleString()} (${item.count} ครั้ง)`}
              />
              {/* Label */}
              <div className="absolute bottom-0 text-[0.625rem] text-muted-foreground whitespace-nowrap">
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

    // 🔄 Auto Update every 60s
    const interval = setInterval(() => {
      fetchSales()
    }, 60000)

    return () => clearInterval(interval)
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
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <WalletIcon size={24} />
        สรุปยอดเติมเงิน
      </h1>

      {/* Period Selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
          <button
            key={p}
            className={`btn min-w-[120px] flex items-center justify-center gap-2 ${period === p ? 'btn-primary' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {periodConfig[p].icon}
            {periodConfig[p].label}
          </button>
        ))}
      </div>

      {/* Period Description */}
      <div className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
        {periodConfig[period].icon}
        {periodConfig[period].description}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6">
        <div className="card p-5">
          <div className="text-sm text-muted-foreground mb-2">
            ยอดเติมเงินรวม
          </div>
          {loading ? (
            <div className="skeleton w-[60%] h-7" />
          ) : (
            <div className="text-3xl font-bold text-success">
              ฿{data?.summary.totalAmount.toLocaleString() || 0}
            </div>
          )}
        </div>
        <div className="card p-5">
          <div className="text-sm text-muted-foreground mb-2">
            จำนวนการเติมเงิน
          </div>
          {loading ? (
            <div className="skeleton w-[50%] h-7" />
          ) : (
            <div className="text-3xl font-bold">
              {data?.summary.totalCount.toLocaleString() || 0} ครั้ง
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
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
        <div className="card p-6 mt-6">
          <h2 className="text-base font-semibold mb-4">
            รายละเอียด
          </h2>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>ช่วงเวลา</th>
                  <th className="text-right">ยอดเงิน</th>
                  <th className="text-right">จำนวนครั้ง</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((item, index) => (
                  <tr key={index}>
                    <td>{item.label}</td>
                    <td className="text-right text-success font-medium">
                      ฿{item.amount.toLocaleString()}
                    </td>
                    <td className="text-right">{item.count}</td>
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
