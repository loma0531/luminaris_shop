import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth, generateShopToken } from '@/lib/adminAuth'
import { validatePagination } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { logger, createTimer } from '@/lib/logger'
import { verifyAuthMePassword } from '@/lib/mysql'
import { z } from 'zod'

// Zod Schema for User Creation
const UserCreateSchema = z.object({
  minecraftName: z.string()
    .min(3, 'Name too short')
    .max(16, 'Name too long')
    .regex(/^[a-zA-Z0-9_]+$/, 'Invalid characters in Minecraft name'),
  password: z.string().min(1, 'Password is required')
})

export async function GET(request: NextRequest) {
  const timer = createTimer()
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = validatePagination(searchParams.get('page'), searchParams.get('limit'), 50)
    const search = searchParams.get('search') || ''

    const whereClause: any = {}
    if (search) {
      whereClause.minecraftName = {
        contains: search,
        mode: 'insensitive'
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        skip, take: limit,
        select: { id: true, minecraftName: true, lastLogin: true, totalSpent: true, coins: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({
        where: whereClause
      }),
    ])

    // Get minecraftNames for the current page of users
    const minecraftNames = users.map(u => u.minecraftName)

    // Single groupBy query to get all totalSpent values at once
    const spentByUser = await prisma.order.groupBy({
      by: ['minecraftName'],
      where: { 
        minecraftName: { in: minecraftNames },
        status: 'COMPLETED' 
      },
      _sum: { total: true },
    })

    // Create a map for O(1) lookup
    const spentMap = new Map(
      spentByUser.map(item => [item.minecraftName, item._sum.total || 0])
    )

    // Map users with their totalSpent
    const usersWithSpent = users.map(user => ({
      ...user,
      totalSpent: spentMap.get(user.minecraftName) || 0
    }))

    logger.info(`Admin viewed users list: ${users.length} users`, 200, timer())

    return NextResponse.json({
      users: usersWithSpent, total, page, totalPages: Math.ceil(total / limit),
    }, { headers: CACHE_HEADERS.NONE })
  } catch {
    logger.system.error('Failed to fetch users')
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const timer = createTimer()
  try {
    const json = await request.json()
    
    // Zod Validation
    const validation = UserCreateSchema.safeParse(json)
    if (!validation.success) {
      const errorMsg = validation.error.issues.map(e => `${e.path}: ${e.message}`).join(', ')
      logger.security.invalidInput('minecraftName_login', errorMsg)
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { minecraftName, password } = validation.data

    // Verify password against AuthMe database
    const authMeResult = await verifyAuthMePassword(minecraftName, password)
    if (!authMeResult.success) {
      logger.security.accessDenied('minecraftName_login', `Invalid credentials for: ${minecraftName}`)
      return NextResponse.json({ error: authMeResult.error || 'รหัสผ่านเซิร์ฟเวอร์ไม่ถูกต้อง' }, { status: 401 })
    }

    // 1. ค้นหาผู้เล่นในระบบแบบ Case-Insensitive ก่อน
    let user = await prisma.user.findFirst({
      where: {
        minecraftName: {
          equals: minecraftName,
          mode: 'insensitive'
        }
      },
      select: { id: true, minecraftName: true, coins: true, createdAt: true },
    })

    // กำหนดชื่อทางการ: ถ้ามีใน DB แล้วใช้ตาม DB (ถ้ามีข้อมูลตรงก็ดำเนินการตามนั้น)
    // ถ้าไม่มี ใช้ตามที่ผู้ใช้กรอกเข้ามา (ผู้เล่นใส่ยังไงก็เชื่อไปก่อน)
    const officialMinecraftName = user ? user.minecraftName : minecraftName

    if (!user) {
      user = await prisma.user.create({
        data: { minecraftName: officialMinecraftName },
        select: { id: true, minecraftName: true, coins: true, createdAt: true },
      })
      logger.auth.userCreated(officialMinecraftName, timer())
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      })
      logger.auth.userLogin(officialMinecraftName, timer())
    }

    // Generate shop session token
    const shopToken = await generateShopToken(officialMinecraftName)

    return NextResponse.json({ ...user, minecraftName: officialMinecraftName, shopToken })
  } catch {
    logger.system.error('Failed to process user login')
    return NextResponse.json({ error: 'Failed to process login' }, { status: 500 })
  }
}
