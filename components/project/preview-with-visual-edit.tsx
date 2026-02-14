"use client"

import React, { useRef, useState, useEffect, useCallback } from "react"
import { ArrowUp, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { VisualEditDesignPanel, type DesignSnapshot } from "./visual-edit-design-panel"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input"

type Rect = { x: number; y: number; width: number; height: number }
type Viewport = { w: number; h: number }

export interface PreviewWithVisualEditProps {
  src: string | null
  canEdit?: boolean
  /** When false, hover/select overlays and "Edit with AI" are disabled (visual edit off). Default false so it only activates when user turns it on. */
  enabled?: boolean
  onEditWithAI: (description: string, userRequest: string) => void
  onSaveManualEdit?: (payload: {
    id: string
    description: string | null
    initial: DesignSnapshot
    current: DesignSnapshot
  }) => Promise<void> | void
  isSavingManualEdit?: boolean
  onIframeNavigate?: (path: string) => void
  className?: string
  iframeKey?: string | number
}

export function PreviewWithVisualEdit({
  src,
  canEdit = true,
  enabled = false,
  onEditWithAI,
  onSaveManualEdit,
  isSavingManualEdit = false,
  onIframeNavigate,
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
  const [draft, setDraft] = useState<DesignSnapshot | null>(null)
  const [isSavingLocal, setIsSavingLocal] = useState(false)
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
      setDraft(null)
    }
  }, [enabled])

  // Listen for navigation events from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data
      if (d && typeof d === "object" && d.type === "preview-navigate" && typeof d.path === "string") {
        onIframeNavigate?.(d.path)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [onIframeNavigate])

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
        setDraft(
          d.rect && d.viewport && d.id
            ? {
                content,
                styles,
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
    setDraft(null)
    setEditInput("")
  }

  const isSameSnapshot = useCallback((a: DesignSnapshot | null, b: DesignSnapshot | null) => {
    if (!a || !b) return false
    const normalizeStyles = (styles?: Record<string, string>) => {
      const out: Record<string, string> = {}
      if (!styles) return out
      for (const [k, v] of Object.entries(styles)) {
        if (typeof v === "string" && v.trim() !== "") out[k] = v
      }
      return out
    }
    return (
      (a.content ?? "") === (b.content ?? "") &&
      JSON.stringify(normalizeStyles(a.styles)) === JSON.stringify(normalizeStyles(b.styles))
    )
  }, [])

  const handleSaveManual = useCallback(async () => {
    if (!select || !draft || !onSaveManualEdit || isSavingLocal || isSavingManualEdit) return
    setIsSavingLocal(true)
    try {
      await onSaveManualEdit({
        id: select.id,
        description: select.description,
        initial: select.snapshot,
        current: draft,
      })
      setSelect(null)
      setDraft(null)
      setEditInput("")
    } finally {
      setIsSavingLocal(false)
    }
  }, [draft, isSavingLocal, isSavingManualEdit, onSaveManualEdit, select])

  const handleIframeLoad = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return
    try {
      // Inject a script to track navigation and post messages to parent
      const doc = iframeRef.current.contentDocument
      if (!doc) return
      
      const script = doc.createElement("script")
      script.textContent = `
        (function() {
          let currentPath = window.location.pathname + window.location.search + window.location.hash;
          
          // Track history changes
          const originalPushState = window.history.pushState;
          const originalReplaceState = window.history.replaceState;
          
          window.history.pushState = function(...args) {
            originalPushState.apply(this, args);
            const newPath = window.location.pathname + window.location.search + window.location.hash;
            if (newPath !== currentPath) {
              currentPath = newPath;
              window.parent.postMessage({ type: 'preview-navigate', path: newPath }, '*');
            }
          };
          
          window.history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            const newPath = window.location.pathname + window.location.search + window.location.hash;
            if (newPath !== currentPath) {
              currentPath = newPath;
              window.parent.postMessage({ type: 'preview-navigate', path: newPath }, '*');
            }
          };
          
          // Listen for popstate (back/forward buttons)
          window.addEventListener('popstate', () => {
            const newPath = window.location.pathname + window.location.search + window.location.hash;
            if (newPath !== currentPath) {
              currentPath = newPath;
              window.parent.postMessage({ type: 'preview-navigate', path: newPath }, '*');
            }
          });
        })();
      `
      doc.head.appendChild(script)
    } catch (e) {
      // Cross-origin iframe, script injection not allowed
      // Navigation tracking will not work for cross-origin sandboxes
    }
  }, [])

  const sendDesignToPreview = useCallback(
    (payload: { content?: string; styles?: Record<string, string> }) => {
      if (!select || !iframeRef.current?.contentWindow) return
      setDraft((prev) => {
        const base = prev ?? select.snapshot
        return {
          content: payload.content !== undefined ? payload.content : base.content,
          styles: payload.styles !== undefined ? payload.styles : base.styles,
        }
      })
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
          onLoad={handleIframeLoad}
        />
        {/* Hover highlight — only when visual edit is enabled */}
        {canEdit && enabled && hover && (
          <div
            className="pointer-events-none absolute z-10 rounded border-2 border-zinc-900/45 transition-all duration-75"
            style={hoverStyle}
          />
        )}
        {/* Select overlay — only when visual edit is enabled */}
        {canEdit && enabled && select && (
          <div
            className="absolute z-20 rounded border-2 border-zinc-900 bg-zinc-900/10"
            style={selectStyle}
          />
        )}
      </div>
      {/* Word-style design panel (side-by-side when element selected) */}
      {canEdit && enabled && select && (
        <div className="flex min-h-0 w-full shrink-0 flex-col border-zinc-200 bg-[#f5f5f2] max-h-[58vh] border-t sm:max-h-none sm:w-[340px] sm:border-l sm:border-t-0">
          <VisualEditDesignPanel
            key={select.id}
            selectedId={select.id}
            description={select.description}
            snapshot={select.snapshot}
            onApply={sendDesignToPreview}
            onClose={() => {
              setSelect(null)
              setDraft(null)
            }}
          />
          <div className="shrink-0 border-t border-zinc-200 bg-white p-3">
            <PromptInput
              value={editInput}
              onValueChange={setEditInput}
              isLoading={isSavingManualEdit}
              onSubmit={handleEditSubmit}
              className="w-full rounded-2xl border border-zinc-200 bg-[#f8f8f5] p-2"
            >
              <div className="relative">
                <PromptInputTextarea
                  placeholder="Ask AI to change this selected element..."
                  className="min-h-[64px] border-zinc-200 bg-transparent px-3 py-2.5 pr-12 text-xs text-zinc-800 placeholder:text-zinc-500"
                />
                <PromptInputAction
                  tooltip={isSavingManualEdit ? "Working..." : "Send AI edit request"}
                  className="absolute bottom-2 right-2"
                >
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    className="h-8 w-8 rounded-full bg-zinc-900 text-white hover:bg-black"
                    onClick={handleEditSubmit}
                    disabled={isSavingManualEdit}
                  >
                    {isSavingManualEdit ? (
                      <Square className="size-3.5 fill-current" />
                    ) : (
                      <ArrowUp className="size-3.5" />
                    )}
                  </Button>
                </PromptInputAction>
              </div>
              <PromptInputActions className="justify-start pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-lg border-zinc-300 bg-white text-xs text-zinc-700 hover:bg-zinc-100"
                  disabled={
                    !onSaveManualEdit ||
                    !draft ||
                    isSavingLocal ||
                    isSavingManualEdit ||
                    isSameSnapshot(select.snapshot, draft)
                  }
                  onClick={handleSaveManual}
                >
                  {isSavingLocal || isSavingManualEdit ? "Saving..." : "Save changes"}
                </Button>
              </PromptInputActions>
            </PromptInput>
          </div>
        </div>
      )}
    </div>
  )
}
