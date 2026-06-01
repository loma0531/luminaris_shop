import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params
  
  if (!pathSegments || pathSegments.length === 0) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // Construct file path
  // Note: public/uploads is where files are stored
  // ใช้ path.resolve เพื่อ Normalize เส้นทางไฟล์ให้เป็นระเบียบและปลอดภัย ป้องกัน Directory Traversal
  const filePath = path.resolve(process.cwd(), 'public', 'uploads', ...pathSegments)

  // Security: Ensure path is within public/uploads
  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads')
  if (!filePath.startsWith(uploadDir)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    // Check if file exists
    await fs.access(filePath)
    
    // Read file
    const fileBuffer = await fs.readFile(filePath)
    
    // Determine content type
    const ext = path.extname(filePath).toLowerCase()
    let contentType = 'application/octet-stream'
    
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg'
        break
      case '.png':
        contentType = 'image/png'
        break
      case '.gif':
        contentType = 'image/gif'
        break
      case '.webp':
        contentType = 'image/webp'
        break
      case '.svg':
        contentType = 'image/svg+xml'
        break
    }

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
    
  } catch {
    return new NextResponse('Not Found', { status: 404 })
  }
}
