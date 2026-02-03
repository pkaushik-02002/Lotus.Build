"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Palette,
  Layout,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export interface DesignSnapshot {
  content?: string
  styles?: Record<string, string>
}

/** Parse computed color (rgb/rgba/hex) to #rrggbb for picker; return as-is for display */
function cssColorToHex(css: string): string {
  if (!css || css === "transparent" || css === "rgba(0, 0, 0, 0)") return "#000000"
  const hex = /^#([0-9A-Fa-f]{6})$/.exec(css)
  if (hex) return css
  const rgb = /^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(css)
  if (rgb) {
    const r = Number(rgb[1]).toString(16).padStart(2, "0")
    const g = Number(rgb[2]).toString(16).padStart(2, "0")
    const b = Number(rgb[3]).toString(16).padStart(2, "0")
    return `#${r}${g}${b}`
  }
  const rgba = /^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/.exec(css)
  if (rgba) {
    const r = Number(rgba[1]).toString(16).padStart(2, "0")
    const g = Number(rgba[2]).toString(16).padStart(2, "0")
    const b = Number(rgba[3]).toString(16).padStart(2, "0")
    return `#${r}${g}${b}`
  }
  return css
}

const FONT_FAMILIES = [
  "Default",
  "Inter",
  "system-ui",
  "Georgia",
  "serif",
  "sans-serif",
  "monospace",
]
const FONT_WEIGHTS = ["Default", "300", "400", "500", "600", "700", "800", "bold", "normal"]
const FONT_SIZES = ["Default", "0.75rem", "0.875rem", "1rem", "1.125rem", "1.25rem", "1.5rem", "2rem", "2.25rem", "3rem"]
const ALIGNMENTS = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
  { value: "justify", icon: AlignJustify },
] as const
const TEXT_TRANSFORMS = ["none", "uppercase", "lowercase", "capitalize"]

export interface VisualEditDesignPanelProps {
  selectedId: string
  description: string | null
  snapshot: DesignSnapshot
  onApply: (payload: { content?: string; styles?: Record<string, string> }) => void
  onClose: () => void
  className?: string
}

