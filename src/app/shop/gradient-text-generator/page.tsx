'use client'

import React, { useState, useEffect, useRef } from 'react'
import { HexColorPicker } from 'react-colorful'

// ==== TYPE DEFINITIONS ====
interface ColorStop {
  id: string;
  hex: string;
  position: number; // 0.0 to 1.0
}

interface FormatOptions {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  obfuscated: boolean;
}

// ==== UTILITIES ====
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0
  };
}

function interpolateColor(color1: string, color2: string, factor: number): string {
  if (factor <= 0) return color1;
  if (factor >= 1) return color2;
  
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  const r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r));
  const g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g));
  const b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));

  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

function getColorAtPosition(stops: ColorStop[], position: number): string {
  if (stops.length === 0) return '#FFFFFF';
  if (stops.length === 1) return stops[0].hex;

  const sortedStops = [...stops].sort((a, b) => a.position - b.position);

  let currentStopIdx = 0;
  for (let i = 0; i < sortedStops.length - 1; i++) {
    if (position >= sortedStops[i].position && position <= sortedStops[i+1].position) {
      currentStopIdx = i;
      break;
    }
  }

  const stop1 = sortedStops[currentStopIdx];
  const stop2 = sortedStops[currentStopIdx + 1];

  if (!stop2 || position <= stop1.position) return stop1.hex;
  if (position >= stop2.position) return stop2.hex;

  const segmentRange = stop2.position - stop1.position;
  const positionInSegment = position - stop1.position;
  const factor = segmentRange === 0 ? 0 : positionInSegment / segmentRange;

  return interpolateColor(stop1.hex, stop2.hex, factor);
}

function formatHexToMinecraft(hex: string, options: FormatOptions): string {
  const cHex = hex.toUpperCase();
  const r1 = cHex[1], r2 = cHex[2];
  const g1 = cHex[3], g2 = cHex[4];
  const b1 = cHex[5], b2 = cHex[6];
  
  const output = `&x&${r1}&${r2}&${g1}&${g2}&${b1}&${b2}`;

  const modifiers = [];
  if (options.bold) modifiers.push('&l');
  if (options.italic) modifiers.push('&o');
  if (options.underline) modifiers.push('&n');
  if (options.strikethrough) modifiers.push('&m');
  if (options.obfuscated) modifiers.push('&k');

  return output + modifiers.join('');
}

function generateGradientText(text: string, colors: ColorStop[], options: FormatOptions): string {
  if (!text) return '';
  if (colors.length === 0) return text;
  
  const letters = text.split('');
  let outputText = '';
  const totalChars = letters.filter(c => c !== ' ').length;
  let charIndexCounter = 0;

  letters.forEach((char) => {
    if (char === ' ') {
      outputText += ' ';
      return;
    }
    const pos = totalChars > 1 ? charIndexCounter / (totalChars - 1) : 0;
    
    let hex = '#FFFFFF';
    if (colors.length === 1) {
      hex = colors[0].hex;
    } else {
      hex = getColorAtPosition(colors, pos);
    }

    outputText += formatHexToMinecraft(hex, options) + char;
    charIndexCounter++;
  });

  return outputText;
}

// ... (Keep existing imports and utilities up to generateGradientText)

// Bedrock standard 16 colors matching hex approximation
const BEDROCK_COLORS = [
  { code: '0', hex: '#000000' }, { code: '1', hex: '#0000AA' },
  { code: '2', hex: '#00AA00' }, { code: '3', hex: '#00AAAA' },
  { code: '4', hex: '#AA0000' }, { code: '5', hex: '#AA00AA' },
  { code: '6', hex: '#FFAA00' }, { code: '7', hex: '#AAAAAA' },
  { code: '8', hex: '#555555' }, { code: '9', hex: '#5555FF' },
  { code: 'a', hex: '#55FF55' }, { code: 'b', hex: '#55FFFF' },
  { code: 'c', hex: '#FF5555' }, { code: 'd', hex: '#FF55FF' },
  { code: 'e', hex: '#FFFF55' }, { code: 'f', hex: '#FFFFFF' },
];

function getClosestBedrockColor(hex: string) {
  const target = hexToRgb(hex);
  let closest = BEDROCK_COLORS[0];
  let minDiff = Infinity;
  for (const bc of BEDROCK_COLORS) {
    const c = hexToRgb(bc.hex);
    const diff = Math.pow(c.r - target.r, 2) + Math.pow(c.g - target.g, 2) + Math.pow(c.b - target.b, 2);
    if (diff < minDiff) {
      minDiff = diff;
      closest = bc;
    }
  }
  return closest.hex;
}

