import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Restrict remote patterns to known domains for security
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mc-heads.net',
      },
      {
        protocol: 'https',
        hostname: 'crafatar.com',
      },
    ],
    // Optimize images
    deviceSizes: [640, 750, 828, 1080, 1200, 1440],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // Use default loader with optimization
    formats: ['image/webp', 'image/avif'],
    // Disable server-side optimization for external images to avoid 504 errors on restricted networks
    unoptimized: true,
  },
  
  // Enable compression
  compress: true,
  
  // Remove X-Powered-By header for security
  poweredByHeader: false,
  
  // Enable React strict mode for better development
  reactStrictMode: true,
  
  // External packages for server-side (bypass Turbopack bundling)
  serverExternalPackages: ['melody191-fetcher'],
  
  // Experimental features for better performance
  experimental: {
    // Enable optimized package imports
    optimizePackageImports: ['@/components', '@/lib'],
  },
  
  // Security and caching headers
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { 
            key: 'Content-Security-Policy', 
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://mc-heads.net https://crafatar.com; font-src 'self' data:; connect-src 'self' https://mc-heads.net https://crafatar.com;" 
          }
        ],
      },
      {
        // Cache static assets aggressively
        source: '/uploads/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Cache fonts
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
