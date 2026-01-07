import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'

type Period = 'daily' | 'weekly' | 'monthly'

interface SalesData {
  label: string
  amount: number
  count: number
}

export async function GET(request: NextRequest) {
  const timer = createTimer()
  // Verify admin auth
  const authResult = await requireAdminAuth(request)
  if (authResult) return authResult

  try {
    const searchParams = request.nextUrl.searchParams
    const period: Period = (searchParams.get('period') as Period) || 'daily'
    
    // Get current time
    const now = new Date()
    
    // Determine date range based on period
    let startDate: Date
    let filterPayments: { amount: number; createdAt: Date }[] = []
    
    if (period === 'daily') {
      // Start from 00:00 of today
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    } else if (period === 'weekly') {
      // Start from Monday of the current week
      const dayOfWeek = now.getDay()
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Sunday is 0, Monday is 1
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday, 0, 0, 0, 0)
    } else {
      // Start from 1st of the current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    }

    // Get filtered payments from startDate
    filterPayments = await prisma.payment.findMany({
      where: { 
        status: 'VERIFIED',
        createdAt: { gte: startDate }
      },
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Aggregate by period
    const aggregated = aggregateByPeriod(filterPayments, period, startDate, now)
    
    // Calculate totals for the period
    const totalAmount = filterPayments.reduce((sum, p) => sum + p.amount, 0)
    const totalCount = filterPayments.length

    logger.info(`Sales report viewed (${period})`, 200, timer())

    return NextResponse.json({
      period,
      data: aggregated,
      summary: {
        totalAmount,
        totalCount,
      }
    })
  } catch {
    logger.system.error('Failed to fetch sales data')
    return NextResponse.json({ error: 'Failed to fetch sales data' }, { status: 500 })
  }
}

function aggregateByPeriod(
  payments: { amount: number; createdAt: Date }[],
  period: Period,
  startDate: Date,
  now: Date
): SalesData[] {
  const result: SalesData[] = []

  if (period === 'daily') {
    // Generate 24 hours (00:00 - 23:00) for today
    const currentHour = now.getHours()
    
    for (let hour = 0; hour <= currentHour; hour++) {
      const hourStart = new Date(startDate)
      hourStart.setHours(hour, 0, 0, 0)
      const hourEnd = new Date(startDate)
      hourEnd.setHours(hour, 59, 59, 999)
      
      // Filter payments for this hour
      const hourPayments = payments.filter(p => {
        const paymentTime = new Date(p.createdAt)
        return paymentTime >= hourStart && paymentTime <= hourEnd
      })
      
      const amount = hourPayments.reduce((sum, p) => sum + p.amount, 0)
      const count = hourPayments.length
      
      result.push({
        label: `${hour.toString().padStart(2, '0')}:00`,
        amount,
        count,
      })
    }
  } else if (period === 'weekly') {
    // Generate 7 days starting from Monday
    const dayNames = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.']
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dayStart = new Date(startDate)
      dayStart.setDate(startDate.getDate() + dayOffset)
      dayStart.setHours(0, 0, 0, 0)
      
      const dayEnd = new Date(dayStart)
      dayEnd.setHours(23, 59, 59, 999)
      
      // Don't show future days
      if (dayStart > now) break
      
      // Filter payments for this day
      const dayPayments = payments.filter(p => {
        const paymentTime = new Date(p.createdAt)
        return paymentTime >= dayStart && paymentTime <= dayEnd
      })
      
      const amount = dayPayments.reduce((sum, p) => sum + p.amount, 0)
      const count = dayPayments.length
      
      const dayOfMonth = dayStart.getDate()
      const month = dayStart.getMonth() + 1
      
      result.push({
        label: `${dayNames[dayOffset]} ${dayOfMonth}/${month}`,
        amount,
        count,
      })
    }
  } else {
    // Monthly - Generate all days from start of month to today
    const currentDay = now.getDate()
    
    for (let day = 1; day <= currentDay; day++) {
      const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), day, 0, 0, 0, 0)
      const dayEnd = new Date(startDate.getFullYear(), startDate.getMonth(), day, 23, 59, 59, 999)
      
      // Filter payments for this day
      const dayPayments = payments.filter(p => {
        const paymentTime = new Date(p.createdAt)
        return paymentTime >= dayStart && paymentTime <= dayEnd
      })
      
      const amount = dayPayments.reduce((sum, p) => sum + p.amount, 0)
      const count = dayPayments.length
      
      result.push({
        label: `${day}`,
        amount,
        count,
      })
    }
  }

  return result
}
