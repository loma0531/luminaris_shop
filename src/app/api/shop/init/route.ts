/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCachedProducts, getCachedCategories, getCachedCart } from '@/lib/redis'
import { isValidMinecraftName } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic' // Ensure dynamic execution

// Simple hash function for change detection
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

export async function GET(request: NextRequest) {
  const start = Date.now()
  const { searchParams } = new URL(request.url)
  const minecraftName = searchParams.get('minecraftName')
  const clientHash = request.headers.get('If-None-Match')?.replace(/"/g, '')
  
  // 1. Parallel Data Fetching
  // We use Promise.all to fetch everything at once
  // Redis is heavily used here
  
  const promises: Promise<any>[] = [
    // 1. Products (Cached in Redis)
    getCachedProducts().then(async (cached) => {
      if (cached) return cached
      // Fallback DB
      const products = await prisma.product.findMany({
        select: {
          id: true, name: true, description: true, price: true, image: true, isActive: true,
          categoryId: true, commands: true,
          requiresInput: true, inputLabel: true, inputPlaceholder: true,
          category: { select: { id: true, name: true } }
        },
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      })
      // Cache will be set by the main products route, we just return data here
      return products
    }),

    // 2. Categories (Cached via adapter)
    getCachedCategories().then(async (cached: unknown[] | null) => {
      if (cached) return cached
      // Fallback DB
      return prisma.category.findMany({
        orderBy: { sortOrder: 'asc' }
      })
    }),
  ]

  // 3. User Specific Data (if logged in)
  if (minecraftName && isValidMinecraftName(minecraftName)) {
    promises.push(
      // Cart (Read from Redis first, fallback to MongoDB)
      getCachedCart(minecraftName).then(async (cachedCart) => {
        if (cachedCart) {
          return cachedCart.items.map(item => ({
            productId: item.productId || item.product?.id,
            quantity: item.quantity,
            customInput: item.customInput || null
          }))
        }
        // Fallback DB
        const cart = await prisma.cart.findUnique({
          where: { minecraftName },
          select: { items: true }
        })
        return cart?.items || []
      })
    )
    
    promises.push(
      // Pending Orders Count
      prisma.order.count({
        where: { 
          minecraftName,
          status: { in: ['PENDING', 'AWAITING_PAYMENT'] }
        }
      })
    )
  }

  try {
    // Await all data
    const results = await Promise.all(promises)
    
    // Generate hash for change detection (based on products + categories)
    const products = results[0] || []
    const categories = results[1] || []
    const hashSource = JSON.stringify({
      pCount: products.length,
      pIds: products.slice(0, 10).map((p: any) => p.id),
      cCount: categories.length,
      cIds: categories.map((c: any) => c.id),
    })
    const serverHash = simpleHash(hashSource)
    
    // Check if data hasn't changed (conditional request)
    if (clientHash && clientHash === serverHash) {
      return new NextResponse(null, { 
        status: 304,
        headers: {
          'ETag': `"${serverHash}"`,
          'Cache-Control': 'private, max-age=30',
        }
      })
    }
    
    // Construct response
    const response: any = {
      products: products,
      categories: categories,
      timestamp: Date.now(),
      hash: serverHash, // Include hash for client-side caching
    }

    if (minecraftName) {
      // Process cart items to include product details
       const cartItems = results[2] || []
      const productMap = new Map(products.map((p: any) => [p.id, p]))
      
      response.cart = cartItems
        .map((item: any) => {
           const product = productMap.get(item.productId) as any
           if (!product) return null
           return {
             product: { 
               id: product.id, 
               name: product.name, 
               price: product.price, 
               image: product.image,
               commands: product.commands,
               requiresInput: product.requiresInput,
               inputLabel: product.inputLabel,
               inputPlaceholder: product.inputPlaceholder
             },
             quantity: item.quantity,
             customInput: item.customInput || null
           }
        })
        .filter((item: any) => item !== null)

      response.pendingOrders = results[3] || 0
    }

    const duration = Date.now() - start
    
    return NextResponse.json(response, { 
      headers: {
        ...CACHE_HEADERS.SHORT, // Cache this response for short time
        'ETag': `"${serverHash}"`,
        'X-Response-Time': `${duration}ms`
      }
    })
    
  } catch (error) {
    logger.system.error(`Unified Init Error: ${error}`)
    return NextResponse.json({ error: 'Failed to init shop' }, { status: 500 })
  }
}
