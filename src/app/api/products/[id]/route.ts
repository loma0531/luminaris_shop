import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { sanitizeString, validatePrice, isValidObjectId } from '@/lib/inputValidation'
import { logger, createTimer } from '@/lib/logger'
import { invalidateProductCache } from '@/lib/redis'
import { unlink } from 'fs/promises'
import path from 'path'

import { deleteFile } from '@/lib/fileUtils'

// Helper removed, using @/lib/fileUtils instead

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createTimer()
  try {
    const { id } = await params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }
    
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true, price: true, image: true, isActive: true,
        soldCount: true, categoryId: true, commands: true, createdAt: true,
        requiresInput: true, inputLabel: true, inputPlaceholder: true,
        category: { select: { id: true, name: true } }
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    logger.product.viewed(id, product.name, timer())

    return NextResponse.json(product, { headers: CACHE_HEADERS.SHORT })
  } catch {
    logger.system.error('Failed to fetch product')
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
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
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }
    
    const body = await request.json()
    const { name, description, price, image, categoryId, commands, isActive, requiresInput, inputLabel, inputPlaceholder } = body

    const currentProduct = await prisma.product.findUnique({ 
      where: { id }, select: { name: true, price: true, image: true, isActive: true } 
    })
    
    if (!currentProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const changes: string[] = []

    if (name !== undefined) {
      if (typeof name !== 'string') {
        return NextResponse.json({ error: 'Invalid name format' }, { status: 400 })
      }
      const sanitizedName = sanitizeString(name, 100)
      if (sanitizedName.length === 0) {
        return NextResponse.json({ error: 'Product name cannot be empty' }, { status: 400 })
      }
      if (sanitizedName !== currentProduct.name) {
        changes.push(`name: "${currentProduct.name}" -> "${sanitizedName}"`)
      }
    }

    let parsedPrice: number | undefined
    if (price !== undefined) {
      const validated = validatePrice(price)
      if (validated === null) {
        return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 })
      }
      parsedPrice = validated
      if (parsedPrice !== currentProduct.price) {
        changes.push(`price: ${currentProduct.price} -> ${parsedPrice}`)
      }
    }

    if (name) {
      const existingProduct = await prisma.product.findFirst({
        where: { name: sanitizeString(name, 100), id: { not: id } },
        select: { id: true }
      })
      if (existingProduct) {
        logger.product.duplicateNameAttempt(name)
        return NextResponse.json({ error: 'Product name already exists' }, { status: 400 })
      }
    }

    if (categoryId) {
      if (!isValidObjectId(categoryId)) {
        return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 })
      }
      const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } })
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
      changes.push('category')
    }

    if (image !== undefined && image !== currentProduct.image) {
      if (currentProduct.image) {
        await deleteFile(currentProduct.image)
      }
      changes.push('image')
    }

    if (isActive !== undefined && isActive !== currentProduct.isActive) {
      logger.product.toggled(id, currentProduct.name, isActive)
    }

    const validCommands = commands !== undefined 
      ? (Array.isArray(commands) 
          ? commands.filter((cmd): cmd is string => typeof cmd === 'string' && cmd.trim().length > 0)
          : undefined)
      : undefined

    if (validCommands !== undefined) {
      changes.push(`commands: ${validCommands.length}`)
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: name ? sanitizeString(name, 100) : undefined,
        description: description !== undefined ? sanitizeString(description, 500) : undefined,
        price: parsedPrice, image, categoryId, commands: validCommands, isActive,
        requiresInput: requiresInput !== undefined ? !!requiresInput : undefined,
        inputLabel: inputLabel !== undefined ? sanitizeString(inputLabel, 50) : undefined,
        inputPlaceholder: inputPlaceholder !== undefined ? sanitizeString(inputPlaceholder, 50) : undefined,
      },
      include: { category: true },
    })

    if (changes.length > 0) {
      logger.product.updated(product.id, product.name, changes.join(', '), timer())
    }

    // Invalidate cache so changes appear immediately
    await invalidateProductCache()

    return NextResponse.json(product)
  } catch {
    logger.system.error('Failed to update product')
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
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
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }
    
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true, image: true } })
    
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    
    await prisma.product.delete({ where: { id } })
    
    if (product.image) {
      await deleteFile(product.image)
    }

    logger.product.deleted(id, product.name, timer())

    // Invalidate cache so deletion appears immediately
    await invalidateProductCache()

    return NextResponse.json({ success: true })
  } catch {
    logger.system.error('Failed to delete product')
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
