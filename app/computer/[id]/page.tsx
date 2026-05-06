"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { doc, onSnapshot, updateDoc } from "firebase/firestore"
import { AnimatePresence, motion } from "framer-motion"
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Database,
  ExternalLink,
  Github,
  Globe2,
  KeyRound,
  Laptop,
  LayoutPanelLeft,
  Loader2,
  MessageSquare,
  Monitor,
  Pencil,
  Rocket,
  ShieldAlert,
} from "lucide-react"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { Button } from "@/components/ui/button"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { db } from "@/lib/firebase"

// ─── Types (unchanged) ────────────────────────────────────────────────────────

type ComputerSessionStatus = "idle" | "planning" | "running" | "error" | "complete"

type ComputerTimelineEvent = {
  id?: string
  title: string
  status: "pending" | "running" | "complete" | "error" | "skipped"
  kind?: "understanding" | "research" | "browser" | "planning" | "code" | "sandbox" | "fix" | "security" | "user"
  createdAt: string
  description?: string
  runId?: string
  index: number
  metadata?: Record<string, string | number | boolean | null>
}

type ComputerSessionResponse = {
  id: string
  prompt?: string
  status: ComputerSessionStatus
  timeline: ComputerTimelineEvent[]
  previewUrl?: string | null
  projectId?: string
}

type WorkspaceTab = "preview" | "browser" | "research"
type MobileView  = "feed" | "workspace"

type BrowserInspection = {
  url: string
  liveUrl: string
  sessionId?: string
  baseUrl?: string
  provider?: string
  title: string
}

type DeployProvider = "netlify" | "vercel"

type DeployState = {
  provider: DeployProvider | null
  busy: boolean
  step: string
  error: string | null
  siteUrl: string | null
  adminUrl: string | null
}

type ComputerProjectIntegration = {
  name?: string
  files?: Array<{ path: string; content: string }>
  githubRepoUrl?: string
  githubRepoFullName?: string
  githubSyncedAt?: unknown
  supabaseUrl?: string
  supabaseProjectRef?: string
  envVarNames?: string[]
}

type IntegrationAction = "github" | "supabase" | "env"

// ─── Constants (unchanged) ────────────────────────────────────────────────────

const STATUS_STYLES: Record<ComputerSessionStatus, string> = {
  idle:     "border-zinc-200 bg-zinc-50 text-zinc-500",
  planning: "border-indigo-100 bg-indigo-50 text-indigo-700",
  running:  "border-amber-100 bg-amber-50 text-amber-700",
  error:    "border-red-100 bg-red-50 text-red-700",
  complete: "border-green-100 bg-green-50 text-green-700",
}

const STATUS_LABELS: Record<ComputerSessionStatus, string> = {
  idle:     "Ready",
  planning: "Thinking",
  running:  "Working",
  error:    "Error",
  complete: "Done",
}

const STATUS_DOT: Record<ComputerSessionStatus, string> = {
  idle:     "bg-zinc-300",
  planning: "bg-indigo-400",
  running:  "bg-amber-400",
  error:    "bg-red-400",
  complete: "bg-green-500",
}

const TRANSCRIPT_PHASES = [
  { key: "understanding" as const, label: "Assess"    },
  { key: "research"      as const, label: "Research"  },
  { key: "planning"      as const, label: "Plan"      },
  { key: "code"          as const, label: "Build"     },
  { key: "sandbox"       as const, label: "Verify"    },
]

const EVENT_TITLES: Record<string, string> = {
  "Run started":          "Starting run",
  "Understanding request":"Reading request",
  "Understanding insight":"Understanding insight",
  "Planning execution":   "Planning approach",
  "Planning failed":      "Planning hit a snag",
  "Decision":             "Deciding next step",
  "Web plan":             "Planning web context",
  "Web skipped":          "Web context skipped",
  "Researching web":      "Researching",
  "Research complete":    "Research complete",
  "Research insight":     "Research insight",
  "Research failed":      "Research failed",
  "Research skipped":     "Research skipped",
  "Browser decision":     "Choosing whether to inspect",
  "Browser live":         "Firecrawl browser live",
  "Browser fallback":     "Collecting page context",
  "Page inspected":       "Page inspected",
  "Browser insight":      "Browser insight",
  "Browser failed":       "Browser failed",
  "Browser skipped":      "Browser skipped",
  "Scrape context collected": "Page context collected",
  "Fallback scrape collected": "Fallback context collected",
  "Scrape failed":        "Page context failed",
  "Generation decision":  "Preparing build",
  "Build approach":       "Build approach",
  "Code generated":       "Application generated",
  "Generation failed":    "Generation failed",
  "Fix applied":          "Fix applied",
  "Fix failed":           "Fix failed",
  "Starting sandbox":     "Starting preview",
  "Preview ready":        "Preview ready",
  "Sandbox run successful":"Preview running",
  "Sandbox error":        "Preview error",
  "Runtime fix applied":  "Runtime fix applied",
  "Runtime fix failed":   "Runtime fix failed",
  "Run failed":           "Run failed",
}

// ─── Helpers (unchanged) ──────────────────────────────────────────────────────

function shortenId(id: string) {
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

function normalizeStatus(status: unknown): ComputerSessionStatus {
  return status === "idle" || status === "planning" || status === "running" ||
    status === "error" || status === "complete" ? status : "idle"
}

function normalizeTimeline(timeline: unknown): ComputerTimelineEvent[] {
  if (!Array.isArray(timeline)) return []
  return timeline
    .map((e, i) => ({ ...(e as ComputerTimelineEvent), index: typeof (e as { index?: unknown }).index === "number" ? (e as { index: number }).index : i }))
    .sort((a, b) => a.index - b.index)
}

function getPhaseState(
  phase: (typeof TRANSCRIPT_PHASES)[number]["key"],
  events: ComputerTimelineEvent[]
): "idle" | "running" | "complete" | "error" {
  const m = events.filter((e) => e.kind === phase)
  if (m.some((e) => e.status === "error"))                              return "error"
  if (m.some((e) => e.status === "running"))                            return "running"
  if (m.some((e) => e.status === "complete" || e.status === "skipped")) return "complete"
  return "idle"
}

function getEventTitle(event: ComputerTimelineEvent) {
  return EVENT_TITLES[event.title] || event.title
}

function getLatestBrowserInspection(events: ComputerTimelineEvent[]): BrowserInspection | null {
  const found = [...events].sort((a, b) => a.index - b.index).reverse().find((e) => {
    const lv = e.metadata?.browserLiveUrl
    const provider = e.metadata?.browserProvider
    return e.kind === "browser" &&
      provider === "firecrawl" &&
      typeof lv === "string" &&
      lv.startsWith("http")
  })
  if (!found?.metadata) return null
  const liveUrl = typeof found.metadata.browserLiveUrl === "string" ? found.metadata.browserLiveUrl : ""
  const url     = typeof found.metadata.targetUrl       === "string" ? found.metadata.targetUrl       : ""
  if (!liveUrl || !url) return null
  return {
    url, liveUrl,
    sessionId: typeof found.metadata.browserSessionId === "string" ? found.metadata.browserSessionId : undefined,
    baseUrl:   typeof found.metadata.browserBaseUrl   === "string" ? found.metadata.browserBaseUrl   : undefined,
    provider:  typeof found.metadata.browserProvider  === "string" ? found.metadata.browserProvider  : undefined,
    title:     typeof found.metadata.pageTitle === "string" && found.metadata.pageTitle.trim() ? found.metadata.pageTitle : url,
  }
}

function getBrowserProviderLabel(provider?: string) {
  if (provider === "firecrawl") return "Firecrawl Browser"
  return "Remote Browser"
}

const INITIAL_DEPLOY_STATE: DeployState = {
  provider: null,
  busy: false,
  step: "",
  error: null,
  siteUrl: null,
  adminUrl: null,
}

function getDeployProviderLabel(provider: DeployProvider) {
  return provider === "netlify" ? "Netlify" : "Vercel"
}

function getDeployErrorMessage(value: unknown) {
  const message = String(value || "Deploy failed")
  if (/netlify not connected/i.test(message)) {
    return "Netlify is not connected. Starting Netlify connection..."
  }
  if (/vercel not connected/i.test(message)) {
    return "Vercel is not connected for this project. Add a Vercel token in project integrations, then deploy again."
  }
  return message
}

function formatSyncedAt(value: unknown) {
  if (!value) return ""
  const date = typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : new Date(value as string | number)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString()
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function PulseDot({ color, active }: { color: string; active?: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      {active && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color)} />}
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", color)} />
    </span>
  )
}

