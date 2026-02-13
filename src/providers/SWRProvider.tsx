'use client'

import { SWRConfig } from 'swr'
import { swrFetcher } from '@/lib/swr-hooks'
import { logger } from '@/lib/logger'

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        shouldRetryOnError: true,
        errorRetryCount: 3,
        dedupingInterval: 5_000,
        onError: (error, key) => {
          // ไม่ log 401/403 (session expired ปกติ)
          if (error?.status !== 401 && error?.status !== 403) {
            logger.error(`SWR error [${key}]: ${error}`)
          }
        },
      }}
    >
      {children}
    </SWRConfig>
  )
}
