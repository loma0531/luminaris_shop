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
          saleActive: true, discountType: true, discountValue: true, saleStart: true, saleEnd: true,
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

    // 3. Coin Settings & Promotions
    Promise.all([
      prisma.settings.findMany({
        where: {
          key: { in: ['coin_rate'] }
        }
      }),
      prisma.coinPromotion.findMany({
        where: {
          isActive: true,
          OR: [
            { startDate: null, endDate: null },
            { startDate: { lte: new Date() }, endDate: null },
            { startDate: null, endDate: { gte: new Date() } },
            { startDate: { lte: new Date() }, endDate: { gte: new Date() } }
          ]
        }
      })
    ]).then(([settings, activePromos]) => {
      const map = new Map(settings.map(s => [s.key, s.value]))
      const coinRate = parseFloat(map.get('coin_rate') || '1.0')
      
      const multiplierPromo = activePromos.find(p => p.promoType === 'MULTIPLIER')
      const bonusPromo = activePromos.find(p => p.promoType === 'BONUS_CASH')
      
      const promoDouble = multiplierPromo ? multiplierPromo.value === 2 : false
      const promoBonusThreshold = bonusPromo ? bonusPromo.minSpend : 0.0
      const promoBonusAmount = bonusPromo ? bonusPromo.value : 0.0

      return {
        coinConfig: {
          coinRate,
          promoDouble,
          promoBonusThreshold,
          promoBonusAmount,
        },
        activePromotions: activePromos.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          promoType: p.promoType,
          value: p.value,
          minSpend: p.minSpend,
          startDate: p.startDate ? p.startDate.toISOString() : null,
          endDate: p.endDate ? p.endDate.toISOString() : null,
        }))
      }
    })
  ]

  // 4. User Specific Data (if logged in)
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

    promises.push(
      // User Coins
      prisma.user.findFirst({
        where: {
          minecraftName: {
            equals: minecraftName,
            mode: 'insensitive'
          }
        },
        select: { coins: true }
      }).then(u => u?.coins || 0.0)
    )
  }

  try {
    // Await all data
    const results = await Promise.all(promises)
    
    // Generate hash for change detection (based on products + categories + user info)
    const products = results[0] || []
    const categories = results[1] || []
    
    const coinData = results[2] || { 
      coinConfig: { coinRate: 1.0, promoDouble: false, promoBonusThreshold: 0.0, promoBonusAmount: 0.0 }, 
      activePromotions: [] 
    }
    const coinConfig = coinData.coinConfig
    const activePromotions = coinData.activePromotions
    
    const userCoins = minecraftName ? (results[5] || 0.0) : 0.0
    const cartItemsCount = minecraftName ? (results[3] ? results[3].length : 0) : 0

    const hashSource = JSON.stringify({
      pCount: products.length,
      pIds: products.slice(0, 10).map((p: any) => p.id),
      cCount: categories.length,
      cIds: categories.map((c: any) => c.id),
      coinConfig,
      activePromotionsCount: activePromotions.length,
      userCoins,
      cartItemsCount
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
      coinConfig: coinConfig,
      activePromotions: activePromotions,
      timestamp: Date.now(),
      hash: serverHash, // Include hash for client-side caching
    }

    if (minecraftName) {
      // Process cart items to include product details
      const cartItems = results[3] || []
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
               inputPlaceholder: product.inputPlaceholder,
               saleActive: product.saleActive,
               discountType: product.discountType,
               discountValue: product.discountValue,
               saleStart: product.saleStart,
               saleEnd: product.saleEnd
             },
             quantity: item.quantity,
             customInput: item.customInput || null
           }
        })
        .filter((item: any) => item !== null)

      response.pendingOrders = results[4] || 0
      response.coins = results[5] || 0.0
    }

    const duration = Date.now() - start
    
    return NextResponse.json(response, { 
      headers: {
        ...(minecraftName ? CACHE_HEADERS.NONE : CACHE_HEADERS.SHORT),
        'ETag': `"${serverHash}"`,
        'X-Response-Time': `${duration}ms`
      }
    })
    
  } catch (error) {
    logger.system.error(`Unified Init Error: ${error}`)
    return NextResponse.json({ error: 'Failed to init shop' }, { status: 500 })
  }
}
