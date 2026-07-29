'use client'

import React from 'react'

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  variant?: 'text' | 'circular' | 'rectangular'
}

export function Skeleton({ 
  className = '', 
  style = {}, 
  width, 
  height, 
  borderRadius,
  variant = 'rectangular' 
}: SkeletonProps) {
  const variantStyles: Record<string, React.CSSProperties> = {
    text: { borderRadius: '0.25rem', height: '1em' },
    circular: { borderRadius: '50%' },
    rectangular: { borderRadius: '0.5rem' },
  }

  return (
    <div 
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...variantStyles[variant],
        ...style,
      }}
    />
  )
}

// Preset skeleton components for common use cases
export function SkeletonText({ lines = 1, gap = '0.5rem' }: { lines?: number; gap?: string }) {
  return (
    <div className="flex flex-col" style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          variant="text" 
          width={i === lines - 1 && lines > 1 ? '70%' : '100%'} 
          height="1rem" 
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ height = 200 }: { height?: number }) {
  return (
    <div className="card p-4">
      <Skeleton width="100%" height={height} />
    </div>
  )
}

// Product Card Skeleton matching exact .product-card layout
export function SkeletonProductCard() {
  return (
    <div className="product-card">
      <div className="product-image">
        <Skeleton width="100%" height="100%" borderRadius={0} />
        {/* Category Badge placeholder */}
        <div className="absolute top-2 left-2 z-10">
          <Skeleton width="70px" height="22px" borderRadius="20px" />
        </div>
      </div>
      <div className="product-info">
        <Skeleton width="75%" height="1.25rem" className="mb-2" />
        <Skeleton width="100%" height="0.875rem" className="mb-1" />
        <Skeleton width="45%" height="0.875rem" className="mb-4" />
        <div className="mt-auto">
          <Skeleton width="40%" height="1.35rem" />
        </div>
      </div>
      <div className="product-actions">
        <Skeleton width="100%" height="42px" borderRadius="0.375rem" />
      </div>
    </div>
  )
}

// Single Cart Item Skeleton matching .cart-item-card
export function SkeletonCartItem() {
  return (
    <div className="card cart-item-card opacity-80 border-2 border-transparent">
      {/* Checkbox wrapper */}
      <div className="flex items-center p-2 shrink-0">
        <Skeleton width="20px" height="20px" borderRadius={4} />
      </div>

      {/* Product Image */}
      <div className="cart-item-image w-20 h-20 rounded-md shrink-0 overflow-hidden">
        <Skeleton width="100%" height="100%" borderRadius={0} />
      </div>

      {/* Product Info + Price */}
      <div className="cart-item-info flex-1 min-w-0 flex justify-between items-center gap-4">
        <div className="w-full max-w-[200px]">
          <Skeleton width="85%" height="1.15rem" className="mb-2" />
          <Skeleton width="55%" height="0.875rem" />
        </div>
        <div className="cart-item-price">
          <Skeleton width="65px" height="1.2rem" className="ml-auto" />
        </div>
      </div>

      {/* Quantity Controls + Delete */}
      <div className="cart-item-controls flex items-center gap-3">
        <div className="cart-qty-controls flex items-center gap-1">
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={24} height={20} className="mx-1" />
          <Skeleton width={28} height={28} borderRadius={6} />
        </div>
        <Skeleton width={32} height={32} borderRadius={6} />
      </div>
    </div>
  )
}

