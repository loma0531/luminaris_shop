/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getRedis, getCachedProducts } from '@/lib/redis'
import { isValidMinecraftName, isValidObjectId } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cache'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic' // Ensure dynamic execution

export async function GET(request: NextRequest) {
  const start = Date.now()
  const { searchParams } = new URL(request.url)
  const minecraftName = searchParams.get('minecraftName')
  
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

    // 2. Categories (Cached in Redis 5m)
    getRedis().get('cache:categories').then(async (cached) => {
      if (cached) return JSON.parse(cached)
      // Fallback DB
      return prisma.category.findMany({
        orderBy: { sortOrder: 'asc' }
      })
    }),
  ]

  // 3. User Specific Data (if logged in)
  if (minecraftName && isValidMinecraftName(minecraftName)) {
    promises.push(
      // Cart
      prisma.cart.findUnique({
        where: { minecraftName },
        select: { items: true }
      }).then(cart => cart?.items || [])
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
    
    // Construct response
    const response: any = {
      products: results[0] || [],
      categories: results[1] || [],
      timestamp: Date.now()
    }

    if (minecraftName) {
      // Process cart items to include product details
      const cartItems = results[2] || []
      const products = response.products as any[]
      const productMap = new Map(products.map((p) => [p.id, p]))
      
      response.cart = cartItems
        .map((item: any) => {
           const product = productMap.get(item.productId)
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
        'X-Response-Time': `${duration}ms`
      }
    })
    
  } catch (error) {
    logger.system.error(`Unified Init Error: ${error}`)
    return NextResponse.json({ error: 'Failed to init shop' }, { status: 500 })
  }
}
