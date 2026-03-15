"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Palette,
  Layout,
  X,
  ChevronDown,
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
const FONT_SIZES = [
  { label: "Default", value: "" },
  { label: "8 pt (10.67px)", value: "10.67px" },
  { label: "9 pt (12px)", value: "12px" },
  { label: "10 pt (13.33px)", value: "13.33px" },
  { label: "11 pt (14.67px)", value: "14.67px" },
  { label: "12 pt (16px)", value: "16px" },
  { label: "14 pt (18.67px)", value: "18.67px" },
  { label: "16 pt (21.33px)", value: "21.33px" },
  { label: "18 pt (24px)", value: "24px" },
  { label: "20 pt (26.67px)", value: "26.67px" },
  { label: "24 pt (32px)", value: "32px" },
  { label: "28 pt (37.33px)", value: "37.33px" },
  { label: "32 pt (42.67px)", value: "42.67px" },
  { label: "36 pt (48px)", value: "48px" },
  { label: "48 pt (64px)", value: "64px" },
  { label: "72 pt (96px)", value: "96px" },
]
const FONT_SIZE_SUGGESTIONS = FONT_SIZES.map((size) => size.value).filter(Boolean)
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
  const [showFontSizeOptions, setShowFontSizeOptions] = useState(false)
  const stylesRef = useRef<Record<string, string>>(snapshot?.styles ?? {})

  // Sync from snapshot when we first get a selection (so we show actual text and styles)
  useEffect(() => {
    const c = snapshot?.content
    const s = snapshot?.styles
    setContent(typeof c === "string" ? c : "")
    setStyles(s && typeof s === "object" ? { ...s } : {})
    stylesRef.current = s && typeof s === "object" ? { ...s } : {}
    setShowFontSizeOptions(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when selection changes
  }, [selectedId])

  const updateStyle = useCallback(
    (key: string, value: string) => {
      const next = { ...stylesRef.current, [key]: value }
      stylesRef.current = next
      setStyles(next)
      onApply({ styles: next })
    },
    [onApply]
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
        "flex h-full flex-col overflow-hidden border-l border-zinc-200 bg-[#f5f5f2] text-zinc-900",
        className
      )}
    >
      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
            <Type className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="truncate text-sm font-medium text-zinc-900">{description || "Element"}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
            className="h-7 w-7 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Content */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-3.5">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Content
          </h3>
          <Textarea
            value={content}
            onChange={handleContentChange}
            onBlur={handleContentBlur}
            placeholder="Edit text..."
            className="min-h-[90px] resize-none border-zinc-200 bg-[#f8f8f5] text-sm text-zinc-900 focus-visible:ring-zinc-300"
          />
        </section>

        {/* Typography */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-3.5">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Typography
          </h3>
          <div className="space-y-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-zinc-500">Font</label>
              <select
                value={fontFamily || "Default"}
                onChange={(e) => updateStyle("fontFamily", e.target.value === "Default" ? "" : e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-[#f8f8f5] px-2 text-xs text-zinc-800"
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
                <label className="mb-0.5 block text-[10px] text-zinc-500">Weight</label>
                <select
                  value={fontWeight || "Default"}
                  onChange={(e) => updateStyle("fontWeight", e.target.value === "Default" ? "" : e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-[#f8f8f5] px-2 text-xs text-zinc-800"
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
                <label className="mb-0.5 block text-[10px] text-zinc-500">Size</label>
                <div className="relative">
                  <Input
                    value={fontSize}
                    onChange={(e) => updateStyle("fontSize", e.target.value)}
                    onFocus={() => setShowFontSizeOptions(true)}
                    placeholder="Choose or type a size"
                    className="h-9 border-zinc-200 bg-[#f8f8f5] pr-8 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFontSizeOptions((prev) => !prev)}
                    className="absolute inset-y-0 right-0 inline-flex w-8 items-center justify-center text-zinc-500"
                    aria-label="Open font size options"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {showFontSizeOptions ? (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                      {FONT_SIZE_SUGGESTIONS.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            updateStyle("fontSize", size)
                            setShowFontSizeOptions(false)
                          }}
                          className="flex w-full items-center px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] text-zinc-500">Line height</label>
                <Input
                  value={lineHeight}
                  onChange={(e) => updateStyle("lineHeight", e.target.value)}
                  placeholder="e.g. 1.5"
                  className="h-9 border-zinc-200 bg-[#f8f8f5] text-xs"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-zinc-500">Letter spacing</label>
                <Input
                  value={letterSpacing}
                  onChange={(e) => updateStyle("letterSpacing", e.target.value)}
                  placeholder="e.g. 0.05em"
                  className="h-9 border-zinc-200 bg-[#f8f8f5] text-xs"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-zinc-500">Alignment</label>
              <div className="flex gap-0.5">
                {ALIGNMENTS.map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateStyle("textAlign", value)}
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded border transition-colors",
                      textAlign === value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-[#f8f8f5] text-zinc-500 hover:bg-zinc-100"
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
                  fontStyle === "italic" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-[#f8f8f5] text-zinc-700"
                )}
              >
                I
              </button>
              <button
                type="button"
                onClick={() => updateStyle("textDecoration", textDecoration.includes("underline") ? "" : "underline")}
                className={cn(
                  "h-8 px-2 text-xs font-medium rounded border",
                  textDecoration.includes("underline") ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-[#f8f8f5] text-zinc-700"
                )}
              >
                U
              </button>
              <button
                type="button"
                onClick={() => updateStyle("textDecoration", textDecoration.includes("line-through") ? "" : "line-through")}
                className={cn(
                  "h-8 px-2 text-xs font-medium rounded border",
                  textDecoration.includes("line-through") ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-[#f8f8f5] text-zinc-700"
                )}
              >
                S
              </button>
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-zinc-500">Text transform</label>
              <select
                value={textTransform}
                onChange={(e) => updateStyle("textTransform", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-[#f8f8f5] px-2 text-xs text-zinc-800"
              >
                {TEXT_TRANSFORMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Color */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-3.5">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <Palette className="w-3.5 h-3.5" />
            Color
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={colorHex}
              onChange={(e) => updateStyle("color", e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border border-zinc-200 bg-white"
            />
            <Input
              value={color}
              onChange={(e) => updateStyle("color", e.target.value)}
              placeholder="e.g. #c92a2a or rgb(201,42,42)"
              className="h-9 flex-1 border-zinc-200 bg-[#f8f8f5] font-mono text-xs"
            />
          </div>
        </section>

        {/* Background */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-3.5">
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Background
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bgHex}
              onChange={(e) => updateStyle("backgroundColor", e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border border-zinc-200 bg-white"
            />
            <Input
              value={backgroundColor}
              onChange={(e) => updateStyle("backgroundColor", e.target.value)}
              placeholder="transparent or #..."
              className="h-9 flex-1 border-zinc-200 bg-[#f8f8f5] font-mono text-xs"
            />
          </div>
        </section>

        {/* Opacity */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-3.5">
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Opacity
          </h3>
          <Input
            value={opacity}
            onChange={(e) => updateStyle("opacity", e.target.value)}
            placeholder="e.g. 1 or 0.8"
            className="h-9 border-zinc-200 bg-[#f8f8f5] text-xs"
          />
        </section>

        {/* Border */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-3.5">
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Border
          </h3>
          <div className="space-y-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-zinc-500">Width</label>
              <Input
                value={borderWidth}
                onChange={(e) => updateStyle("borderWidth", e.target.value)}
                placeholder="e.g. 1px"
                className="h-9 border-zinc-200 bg-[#f8f8f5] text-xs"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-zinc-500">Color</label>
              <Input
                value={borderColor}
                onChange={(e) => updateStyle("borderColor", e.target.value)}
                placeholder="e.g. #ccc"
                className="h-9 border-zinc-200 bg-[#f8f8f5] font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-zinc-500">Radius</label>
              <Input
                value={borderRadius}
                onChange={(e) => updateStyle("borderRadius", e.target.value)}
                placeholder="e.g. 0.5rem"
                className="h-9 border-zinc-200 bg-[#f8f8f5] text-xs"
              />
            </div>
          </div>
        </section>

        {/* Box shadow */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-3.5">
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Box shadow
          </h3>
          <Input
            value={boxShadow}
            onChange={(e) => updateStyle("boxShadow", e.target.value)}
            placeholder="e.g. 0 1px 3px rgba(0,0,0,0.2)"
            className="h-9 border-zinc-200 bg-[#f8f8f5] font-mono text-xs"
          />
        </section>

        {/* Layout */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-3.5">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <Layout className="w-3.5 h-3.5" />
            Layout
          </h3>
          <div className="space-y-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-zinc-500">Padding</label>
              <Input
                value={padding}
                onChange={(e) => updateStyle("padding", e.target.value)}
                placeholder="e.g. 1rem 0.5rem"
                className="h-9 border-zinc-200 bg-[#f8f8f5] text-xs"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-zinc-500">Margin</label>
              <Input
                value={margin}
                onChange={(e) => updateStyle("margin", e.target.value)}
                placeholder="e.g. 0 1rem"
                className="h-9 border-zinc-200 bg-[#f8f8f5] text-xs"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
