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
    rectangular: { borderRadius: '0.375rem' },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
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
    <div className="card" style={{ padding: '1rem' }}>
      <Skeleton width="100%" height={height} />
    </div>
  )
}

export function SkeletonProductCard() {
  return (
    <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem' }}>
      <Skeleton width={80} height={80} />
      <div style={{ flex: 1 }}>
        <Skeleton width="60%" height="1.25rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton width="40%" height="1rem" style={{ marginBottom: '0.75rem' }} />
        <Skeleton width="30%" height="1.5rem" />
      </div>
    </div>
  )
}

export function SkeletonCartItem() {
  return (
    <div className="card" style={{ 
      padding: '1rem', 
      display: 'flex', 
      alignItems: 'center', 
      gap: '1rem' 
    }}>
      <Skeleton width={20} height={20} borderRadius={4} />
      <Skeleton width={80} height={80} />
      <div style={{ flex: 1 }}>
        <Skeleton width="50%" height="1rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton width="30%" height="0.875rem" />
      </div>
      <Skeleton width={100} height={36} />
    </div>
  )
}

export function SkeletonOrderCard() {
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <Skeleton width={120} height="1.25rem" />
        <Skeleton width={80} height="1.5rem" borderRadius={20} />
      </div>
      <Skeleton width="100%" height={60} style={{ marginBottom: '1rem' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width={100} height="1rem" />
        <Skeleton width={80} height="1.25rem" />
      </div>
    </div>
  )
}

export function SkeletonProfileCard() {
  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Skeleton width={80} height={80} variant="circular" />
        <div style={{ flex: 1 }}>
          <Skeleton width="60%" height="1.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton width="40%" height="1rem" />
        </div>
      </div>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <Skeleton width="100%" height={70} />
        <Skeleton width="100%" height={70} />
        <Skeleton width="100%" height={70} />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card" style={{ padding: '1rem', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${100/cols}%`} height="1rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
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
      <Skeleton width={200} height="1.5rem" style={{ marginBottom: '1.5rem' }} />
      
      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '2rem' 
      }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <Skeleton width="60%" height="0.875rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton width="80%" height="1.75rem" />
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <Skeleton width="60%" height="0.875rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton width="70%" height="1.75rem" />
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '1.5rem' 
      }}>
        {/* Leaderboard */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <Skeleton width={180} height="1rem" style={{ marginBottom: '1rem' }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem' }}>
              <Skeleton width={24} height={24} />
              <Skeleton width={24} height={24} />
              <Skeleton width="40%" height="1rem" style={{ flex: 1 }} />
              <Skeleton width={80} height="1.25rem" />
            </div>
          ))}
        </div>

        {/* Recent Transactions */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <Skeleton width={150} height="1rem" style={{ marginBottom: '1rem' }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
              <Skeleton width={20} height={20} />
              <Skeleton width="40%" height="0.875rem" style={{ flex: 1 }} />
              <Skeleton width={70} height="1rem" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Skeleton for Profile Page
export function SkeletonProfilePage() {
  return (
    <div>
      {/* Title */}
      <Skeleton width={120} height="1.375rem" style={{ marginBottom: '1.5rem' }} />

      {/* 2 Column Layout */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '1rem',
        maxWidth: '900px',
      }}>
        {/* Left Column - Main Info */}
        <div className="card" style={{ padding: '1.25rem' }}>
          {/* Profile Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
            <Skeleton width={56} height={56} borderRadius="0.5rem" />
            <div style={{ flex: 1 }}>
              <Skeleton width="60%" height="1rem" style={{ marginBottom: '0.25rem' }} />
              <Skeleton width="40%" height="0.75rem" />
            </div>
          </div>
          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <Skeleton width="100%" height={70} />
            <Skeleton width="100%" height={70} />
            <Skeleton width="100%" height={70} />
          </div>
        </div>

        {/* Right Column - Activity Info */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ height: '76px', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Skeleton width={16} height={16} />
            <Skeleton width={100} height="0.9375rem" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <Skeleton width="100%" height={70} />
            <Skeleton width="100%" height={70} />
            <Skeleton width="100%" height={70} />
          </div>
        </div>
      </div>
    </div>
  )
}