// Full Cart Page Skeleton
export function SkeletonCartPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Cart Items List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Select All Bar Skeleton */}
          <div className="flex items-center gap-4 px-4 py-3 bg-muted/60 rounded-lg">
            <Skeleton width="100px" height="32px" borderRadius="6px" />
            <Skeleton width="100px" height="32px" borderRadius="6px" />
            <Skeleton width="120px" height="16px" className="ml-auto" />
          </div>

          {/* Cart Item Cards */}
          <SkeletonCartItem />
          <SkeletonCartItem />
          <SkeletonCartItem />
        </div>

        {/* Right: Order Summary Panel */}
        <div>
          <div className="card p-6 space-y-5">
            <Skeleton width="140px" height="1.5rem" />
            
            {/* Coupon Code input block */}
            <div className="flex gap-2">
              <Skeleton width="100%" height="40px" borderRadius="8px" />
              <Skeleton width="80px" height="40px" borderRadius="8px" />
            </div>

            <div className="border-t border-border/50 pt-4 space-y-3">
              <div className="flex justify-between">
                <Skeleton width="100px" height="1rem" />
                <Skeleton width="70px" height="1rem" />
              </div>
              <div className="flex justify-between">
                <Skeleton width="90px" height="1rem" />
                <Skeleton width="60px" height="1rem" />
              </div>
              <div className="flex justify-between pt-2 border-t border-border/50">
                <Skeleton width="110px" height="1.25rem" />
                <Skeleton width="90px" height="1.5rem" />
              </div>
            </div>

            <Skeleton width="100%" height="48px" borderRadius="10px" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Orders / Checkout Page Skeleton
