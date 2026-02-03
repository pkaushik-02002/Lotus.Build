"use client"

import React, { useRef, useState, useEffect, useCallback } from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { VisualEditDesignPanel, type DesignSnapshot } from "./visual-edit-design-panel"

type Rect = { x: number; y: number; width: number; height: number }
type Viewport = { w: number; h: number }

export interface PreviewWithVisualEditProps {
  src: string | null
  canEdit?: boolean
  /** When false, hover/select overlays and "Edit with AI" are disabled (visual edit off). Default false so it only activates when user turns it on. */
  enabled?: boolean
  onEditWithAI: (description: string, userRequest: string) => void
  className?: string
  iframeKey?: string | number
}

export function PreviewWithVisualEdit({
  src,
  canEdit = true,
  enabled = false,
  onEditWithAI,
  className,
  iframeKey,
}: PreviewWithVisualEditProps) {
  const previewAreaRef = useRef<HTMLDivElement>(null)
  const [previewSize, setPreviewSize] = useState({ w: 1, h: 1 })
  const [hover, setHover] = useState<{ rect: Rect; viewport: Viewport } | null>(null)
  const [select, setSelect] = useState<{
    id: string
    rect: Rect
    viewport: Viewport
    description: string | null
    snapshot: DesignSnapshot
  } | null>(null)
  const [editInput, setEditInput] = useState("")
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const updateSize = useCallback(() => {
    const el = previewAreaRef.current
    if (el) {
      const { width, height } = el.getBoundingClientRect()
      setPreviewSize((prev) =>
        prev.w !== width || prev.h !== height ? { w: width, h: height } : prev
      )
    }
  }, [])

  useEffect(() => {
    const el = previewAreaRef.current
    if (!el) return
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateSize, src])

  useEffect(() => {
    if (!enabled) {
      setHover(null)
      setSelect(null)
    }
  }, [enabled])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!enabled) return
      const d = e.data
      if (!d || typeof d !== "object" || d.type === undefined) return
      if (d.type === "preview-hover") {
        setHover(
          d.rect && d.viewport
            ? { rect: d.rect, viewport: d.viewport }
            : null
        )
      } else if (d.type === "preview-select") {
        const raw = d.snapshot && typeof d.snapshot === "object" ? d.snapshot : null
        const content =
          typeof raw?.content === "string"
            ? raw.content
            : (typeof d.description === "string"
                ? (() => {
                    const match = d.description.match(/"([^"]*)"/)
                    return match ? match[1].trim() : undefined
                  })()
                : undefined)
        const styles =
          raw?.styles && typeof raw.styles === "object"
            ? { ...raw.styles }
            : undefined
        setSelect(
          d.rect && d.viewport && d.id
            ? {
                id: d.id,
                rect: d.rect,
                viewport: d.viewport,
                description: d.description ?? null,
                snapshot: { content, styles },
              }
            : null
        )
        setEditInput("")
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [enabled])

  const scale = select
    ? {
        x: previewSize.w / select.viewport.w,
        y: previewSize.h / select.viewport.h,
      }
    : hover
      ? {
          x: previewSize.w / hover.viewport.w,
          y: previewSize.h / hover.viewport.h,
        }
      : { x: 1, y: 1 }

  const hoverStyle =
    hover && previewSize.w > 0
      ? {
          left: hover.rect.x * scale.x,
          top: hover.rect.y * scale.y,
          width: hover.rect.width * scale.x,
          height: hover.rect.height * scale.y,
        }
      : undefined

  const selectStyle =
    select && previewSize.w > 0
      ? {
          left: select.rect.x * scale.x,
          top: select.rect.y * scale.y,
          width: select.rect.width * scale.x,
          height: select.rect.height * scale.y,
        }
      : undefined

  const handleEditSubmit = () => {
    if (!select) return
    const desc = select.description || "selected element"
    onEditWithAI(desc, editInput.trim())
    setSelect(null)
    setEditInput("")
  }

  const sendDesignToPreview = useCallback(
    (payload: { content?: string; styles?: Record<string, string> }) => {
      if (!select || !iframeRef.current?.contentWindow) return
      iframeRef.current.contentWindow.postMessage(
        { type: "bstudio-apply-design", id: select.id, payload },
        "*"
      )
    },
    [select]
  )

  return (
    <div
      className={cn("relative w-full flex-1 min-h-0 flex flex-col sm:flex-row", className)}
    >
      <div ref={previewAreaRef} className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={src || undefined}
          className="w-full h-full min-h-0 border-0 absolute inset-0"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
        {/* Hover highlight — only when visual edit is enabled */}
        {canEdit && enabled && hover && (
          <div
            className="pointer-events-none absolute border-2 border-amber-400/70 rounded transition-all duration-75 z-10"
            style={hoverStyle}
          />
        )}
        {/* Select overlay — only when visual edit is enabled */}
        {canEdit && enabled && select && (
          <div
            className="absolute border-2 border-amber-400 bg-amber-400/10 rounded z-20"
            style={selectStyle}
          />
        )}
      </div>
      {/* Word-style design panel (side-by-side when element selected) */}
      {canEdit && enabled && select && (
        <div className="w-full sm:w-[280px] shrink-0 border-t sm:border-t-0 sm:border-l border-zinc-800 flex flex-col min-h-0 max-h-[50vh] sm:max-h-none bg-zinc-900">
          <VisualEditDesignPanel
            key={select.id}
            selectedId={select.id}
            description={select.description}
            snapshot={select.snapshot}
            onApply={sendDesignToPreview}
            onClose={() => setSelect(null)}
          />
          <div className="flex items-center gap-2 p-2 border-t border-zinc-800 bg-zinc-900 shrink-0">
            <Input
              placeholder="Or ask AI to change..."
              value={editInput}
              onChange={(e) => setEditInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEditSubmit()
              }}
              className="h-8 text-xs bg-zinc-800 border-zinc-700 flex-1"
            />
            <Button
              size="sm"
              className="h-8 text-xs bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border-amber-500/50 shrink-0"
              onClick={handleEditSubmit}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
