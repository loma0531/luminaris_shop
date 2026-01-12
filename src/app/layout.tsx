import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import "./fonts.css";

// Fallback font if no local fonts are provided
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-fallback",
});

export const metadata: Metadata = {
  title: "Luminaris Shop - ร้านค้า Minecraft",
  description: "ร้านค้าไอเทม Minecraft สำหรับเซิร์ฟเวอร์ Luminaris",
};

import { ToastProvider } from '@/context/ToastContext'
import ToastContainer from '@/components/ToastContainer'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body className={notoSansThai.variable}>
        <ErrorBoundary>
          <ToastProvider>
            {children}
            <ToastContainer />
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}