function renderPreviewText(outputText: string, edition: 'java' | 'bedrock' = 'java', selectedFont: string) {
  const tokens: React.ReactNode[] = [];
  
  let currentText = '';
  let currentColor = '#FFFFFF';
  let bold = false, italic = false, underline = false, strikethrough = false, obfuscated = false;

  const commitToken = (key: number) => {
    if (currentText) {
      tokens.push(
        <span key={`prev-${key}-${currentText}`} style={{
          color: currentColor,
          fontWeight: bold ? 'bold' : 'normal',
          fontStyle: italic ? 'italic' : 'normal',
          textDecoration: `${underline ? 'underline' : ''} ${strikethrough ? 'line-through' : ''}`.trim() || 'none',
          fontFamily: selectedFont || 'inherit'
        }} className={obfuscated ? 'animate-pulse opacity-50 bg-white/20' : ''}>
          {currentText}
        </span>
      );
      currentText = '';
    }
  };

  const regex = /(&x(?:&[0-9a-fA-F]){6}|&#[0-9a-fA-F]{6}|&[0-9a-fA-Fk-oK-OrR])(.*?)(?=&x|&#|&|$)/g;
  
  let match;
  let textIndex = 0;
  
  if (!outputText.match(/(​&x|&#|&[0-9a-fk-or])/i)) {
    return <span style={{ fontFamily: selectedFont || 'inherit' }}>{outputText}</span>;
  }

  while ((match = regex.exec(outputText)) !== null) {
      const code = match[1].toLowerCase();
      const content = match[2];

      commitToken(textIndex++);

      if (code.startsWith('&#')) {
        currentColor = code.replace('&', '');
      } else if (code.startsWith('&x')) {
        currentColor = '#' + code.replace(/&x|&/g, '').substring(0,6);
      } else if (code.length === 2 && code[0] === '&' && /[0-9a-f]/.test(code[1])) {
        const bc = BEDROCK_COLORS.find(b => b.code === code[1]);
        if(bc) currentColor = bc.hex;
      }
      
      if (edition === 'bedrock') {
        currentColor = getClosestBedrockColor(currentColor);
      }

      if (code === '&l') bold = true;
      else if (code === '&o') italic = true;
      else if (code === '&n') underline = true;
      else if (code === '&m') strikethrough = true;
      else if (code === '&k') obfuscated = true;
      else if (code === '&r') {
        bold = false; italic = false; underline = false; strikethrough = false; obfuscated = false; currentColor = '#ffffff';
      }
      
      currentText += content;
  }
  commitToken(textIndex);

  return <>{tokens}</>;
}

function randomHexColor(): string {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

interface FontManifest {
  primary: string | null;
  families: string[];
}

// ==== MAIN COMPONENT ====
export default function GradientGeneratorPage() {
  const [text, setText] = useState("Luminaris");
  
  const [colors, setColors] = useState<ColorStop[]>([
    { id: '1', hex: '#FFAC2B', position: 0 },
    { id: '2', hex: '#FCD05C', position: 1 }
  ]);
  
  const [openColorPickerId, setOpenColorPickerId] = useState<string | null>(null);

  const [options, setOptions] = useState<FormatOptions>({
    bold: true,
    italic: false,
    underline: false,
    strikethrough: false,
    obfuscated: false
  });
  
  const [outputText, setOutputText] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  
  const handleCopy = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch(err => console.error("Could not copy text: ", err));
  };
  
  // Font States
  const [fonts, setFonts] = useState<FontManifest | null>(null);
  const [javaFont, setJavaFont] = useState<string>('');
  const [bedrockFont, setBedrockFont] = useState<string>('');

  const [isJavaDropdownOpen, setIsJavaDropdownOpen] = useState(false);
  const [isBedrockDropdownOpen, setIsBedrockDropdownOpen] = useState(false);

  const sliderRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const javaDropdownRef = useRef<HTMLDivElement>(null);
  const bedrockDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/fonts-manifest.json')
      .then(res => res.json())
      .then((data: FontManifest) => {
        setFonts(data);
        const defaultFont = data.primary || (data.families.length > 0 ? data.families[0] : '');
        setJavaFont(defaultFont);
        setBedrockFont(defaultFont);
      })
      .catch(err => console.error("Could not load fonts manifest", err));
  }, []);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setOpenColorPickerId(null);
      }
      if (javaDropdownRef.current && !javaDropdownRef.current.contains(e.target as Node)) {
        setIsJavaDropdownOpen(false);
      }
      if (bedrockDropdownRef.current && !bedrockDropdownRef.current.contains(e.target as Node)) {
        setIsBedrockDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Recalculate output whenever anything changes
  useEffect(() => {
    const sortedColors = [...colors].sort((a,b) => a.position - b.position);
    const result = generateGradientText(text, sortedColors, options);
    setOutputText(result);
  }, [text, colors, options]);

  // Color Management
  const handleColorAmountChange = (delta: number) => {
    if (delta > 0 && colors.length < 10) {
      const newId = Date.now().toString();
      const lastColor = colors[colors.length - 1]?.hex || '#FFFFFF';
      const newColors = [...colors, { id: newId, hex: lastColor, position: 1 }];
      // Auto-disperse
      setColors(newColors.map((c, i) => ({
        ...c,
        position: newColors.length > 1 ? i / (newColors.length - 1) : 0
      })));
    } else if (delta < 0 && colors.length > 1) {
      const newColors = colors.slice(0, colors.length - 1);
      setColors(newColors.map((c, i) => ({
        ...c,
        position: newColors.length > 1 ? i / (newColors.length - 1) : 0
      })));
    }
  };

  const randomizeColors = () => {
    setColors(prev => prev.map(c => ({ ...c, hex: randomHexColor() })));
  };

  const deleteColor = (id: string) => {
    if (colors.length <= 1) return;
    setColors(prev => prev.filter(c => c.id !== id));
  };

  const moveColor = (index: number, direction: 'up' | 'down') => {
    const newColors = [...colors];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newColors.length) return;
    // Swap positions
    const tempPos = newColors[index].position;
    newColors[index].position = newColors[targetIndex].position;
    newColors[targetIndex].position = tempPos;
    // Swap in array
    [newColors[index], newColors[targetIndex]] = [newColors[targetIndex], newColors[index]];
    setColors(newColors);
  };

  const updateColorHex = (id: string, hex: string) => {
    setColors(prev => prev.map(c => c.id === id ? { ...c, hex } : c));
  };

  // Slider Dragging Logic
  const handleDragStart = (e: React.PointerEvent, id: string) => {
    const slider = sliderRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();

    const handlePointerMove = (moveEv: PointerEvent) => {
      const relativeX = moveEv.clientX - rect.left;
      let newPos = relativeX / rect.width;
      newPos = Math.max(0, Math.min(1, newPos));
      
      setColors(prev => prev.map(c => c.id === id ? { ...c, position: newPos } : c));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Produce text elements styled with color gradient based on current text content
  const renderInputPreview = () => {
    if (!text) return null;
    const sortedColors = [...colors].sort((a,b) => a.position - b.position);
    const chars = text.split('');
    const nonSpaceCount = chars.filter(c => c !== ' ').length;
    let charIdx = 0;

    return chars.map((char, i) => {
      if (char === ' ') return <span key={i}>&nbsp;</span>;
      const pos = nonSpaceCount > 1 ? charIdx / (nonSpaceCount - 1) : 0;
      const color = sortedColors.length === 1 ? sortedColors[0].hex : getColorAtPosition(sortedColors, pos);
      charIdx++;
      return <span key={i} style={{ color }}>{char}</span>;
    });
  };

  const formatBtns: { key: keyof FormatOptions; label: string; style?: React.CSSProperties; className?: string }[] = [
    { key: 'bold', label: 'B', className: 'font-bold' },
    { key: 'italic', label: 'I', style: { transform: 'rotate(10deg)' }, className: 'font-bold' },
    { key: 'underline', label: 'U', className: 'underline' },
    { key: 'strikethrough', label: 'S', className: 'line-through' },
  ];  return (
    <div className="w-full bg-transparent text-foreground py-4 md:py-6" style={{ fontFamily: "var(--font-primary)" }}>
      {/* Maximum width container roughly matching the design proportions */}
      <div className="max-w-[1392px] mx-auto px-4 md:px-8 space-y-6">
        
        {/* ==== HEADER & INPUT SECTION ==== */}
        <div className="space-y-4 animate-fade-in-down">
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide">
            ตัวสร้างข้อความไล่ระดับสี
          </h1>
 
          <div className="relative">
             {/* Subtitle & Format Buttons in same perceived line */}
             <div className="flex justify-between items-end mb-3">
                <p className="text-sm text-muted-foreground">
                  พิมพ์ที่นี่เพื่อสร้างข้อความ
                </p>
                
                {/* Format Buttons (B I U S) */}
                <div className="flex rounded-md overflow-hidden bg-card border border-border">
                  {formatBtns.map((btn, i) => (
                    <button
                      key={btn.key}
                      onClick={() => setOptions(p => ({...p, [btn.key]: !p[btn.key]}))}
                      className={`w-10 h-10 flex items-center justify-center text-xl transition-colors
                        ${i !== 0 ? 'border-l border-border' : ''}
                        ${options[btn.key] ? 'bg-transparent text-foreground font-bold' : 'bg-transparent text-muted-foreground hover:bg-card-hover hover:text-foreground'}
                      `}
                    >
                      <span className={btn.className} style={btn.style}>{btn.label}</span>
                    </button>
                  ))}
                </div>
             </div>
 
             {/* Main Input Box */}
             <div className="flex bg-card border border-border rounded-md h-[50px] relative">
               <div className="flex items-center px-6 h-full shrink-0">
                 <span className="text-foreground font-bold text-base whitespace-nowrap">{'>_'} ใส่ข้อความ</span>
               </div>
               {/* Vertical Divider line */}
               <div className="h-full w-[1px] bg-border my-auto"></div>
               <div className="flex-1 relative h-full">
                 <input
                   type="text"
                   value={text}
                   onChange={e => setText(e.target.value)}
                   className="absolute inset-0 w-full h-full bg-transparent px-6 text-xl font-bold outline-none text-transparent caret-foreground z-10"
                   style={{ caretColor: 'var(--foreground)' }}
                 />
                 <div className="absolute inset-0 flex items-center px-6 pointer-events-none text-xl font-bold whitespace-nowrap z-0">
                   {renderInputPreview()}
                 </div>
               </div>
             </div>
 
             {/* Gradient Bar directly underneath */}
             <div className="mt-4 px-0 relative">
               <div
                 ref={sliderRef}
                 className="h-[8px] rounded-full relative"
                 style={{
                   background: `linear-gradient(to right, ${
                     [...colors].sort((a,b) => a.position - b.position)
                       .map(c => `${c.hex} ${c.position * 100}%`).join(', ')
                   })`
                 }}
               >
                 {colors.map((c) => (
                   <div
                     key={c.id}
                     onPointerDown={(e) => handleDragStart(e, c.id)}
                     className="absolute top-1/2 w-[16px] h-[16px] rounded-full border border-black cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                     style={{
                       left: `${c.position * 100}%`,
                       transform: 'translate(-50%, -50%)',
                       backgroundColor: c.hex,
                     }}
                   />
                 ))}
               </div>
             </div>
          </div>
        </div>
 
 
        {/* ==== 2-COLUMN MAIN CONTENT SECTION ==== */}
        <div className="grid grid-cols-1 lg:grid-cols-[427px_1fr] gap-6">
          
          {/* LEFT: Colors Panel */}
          <div className="space-y-4 animate-fade-in-left delay-100">
            <h2 className="text-2xl md:text-3xl font-bold tracking-wide mb-4">เลือกสี</h2>
            
            <div className="space-y-4">
               <div className="flex flex-col space-y-2 max-w-[334px]">
                 <label className="text-lg md:text-xl font-medium text-foreground">จำนวนสี</label>
                 
                 {/* Color Amount Controls */}
                 <div className="flex bg-card border border-border rounded-md h-[40px] overflow-hidden">
                   <button onClick={() => handleColorAmountChange(-1)} className="w-[50px] md:w-[60px] h-full text-foreground hover:bg-card-hover font-bold text-xl">−</button>
                   <div className="flex-1 text-center flex items-center justify-center font-bold text-lg pointer-events-none text-foreground">
                     {colors.length}
                   </div>
                   <button onClick={() => handleColorAmountChange(1)} className="w-[50px] md:w-[60px] h-full text-foreground hover:bg-card-hover font-bold text-xl">+</button>
                 </div>
                 
                 {/* Random Button */}
                 <button onClick={randomizeColors} className="w-full h-[40px] bg-card border border-border rounded-md text-foreground font-medium text-base hover:bg-card-hover">
                   Random
                 </button>
               </div>
 
               {/* Colors List */}
               <div className="space-y-4 pt-4 max-w-[334px]" ref={colorPickerRef}>
                 {colors.map((c, i) => (
                   <div key={c.id} className="relative group">
                     <div className="flex items-center gap-2">
                       {/* Arrow Button */}
                       <button
                         onClick={() => moveColor(i, i === 0 ? 'down' : 'up')}
                         className={`w-[40px] h-[40px] flex items-center justify-center bg-card border border-border rounded-md transition-colors font-bold text-foreground
                           ${colors.length <= 1 ? 'opacity-30 cursor-default' : 'hover:bg-card-hover'}
                         `}
                         disabled={colors.length <= 1}
                       >
                         {/* Toggle arrow direction based on position */}
                         <span className={i === 0 && colors.length > 1 ? "rotate-180" : ""}>V</span>
                       </button>
 
                       {/* Color Hex Block */}
                       <button
                         onClick={() => setOpenColorPickerId(openColorPickerId === c.id ? null : c.id)}
                         className="flex-1 h-[40px] rounded-md flex items-center px-4 font-mono text-lg uppercase transition-transform active:scale-[0.98] border border-border"
                         style={{ backgroundColor: c.hex, color: isLightColor(c.hex) ? '#000' : '#fff' }}
                       >
                         {c.hex.replace('#', '# ')}
                       </button>
 
                       {/* Minus Delete Button */}
                       <button
                         onClick={() => deleteColor(c.id)}
                         className={`w-[40px] h-[40px] flex items-center justify-center bg-card border border-red-600 rounded-md transition-colors text-foreground text-3xl pb-1
                           ${colors.length <= 1 ? 'opacity-30 cursor-default' : 'hover:bg-red-900/30'}
                         `}
                         disabled={colors.length <= 1}
                       >
                         −
                       </button>
                     </div>
 
                    {/* Color Picker Popup */}
                     {openColorPickerId === c.id && (
                       <div className="absolute z-50 left-12 bottom-full mb-2 p-3 bg-card border border-border rounded-md shadow-2xl w-[220px]">
                         {/* Wrapper to force react-colorful to take full width */}
                         <div className="react-colorful-custom-wrapper">
                           <HexColorPicker color={c.hex} onChange={(hex) => updateColorHex(c.id, hex)} />
                         </div>
                         <div className="mt-3 flex items-center bg-card rounded border border-border px-3">
                           <span className="text-muted-foreground font-mono">#</span>
                           <input
                             type="text"
                             value={c.hex.replace('#', '')}
                             onChange={(e) => {
                               const val = e.target.value;
                               if (/^[0-9a-fA-F]{0,6}$/.test(val)) {
                                 updateColorHex(c.id, '#' + val);
                               }
                             }}
                             className="w-full bg-transparent py-2 px-1 text-foreground font-mono outline-none uppercase"
                             maxLength={6}
                           />
                         </div>
                       </div>
                     )}
                   </div>
                 ))}
               </div>
            </div>
          </div>
 
 
          {/* RIGHT: Output & Previews Panel */}
          <div className="space-y-6 animate-fade-in-right delay-200">
            
            {/* Output Segment */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl md:text-3xl font-bold tracking-wide text-foreground">ผลลัพธ์</h2>
                <button 
                  onClick={handleCopy}
                  className={`px-4 py-1.5 rounded-md font-bold text-sm transition-colors flex items-center gap-2 border
                    ${copySuccess 
                      ? 'bg-green-600/20 text-green-400 border-green-600/50' 
                      : 'bg-card text-muted-foreground border-border hover:bg-card-hover hover:text-foreground'
                    }
                  `}
                >
                  {copySuccess ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      Copy Code
                    </>
                  )}
                </button>
              </div>
              <div className="bg-card border border-border rounded-md p-4 min-h-[140px]">
                 <p className="text-foreground text-lg md:text-xl font-normal leading-relaxed break-all whitespace-pre-wrap font-mono">
                   {outputText || 'No output text.'}
                 </p>
              </div>
            </div>

            {/* Java Edition Preview Segment */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-wide flex items-center gap-2 text-foreground">
                  Java Edition Preview
                </h2>
                {/* Custom Font Selector for Java Preview */}
                 <div className="flex items-center gap-3 bg-muted pr-1 pl-4 py-1 rounded-md border border-border">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">ฟอนต์</span>
                    <div className="relative border-l border-border pl-2" ref={javaDropdownRef}>
                      <div className="custom-dropdown min-w-[150px]">
                        <button 
                          type="button"
                          className={`dropdown-trigger ${isJavaDropdownOpen ? 'active' : ''}`}
                          onClick={() => setIsJavaDropdownOpen(!isJavaDropdownOpen)}
                          style={{ padding: '0.375rem 0.75rem', borderRadius: '0.5rem', minHeight: '34px' }}
                        >
                          <span style={{ fontFamily: javaFont === 'inherit' ? 'inherit' : javaFont }}>
                            {javaFont === 'inherit' ? 'System Default' : javaFont}
                          </span>
                          <div className="dropdown-arrow">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </button>
                        
                        <div className={`dropdown-menu ${isJavaDropdownOpen ? 'open' : ''}`} style={{ width: '180px', right: 0, left: 'auto' }}>
                          <button
                            type="button"
                            className={`dropdown-item ${javaFont === 'inherit' ? 'selected' : ''}`}
                            onClick={() => {
                              setJavaFont('inherit');
                              setIsJavaDropdownOpen(false);
                            }}
                          >
                            <span>System Default</span>
                            <div className="item-check">✓</div>
                          </button>
                          
                          {fonts?.families.map((f) => (
                            <button
                              key={f}
                              type="button"
                              className={`dropdown-item ${javaFont === f ? 'selected' : ''}`}
                              onClick={() => {
                                setJavaFont(f);
                                setIsJavaDropdownOpen(false);
                              }}
                              style={{ fontFamily: f }}
                            >
                              <span>{f}</span>
                              <div className="item-check">✓</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
              <div className="bg-card border border-border rounded-md px-6 py-4 min-h-[86px] flex flex-col justify-center">
                 <span className="text-[36px] font-bold drop-shadow-md whitespace-nowrap overflow-x-auto custom-scrollbar overflow-y-hidden text-foreground">
                   {renderPreviewText(outputText, 'java', javaFont)}
                 </span>
              </div>
            </div>
 
            {/* Bedrock Edition Preview Segment */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-wide flex items-center gap-2 text-foreground">
                  Bedrock Edition Preview
                </h2>
                {/* Custom Font Selector for Bedrock Preview */}
                 <div className="flex items-center gap-3 bg-muted pr-1 pl-4 py-1 rounded-md border border-border">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">ฟอนต์</span>
                    <div className="relative border-l border-border pl-2" ref={bedrockDropdownRef}>
                      <div className="custom-dropdown min-w-[150px]">
                        <button 
                          type="button"
                          className={`dropdown-trigger ${isBedrockDropdownOpen ? 'active' : ''}`}
                          onClick={() => setIsBedrockDropdownOpen(!isBedrockDropdownOpen)}
                          style={{ padding: '0.375rem 0.75rem', borderRadius: '0.5rem', minHeight: '34px' }}
                        >
                          <span style={{ fontFamily: bedrockFont === 'inherit' ? 'inherit' : bedrockFont }}>
                            {bedrockFont === 'inherit' ? 'System Default' : bedrockFont}
                          </span>
                          <div className="dropdown-arrow">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </button>
                        
                        <div className={`dropdown-menu ${isBedrockDropdownOpen ? 'open' : ''}`} style={{ width: '180px', right: 0, left: 'auto' }}>
                          <button
                            type="button"
                            className={`dropdown-item ${bedrockFont === 'inherit' ? 'selected' : ''}`}
                            onClick={() => {
                              setBedrockFont('inherit');
                              setIsBedrockDropdownOpen(false);
                            }}
                          >
                            <span>System Default</span>
                            <div className="item-check">✓</div>
                          </button>
                          
                          {fonts?.families.map((f) => (
                            <button
                              key={f}
                              type="button"
                              className={`dropdown-item ${bedrockFont === f ? 'selected' : ''}`}
                              onClick={() => {
                                setBedrockFont(f);
                                setIsBedrockDropdownOpen(false);
                              }}
                              style={{ fontFamily: f }}
                            >
                              <span>{f}</span>
                              <div className="item-check">✓</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
              <div className="bg-card border border-border rounded-md px-6 py-4 min-h-[86px] flex flex-col justify-center">
                 <span className="text-[36px] font-bold drop-shadow-md whitespace-nowrap overflow-x-auto custom-scrollbar overflow-y-hidden text-foreground">
                   {renderPreviewText(outputText, 'bedrock', bedrockFont)}
                 </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
  return luminance > 140;
}
