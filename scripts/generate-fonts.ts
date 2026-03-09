import fs from 'fs'
import path from 'path'

const FONTS_DIR = path.join(process.cwd(), 'src/app/fonts')
const MANIFEST_OUTPUT = path.join(process.cwd(), 'public/fonts-manifest.json')
const CSS_OUTPUT = path.join(process.cwd(), 'src/app/fonts.css')

// Supported font extensions
const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2']

// Font weight mapping based on filename keywords
const WEIGHT_KEYWORDS: Record<string, number> = {
  'thin': 100,
  'extralight': 200,
  'light': 300,
  'regular': 400,
  'normal': 400,
  'medium': 500,
  'semibold': 600,
  'bold': 700,
  'extrabold': 800,
  'black': 900,
}

function getFontWeight(filename: string): number {
  const lower = filename.toLowerCase()
  for (const [keyword, weight] of Object.entries(WEIGHT_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return weight
    }
  }
  return 400 // default regular
}

function getFontStyle(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.includes('italic')) {
    return 'italic'
  }
  return 'normal'
}

function generateFontCSS(): void {
  if (!fs.existsSync(FONTS_DIR)) {
    console.log('📁 No fonts directory found, creating empty fonts.css')
    fs.writeFileSync(CSS_OUTPUT, '/* No fonts in src/app/fonts */\n')
    return
  }

  const files = fs.readdirSync(FONTS_DIR)
  const fontFiles = files.filter(f => 
    FONT_EXTENSIONS.some(ext => f.toLowerCase().endsWith(ext))
  )

  if (fontFiles.length === 0) {
    console.log('📁 No font files found in src/app/fonts')
    fs.writeFileSync(CSS_OUTPUT, '/* No fonts in src/app/fonts */\n')
    return
  }

  // Group fonts by family name (first part of filename before weight keywords)
  const fontFamilies: Map<string, Array<{ file: string; weight: number; style: string }>> = new Map()

  for (const file of fontFiles) {
    const ext = path.extname(file)
    const basename = path.basename(file, ext)
    
    // Format font family name (e.g., from 'Kanit-Medium' to 'Kanit Medium')
    let familyName = basename
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    // Fallback if empty
    if (!familyName) {
      familyName = basename
    }

    const weight = getFontWeight(basename)
    const style = getFontStyle(basename)

    if (!fontFamilies.has(familyName)) {
      fontFamilies.set(familyName, [])
    }
    fontFamilies.get(familyName)!.push({ file, weight, style })
  }

  // Generate CSS
  let css = '/* Auto-generated font faces - DO NOT EDIT */\n'
  css += '/* To add fonts: Drop .ttf/.otf/.woff/.woff2 files into src/app/fonts and rebuild */\n\n'

  let primaryFontFamily = ''

  // Attempt to read the primary font from the manifest if it exists
  if (fs.existsSync(MANIFEST_OUTPUT)) {
    try {
      const manifestData = JSON.parse(fs.readFileSync(MANIFEST_OUTPUT, 'utf-8'))
      if (manifestData.primary && fontFamilies.has(manifestData.primary)) {
        primaryFontFamily = manifestData.primary
      }
    } catch (e) {
      console.error('Error reading fonts-manifest.json:', e)
    }
  }

  for (const [family, variants] of fontFamilies) {
    if (!primaryFontFamily) {
      primaryFontFamily = family
    }

    for (const variant of variants) {
      const format = getFormat(variant.file)
      css += `@font-face {\n`
      css += `  font-family: '${family}';\n`
      css += `  src: url('./fonts/${variant.file}') format('${format}');\n`
      css += `  font-weight: ${variant.weight};\n`
      css += `  font-style: ${variant.style};\n`
      css += `  font-display: swap;\n`
      css += `}\n\n`
    }
  }

  // Add CSS variable and body style for the primary font
  if (primaryFontFamily) {
    css += `/* Primary font: ${primaryFontFamily} */\n`
    css += `:root {\n`
    css += `  --font-primary: '${primaryFontFamily}', 'Noto Sans Thai', system-ui, sans-serif;\n`
    css += `}\n\n`
    css += `html, body {\n`
    css += `  font-family: var(--font-primary);\n`
    css += `}\n`
  }

  fs.writeFileSync(CSS_OUTPUT, css)
  
  // Update manifest with new families, keeping user's primary choice
  const fontFamilyList = Array.from(fontFamilies.keys())
  const manifest = {
    primary: primaryFontFamily || null,
    families: fontFamilyList,
  }
  fs.writeFileSync(MANIFEST_OUTPUT, JSON.stringify(manifest, null, 2))

  console.log(`✅ Generated fonts.css with ${fontFiles.length} font file(s)`)
  console.log(`   Primary font family: ${primaryFontFamily || 'None'}`)
  console.log(`   Font manifest: ${fontFamilyList.length} families → public/fonts-manifest.json`)
}

function getFormat(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case '.woff2': return 'woff2'
    case '.woff': return 'woff'
    case '.otf': return 'opentype'
    case '.ttf': return 'truetype'
    default: return 'truetype'
  }
}

// Run
generateFontCSS()
