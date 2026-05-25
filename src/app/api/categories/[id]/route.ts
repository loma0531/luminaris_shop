import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { isValidObjectId, sanitizeString } from '@/lib/inputValidation'
import { logger, createTimer } from '@/lib/logger'
import { invalidateCategoryCache } from '@/lib/redis'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createTimer()
  try {
    const { id } = await params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 })
    }
    
    const category = await prisma.category.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true, icon: true, sortOrder: true, createdAt: true,
        products: { select: { id: true, name: true, price: true, image: true, isActive: true } },
        _count: { select: { products: true } },
      },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    logger.category.viewed(category.name, timer())

    return NextResponse.json(category, { headers: CACHE_HEADERS.SHORT })
  } catch {
    logger.system.error('Failed to fetch category')
    return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createTimer()
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 })
    }
    
    const currentCategory = await prisma.category.findUnique({
      where: { id }, select: { name: true }
    })
    
    if (!currentCategory) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    
    const body = await request.json()
    const { name, description, icon, sortOrder } = body

    if (name !== undefined) {
      if (typeof name !== 'string') {
        return NextResponse.json({ error: 'Invalid name format' }, { status: 400 })
      }
      const sanitizedName = sanitizeString(name, 50)
      if (sanitizedName.length === 0) {
        return NextResponse.json({ error: 'Category name cannot be empty' }, { status: 400 })
      }
    }

    if (name) {
      const existingCategory = await prisma.category.findFirst({
        where: { name: sanitizeString(name, 50), id: { not: id } },
        select: { id: true }
      })
      if (existingCategory) {
        logger.category.duplicateNameAttempt(name)
        return NextResponse.json({ error: 'Category name already exists' }, { status: 400 })
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: { 
        name: name ? sanitizeString(name, 50) : undefined,
        description: description !== undefined ? sanitizeString(description, 200) : undefined,
        icon: icon !== undefined ? sanitizeString(icon, 50) : undefined,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : undefined,
      },
    })

    logger.category.updated(id, category.name, timer())

    // Invalidate cache so changes appear immediately
    await invalidateCategoryCache()

    return NextResponse.json(category)
  } catch {
    logger.system.error('Failed to update category')
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createTimer()
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 })
    }
    
    const category = await prisma.category.findUnique({
      where: { id }, select: { name: true }
    })
    
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    
    const productsCount = await prisma.product.count({ where: { categoryId: id } })

    if (productsCount > 0) {
      logger.category.deleteBlocked(id, category.name, productsCount)
      return NextResponse.json({ error: `Cannot delete category with ${productsCount} products` }, { status: 400 })
    }

    await prisma.category.delete({ where: { id } })
    
    logger.category.deleted(id, category.name, timer())

    // Invalidate cache so deletion appears immediately
    await invalidateCategoryCache()
    
    return NextResponse.json({ success: true })
  } catch {
    logger.system.error('Failed to delete category')
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
