import React from 'react'

// Minecraft legacy color codes (§0-§f)
const legacyColors: Record<string, string> = {
  '0': '#000000', // Black
  '1': '#0000AA', // Dark Blue
  '2': '#00AA00', // Dark Green
  '3': '#00AAAA', // Dark Aqua
  '4': '#AA0000', // Dark Red
  '5': '#AA00AA', // Dark Purple
  '6': '#FFAA00', // Gold
  '7': '#AAAAAA', // Gray
  '8': '#555555', // Dark Gray
  '9': '#5555FF', // Blue
  'a': '#55FF55', // Green
  'b': '#55FFFF', // Aqua
  'c': '#FF5555', // Red
  'd': '#FF55FF', // Light Purple
  'e': '#FFFF55', // Yellow
  'f': '#FFFFFF', // White
}

// Format codes
const formatCodes: Record<string, React.CSSProperties> = {
  'l': { fontWeight: 'bold' },
  'o': { fontStyle: 'italic' },
  'n': { textDecoration: 'underline' },
  'm': { textDecoration: 'line-through' },
  'k': {}, // Obfuscated (not supported in web)
  'r': {}, // Reset
}

interface ColoredTextSegment {
  text: string
  color?: string
  style?: React.CSSProperties
}

/**
 * Parse hex color code like &#RRGGBB or <#RRGGBB>
 */
function parseHexColor(text: string, startIndex: number): { color: string | null; length: number } {
  // Format: &#RRGGBB (8 characters total)
  if (text.substring(startIndex, startIndex + 2) === '&#') {
    const hexMatch = text.substring(startIndex + 2, startIndex + 8)
    if (/^[0-9A-Fa-f]{6}$/.test(hexMatch)) {
      return { color: `#${hexMatch}`, length: 8 }
    }
  }
  
  // Format: <#RRGGBB> (9 characters total)
  if (text[startIndex] === '<' && text[startIndex + 1] === '#') {
    const closeIndex = text.indexOf('>', startIndex)
    if (closeIndex !== -1) {
      const hexColor = text.substring(startIndex + 1, closeIndex)
      if (/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
        return { color: hexColor, length: closeIndex - startIndex + 1 }
      }
    }
  }
  
  // Format: §x§R§R§G§G§B§B (14 characters) - Spigot hex format
  if (text.substring(startIndex, startIndex + 2) === '§x' || text.substring(startIndex, startIndex + 2) === '&x') {
    let hex = ''
    let valid = true
    for (let j = 0; j < 6; j++) {
      const idx = startIndex + 2 + (j * 2)
      if (idx + 1 < text.length && (text[idx] === '§' || text[idx] === '&')) {
        hex += text[idx + 1]
      } else {
        valid = false
        break
      }
    }
    if (valid && /^[0-9A-Fa-f]{6}$/i.test(hex)) {
      return { color: `#${hex}`, length: 14 }
    }
  }
  
  return { color: null, length: 0 }
}

/**
 * Parse Minecraft color codes (§, &, hex) and return segments
 */
export function parseMinecraftColors(text: string): ColoredTextSegment[] {
  const segments: ColoredTextSegment[] = []
  let currentSegment: ColoredTextSegment = { text: '', style: {} }
  let currentColor: string | undefined = undefined
  
  let i = 0
  while (i < text.length) {
    const char = text[i]
    
    // Try to parse hex color first
    const hexResult = parseHexColor(text, i)
    if (hexResult.color) {
      // Save current segment if it has text
      if (currentSegment.text) {
        segments.push({ ...currentSegment, color: currentColor })
        currentSegment = { text: '', style: {} }
      }
      currentColor = hexResult.color
      i += hexResult.length
      continue
    }
    
    // Check for legacy color code prefix (§ or &)
    if ((char === '§' || char === '&') && i + 1 < text.length) {
      const code = text[i + 1].toLowerCase()
      
      // Save current segment if it has text
      if (currentSegment.text) {
        segments.push({ ...currentSegment, color: currentColor })
        currentSegment = { text: '', style: {} }
      }
      
      // Check if it's a legacy color code
      if (legacyColors[code]) {
        currentColor = legacyColors[code]
        currentSegment.style = {}
      }
      // Check if it's a format code
      else if (formatCodes[code]) {
        if (code === 'r') {
          // Reset
          currentColor = undefined
          currentSegment.style = {}
        } else {
          currentSegment.style = { ...currentSegment.style, ...formatCodes[code] }
        }
      }
      
      i += 2 // Skip the code
      continue
    }
    
    currentSegment.text += char
    i++
  }
  
  // Add remaining segment
  if (currentSegment.text) {
    segments.push({ ...currentSegment, color: currentColor })
  }
  
  return segments
}

/**
 * Render Minecraft colored text as React elements
 */
export function MinecraftColoredText({ text, className }: { text: string; className?: string }) {
  const segments = parseMinecraftColors(text)
  
  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <span
          key={index}
          style={{
            color: segment.color,
            ...segment.style,
          }}
        >
          {segment.text}
        </span>
      ))}
    </span>
  )
}

/**
 * Strip Minecraft color codes from text
 */
export function stripMinecraftColors(text: string): string {
  // Remove legacy codes
  let result = text.replace(/[§&][0-9a-fk-or]/gi, '')
  // Remove hex codes &#RRGGBB
  result = result.replace(/&#[0-9A-Fa-f]{6}/g, '')
  // Remove hex codes <#RRGGBB>
  result = result.replace(/<#[0-9A-Fa-f]{6}>/g, '')
  // Remove Spigot hex format §x§R§R§G§G§B§B
  result = result.replace(/[§&]x([§&][0-9A-Fa-f]){6}/gi, '')
  return result
}