export function SkeletonOrdersPage() {
  return (
    <div className="checkout-page">
      {/* Top Banner Skeleton */}
      <Skeleton width="100%" height="52px" borderRadius="12px" className="mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Panel: Payment steps */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6 space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-border">
              <Skeleton width="160px" height="1.25rem" />
              <Skeleton width="100px" height="28px" borderRadius="20px" />
            </div>
            
            <div className="space-y-3">
              <Skeleton width="120px" height="1rem" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton width="100%" height="60px" borderRadius="10px" />
                <Skeleton width="100%" height="60px" borderRadius="10px" />
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Skeleton width="140px" height="1rem" />
              <Skeleton width="100%" height="180px" borderRadius="12px" />
            </div>

            <Skeleton width="100%" height="46px" borderRadius="10px" className="mt-4" />
          </div>
        </div>

        {/* Sidebar Panel: Order Summary */}
        <div>
          <div className="card p-6 space-y-4">
            <Skeleton width="130px" height="1.25rem" className="mb-2" />
            
            <div className="space-y-3 pb-4 border-b border-border">
              <div className="flex gap-3 items-center">
                <Skeleton width="48px" height="48px" borderRadius="8px" />
                <div className="flex-1">
                  <Skeleton width="80%" height="1rem" className="mb-1" />
                  <Skeleton width="40%" height="0.875rem" />
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex justify-between">
                <Skeleton width="80px" height="0.875rem" />
                <Skeleton width="60px" height="0.875rem" />
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t border-border">
                <Skeleton width="100px" height="1.15rem" />
                <Skeleton width="80px" height="1.3rem" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Order History Page Skeleton
export function SkeletonHistoryPage() {
  return (
    <div className="space-y-6">
      {/* Desktop Table View Skeleton */}
      <div className="card p-4 overflow-hidden hidden md:block">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-border/60">
          <Skeleton width="12%" height="1rem" />
          <Skeleton width="35%" height="1rem" />
          <Skeleton width="15%" height="1rem" />
          <Skeleton width="15%" height="1rem" />
          <Skeleton width="15%" height="1rem" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center py-3.5 border-b border-border/30 last:border-0">
            <Skeleton width="10%" height="1rem" />
            <Skeleton width="30%" height="1.1rem" />
            <Skeleton width="12%" height="1.1rem" />
            <Skeleton width="14%" height="24px" borderRadius="12px" />
            <Skeleton width="12%" height="32px" borderRadius="6px" />
          </div>
        ))}
      </div>

      {/* Mobile Card List Skeleton */}
      <div className="space-y-4 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton width="100px" height="1rem" />
              <Skeleton width="70px" height="22px" borderRadius="12px" />
            </div>
            <Skeleton width="80%" height="1.1rem" />
            <div className="flex justify-between items-center pt-2 border-t border-border/40">
              <Skeleton width="80px" height="1.2rem" />
              <Skeleton width="90px" height="32px" borderRadius="6px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Admin Product Grid Skeleton (matching admin product cards)
export function SkeletonAdminProductGrid() {
  return (
    <div className="product-grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="product-card">
          <div className="product-image flex items-center justify-center">
            <Skeleton width="100%" height="100%" borderRadius={0} />
          </div>
          <div className="product-info">
            <div className="product-header flex justify-between items-start mb-2">
              <Skeleton width="65%" height="1.2rem" />
              <Skeleton width="60px" height="1.2rem" borderRadius="6px" />
            </div>
            <Skeleton width="50%" height="0.875rem" className="mt-1" />
          </div>
          <div className="product-actions flex items-center gap-2 p-4 pt-0">
            <Skeleton width="70%" height="36px" borderRadius="8px" />
            <div className="flex items-center gap-2 ml-auto">
              <Skeleton width="40px" height="14px" />
              <Skeleton width="44px" height="24px" borderRadius="12px" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Admin Table Skeleton for Orders, Categories, Users
export function SkeletonAdminTable({ 
  rows = 5, 
  cols = [15, 25, 20, 20, 20] 
}: { 
  rows?: number; 
  cols?: number[] 
}) {
  return (
    <div className="table-container card overflow-hidden p-4">
      {/* Table Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/80 gap-4">
        {cols.map((colWidth, i) => (
          <div key={i} style={{ width: `${colWidth}%` }}>
            <Skeleton width="80%" height="1rem" />
          </div>
        ))}
      </div>

      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div 
          key={rowIndex} 
          className="flex items-center justify-between py-3.5 border-b border-border/40 last:border-0 gap-4"
        >
          {cols.map((colWidth, colIndex) => (
            <div key={colIndex} style={{ width: `${colWidth}%` }}>
              <Skeleton 
                width={colIndex === cols.length - 1 ? "60%" : "85%"} 
                height={colIndex === 0 ? "1.1rem" : "1rem"} 
                borderRadius={colIndex === cols.length - 1 ? "6px" : "4px"}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Admin Coupon Grid Skeleton
export function SkeletonAdminCouponGrid() {
  return (
    <div className="coupon-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton width="120px" height="28px" borderRadius="6px" />
            <Skeleton width="60px" height="28px" borderRadius="6px" />
          </div>
          <div className="flex justify-between items-center">
            <Skeleton width="90px" height="22px" borderRadius="4px" />
            <Skeleton width="70px" height="16px" />
          </div>
          <div className="space-y-2 pt-2 border-t border-border/40">
            <Skeleton width="100%" height="14px" />
            <Skeleton width="60%" height="14px" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Order Card Skeleton
export function SkeletonOrderCard() {
  return (
    <div className="card p-4">
      <div className="flex justify-between mb-4">
        <Skeleton width={120} height="1.25rem" />
        <Skeleton width={80} height="1.5rem" borderRadius={20} />
      </div>
      <Skeleton width="100%" height={60} className="mb-4" />
      <div className="flex justify-between">
        <Skeleton width={100} height="1rem" />
        <Skeleton width={80} height="1.25rem" />
      </div>
    </div>
  )
}

export function SkeletonProfileCard() {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-4 mb-6">
        <Skeleton width={80} height={80} variant="circular" />
        <div className="flex-1">
          <Skeleton width="60%" height="1.5rem" className="mb-2" />
          <Skeleton width="40%" height="1rem" />
        </div>
      </div>
      <div className="grid gap-3">
        <Skeleton width="100%" height={70} />
        <Skeleton width="100%" height={70} />
        <Skeleton width="100%" height={70} />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card p-4 overflow-hidden">
      <div className="flex gap-4 mb-4 pb-4 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${100/cols}%`} height="1rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 mb-3">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} width={`${100/cols}%`} height="1rem" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Skeleton for Stats Page
export function SkeletonStatsPage() {
  return (
    <div>
      {/* Title */}
      <Skeleton width={200} height="1.5rem" className="mb-6" />
      
      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-8">
        <div className="card p-5">
          <Skeleton width="60%" height="0.875rem" className="mb-2" />
          <Skeleton width="80%" height="1.75rem" />
        </div>
        <div className="card p-5">
          <Skeleton width="60%" height="0.875rem" className="mb-2" />
          <Skeleton width="70%" height="1.75rem" />
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
        {/* Leaderboard */}
        <div className="card p-5">
          <Skeleton width={180} height="1rem" className="mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton width={24} height={24} />
              <Skeleton width={24} height={24} />
              <Skeleton width="40%" height="1rem" className="flex-1" />
              <Skeleton width={80} height="1.25rem" />
            </div>
          ))}
        </div>

        {/* Recent Transactions */}
        <div className="card p-5">
          <Skeleton width={150} height="1rem" className="mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`flex items-center gap-3 py-2 ${i < 4 ? 'border-b border-border' : ''}`}>
              <Skeleton width={20} height={20} />
              <Skeleton width="40%" height="0.875rem" className="flex-1" />
              <Skeleton width={70} height="1rem" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Skeleton for Profile Page - New Layout with 3D model
export function SkeletonProfilePage() {
  return (
    <>
      <div className="skeleton-profile-page">
        {/* Title - Simple without box */}
        <div className="flex items-center gap-2 mb-8">
          <Skeleton width={22} height={22} borderRadius={4} />
          <Skeleton width={140} height="1.375rem" />
        </div>

        {/* Main Grid - 3D Model Left, Info Right */}
        <div className="skeleton-profile-grid">
          {/* Left - 3D Model Card (hidden on mobile) */}
          <div className="skeleton-3d-section">
            {/* Model Header */}
            <div className="flex items-center gap-2 mb-3">
              <Skeleton width={18} height={18} borderRadius={4} />
              <Skeleton width={100} height="0.875rem" />
            </div>
            {/* 3D Model Placeholder */}
            <div className="w-full h-[400px] flex items-center justify-center bg-white/[0.02] rounded-xl">
              <div className="text-center">
                <div className="skeleton-spinner" />
                <Skeleton width={100} height="0.875rem" className="mx-auto" />
              </div>
            </div>
            {/* Hint */}
            <Skeleton width={140} height="0.75rem" className="mx-auto mt-3" />
          </div>

          {/* Right - Info Cards */}
          <div className="flex flex-col gap-4">
            {/* Profile Card */}
            <div className="bg-white/5 border border-white/15 rounded-2xl p-5">
              <div className="flex items-center gap-5">
                <Skeleton width={80} height={80} borderRadius="16px" />
                <div className="flex-1">
                  <Skeleton width="60%" height="1.375rem" className="mb-2" />
                  <Skeleton width="40%" height="0.875rem" />
                </div>
              </div>
            </div>

            {/* UUID Card */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="flex justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Skeleton width={16} height={16} borderRadius={4} />
                  <Skeleton width={40} height="0.875rem" />
                </div>
                <Skeleton width={60} height={28} borderRadius={8} />
              </div>
              <Skeleton width="100%" height={44} borderRadius={8} />
            </div>

            {/* Activity Card */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.08]">
                <Skeleton width={18} height={18} borderRadius={4} />
                <Skeleton width={100} height="1rem" />
              </div>
              <div className="skeleton-activity-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="text-center p-4 bg-white/[0.02] rounded-xl border border-white/[0.08]">
                    <Skeleton width="70%" height="0.75rem" className="mx-auto mb-2" />
                    <Skeleton width="50%" height="1.125rem" className="mx-auto" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .skeleton-profile-page {
          max-width: 1100px;
          margin: 0 auto;
        }

        .skeleton-profile-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 1.5rem;
          align-items: start;
        }

        .skeleton-3d-section {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1.25rem;
        }

        .skeleton-activity-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .skeleton-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: rgba(255, 255, 255, 0.5);
          border-radius: 50%;
          margin: 0 auto 1rem;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 900px) {
          .skeleton-profile-grid {
            grid-template-columns: 1fr;
          }

          .skeleton-3d-section {
            display: none;
          }

          .skeleton-activity-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  )
}
