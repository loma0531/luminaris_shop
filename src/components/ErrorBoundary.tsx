'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary Component
 * จับ React runtime errors และแสดง fallback UI
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console (could send to logging service)
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div className="error-boundary-fallback">
          <div className="error-boundary-content">
            <svg 
              width="48" 
              height="48" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2>เกิดข้อผิดพลาด</h2>
            <p>ขออภัย เกิดข้อผิดพลาดในการแสดงผลหน้านี้</p>
            <button 
              className="btn btn-primary" 
              onClick={this.handleRetry}
              aria-label="ลองใหม่อีกครั้ง"
            >
              ลองใหม่
            </button>
          </div>

          <style jsx>{`
            .error-boundary-fallback {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 300px;
              padding: 2rem;
              background: var(--muted);
              border-radius: 0.5rem;
              margin: 1rem;
            }
            .error-boundary-content {
              text-align: center;
              color: var(--muted-foreground);
            }
            .error-boundary-content svg {
              margin-bottom: 1rem;
              color: var(--error);
            }
            .error-boundary-content h2 {
              margin-bottom: 0.5rem;
              color: var(--foreground);
            }
            .error-boundary-content p {
              margin-bottom: 1rem;
            }
          `}</style>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
