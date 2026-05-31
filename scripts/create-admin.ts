#!/usr/bin/env npx ts-node

/**
 * Admin User Creation Script
 * 
 * Usage: npm run create-admin
 * 
 * This script creates an admin user with encrypted password and token.
 * Credentials are read from environment variables:
 * - ADMIN_EMAIL
 * - ADMIN_PASSWORD  
 * - ADMIN_TOKEN
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'
import { generateTOTPSecret, getOTPAuthURL } from '../src/lib/totp'

// Load environment variables
dotenv.config()

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const token = process.env.ADMIN_TOKEN

  if (!email || !password || !token) {
    console.error('❌ Error: Missing required environment variables')
    console.error('Please set the following in your .env file:')
    console.error('  - ADMIN_EMAIL')
    console.error('  - ADMIN_PASSWORD')
    console.error('  - ADMIN_TOKEN')
    process.exit(1)
  }

  console.log('🔐 Creating admin user...')
  console.log(`📧 Email: ${email}`)

  // Hash password and token with bcrypt
  const saltRounds = 12
  const passwordHash = await bcrypt.hash(password, saltRounds)
  const tokenHash = await bcrypt.hash(token, saltRounds)

  // Generate TOTP Secret for Google Authenticator
  const twoFactorSecret = generateTOTPSecret()
  const otpauthUrl = getOTPAuthURL(email, 'Luminaris Shop', twoFactorSecret)

  // Check if admin already exists
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase() },
  })

  if (existingAdmin) {
    console.log('⚠️  Admin user already exists. Updating credentials...')
    
    await prisma.adminUser.update({
      where: { email: email.toLowerCase() },
      data: {
        passwordHash,
        tokenHash,
        twoFactorSecret,
        updatedAt: new Date(),
      },
    })
    
    console.log('✅ Admin credentials updated successfully!')
  } else {
    await prisma.adminUser.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        tokenHash,
        twoFactorSecret,
      },
    })
    
    console.log('✅ Admin user created successfully!')
  }

  console.log('')
  console.log('📝 Login with:')
  console.log(`   Email: ${email}`)
  console.log(`   Password: (your ADMIN_PASSWORD)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔑 Google Authenticator Setup:')
  console.log(`   Secret Key: ${twoFactorSecret}`)
  console.log(`   OTPAuth URL: ${otpauthUrl}`)
  console.log('   (ป้อน Secret Key ด้านบนในแอป Google Authenticator)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
