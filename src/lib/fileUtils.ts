import { unlink } from 'fs/promises'
import path from 'path'
import { logger } from '@/lib/logger'

/**
 * Safely deletes a file from the public/uploads directory.
 * @param relativePath The path relative to the public folder (e.g., /uploads/products/image.webp)
 * @returns true if deleted, false if not found or invalid
 */
export async function deleteFile(relativePath: string | null): Promise<boolean> {
  if (!relativePath) return false
  
  // 1. Basic format check
  if (!relativePath.startsWith('/uploads/')) {
    logger.warn(`Attempted to delete file outside uploads: ${relativePath}`)
    return false
  }

  try {
    const filename = path.basename(relativePath)
    
    // 2. Traversal check (Path traversal protection)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
         logger.warn(`Invalid filename in delete request: ${filename}`)
         return false
    }

    // 3. Extension check (Allowlist)
    const ext = path.extname(filename).toLowerCase().replace('.', '')
    const allowedExtensions = ['webp', 'jpg', 'jpeg', 'png', 'gif']
    if (!allowedExtensions.includes(ext)) {
       logger.warn(`Attempted to delete unsupported file type: ${filename}`)
       return false
    }

    // 4. Construct absolute path safe against traversal
    // path.join with process.cwd() ensures it stays within the project
    // checking if it starts with the uploads dir adds another layer
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    const fullPath = path.join(process.cwd(), 'public', relativePath)
    
    // Verify it is indeed within imports
    if (!fullPath.startsWith(uploadsDir)) {
        logger.error(`Security alert: Path traversal detected resolved to ${fullPath}`)
        return false
    }

    await unlink(fullPath)
    logger.info(`File deleted: ${relativePath}`)
    return true
  } catch (error) {
    // Ignore if file not found, log other errors
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error(`Failed to delete file ${relativePath}: ${error}`)
    }
    return false
  }
}
