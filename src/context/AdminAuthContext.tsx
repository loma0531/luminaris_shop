'use client'

import { useState, useEffect, createContext, useContext, ReactNode } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { logger } from '@/lib/logger'

interface AdminAuthContextType {
  isAuthenticated: boolean
  login: (email: string, password: string, token: string) => Promise<boolean>
  logout: () => void
  loading: boolean
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return context
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if already authenticated
    const sessionToken = localStorage.getItem('admin_session')
    if (sessionToken) {
      verifySession(sessionToken)
    } else {
      setLoading(false)
    }
  }, [])

  const verifySession = async (sessionToken: string) => {
    try {
      const res = await apiFetch('/api/admin/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      if (res.ok) {
        setIsAuthenticated(true)
      } else {
        localStorage.removeItem('admin_session')
      }
    } catch (err) {
      logger.error(`Session verification error: ${err}`)
      localStorage.removeItem('admin_session')
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string, token: string): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, token }),
      })

      if (res.ok) {
        const data = await res.json()
        localStorage.setItem('admin_session', data.sessionToken)
        setIsAuthenticated(true)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const logout = () => {
    localStorage.removeItem('admin_session')
    setIsAuthenticated(false)
  }

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, login, logout, loading }}>
      {children}
    </AdminAuthContext.Provider>
  )
}