function StatusBadge({ status }: { status: ComputerSessionStatus }) {
  const isActive = status === "planning" || status === "running"
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
      "text-[10px] font-semibold uppercase tracking-[0.14em]",
      STATUS_STYLES[status]
    )}>
      <PulseDot color={STATUS_DOT[status]} active={isActive} />
      {STATUS_LABELS[status]}
    </div>
  )
}

// ─── Step strip ───────────────────────────────────────────────────────────────

function DeployButton({
  projectId,
  open,
  state,
  onOpenChange,
  onDeploy,
}: {
  projectId?: string
  open: boolean
  state: DeployState
  onOpenChange: (open: boolean) => void
  onDeploy: (provider: DeployProvider) => void
}) {
  if (!projectId) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        disabled={state.busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-3 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
      >
        {state.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
        Deploy
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-30 w-[280px] rounded-2xl border border-[#e0dbd1] bg-[#fffdf8] p-2.5 shadow-[0_18px_60px_-24px_rgba(0,0,0,0.45)]">
          <div className="px-1 pb-2">
            <p className="text-[12px] font-semibold text-zinc-900">Publish this project</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
              Deploy directly from this generated project.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["netlify", "vercel"] as DeployProvider[]).map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => onDeploy(provider)}
                disabled={state.busy}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-[12px] font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {getDeployProviderLabel(provider)}
              </button>
            ))}
          </div>

          {(state.step || state.error || state.siteUrl) && (
            <div className="mt-2 rounded-xl border border-zinc-200 bg-[#faf9f5] p-2.5">
              <div className="flex items-center gap-1.5">
                {state.busy && <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />}
                <p className="min-w-0 truncate text-[11px] font-medium text-zinc-600">
                  {state.provider ? getDeployProviderLabel(state.provider) : "Deploy"}
                  {state.step ? ` - ${state.step}` : ""}
                </p>
              </div>
              {state.error && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-red-600">{state.error}</p>
              )}
              {state.siteUrl && (
                <a
                  href={state.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex max-w-full items-center gap-1 text-[11px] font-semibold text-zinc-900 hover:underline"
                >
                  <span className="truncate">{state.siteUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function IntegrationsButton({
  projectId,
  project,
  open,
  busy,
  message,
  envValues,
  onOpenChange,
  onGithubSync,
  onSupabaseSetup,
  onEnvChange,
  onEnvAdd,
  onEnvSave,
}: {
  projectId?: string
  project: ComputerProjectIntegration | null
  open: boolean
  busy: IntegrationAction | null
  message: string
  envValues: Record<string, string>
  onOpenChange: (open: boolean) => void
  onGithubSync: () => void
  onSupabaseSetup: () => void
  onEnvChange: (key: string, value: string) => void
  onEnvAdd: (key: string, value: string) => void
  onEnvSave: () => void
}) {
  const [newEnvKey, setNewEnvKey] = useState("")
  const [newEnvValue, setNewEnvValue] = useState("")
  if (!projectId) return null

  const envNames = project?.envVarNames || []
  const hasGitHub = Boolean(project?.githubRepoUrl || project?.githubRepoFullName)
  const hasSupabase = Boolean(project?.supabaseUrl || project?.supabaseProjectRef)
  const syncedAt = formatSyncedAt(project?.githubSyncedAt)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-[11px] font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Integrations
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-30 w-[360px] rounded-2xl border border-[#e0dbd1] bg-[#fffdf8] p-3 shadow-[0_18px_60px_-24px_rgba(0,0,0,0.45)]">
          <div className="mb-3">
            <p className="text-[12px] font-semibold text-zinc-900">Project integrations</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
              Connect services directly to this generated website.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Github className="h-3.5 w-3.5 text-zinc-500" />
                    <p className="text-[12px] font-semibold text-zinc-900">GitHub</p>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-zinc-500">
                    {hasGitHub ? project?.githubRepoFullName || project?.githubRepoUrl : "Create or update a repository"}
                  </p>
                  {syncedAt ? <p className="mt-0.5 text-[10.5px] text-zinc-400">Last synced {syncedAt}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={onGithubSync}
                  disabled={busy !== null}
                  className="rounded-lg border border-zinc-200 bg-[#faf9f5] px-2.5 py-1 text-[11px] font-semibold text-zinc-700 disabled:opacity-60"
                >
                  {busy === "github" ? "Syncing..." : hasGitHub ? "Sync" : "Publish"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-zinc-500" />
                    <p className="text-[12px] font-semibold text-zinc-900">Supabase</p>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-zinc-500">
                    {hasSupabase ? project?.supabaseProjectRef || project?.supabaseUrl : "Provision database and app credentials"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSupabaseSetup}
                  disabled={busy !== null}
                  className="rounded-lg border border-zinc-200 bg-[#faf9f5] px-2.5 py-1 text-[11px] font-semibold text-zinc-700 disabled:opacity-60"
                >
                  {busy === "supabase" ? "Setting up..." : hasSupabase ? "Re-run" : "Set up"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-zinc-500" />
                <p className="text-[12px] font-semibold text-zinc-900">Environment variables</p>
              </div>
              <div className="mt-2 space-y-2">
                {envNames.map((name) => (
                  <label key={name} className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{name}</span>
                    <input
                      value={envValues[name] || ""}
                      onChange={(event) => onEnvChange(name, event.target.value)}
                      placeholder="Value"
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-[#faf9f5] px-2 text-[12px] outline-none focus:border-zinc-400"
                    />
                  </label>
                ))}
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                  <input
                    value={newEnvKey}
                    onChange={(event) => setNewEnvKey(event.target.value)}
                    placeholder="KEY"
                    className="h-8 min-w-0 rounded-lg border border-zinc-200 bg-[#faf9f5] px-2 text-[12px] outline-none focus:border-zinc-400"
                  />
                  <input
                    value={newEnvValue}
                    onChange={(event) => setNewEnvValue(event.target.value)}
                    placeholder="Value"
                    className="h-8 min-w-0 rounded-lg border border-zinc-200 bg-[#faf9f5] px-2 text-[12px] outline-none focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const key = newEnvKey.trim()
                      if (!key) return
                      onEnvAdd(key, newEnvValue)
                      setNewEnvKey("")
                      setNewEnvValue("")
                    }}
                    disabled={busy !== null || !newEnvKey.trim()}
                    className="rounded-lg border border-zinc-200 bg-[#faf9f5] px-2.5 text-[11px] font-semibold text-zinc-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onEnvSave}
                  disabled={busy !== null}
                  className="rounded-lg border border-zinc-200 bg-[#faf9f5] px-2.5 py-1 text-[11px] font-semibold text-zinc-700 disabled:opacity-60"
                >
                  {busy === "env" ? "Saving..." : "Save and update preview"}
                </button>
              </div>
            </div>
          </div>

          {message ? (
            <p className="mt-3 rounded-xl border border-zinc-200 bg-[#faf9f5] px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function StepStrip({ events, status }: { events: ComputerTimelineEvent[]; status: ComputerSessionStatus }) {
  return (
    <div className="flex min-w-max items-center gap-2">
      {TRANSCRIPT_PHASES.map((phase, i) => {
        const state = getPhaseState(phase.key, events)
        const prev  = i > 0 ? getPhaseState(TRANSCRIPT_PHASES[i - 1].key, events) : null
        return (
          <div key={phase.key} className="flex shrink-0 items-center gap-2">
            {i > 0 && (
              <div className={cn(
                "h-px w-8 transition-colors duration-300",
                prev === "complete" ? "bg-zinc-400" : "bg-zinc-200"
              )} />
            )}
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-2 w-2 shrink-0 items-center justify-center rounded-full transition-all duration-200",
                state === "complete" && "bg-zinc-900",
                state === "running"  && "bg-zinc-900 ring-4 ring-zinc-200",
                state === "error"    && "bg-red-500 ring-4 ring-red-100",
                state === "idle"     && "bg-zinc-300"
              )}>
                {state === "running" && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-900 opacity-20" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-900" />
                  </span>
                )}
              </div>
              {state === "running" ? (
                <TextShimmer
                  className="bg-gradient-to-r from-zinc-500 via-zinc-950 to-zinc-500 text-[11px] font-medium"
                  duration={1.45}
                >
                  {phase.label}
                </TextShimmer>
              ) : (
                <span className={cn(
                  "text-[11px] font-medium",
                  state === "complete" && "text-zinc-700",
                  state === "error"    && "text-red-500",
                  state === "idle"     && "text-zinc-400"
                )}>
                  {phase.label}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Plan description renderer ────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-zinc-700">{part.slice(2, -2)}</strong>
      : part
  )
}

function PlanDescription({ text }: { text: string }) {
  return (
    <div className="space-y-0.5 text-[12.5px] leading-relaxed">
      {text.split("\n").map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} className="h-1.5" />
        if (t.match(/^#\s+/)) return null
        const h2 = t.match(/^##\s+(.+)/)
        if (h2) return <p key={i} className="pt-2 pb-0.5 text-[12px] font-semibold text-zinc-800">{renderInline(h2[1])}</p>
        const h3 = t.match(/^###\s+(.+)/)
        if (h3) return <p key={i} className="pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{h3[1]}</p>
        const li = t.match(/^[-*]\s+(.+)/)
        if (li) return (
          <div key={i} className="flex items-start gap-2 text-zinc-500">
            <span className="mt-[6px] h-[3px] w-[3px] shrink-0 rounded-full bg-zinc-300" />
            <span>{renderInline(li[1])}</span>
          </div>
        )
        return <p key={i} className="text-zinc-500">{renderInline(t)}</p>
      })}
    </div>
  )
}

// ─── Feed item ────────────────────────────────────────────────────────────────

function FeedItem({ event, isLatest }: { event: ComputerTimelineEvent; isLatest: boolean }) {
  const isComplete = event.status === "complete"
  const isError    = event.status === "error"
  const isRunning  = event.status === "running"
  const isSkipped  = event.status === "skipped"
  const title      = getEventTitle(event)

  // Plan card — rendered only once when planning completes
  if (event.title === "Planning execution" && isComplete && event.description) {
    return (
      <div className="my-3 rounded-2xl border border-[#e0dbd1] bg-white px-4 py-3.5 shadow-sm">
        <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Plan drafted</p>
        <PlanDescription text={event.description} />
      </div>
    )
  }

  const PROSE_EVENTS = ["Understanding insight", "Research insight", "Browser insight", "Build approach"]
  if (PROSE_EVENTS.includes(event.title) && event.description) {
    return (
      <div className="my-2 rounded-2xl border border-[#e8e3da] bg-[#faf8f4] px-3.5 py-3">
        <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          {title}
        </p>
        <p className="text-[12.5px] leading-relaxed text-zinc-600">
          {event.description}
        </p>
      </div>
    )
  }

  // Completed / errored
  if (isComplete || isError || isSkipped) {
    return (
      <div className="flex items-baseline gap-2.5 py-[3px]">
        <svg className="mt-[1px] h-[11px] w-[11px] shrink-0" viewBox="0 0 11 11" fill="none"
          stroke={isError ? "#f87171" : "#d4d4d8"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2,5.5 4.5,8 9,3" />
        </svg>
        <span className={cn("text-[13px] leading-relaxed", isError ? "text-red-600" : "text-zinc-800")}>
          {title}
        </span>
        {event.description && isError && (
          <span className="ml-1 truncate text-[10.5px] text-red-400">{event.description}</span>
        )}
      </div>
    )
  }

  // Active / pending
  return (
    <div className="flex items-baseline gap-2.5 py-[3px]">
      {isLatest && isRunning ? (
        <TextShimmer className="shrink-0 bg-gradient-to-r from-zinc-500 via-zinc-950 to-zinc-500 font-mono text-[13px] font-semibold" duration={1.45}>
          →
        </TextShimmer>
      ) : (
        <span className={cn("shrink-0 font-mono text-[13px]", isRunning ? "text-zinc-900" : "text-zinc-400")}>→</span>
      )}
      {isLatest && isRunning ? (
        <TextShimmer className="bg-gradient-to-r from-zinc-500 via-zinc-950 to-zinc-500 font-mono text-[13px] font-semibold" duration={1.45}>
          {title}
        </TextShimmer>
      ) : (
        <span className={cn("font-mono text-[13px]", isRunning ? "text-zinc-900" : "text-zinc-400")}>{title}</span>
      )}
      {event.description && !isError && (
        <span className="min-w-0 truncate font-mono text-[11px] text-zinc-300">
          {event.description.split("\n")[0]}
        </span>
      )}
    </div>
  )
}

// ─── Editable user bubble ─────────────────────────────────────────────────────

function UserMessageBubble({
  content, index, isEditing, editText,
  onEditStart, onEditChange, onEditSubmit, onEditCancel,
}: {
  content: string; index: number; isEditing: boolean; editText: string
  onEditStart: (i: number, c: string) => void
  onEditChange: (t: string) => void
  onEditSubmit: (i: number) => void
  onEditCancel: () => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard?.writeText(content).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.focus()
      const len = ref.current.value.length
      ref.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  if (isEditing) {
    return (
      <div className="flex justify-end pb-4">
        <div className="w-full max-w-[84%]">
          <div className="overflow-hidden rounded-[14px] bg-[#1f1f1f] shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
          <textarea
            ref={ref} value={editText} onChange={(e) => onEditChange(e.target.value)}
            rows={Math.max(2, editText.split("\n").length)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEditSubmit(index) }
              if (e.key === "Escape") onEditCancel()
            }}
            className="w-full resize-none bg-transparent px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          </div>
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <button type="button" onClick={onEditCancel} className="rounded-md px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">Cancel</button>
            <button type="button" onClick={() => onEditSubmit(index)} className="rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-zinc-800">Submit</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex justify-end pb-4">
      <div className="flex max-w-[84%] flex-col items-end">
        <div className="rounded-[14px] bg-[#1f1f1f] px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-100">{content}</p>
        </div>
        <div className="mt-1.5 flex items-center gap-1 pr-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy message"
            title="Copy"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onEditStart(index, content)}
            aria-label="Edit and restore from this message"
            title="Edit and restore"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Agent feed ───────────────────────────────────────────────────────────────

function AgentFeed({
  prompt, events, localMessages, status, optimisticStart,
  editingIndex, editText, onEditStart, onEditChange, onEditSubmit, onEditCancel,
}: {
  prompt?: string; events: ComputerTimelineEvent[]
  localMessages: Array<{ role: "user" | "system"; content: string }>
  status: ComputerSessionStatus; optimisticStart?: boolean
  editingIndex: number | null; editText: string
  onEditStart: (i: number, c: string) => void
  onEditChange: (t: string) => void
  onEditSubmit: (i: number) => void
  onEditCancel: () => void
}) {
  const endRef    = useRef<HTMLDivElement | null>(null)
  const isRunning = status === "running" || status === "planning"
  const visible   = events.filter((e) => e.title !== "Session created")
  const isStarting = optimisticStart && visible.length === 0
  const isEmpty   = !prompt && visible.length === 0 && localMessages.length === 0 && !isStarting

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [visible.length, localMessages.length, isStarting])

  if (isEmpty) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-center">
        <div>
          <p className="text-[13px] font-medium text-zinc-600">Ready to build</p>
          <p className="mt-1 text-[11.5px] text-zinc-400">Send a message to start the agent.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0.5 pb-2">
      {/* Prompt bubble */}
      {prompt && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="pb-4">
          <UserMessageBubble
            content={prompt} index={-1} isEditing={editingIndex === -1}
            editText={editingIndex === -1 ? editText : ""}
            onEditStart={onEditStart} onEditChange={onEditChange}
            onEditSubmit={onEditSubmit} onEditCancel={onEditCancel}
          />
        </motion.div>
      )}

      {/* Optimistic start shimmer */}
      <AnimatePresence initial={false}>
        {isStarting && (
          <motion.div key="optimistic" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="py-1">
            <TextShimmer className="bg-gradient-to-r from-zinc-500 via-zinc-950 to-zinc-500 font-mono text-[13px] font-semibold" duration={1.45}>
              Starting agent...
            </TextShimmer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline events — pure stream, no group dividers */}
      <AnimatePresence initial={false}>
        {visible.map((event, i) => {
          const isLatest = i === visible.length - 1 && isRunning
          return (
            <motion.div key={event.id ?? `${event.title}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
              <FeedItem event={event} isLatest={isLatest} />
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Local follow-up messages */}
      <AnimatePresence initial={false}>
        {localMessages.map((msg, i) =>
          msg.role === "user" ? (
            <motion.div key={`user-${i}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="pt-2">
              <UserMessageBubble
                content={msg.content} index={i} isEditing={editingIndex === i}
                editText={editingIndex === i ? editText : ""}
                onEditStart={onEditStart} onEditChange={onEditChange}
                onEditSubmit={onEditSubmit} onEditCancel={onEditCancel}
              />
            </motion.div>
          ) : (
            <motion.div key={`sys-${i}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="flex justify-center py-1">
              <span className="text-[11px] text-zinc-400">{msg.content}</span>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* Running shimmer */}
      <AnimatePresence>
        {isRunning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="py-2">
            <TextShimmer className="text-[12px] text-zinc-400" duration={1.8}>
              {STATUS_LABELS[status]}
            </TextShimmer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Completion message */}
      {status === "complete" && visible.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }} className="pt-4">
          <p className="text-[13px] leading-relaxed text-zinc-800">
            {events.some((e) => e.title === "Preview ready")
              ? "Preview is ready. The generated app is live in the workspace."
              : "Run complete."}
          </p>
        </motion.div>
      )}

      <div ref={endRef} />
    </div>
  )
}

// ─── Research panel ───────────────────────────────────────────────────────────

function ResearchPanel({ events }: { events: ComputerTimelineEvent[] }) {
  const evidence = events.filter(
    (e) => (e.kind === "research" || e.kind === "browser") && Boolean(e.description?.trim())
  )
  if (evidence.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[#e0dbd1] bg-white text-zinc-300">
            <BookOpen className="h-4.5 w-4.5" />
          </div>
          <p className="text-[13px] font-medium text-zinc-600">No research yet</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">Research notes and inspected pages appear here.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-3 p-4 sm:p-5">
      <AnimatePresence initial={false}>
        {evidence.map((event, i) => (
          <motion.div key={event.id ?? `${event.title}-${i}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }}
            className="rounded-2xl border border-[#e0dbd1] bg-white px-3.5 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12.5px] font-semibold text-zinc-800">{getEventTitle(event)}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-400">{event.kind}</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                {new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-500">{event.description}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ─── Workspace panel ──────────────────────────────────────────────────────────

function WorkspaceHeaderLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] text-zinc-400 transition-colors hover:text-zinc-700">
      <span className="truncate">{href}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  )
}

function LaptopSwitcher({ label, title, url, icon, onClick }: {
  label: string; title: string; url: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className="absolute bottom-4 right-4 z-10 w-[180px] rounded-2xl border border-black/10 bg-[#f7f5ef] p-2 text-left shadow-[0_12px_40px_-18px_rgba(0,0,0,0.55)] transition hover:-translate-y-0.5">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-1">
        <div className="aspect-[16/10] overflow-hidden rounded-lg border border-white/10 bg-white">
          <div className="flex h-full flex-col">
            <div className="h-4 border-b border-zinc-200 bg-zinc-100" />
            <div className="flex flex-1 items-center justify-center bg-[#faf9f5] text-zinc-300">
              <Laptop className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-start gap-2 px-0.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500">{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</p>
          <p className="truncate text-[12px] font-semibold text-zinc-800">{title}</p>
          <p className="truncate text-[10.5px] text-zinc-400">{url}</p>
        </div>
      </div>
    </button>
  )
}

function WorkspaceContent({
  session, activeTab, browserInspection, onSwitchView,
}: {
  session: ComputerSessionResponse; activeTab: WorkspaceTab
  browserInspection: BrowserInspection | null
  onSwitchView: (v: WorkspaceTab) => void
}) {
  if (activeTab === "research") {
    return <ResearchPanel events={session.timeline} />
  }

  if (activeTab === "browser" && browserInspection) {
    return (
      <motion.div key="browser" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
        className="flex h-full min-h-0 flex-col p-3 sm:p-4">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              {getBrowserProviderLabel(browserInspection.provider)}
            </p>
            <p className="mt-0.5 truncate text-[12px] font-medium text-zinc-800">{browserInspection.title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <WorkspaceHeaderLink href={browserInspection.liveUrl} />
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-[#111113] shadow-sm">
          <iframe src={browserInspection.liveUrl} className="h-full w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer" title="Remote browser" />
          {session.previewUrl && (
            <LaptopSwitcher label="Preview" title="Generated app" url={session.previewUrl}
              icon={<Monitor className="h-3.5 w-3.5" />} onClick={() => onSwitchView("preview")} />
          )}
        </div>
      </motion.div>
    )
  }

  if (activeTab === "preview" && session.previewUrl) {
    return (
      <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
        className="flex h-full min-h-0 flex-col p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Live Preview</p>
          <div className="flex items-center gap-2">
            <WorkspaceHeaderLink href={session.previewUrl} />
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-[#e0dbd1] bg-white shadow-sm">
          <iframe src={session.previewUrl} className="h-full w-full"
            sandbox="allow-scripts allow-same-origin allow-forms" title="Live preview" />
          {browserInspection && (
            <LaptopSwitcher label="Browser" title={browserInspection.title} url={browserInspection.url}
              icon={<Globe2 className="h-3.5 w-3.5" />} onClick={() => onSwitchView("browser")} />
          )}
        </div>
      </motion.div>
    )
  }

  // Empty state
  return (
    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
      className="flex h-full items-center justify-center p-8 text-center">
      <div className="max-w-xs">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e0dbd1] bg-white text-zinc-300 shadow-sm">
          <Monitor className="h-5 w-5" />
        </div>
        <p className="text-[13px] font-semibold text-zinc-700">
          {session.status === "running" ? "Preparing workspace…" : "Workspace will appear here."}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
          {session.status === "running"
            ? "The preview will appear once the sandbox reports a ready URL."
            : "Preview, browser, and research appear here once the agent runtime is connected."}
        </p>
      </div>
    </motion.div>
  )
}

// ─── Loading + error ──────────────────────────────────────────────────────────

function LoadingShell() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#f0ece4]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(210,200,182,0.22),transparent)]" />
      <header className="relative z-10 shrink-0 px-3 pt-3 pb-2.5 sm:px-4">
        <div className="flex h-12 items-center gap-3 rounded-[1.4rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.92)] px-4 backdrop-blur-md">
          <div className="h-5 w-5 animate-pulse rounded-lg bg-zinc-200" />
          <div className="h-3 w-36 animate-pulse rounded bg-zinc-200" />
          <div className="ml-auto h-6 w-24 animate-pulse rounded-full bg-zinc-200" />
        </div>
      </header>
      <div className="flex flex-1 gap-3 overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="w-[380px] shrink-0 animate-pulse rounded-[1.4rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.96)] hidden sm:block" />
        <div className="flex-1 animate-pulse rounded-[1.4rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.96)]" />
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-[#f0ece4] px-4">
      <div className="w-full max-w-md rounded-[1.5rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.96)] p-8 text-center shadow-[0_4px_24px_-8px_rgba(0,0,0,0.10)]">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e0dbd1] bg-white text-zinc-400 shadow-sm">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h1 className="text-[15px] font-semibold text-zinc-900">Session not found</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{message}</p>
        <Button asChild className="mt-6 inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-900 px-4 text-[12px] font-semibold text-white hover:bg-zinc-800">
          <Link href="/"><ArrowLeft className="h-3.5 w-3.5" />Back home</Link>
        </Button>
      </div>
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label, dot }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; dot?: boolean
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium transition-all",
        active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
      )}>
      {icon}
      {label}
      {dot && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComputerPage() {
  const params = useParams()
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : ""
  const { user, loading: authLoading, getOptionalAuthHeader } = useAuth()
  // ── State (all unchanged) ─────────────────────────────────────────────────
  const [session,           setSession]           = useState<ComputerSessionResponse | null>(null)
  const [loading,           setLoading]           = useState(true)
  const [error,             setError]             = useState<string | null>(null)
  const [mobileView,        setMobileView]        = useState<MobileView>("feed")
  const [localMessages,     setLocalMessages]     = useState<Array<{ role: "user" | "system"; content: string }>>([])
  const [isStartingRun,     setIsStartingRun]     = useState(false)
  const [runError,          setRunError]          = useState<string | null>(null)
  const [optimisticStart,   setOptimisticStart]   = useState(false)
  const [activeTab,         setActiveTab]         = useState<WorkspaceTab>("preview")
  const [editingMsgIndex,   setEditingMsgIndex]   = useState<number | null>(null)
  const [editText,          setEditText]          = useState("")
  const [deployOpen,        setDeployOpen]        = useState(false)
  const [deployState,       setDeployState]       = useState<DeployState>(INITIAL_DEPLOY_STATE)
  const [integrationsOpen,  setIntegrationsOpen]  = useState(false)
  const [integrationBusy,   setIntegrationBusy]   = useState<IntegrationAction | null>(null)
  const [integrationMessage,setIntegrationMessage]= useState("")
  const [projectIntegration,setProjectIntegration]= useState<ComputerProjectIntegration | null>(null)
  const [envValues,         setEnvValues]         = useState<Record<string, string>>({})
  const [isEditingTitle,    setIsEditingTitle]    = useState(false)
  const [titleDraft,        setTitleDraft]        = useState("")
  const [titleSaving,       setTitleSaving]       = useState(false)
  const [titleError,        setTitleError]        = useState<string | null>(null)
  const hasStartedRef = useRef(false)

  // ── Firestore listener (unchanged) ────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return
    if (!user || !id) { setError("Session not found or access denied."); setLoading(false); return }
    setLoading(true); setError(null)
    const unsub = onSnapshot(
      doc(db, "computerSessions", id),
      (snap) => {
        if (!snap.exists()) { setSession(null); setError("Session not found or access denied."); setLoading(false); return }
        const d = snap.data()
        setSession({
          id: snap.id,
          prompt:    typeof d.prompt    === "string" ? d.prompt    : undefined,
          status:    normalizeStatus(d.status),
          timeline:  normalizeTimeline(d.timeline),
          previewUrl: typeof d.previewUrl === "string" ? d.previewUrl : null,
          projectId:  typeof d.projectId  === "string" ? d.projectId  : undefined,
        })
        setError(null); setLoading(false)
      },
      () => { setSession(null); setError("Failed to load session."); setLoading(false) }
    )
    return () => unsub()
  }, [authLoading, id, user])

  useEffect(() => {
    const projectId = session?.projectId
    if (!projectId) {
      setProjectIntegration(null)
      return
    }

    const unsub = onSnapshot(doc(db, "projects", projectId), (snap) => {
      if (!snap.exists()) {
        setProjectIntegration(null)
        return
      }
      const data = snap.data() as ComputerProjectIntegration
      setProjectIntegration((current) => {
        const savedEnvNames = Array.isArray(data.envVarNames) ? data.envVarNames.filter((name): name is string => typeof name === "string") : []
        return {
          name: typeof data.name === "string" ? data.name : undefined,
          files: Array.isArray(data.files)
            ? data.files.filter((file): file is { path: string; content: string } =>
                typeof file?.path === "string" && typeof file?.content === "string"
              )
            : undefined,
          githubRepoUrl: typeof data.githubRepoUrl === "string" ? data.githubRepoUrl : undefined,
          githubRepoFullName: typeof data.githubRepoFullName === "string" ? data.githubRepoFullName : undefined,
          githubSyncedAt: data.githubSyncedAt,
          supabaseUrl: typeof data.supabaseUrl === "string" ? data.supabaseUrl : undefined,
          supabaseProjectRef: typeof data.supabaseProjectRef === "string" ? data.supabaseProjectRef : undefined,
          envVarNames: Array.from(new Set([...(current?.envVarNames || []), ...savedEnvNames])),
        }
      })
    })
    return () => unsub()
  }, [session?.projectId])

  useEffect(() => {
    const projectId = session?.projectId
    if (!projectId) return

    let cancelled = false
    void (async () => {
      try {
        const auth = await getOptionalAuthHeader()
        const [requiredRes, savedRes] = await Promise.all([
          fetch(`/api/env-vars/required?projectId=${encodeURIComponent(projectId)}`, { headers: auth }),
          fetch(`/api/env-vars/names?projectId=${encodeURIComponent(projectId)}`, { headers: auth }),
        ])
        const requiredJson = await requiredRes.json().catch(() => ({})) as { requiredEnvVars?: string[] }
        const savedJson = await savedRes.json().catch(() => ({})) as { envVarNames?: string[] }
        const names = Array.from(new Set([
          ...(Array.isArray(requiredJson.requiredEnvVars) ? requiredJson.requiredEnvVars : []),
          ...(Array.isArray(savedJson.envVarNames) ? savedJson.envVarNames : []),
        ].filter((name): name is string => typeof name === "string" && Boolean(name.trim()))))
        if (!cancelled) {
          setProjectIntegration((current) => ({
            ...(current || {}),
            envVarNames: names,
          }))
          setEnvValues((current) => names.reduce<Record<string, string>>((next, name) => {
            next[name] = current[name] || ""
            return next
          }, {}))
        }
      } catch {
        // Env hints are helpful, not required for the core session.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [getOptionalAuthHeader, session?.projectId])

  const firstPrompt        = useMemo(() => session?.prompt?.trim(), [session?.prompt])
  const browserInspection  = useMemo(() => session ? getLatestBrowserInspection(session.timeline) : null, [session])
  const visibleCount       = session?.timeline.filter((e) => e.title !== "Session created").length ?? 0

  useEffect(() => {
    if (!isEditingTitle && session?.prompt) {
      setTitleDraft(session.prompt)
    }
  }, [session?.prompt, isEditingTitle])

  const sessionTitle = useMemo(() => {
    const raw = (firstPrompt || "").trim()
    if (!raw) return "Untitled request"
    const firstLine = raw.split(/\r?\n/)[0].trim()
    const candidate = firstLine.split(/[.?!]\s+/)[0].trim().replace(/^(build|create|make|develop|design)\s+/i, "").trim()
    const titleText = candidate || firstLine
    return titleText.length > 72 ? `${titleText.slice(0, 72).trim()}...` : titleText
  }, [firstPrompt])

  useEffect(() => { if (visibleCount > 0) setOptimisticStart(false) }, [visibleCount])
  useEffect(() => { if (browserInspection && !session?.previewUrl) setActiveTab("browser") }, [browserInspection, session?.previewUrl])

  // ── Auto-run (unchanged) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!session || session.status !== "idle" || hasStartedRef.current) return
    hasStartedRef.current = true
    setRunError(null); setOptimisticStart(true)
    void (async () => {
      try {
        const auth = await getOptionalAuthHeader()
        const res  = await fetch("/api/computer/run", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({ sessionId: session.id, prompt: session.prompt }),
        })
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
        if (!res.ok && res.status !== 409) throw new Error(data.error || "Could not start run")
      } catch (err) {
        hasStartedRef.current = false; setOptimisticStart(false)
        setRunError(err instanceof Error ? err.message : "Could not start run")
      }
    })()
  }, [getOptionalAuthHeader, session])

  // ── handleRun (unchanged) ─────────────────────────────────────────────────
  const handleRun = async (value: string) => {
    const t = value.trim(); if (!t) return
    setLocalMessages((c) => [...c, { role: "user", content: t }])
    if (!session || isStartingRun) return
    setIsStartingRun(true); setRunError(null)
    try {
      const auth = await getOptionalAuthHeader()
      const res  = await fetch("/api/computer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ sessionId: session.id, prompt: t }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not start run")
    } catch (err) { setRunError(err instanceof Error ? err.message : "Could not start run") }
    finally { setIsStartingRun(false) }
  }

  const handleEditStart  = (i: number, c: string) => { setEditingMsgIndex(i); setEditText(c) }
  const handleEditCancel = () => { setEditingMsgIndex(null); setEditText("") }
  const handleEditSubmit = async (index: number) => {
    const t = editText.trim(); if (!t) return
    setEditingMsgIndex(null); setEditText("")
    setLocalMessages((c) => index < 0 ? [] : [...c.slice(0, index), { role: "user", content: t }])
    if (!session || isStartingRun) return
    setIsStartingRun(true); setRunError(null)
    try {
      const auth = await getOptionalAuthHeader()
      const res  = await fetch("/api/computer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ sessionId: session.id, prompt: t }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not start run")
    } catch (err) { setRunError(err instanceof Error ? err.message : "Could not start run") }
    finally { setIsStartingRun(false) }
  }

  const startNetlifyConnection = async () => {
    if (!session?.projectId) return
    const auth = await getOptionalAuthHeader()
    const returnTo = encodeURIComponent(`/computer/${session.id}`)
    const res = await fetch(`/api/netlify/oauth/start?projectId=${encodeURIComponent(session.projectId)}&returnTo=${returnTo}`, {
      headers: auth,
    })
    const data = await res.json().catch(() => ({})) as { url?: string; error?: string }
    if (!res.ok || !data.url) {
      throw new Error(data.error || "Could not start Netlify connection")
    }
    window.location.href = data.url
  }

  const handleDeploy = async (provider: DeployProvider) => {
    if (!session?.projectId || deployState.busy) return

    setDeployOpen(true)
    setDeployState({
      provider,
      busy: true,
      step: "Starting",
      error: null,
      siteUrl: null,
      adminUrl: null,
    })

    try {
      const auth = await getOptionalAuthHeader()
      const endpoint = provider === "netlify" ? "/api/netlify/deploy" : "/api/vercel/deploy"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ projectId: session.projectId }),
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "Deploy request failed")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let failedWithNetlifyConnection = false

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        while (true) {
          const index = buffer.indexOf("\n")
          if (index === -1) break
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (!line) continue

          let payload: {
            type?: string
            step?: string
            message?: string
            error?: string
            siteUrl?: string
            adminUrl?: string
          }
          try {
            payload = JSON.parse(line)
          } catch {
            continue
          }

          if (payload.type === "step" && payload.step) {
            setDeployState((current) => ({ ...current, step: payload.step || current.step }))
          }

          if (payload.type === "log" && payload.message) {
            setDeployState((current) => ({ ...current, step: payload.message || current.step }))
          }

          if (payload.type === "error") {
            failedWithNetlifyConnection = provider === "netlify" && /netlify not connected/i.test(String(payload.error || ""))
            setDeployState((current) => ({
              ...current,
              error: getDeployErrorMessage(payload.error),
              step: "Needs connection",
            }))
          }

          if (payload.type === "success") {
            setDeployState((current) => ({
              ...current,
              step: "Ready",
              error: null,
              siteUrl: payload.siteUrl || null,
              adminUrl: payload.adminUrl || null,
            }))
          }
        }
      }

      if (failedWithNetlifyConnection) {
        await startNetlifyConnection()
      }
    } catch (err) {
      setDeployState((current) => ({
        ...current,
        error: getDeployErrorMessage(err instanceof Error ? err.message : "Deploy failed"),
        step: "Failed",
      }))
    } finally {
      setDeployState((current) => ({ ...current, busy: false }))
    }
  }

  const handleGithubSync = async () => {
    if (!session?.projectId || integrationBusy) return
    setIntegrationBusy("github")
    setIntegrationMessage("Syncing project files to GitHub...")
    try {
      const auth = await getOptionalAuthHeader()
      const res = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ projectId: session.projectId }),
      })
      const data = await res.json().catch(() => ({})) as { repoUrl?: string; repoFullName?: string; error?: string }
      if (!res.ok) {
        const error = data.error || "GitHub sync failed"
        if (/not connected/i.test(error)) {
          const returnTo = encodeURIComponent(`/computer/${session.id}`)
          const start = await fetch(`/api/github/oauth/start?projectId=${encodeURIComponent(session.projectId)}&returnTo=${returnTo}`, {
            headers: auth,
          })
          const startJson = await start.json().catch(() => ({})) as { url?: string; error?: string }
          if (!start.ok || !startJson.url) throw new Error(startJson.error || error)
          window.location.href = startJson.url
          return
        }
        throw new Error(error)
      }
      setIntegrationMessage(`Synced to ${data.repoFullName || data.repoUrl || "GitHub"}.`)
    } catch (err) {
      setIntegrationMessage(err instanceof Error ? err.message : "GitHub sync failed")
    } finally {
      setIntegrationBusy(null)
    }
  }

  const handleSupabaseSetup = async () => {
    if (!session?.projectId || integrationBusy) return
    setIntegrationBusy("supabase")
    setIntegrationMessage("Preparing Supabase for this website...")
    try {
      const auth = await getOptionalAuthHeader()
      const connectionRes = await fetch("/api/supabase/check-connection", { headers: auth })
      const connection = await connectionRes.json().catch(() => ({})) as { connected?: boolean; error?: string }
      if (!connection.connected) {
        const authRes = await fetch(`/api/integrations/supabase/authorize?builderProjectId=${encodeURIComponent(session.projectId)}`, {
          headers: auth,
        })
        const authJson = await authRes.json().catch(() => ({})) as { url?: string; error?: string }
        if (!authRes.ok || !authJson.url) throw new Error(authJson.error || "Failed to start Supabase connection")
        window.open(authJson.url, "supabase-oauth", "width=560,height=760,menubar=no,toolbar=no")
        setIntegrationMessage("Complete Supabase connection, then run setup again.")
        return
      }

      const setupRes = await fetch("/api/integrations/supabase/auto-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ projectId: session.projectId, createProject: true }),
      })
      const setup = await setupRes.json().catch(() => ({})) as { projectRef?: string; error?: string }
      if (!setupRes.ok) throw new Error(setup.error || "Supabase setup failed")
      if (!setup.projectRef) {
        setIntegrationMessage("Supabase is connected. This website does not need backend provisioning yet.")
        return
      }

      setIntegrationMessage("Supabase linked. Wiring it into the generated website...")
      const provisionRes = await fetch("/api/integrations/supabase/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ projectId: session.projectId }),
      })
      const provision = await provisionRes.json().catch(() => ({})) as {
        projectRef?: string
        provisioned?: boolean
        error?: string
      }
      if (!provisionRes.ok) throw new Error(provision.error || "Supabase provisioning failed")
      setIntegrationMessage(`Supabase connected${setup.projectRef ? `: ${setup.projectRef}` : ""}.`)
    } catch (err) {
      setIntegrationMessage(err instanceof Error ? err.message : "Supabase setup failed")
    } finally {
      setIntegrationBusy(null)
    }
  }

  const handleEnvAdd = (key: string, value: string) => {
    const name = key.trim()
    if (!name) return
    setProjectIntegration((current) => ({
      ...(current || {}),
      envVarNames: Array.from(new Set([...(current?.envVarNames || []), name])),
    }))
    setEnvValues((current) => ({ ...current, [name]: value }))
  }

  const handleEnvSave = async () => {
    if (!session?.projectId || integrationBusy) return
    setIntegrationBusy("env")
    setIntegrationMessage("Saving encrypted environment variables...")
    try {
      const auth = await getOptionalAuthHeader()
      const res = await fetch("/api/env-vars/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ projectId: session.projectId, envVars: envValues }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || "Failed to save environment variables")
      setIntegrationMessage("Environment variables saved. Updating preview...")

      const files = projectIntegration?.files || []
      if (!files.length) {
        setIntegrationMessage("Environment variables saved. Preview will use them on the next run.")
        return
      }

      const sandboxRes = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ files, projectId: session.projectId }),
      })
      const text = await sandboxRes.text().catch(() => "")
      if (!sandboxRes.ok) {
        const parsed = text.split("\n").map((line) => {
          try { return JSON.parse(line) } catch { return null }
        }).find((event) => event?.error)
        throw new Error(parsed?.error || text || "Preview update failed")
      }

      let previewUrl = ""
      for (const line of text.split("\n")) {
        try {
          const event = JSON.parse(line)
          if (event?.type === "success" && typeof event.url === "string") {
            previewUrl = event.url
          }
        } catch {}
      }

      if (previewUrl) {
        await updateDoc(doc(db, "computerSessions", session.id), { previewUrl })
        setActiveTab("preview")
        setIntegrationMessage("Environment variables saved and preview updated.")
      } else {
        setIntegrationMessage("Environment variables saved. Preview is restarting.")
      }
    } catch (err) {
      setIntegrationMessage(err instanceof Error ? err.message : "Failed to save environment variables")
    } finally {
      setIntegrationBusy(null)
    }
  }

  useEffect(() => {
    if (!session?.projectId) return

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; ok?: boolean; builderProjectId?: string; message?: string }
      if (data?.type !== "supabase-oauth") return
      if (data.builderProjectId && data.builderProjectId !== session.projectId) return
      if (!data.ok) {
        setIntegrationMessage(data.message || "Supabase connection failed.")
        return
      }
      setIntegrationMessage("Supabase connected. Provisioning this website...")
      void handleSupabaseSetup()
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [session?.projectId])

  if (loading) return <LoadingShell />
  if (error || !session) return <ErrorState message={error ?? "Session not found or access denied."} />

  const isActive     = session.status === "running" || session.status === "planning"
  const visibleEvents = session.timeline.filter((e) => e.title !== "Session created")
  const hasPreview    = Boolean(session.previewUrl)
  const hasBrowser    = Boolean(browserInspection)
  const hasResearch   = session.timeline.some((e) => (e.kind === "research" || e.kind === "browser") && e.description?.trim())

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#f0ece4] text-[#1c1c1c]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(210,200,182,0.22),transparent)]" />

      {/* ── Header ── */}
      <header className="relative z-10 shrink-0 px-3 pt-3 pb-2.5 sm:px-4 sm:pt-4 sm:pb-3">
        <div className="mx-auto max-w-[1800px]">
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[1.4rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.92)] px-3.5 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_32px_-12px_rgba(0,0,0,0.12)] backdrop-blur-md sm:rounded-[1.6rem] sm:px-5 sm:py-3">
            <Link href="/" aria-label="Back"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 shadow-sm">
                  <Laptop className="h-4 w-4" />
                  <span className="sr-only">Computer session</span>
                </span>
                {isEditingTitle ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      className="min-w-0 flex-1 max-w-[24rem] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-1 ring-transparent transition focus:border-zinc-400 focus:ring-zinc-200"
                      placeholder="Enter a session title"
                      aria-label="Edit session title"
                    />
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => { setIsEditingTitle(false); setTitleError(null); setTitleDraft(firstPrompt || "") }}>
                        Cancel
                      </Button>
                      <Button type="button" size="sm" disabled={titleSaving || !titleDraft.trim()} onClick={async () => {
                        if (!session) return
                        const trimmed = titleDraft.trim()
                        if (!trimmed) return
                        setTitleSaving(true)
                        setTitleError(null)
                        try {
                          await updateDoc(doc(db, "computerSessions", session.id), { prompt: trimmed })
                          setIsEditingTitle(false)
                        } catch (err) {
                          setTitleError("Could not save title. Please try again.")
                        } finally {
                          setTitleSaving(false)
                        }
                      }}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
                      {sessionTitle}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(true)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 transition-colors hover:text-zinc-900"
                      aria-label="Edit session title"
                      title="Edit title"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {titleError && (
                <p className="mt-1 text-xs text-red-600">{titleError}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <StatusBadge status={session.status} />
              <IntegrationsButton
                projectId={session.projectId}
                project={projectIntegration}
                open={integrationsOpen}
                busy={integrationBusy}
                message={integrationMessage}
                envValues={envValues}
                onOpenChange={setIntegrationsOpen}
                onGithubSync={handleGithubSync}
                onSupabaseSetup={handleSupabaseSetup}
                onEnvChange={(key, value) => setEnvValues((current) => ({ ...current, [key]: value }))}
                onEnvAdd={handleEnvAdd}
                onEnvSave={handleEnvSave}
              />
              <DeployButton
                projectId={session.projectId}
                open={deployOpen}
                state={deployState}
                onOpenChange={setDeployOpen}
                onDeploy={handleDeploy}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── 2-panel body ── */}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 gap-3 overflow-hidden px-3 pb-16 sm:pb-3 sm:px-4 sm:pb-4">

        {/* ── Feed panel (left) ── */}
        <div className={cn(
          "flex w-full shrink-0 flex-col overflow-hidden rounded-[1.4rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.96)] shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)]",
          "sm:w-[380px] xl:w-[420px]",
          mobileView !== "feed" && "hidden sm:flex"
        )}>
          {/* Feed header */}
          <div className="shrink-0 border-b border-[#ede8e0] bg-[#fcfaf6] px-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium leading-5 text-zinc-900">
                  {firstPrompt || "Untitled request"}
                </p>
              </div>
              {isActive && (
                <div className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                  <PulseDot color="bg-zinc-900" active />
                  <TextShimmer className="bg-gradient-to-r from-zinc-500 via-zinc-950 to-zinc-500 text-[11px] font-medium" duration={1.45}>
                    {STATUS_LABELS[session.status]}
                  </TextShimmer>
                </div>
              )}
              {!isActive && (
                <span className="shrink-0 text-[11px] font-medium text-zinc-400">
                  {STATUS_LABELS[session.status]}
                </span>
              )}
            </div>
          </div>

          {/* Step strip */}
          {visibleEvents.length > 0 && (
            <div className="shrink-0 overflow-x-auto border-b border-[#ede8e0] bg-[#fcfaf6] px-4 py-3 [scrollbar-width:none]">
              <StepStrip events={session.timeline} status={session.status} />
            </div>
          )}

          {/* Feed scroll area */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin] sm:px-5">
            <AgentFeed
              prompt={firstPrompt} events={session.timeline}
              localMessages={localMessages} status={session.status}
              optimisticStart={optimisticStart}
              editingIndex={editingMsgIndex} editText={editText}
              onEditStart={handleEditStart} onEditChange={setEditText}
              onEditSubmit={handleEditSubmit} onEditCancel={handleEditCancel}
            />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-[#ede8e0] bg-[#faf9f5] p-3 sm:p-4">
            {runError && (
              <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                <p className="text-[11.5px] text-red-700">{runError}</p>
              </div>
            )}
            <AnimatedAIInput mode="chat" compact isLoading={isStartingRun}
              onSubmit={handleRun} placeholder="Message the agent..." submitLabel="Run" />
          </div>
        </div>

        {/* ── Workspace panel (right) ── */}
        <div className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.4rem] border border-[#e0dbd1] bg-[rgba(252,250,246,0.96)] shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)]",
          mobileView !== "workspace" && "hidden sm:flex"
        )}>
          {/* Workspace tab bar */}
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-[#faf9f5] px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
              <TabBtn active={activeTab === "preview"} onClick={() => setActiveTab("preview")}
                icon={<Monitor className="h-3.5 w-3.5" />} label="Preview"
                dot={hasPreview && isActive} />
              <TabBtn active={activeTab === "browser"} onClick={() => setActiveTab("browser")}
                icon={<Globe2 className="h-3.5 w-3.5" />} label="Browser"
                dot={hasBrowser && isActive} />
              <TabBtn active={activeTab === "research"} onClick={() => setActiveTab("research")}
                icon={<BookOpen className="h-3.5 w-3.5" />} label="Research"
                dot={hasResearch && activeTab !== "research"} />
            </div>
            {/* Completion badge */}
            {session.status === "complete" && (
              <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-semibold text-green-700">
                <Check className="h-2.5 w-2.5 stroke-[3]" />Done
              </span>
            )}
          </div>

          {/* Workspace content */}
          <div className="relative min-h-0 flex-1 bg-[#f7f5f1]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }} className="h-full min-h-0">
                <WorkspaceContent
                  session={session} activeTab={activeTab}
                  browserInspection={browserInspection}
                  onSwitchView={setActiveTab}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Mobile bottom nav — 2 views only ── */}
      <nav className="absolute inset-x-0 bottom-0 z-10 shrink-0 border-t border-[#ede8e0] bg-[rgba(252,250,246,0.96)] px-3 pb-safe pt-2 backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-sm grid-cols-2 gap-1 rounded-[1rem] border border-[#e0dbd1] bg-[#f5f3ee] p-1">
          {([
            { value: "feed"      as const, label: "Session",   icon: MessageSquare   },
            { value: "workspace" as const, label: "Workspace", icon: LayoutPanelLeft },
          ]).map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" onClick={() => setMobileView(value)}
              className={cn(
                "flex h-10 items-center justify-center gap-1.5 rounded-[0.75rem]",
                "text-[12px] font-medium transition-all",
                mobileView === value
                  ? "bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-zinc-500 hover:text-zinc-700"
              )}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              {value === "workspace" && isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
