import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { CACHE_HEADERS } from '@/lib/cache'
import { sanitizeString } from '@/lib/inputValidation'
import { logger, createTimer } from '@/lib/logger'
import { getCachedCategories, setCachedCategories, invalidateCategoryCache } from '@/lib/redis'

interface CategoryWithCount {
  id: string
  name: string
  description: string | null
  icon: string | null
  sortOrder: number
  createdAt: Date
  _count: { products: number }
}

export async function GET() {
  const timer = createTimer()
  try {
    // Try cache first (1-5ms)
    const cached = await getCachedCategories<CategoryWithCount>()
    if (cached) {
      logger.debug(`Categories served from cache: ${cached.length} items`)
      return NextResponse.json(cached, { headers: CACHE_HEADERS.MEDIUM })
    }

    // Cache miss - query database
    const categories = await prisma.category.findMany({
      select: {
        id: true, name: true, description: true, icon: true, sortOrder: true, createdAt: true,
        _count: { select: { products: true } },
      },
      orderBy: { sortOrder: 'asc' },
    })
    
    // Cache the result
    await setCachedCategories(categories)
    
    logger.category.listViewed(categories.length, timer())
    
    return NextResponse.json(categories, { headers: CACHE_HEADERS.MEDIUM })
  } catch {
    logger.system.error('Failed to fetch categories')
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500, headers: CACHE_HEADERS.NONE })
  }
}

export async function POST(request: NextRequest) {
  const timer = createTimer()
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { name, description, icon } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }
    
    const sanitizedName = sanitizeString(name, 50)
    if (sanitizedName.length === 0) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const existingCategory = await prisma.category.findFirst({
      where: { name: sanitizedName }, select: { id: true }
    })

    if (existingCategory) {
      logger.category.duplicateNameAttempt(sanitizedName)
      return NextResponse.json({ error: 'Category name already exists' }, { status: 400 })
    }

    const maxSortOrder = await prisma.category.findFirst({
      orderBy: { sortOrder: 'desc' }, select: { sortOrder: true }
    })

    const category = await prisma.category.create({
      data: {
        name: sanitizedName,
        description: description ? sanitizeString(description, 200) : null,
        icon: icon ? sanitizeString(icon, 50) : null,
        sortOrder: (maxSortOrder?.sortOrder ?? 0) + 1,
      },
    })

    logger.category.created(category.id, sanitizedName, timer())

    // Invalidate cache so new category appears immediately
    await invalidateCategoryCache()

    return NextResponse.json(category, { status: 201 })
  } catch {
    logger.system.error('Failed to create category')
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