export function VisualEditDesignPanel({
  selectedId,
  description,
  snapshot,
  onApply,
  onClose,
  className,
}: VisualEditDesignPanelProps) {
  const [content, setContent] = useState(() => snapshot?.content ?? "")
  const [styles, setStyles] = useState<Record<string, string>>(() => snapshot?.styles ?? {})

  // Sync from snapshot when we first get a selection (so we show actual text and styles)
  useEffect(() => {
    const c = snapshot?.content
    const s = snapshot?.styles
    setContent(typeof c === "string" ? c : "")
    setStyles(s && typeof s === "object" ? { ...s } : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when selection changes
  }, [selectedId])

  const updateStyle = useCallback(
    (key: string, value: string) => {
      const next = { ...styles, [key]: value }
      setStyles(next)
      onApply({ styles: next })
    },
    [styles, onApply]
  )

  const handleContentBlur = useCallback(() => {
    if (content !== (snapshot.content ?? "")) onApply({ content })
  }, [content, snapshot.content, onApply])

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setContent(v)
    onApply({ content: v })
  }

  const fontFamily = styles.fontFamily ?? ""
  const fontSize = styles.fontSize ?? ""
  const fontWeight = styles.fontWeight ?? ""
  const color = styles.color ?? ""
  const backgroundColor = styles.backgroundColor ?? ""
  const colorHex = cssColorToHex(color)
  const bgHex = cssColorToHex(backgroundColor)
  const textAlign = (styles.textAlign ?? "left") as "left" | "center" | "right" | "justify"
  const lineHeight = styles.lineHeight ?? ""
  const letterSpacing = styles.letterSpacing ?? ""
  const fontStyle = styles.fontStyle ?? ""
  const textDecoration = styles.textDecoration ?? ""
  const textTransform = styles.textTransform ?? "none"
  const opacity = styles.opacity ?? ""
  const borderWidth = styles.borderWidth ?? ""
  const borderColor = styles.borderColor ?? ""
  const borderRadius = styles.borderRadius ?? ""
  const boxShadow = styles.boxShadow ?? ""
  const padding =
    styles.padding ??
    ([styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft]
      .filter(Boolean)
      .join(" ") || "")
  const margin =
    styles.margin ??
    ([styles.marginTop, styles.marginRight, styles.marginBottom, styles.marginLeft]
      .filter(Boolean)
      .join(" ") || "")

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-zinc-900 border-l border-zinc-800 text-zinc-200 overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between shrink-0 px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Type className="w-4 h-4 text-zinc-500 shrink-0" />
          <span className="text-xs font-medium truncate">{description || "Element"}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Content */}
        <section>
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
            Content
          </h3>
          <Textarea
            value={content}
            onChange={handleContentChange}
            onBlur={handleContentBlur}
            placeholder="Edit text..."
            className="min-h-[80px] text-sm bg-zinc-800/50 border-zinc-700 resize-none focus-visible:ring-1"
          />
        </section>

        {/* Typography */}
        <section>
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
            Typography
          </h3>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Font</label>
              <select
                value={fontFamily || "Default"}
                onChange={(e) => updateStyle("fontFamily", e.target.value === "Default" ? "" : e.target.value)}
                className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 text-zinc-200"
              >
                {fontFamily && !FONT_FAMILIES.includes(fontFamily) && (
                  <option value={fontFamily}>{fontFamily.split(",")[0]?.trim() || fontFamily}</option>
                )}
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Weight</label>
                <select
                  value={fontWeight || "Default"}
                  onChange={(e) => updateStyle("fontWeight", e.target.value === "Default" ? "" : e.target.value)}
                  className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 text-zinc-200"
                >
                  {fontWeight && !FONT_WEIGHTS.includes(fontWeight) && (
                    <option value={fontWeight}>{fontWeight}</option>
                  )}
                  {FONT_WEIGHTS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Size</label>
                <select
                  value={fontSize || "Default"}
                  onChange={(e) => updateStyle("fontSize", e.target.value === "Default" ? "" : e.target.value)}
                  className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 text-zinc-200"
                >
                  {fontSize && !FONT_SIZES.includes(fontSize) && (
                    <option value={fontSize}>{fontSize}</option>
                  )}
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Line height</label>
                <Input
                  value={lineHeight}
                  onChange={(e) => updateStyle("lineHeight", e.target.value)}
                  placeholder="e.g. 1.5"
                  className="h-8 text-xs bg-zinc-800 border-zinc-700"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Letter spacing</label>
                <Input
                  value={letterSpacing}
                  onChange={(e) => updateStyle("letterSpacing", e.target.value)}
                  placeholder="e.g. 0.05em"
                  className="h-8 text-xs bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Alignment</label>
              <div className="flex gap-0.5">
                {ALIGNMENTS.map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateStyle("textAlign", value)}
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded border transition-colors",
                      textAlign === value
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                    )}
                    title={value}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => updateStyle("fontStyle", fontStyle === "italic" ? "" : "italic")}
                className={cn(
                  "h-8 px-2 text-xs font-medium rounded border",
                  fontStyle === "italic" ? "bg-amber-500/20 border-amber-500/50" : "bg-zinc-800 border-zinc-700"
                )}
              >
                I
              </button>
              <button
                type="button"
                onClick={() => updateStyle("textDecoration", textDecoration.includes("underline") ? "" : "underline")}
                className={cn(
                  "h-8 px-2 text-xs font-medium rounded border",
                  textDecoration.includes("underline") ? "bg-amber-500/20 border-amber-500/50" : "bg-zinc-800 border-zinc-700"
                )}
              >
                U
              </button>
              <button
                type="button"
                onClick={() => updateStyle("textDecoration", textDecoration.includes("line-through") ? "" : "line-through")}
                className={cn(
                  "h-8 px-2 text-xs font-medium rounded border",
                  textDecoration.includes("line-through") ? "bg-amber-500/20 border-amber-500/50" : "bg-zinc-800 border-zinc-700"
                )}
              >
                S
              </button>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Text transform</label>
              <select
                value={textTransform}
                onChange={(e) => updateStyle("textTransform", e.target.value)}
                className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 text-zinc-200"
              >
                {TEXT_TRANSFORMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Color */}
        <section>
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" />
            Color
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={colorHex}
              onChange={(e) => updateStyle("color", e.target.value)}
              className="w-8 h-8 rounded border border-zinc-700 cursor-pointer bg-transparent"
            />
            <Input
              value={color}
              onChange={(e) => updateStyle("color", e.target.value)}
              placeholder="e.g. #c92a2a or rgb(201,42,42)"
              className="h-8 text-xs bg-zinc-800 border-zinc-700 flex-1 font-mono"
            />
          </div>
        </section>

        {/* Background */}
        <section>
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
            Background
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bgHex}
              onChange={(e) => updateStyle("backgroundColor", e.target.value)}
              className="w-8 h-8 rounded border border-zinc-700 cursor-pointer bg-transparent"
            />
            <Input
              value={backgroundColor}
              onChange={(e) => updateStyle("backgroundColor", e.target.value)}
              placeholder="transparent or #..."
              className="h-8 text-xs bg-zinc-800 border-zinc-700 flex-1 font-mono"
            />
          </div>
        </section>

        {/* Opacity */}
        <section>
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
            Opacity
          </h3>
          <Input
            value={opacity}
            onChange={(e) => updateStyle("opacity", e.target.value)}
            placeholder="e.g. 1 or 0.8"
            className="h-8 text-xs bg-zinc-800 border-zinc-700"
          />
        </section>

        {/* Border */}
        <section>
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
            Border
          </h3>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Width</label>
              <Input
                value={borderWidth}
                onChange={(e) => updateStyle("borderWidth", e.target.value)}
                placeholder="e.g. 1px"
                className="h-8 text-xs bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Color</label>
              <Input
                value={borderColor}
                onChange={(e) => updateStyle("borderColor", e.target.value)}
                placeholder="e.g. #ccc"
                className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Radius</label>
              <Input
                value={borderRadius}
                onChange={(e) => updateStyle("borderRadius", e.target.value)}
                placeholder="e.g. 0.5rem"
                className="h-8 text-xs bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
        </section>

        {/* Box shadow */}
        <section>
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
            Box shadow
          </h3>
          <Input
            value={boxShadow}
            onChange={(e) => updateStyle("boxShadow", e.target.value)}
            placeholder="e.g. 0 1px 3px rgba(0,0,0,0.2)"
            className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
          />
        </section>

        {/* Layout */}
        <section>
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Layout className="w-3.5 h-3.5" />
            Layout
          </h3>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Padding</label>
              <Input
                value={padding}
                onChange={(e) => updateStyle("padding", e.target.value)}
                placeholder="e.g. 1rem 0.5rem"
                className="h-8 text-xs bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Margin</label>
              <Input
                value={margin}
                onChange={(e) => updateStyle("margin", e.target.value)}
                placeholder="e.g. 0 1rem"
                className="h-8 text-xs bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
