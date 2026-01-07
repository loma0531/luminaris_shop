import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { CACHE_HEADERS } from '@/lib/cache'
import { sanitizeString, validatePrice, isValidObjectId } from '@/lib/inputValidation'
import { logger, createTimer } from '@/lib/logger'
import { getCachedProducts, setCachedProducts, invalidateProductCache } from '@/lib/redis'

interface ProductWithCategory {
  id: string
  name: string
  description: string | null
  price: number
  image: string | null
  isActive: boolean
  soldCount: number
  categoryId: string
  createdAt: Date
  commands: string[]
  category: { id: string; name: string }
}

export async function GET() {
  const timer = createTimer()
  try {
    // Try cache first (1-5ms)
    const cached = await getCachedProducts<ProductWithCategory>()
    if (cached) {
      logger.debug(`Products served from cache: ${cached.length} items`)
      return NextResponse.json(cached, { headers: CACHE_HEADERS.SHORT })
    }

    // Cache miss - query database
    const products = await prisma.product.findMany({
      select: {
        id: true, name: true, description: true, price: true, image: true, isActive: true,
        soldCount: true, categoryId: true, createdAt: true, commands: true,
        requiresInput: true, inputLabel: true, inputPlaceholder: true,
        category: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
    })
    
    // Cache the result
    await setCachedProducts(products)
    
    logger.product.listViewed(products.length, timer())
    
    return NextResponse.json(products, { headers: CACHE_HEADERS.SHORT })
  } catch {
    logger.system.error('Failed to fetch products')
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500, headers: CACHE_HEADERS.NONE })
  }
}

export async function POST(request: NextRequest) {
  const timer = createTimer()
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { name, description, price, image, categoryId, commands, requiresInput, inputLabel, inputPlaceholder } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }
    
    const sanitizedName = sanitizeString(name, 100)
    if (sanitizedName.length === 0) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const parsedPrice = validatePrice(price)
    if (parsedPrice === null) {
      return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 })
    }

    if (!categoryId || !isValidObjectId(categoryId)) {
      return NextResponse.json({ error: 'Valid Category ID is required' }, { status: 400 })
    }

    const existingProduct = await prisma.product.findFirst({
      where: { name: sanitizedName }, select: { id: true }
    })

    if (existingProduct) {
      logger.product.duplicateNameAttempt(sanitizedName)
      return NextResponse.json({ error: 'Product name already exists' }, { status: 400 })
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true } })
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const sanitizedDescription = description ? sanitizeString(description, 500) : null
    const validCommands = Array.isArray(commands) 
      ? commands.filter((cmd): cmd is string => typeof cmd === 'string' && cmd.trim().length > 0)
      : []

    // Validate Input Configuration
    if (requiresInput && (!inputLabel || typeof inputLabel !== 'string')) {
       return NextResponse.json({ error: 'Input label is required when input is enabled' }, { status: 400 })
    }

    const product = await prisma.product.create({
      data: { 
        name: sanitizedName, 
        description: sanitizedDescription, 
        price: parsedPrice, 
        image, 
        categoryId, 
        commands: validCommands,
        // Custom Input Fields
        requiresInput: !!requiresInput,
        inputLabel: requiresInput ? sanitizeString(inputLabel, 50) : null,
        inputPlaceholder: requiresInput && inputPlaceholder ? sanitizeString(inputPlaceholder, 50) : null
      },
      include: { category: true },
    })

    logger.product.created(product.id, sanitizedName, parsedPrice, timer())
    logger.debug(`   - Category: ${category.name}, Commands: ${validCommands.length}`, 200)

    // Invalidate cache so new product appears immediately
    await invalidateProductCache()

    return NextResponse.json(product, { status: 201 })
  } catch {
    logger.system.error('Failed to create product')
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
