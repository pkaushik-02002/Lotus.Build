import crypto from "crypto"
import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import { z } from "zod"
import type { DocumentReference } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"
import type { ComputerTimelineEvent } from "@/lib/computer-agent/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const CLAUDE_COMPUTER_MODEL = "claude-sonnet-4-5-20250929"

const runRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  prompt: z.string().trim().max(12000).optional(),
})

type FirecrawlSearchResult = {
  title?: unknown
  url?: unknown
  description?: unknown
}

type GenerationDecision = {
  shouldGenerate: boolean
  reason: string
}

type GeneratedFile = {
  path: string
  content: string
}

type RemoteBrowserInspection = {
  summary: string
  liveUrl: string
  sessionId: string
  baseUrl: string
  pageTitle: string
  evidence: WebEvidence
}

type AgentWebAction =
  | "search_web"
  | "inspect_page"
  | "collect_dom"
  | "scrape_fallback"
  | "generate_frontend"
  | "skip"

type AgentWebIntent = "clone" | "reference" | "research" | "build" | "edit" | "unknown"

type AgentWebPlan = {
  actions: AgentWebAction[]
  targetUrls: string[]
  searchQuery: string
  intent: AgentWebIntent
  reason: string
}

type WebEvidenceProvider = "firecrawl" | "tinyfish"

type WebEvidence = {
  provider: WebEvidenceProvider
  sourceUrl: string
  intent: AgentWebIntent
  title?: string
  description?: string
  searchResults?: Array<{ title: string; url: string; description?: string }>
  domOutline?: string[]
  sections?: Array<{ tag: string; heading: string; text: string }>
  textContent?: string
  links?: Array<{ text: string; href: string }>
  images?: Array<{ alt: string; src: string }>
  styleHints?: {
    colors?: string[]
    fonts?: string[]
    backgroundColor?: string
    textColor?: string
  }
  screenshotSummary?: string
  fallbackReason?: string
}

async function appendEvent(
  docRef: DocumentReference,
  event: ComputerTimelineEvent,
  runId: string
) {
  const snap = await docRef.get()
  const data = snap.data() || {}
  const timeline = Array.isArray(data.timeline) ? data.timeline : []

  if (data?.currentRunId !== runId) {
    return
  }

  const sanitizedEvent = { ...event, runId, index: timeline.length } as Record<string, unknown>

  if (sanitizedEvent.description === undefined) {
    delete sanitizedEvent.description
  }

  if (sanitizedEvent.metadata && typeof sanitizedEvent.metadata === "object") {
    const cleanedMetadata = Object.entries(sanitizedEvent.metadata as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[key] = value
        return acc
      }, {})

    if (Object.keys(cleanedMetadata).length > 0) {
      sanitizedEvent.metadata = cleanedMetadata
    } else {
      delete sanitizedEvent.metadata
    }
  }

  timeline.push(sanitizedEvent as ComputerTimelineEvent)

  await docRef.update({
    timeline,
    updatedAt: new Date(),
  })
}

async function isActiveRun(docRef: DocumentReference, runId: string) {
  const latest = await docRef.get()
  const data = latest.data()
  return data?.currentRunId === runId
}

function normalizeFirecrawlSearchResults(rawResults: unknown): Array<{ title: string; url: string; description?: string }> {
  const results = Array.isArray(rawResults) ? rawResults : []
  return results
    .map((result) => {
      const record = result as FirecrawlSearchResult
      const url = typeof record.url === "string" ? record.url.trim() : ""
      if (!url.startsWith("http")) return null

      const title = typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : "Untitled result"
      const description = typeof record.description === "string" && record.description.trim()
        ? record.description.trim().slice(0, 500)
        : undefined

      return {
        title,
        url,
        ...(description ? { description } : {}),
      }
    })
    .filter((result): result is { title: string; url: string; description?: string } => Boolean(result))
    .slice(0, 5)
}

function getFirstEvidenceUrl(results: Array<{ url: string }>) {
  return results.find((result) => result.url.startsWith("http"))?.url || null
}

function extractTextFromAnthropicContent(content: unknown) {
  return Array.isArray(content)
    ? content
        .map((contentBlock: any) => (contentBlock.type === "text" ? contentBlock.text : ""))
        .join("")
        .trim()
    : ""
}

function extractJson(text: string): any | null {
  if (!text) return null

  const match = text.match(/\{[\s\S]*\}/)

  if (match) {
    try {
      return JSON.parse(match[0])
    } catch {}
  }

  return null
}

function extractAgentMessage(content: string) {
  return {
    contentWithoutAgent: content.replace(
      /===AGENT_MESSAGE===[\s\S]*?===END_AGENT_MESSAGE===/,
      ""
    ),
  }
}

function parseStreamingFiles(content: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const seenPaths = new Set<string>()
  const parseWithRegex = (fileRegex: RegExp) => {
    let match: RegExpExecArray | null

    while ((match = fileRegex.exec(content)) !== null) {
      const path = match[1]?.trim()
      const fileContent = match[2]
        ?.replace(/^```[a-zA-Z0-9_-]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim()

      if (path && fileContent && !seenPaths.has(path)) {
        seenPaths.add(path)
        files.push({ path, content: fileContent })
      }
    }
  }

  parseWithRegex(/===FILE:\s*(.*?)===([\s\S]*?)===END_FILE===/g)
  if (!files.length) {
    parseWithRegex(/===FILE:(.*?)===([\s\S]*?)===END_FILE===/g)
  }

  return files
}

async function parseGenerateResponse(res: Response): Promise<GeneratedFile[]> {
  const contentType = res.headers.get("content-type") || ""
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No response body")

  let text = ""
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }

  text += decoder.decode()
  console.log("FULL GEN OUTPUT:", text)

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      const parsed = extractJson(text)
      const error = typeof parsed?.error === "string" ? parsed.error : null
      throw new Error(error || `Generation failed with ${res.status}`)
    }
    throw new Error(text || `Generation failed with ${res.status}`)
  }

  const { contentWithoutAgent } = extractAgentMessage(text)
  const files = parseStreamingFiles(contentWithoutAgent)
  if (!files.length) {
    console.error("GEN PARSE FAILED:", text.slice(0, 1000))
    throw new Error("No files generated - parser failed")
  }

  return files
}

type FailureClassification = {
  category: "syntax_error" | "missing_dependency" | "invalid_request" | "unknown"
  reason: string
}

function parseFailureClassification(text: string): FailureClassification {
  const parsed = extractJson(text) as Partial<FailureClassification> | null
  if (parsed) {
    const validCategories = ["syntax_error", "missing_dependency", "invalid_request", "unknown"]
    return {
      category: validCategories.includes(parsed.category as string)
        ? (parsed.category as FailureClassification["category"])
        : "unknown",
      reason: typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 500)
        : "parse_failed",
    }
  }

  return { category: "unknown", reason: "parse_failed" }
}

function parseGenerationDecision(text: string): GenerationDecision {
  const parsed = extractJson(text) as Partial<GenerationDecision> | null
  if (
    parsed &&
    typeof parsed.shouldGenerate === "boolean" &&
    typeof parsed.reason === "string"
  ) {
    return {
      shouldGenerate: parsed.shouldGenerate,
      reason: parsed.reason.trim() ? parsed.reason.trim().slice(0, 500) : "default",
    }
  }

  return { shouldGenerate: true, reason: "parse_failed" }
}

function normalizeTinyFishEvent(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const nested = record.event
  return nested && typeof nested === "object"
    ? { ...record, ...(nested as Record<string, unknown>) }
    : record
}

function readStringField(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = record[field]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return ""
}

function summarizeTinyFishResult(result: unknown) {
  if (typeof result === "string") return result.trim()
  if (!result || typeof result !== "object") return ""

  const record = result as Record<string, unknown>
  const directSummary = readStringField(record, ["summary", "answer", "text", "markdown"])
  if (directSummary) return directSummary

  return JSON.stringify(result)
}

function getOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return ""
  }
}

function summarizeWebEvidence(evidence: WebEvidence) {
  const lines = [
    `Provider: ${evidence.provider}`,
    `URL: ${evidence.sourceUrl}`,
    evidence.title ? `Title: ${evidence.title}` : "",
    evidence.description ? `Description: ${evidence.description}` : "",
    evidence.fallbackReason ? `Fallback: ${evidence.fallbackReason}` : "",
    evidence.searchResults?.length
      ? `Search results:\n${evidence.searchResults.map((result, index) => `${index + 1}. ${result.title}\n${result.url}${result.description ? `\n${result.description}` : ""}`).join("\n\n")}`
      : "",
    evidence.domOutline?.length ? `DOM outline:\n${evidence.domOutline.slice(0, 30).join("\n")}` : "",
    evidence.sections?.length
      ? `Sections:\n${evidence.sections.slice(0, 12).map((section) => `- ${section.heading || section.tag}: ${section.text}`).join("\n")}`
      : "",
    evidence.styleHints
      ? `Style hints: ${[
          evidence.styleHints.colors?.length ? `colors ${evidence.styleHints.colors.join(", ")}` : "",
          evidence.styleHints.fonts?.length ? `fonts ${evidence.styleHints.fonts.join(", ")}` : "",
          evidence.styleHints.backgroundColor ? `background ${evidence.styleHints.backgroundColor}` : "",
          evidence.styleHints.textColor ? `text ${evidence.styleHints.textColor}` : "",
        ].filter(Boolean).join("; ")}`
      : "",
    evidence.links?.length ? `Key links: ${evidence.links.slice(0, 10).map((link) => `${link.text || "Link"} (${link.href})`).join(", ")}` : "",
    evidence.images?.length ? `Images: ${evidence.images.slice(0, 8).map((image) => `${image.alt || "Image"} (${image.src})`).join(", ")}` : "",
    evidence.textContent ? `Visible copy:\n${evidence.textContent.slice(0, 1800)}` : "",
  ].filter(Boolean)

  return lines.join("\n\n").slice(0, 5000)
}

function formatWebEvidenceList(evidenceList: WebEvidence[]) {
  if (!evidenceList.length) return ""

  return evidenceList
    .map((evidence, index) => `Evidence ${index + 1} (${evidence.intent}, ${evidence.provider})\n${summarizeWebEvidence(evidence)}`)
    .join("\n\n---\n\n")
    .slice(0, 9000)
}

function extractUrls(text: string) {
  const matches = text.match(/https?:\/\/[^\s<>"'`]+/g) || []
  return Array.from(
    new Set(matches.map((url) => url.replace(/[),.;!?]+$/, "")))
  ).slice(0, 3)
}

function inferWebIntent(prompt: string): AgentWebIntent {
  const normalized = prompt.toLowerCase()
  if (/\b(clone|copy|recreate|replicate|remake|duplicate)\b/.test(normalized)) return "clone"
  if (/\b(reference|inspired by|like this|similar to|use this site)\b/.test(normalized)) return "reference"
  if (/\b(research|competitor|latest|current|today|market|examples?)\b/.test(normalized)) return "research"
  if (/\b(update|change|edit|modify|improve)\b/.test(normalized)) return "edit"
  if (/\b(build|create|make|generate)\b/.test(normalized)) return "build"
  return "unknown"
}

function normalizeAgentWebAction(value: unknown): AgentWebAction | null {
  const action = typeof value === "string" ? value.trim() : ""
  const actions: AgentWebAction[] = [
    "search_web",
    "inspect_page",
    "collect_dom",
    "scrape_fallback",
    "generate_frontend",
    "skip",
  ]
  return actions.includes(action as AgentWebAction) ? action as AgentWebAction : null
}

function normalizeAgentWebIntent(value: unknown): AgentWebIntent {
  const intent = typeof value === "string" ? value.trim() : ""
  const intents: AgentWebIntent[] = ["clone", "reference", "research", "build", "edit", "unknown"]
  return intents.includes(intent as AgentWebIntent) ? intent as AgentWebIntent : "unknown"
}

function hasUsableEvidence(evidence: WebEvidence) {
  return Boolean(
    evidence.textContent?.trim() ||
    evidence.domOutline?.length ||
    evidence.sections?.length ||
    evidence.searchResults?.length ||
    evidence.links?.length ||
    evidence.images?.length
  )
}

async function runTinyFishScrapeFallback(params: {
  targetUrl: string
  prompt: string
  apiKey: string
  signal: AbortSignal
  intent: AgentWebIntent
  fallbackReason: string
}): Promise<WebEvidence> {
  const browserRes = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": params.apiKey,
    },
    body: JSON.stringify({
      url: params.targetUrl,
      goal: `Scrape this page for the website builder task below. Extract useful visible content, headings, links, images, page structure, and style notes. Do not browse interactively.\n\nBuilder task:\n${params.prompt}`,
      browser_profile: "lite",
      api_integration: "lotus-build",
      agent_config: {
        mode: "strict",
        max_steps: 20,
      },
      capture_config: {
        elements: true,
        snapshots: true,
        screenshots: true,
        recording: false,
      },
      output_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          pageTitle: { type: "string" },
          headings: {
            type: "array",
            items: { type: "string" },
          },
          designPatterns: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["summary"],
      },
    }),
    signal: params.signal,
  })

  if (!browserRes.ok) {
    const text = await browserRes.text().catch(() => "")
    throw new Error(`TinyFish request failed: ${browserRes.status} ${text}`)
  }

  const reader = browserRes.body?.getReader()
  if (!reader) throw new Error("TinyFish stream unavailable")

  const decoder = new TextDecoder()
  let buffer = ""
  let summary = ""

  const handleData = async (dataStr: string) => {
    if (!dataStr || dataStr === "[DONE]") return

    const parsed = JSON.parse(dataStr)
    const event = normalizeTinyFishEvent(parsed)
    if (!event) return

    const type = readStringField(event, ["type"]).toUpperCase()

    if (type === "COMPLETE") {
      summary = summarizeTinyFishResult(event.result).trim()
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""

    for (const part of parts) {
      const dataLines = part
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, ""))

      if (!dataLines.length) continue
      try {
        await handleData(dataLines.join("\n"))
      } catch {
        // Ignore malformed partial SSE payloads.
      }
    }
  }

  buffer += decoder.decode()
  const remainingDataLines = buffer
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
  if (remainingDataLines.length) {
    try {
      await handleData(remainingDataLines.join("\n"))
    } catch {}
  }

  if (!summary) {
    throw new Error("TinyFish stream did not contain a completion result")
  }

  return {
    provider: "tinyfish",
    sourceUrl: params.targetUrl,
    intent: params.intent,
    title: params.targetUrl,
    textContent: summary.slice(0, 6000),
    fallbackReason: params.fallbackReason,
  }
}

function toStringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, limit)
    : []
}

function toRecordArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).slice(0, limit)
    : []
}

function parseFirecrawlExecuteResult(payload: Record<string, unknown>, sourceUrl: string, intent: AgentWebIntent): WebEvidence {
  const raw =
    typeof payload.result === "string" && payload.result.trim()
      ? payload.result.trim()
      : typeof payload.stdout === "string"
        ? payload.stdout.trim()
        : ""

  if (!raw) {
    return {
      provider: "firecrawl",
      sourceUrl,
      intent,
    }
  }

  try {
    const parsed = JSON.parse(raw) as {
      title?: unknown
      description?: unknown
      headings?: unknown
      domOutline?: unknown
      sections?: unknown
      textContent?: unknown
      links?: unknown
      images?: unknown
      styleHints?: unknown
    }
    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const description = typeof parsed.description === "string" ? parsed.description.trim().slice(0, 500) : ""
    const domOutline = toStringArray(parsed.domOutline, 80)
    const headingSections = toStringArray(parsed.headings, 24).map((heading) => ({
      tag: "heading",
      heading,
      text: "",
    }))
    const sections = toRecordArray(parsed.sections, 24).map((section) => ({
      tag: typeof section.tag === "string" ? section.tag.slice(0, 20) : "section",
      heading: typeof section.heading === "string" ? section.heading.slice(0, 160) : "",
      text: typeof section.text === "string" ? section.text.slice(0, 700) : "",
    }))
    const textContent = typeof parsed.textContent === "string" ? parsed.textContent.trim().slice(0, 6000) : ""
    const links = toRecordArray(parsed.links, 30).map((link) => ({
      text: typeof link.text === "string" ? link.text.slice(0, 120) : "",
      href: typeof link.href === "string" ? link.href.slice(0, 500) : "",
    })).filter((link) => link.href)
    const images = toRecordArray(parsed.images, 24).map((image) => ({
      alt: typeof image.alt === "string" ? image.alt.slice(0, 160) : "",
      src: typeof image.src === "string" ? image.src.slice(0, 500) : "",
    })).filter((image) => image.src)
    const rawStyleHints = parsed.styleHints && typeof parsed.styleHints === "object"
      ? parsed.styleHints as Record<string, unknown>
      : {}
    const colors = toStringArray(rawStyleHints.colors, 12)
    const fonts = toStringArray(rawStyleHints.fonts, 8)
    const backgroundColor = typeof rawStyleHints.backgroundColor === "string" ? rawStyleHints.backgroundColor : undefined
    const textColor = typeof rawStyleHints.textColor === "string" ? rawStyleHints.textColor : undefined

    return {
      provider: "firecrawl",
      sourceUrl,
      intent,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(domOutline.length ? { domOutline } : {}),
      ...(sections.length || headingSections.length ? { sections: sections.length ? sections : headingSections } : {}),
      ...(textContent ? { textContent } : {}),
      ...(links.length ? { links } : {}),
      ...(images.length ? { images } : {}),
      ...(colors.length || fonts.length || backgroundColor || textColor
        ? { styleHints: { ...(colors.length ? { colors } : {}), ...(fonts.length ? { fonts } : {}), ...(backgroundColor ? { backgroundColor } : {}), ...(textColor ? { textColor } : {}) } }
        : {}),
    }
  } catch {
    return {
      provider: "firecrawl",
      sourceUrl,
      intent,
      textContent: raw.slice(0, 6000),
    }
  }
}

async function runFirecrawlBrowserInspection(params: {
  targetUrl: string
  apiKey: string
  onLiveUrl: (inspection: RemoteBrowserInspection) => Promise<void>
  signal: AbortSignal
  intent: AgentWebIntent
}): Promise<RemoteBrowserInspection> {
  const createRes = await fetch("https://api.firecrawl.dev/v2/browser", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      ttl: 300,
      activityTtl: 180,
      streamWebView: true,
    }),
    signal: params.signal,
  })

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "")
    throw new Error(`Firecrawl browser session failed: ${createRes.status} ${text}`)
  }

  const session = await createRes.json().catch(() => null) as Record<string, unknown> | null
  const sessionId = typeof session?.id === "string" ? session.id : ""
  const liveUrl =
    typeof session?.interactiveLiveViewUrl === "string" && session.interactiveLiveViewUrl.startsWith("http")
      ? session.interactiveLiveViewUrl
      : typeof session?.liveViewUrl === "string" && session.liveViewUrl.startsWith("http")
        ? session.liveViewUrl
        : ""

  if (!sessionId || !liveUrl) {
    throw new Error("Firecrawl browser response did not include a live view URL")
  }

  await params.onLiveUrl({
    summary: "",
    liveUrl,
    sessionId,
    baseUrl: getOrigin(liveUrl),
    pageTitle: params.targetUrl,
    evidence: {
      provider: "firecrawl",
      sourceUrl: params.targetUrl,
      intent: params.intent,
      title: params.targetUrl,
    },
  })

  const executeCode = `
await page.goto(${JSON.stringify(params.targetUrl)}, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(1500);
const title = await page.title();
const description = await page.locator('meta[name="description"]').getAttribute("content").catch(() => "");
const textContent = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
const domOutline = await page.$$eval("body *", nodes => {
  const interesting = ["HEADER", "NAV", "MAIN", "SECTION", "ARTICLE", "ASIDE", "FOOTER", "H1", "H2", "H3", "BUTTON", "A", "FORM"];
  return nodes
    .filter(node => interesting.includes(node.tagName))
    .slice(0, 90)
    .map(node => {
      const text = (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120);
      const id = node.id ? "#" + node.id : "";
      const cls = typeof node.className === "string" && node.className ? "." + node.className.trim().split(/\\s+/).slice(0, 3).join(".") : "";
      return \`\${node.tagName.toLowerCase()}\${id}\${cls}\${text ? " - " + text : ""}\`;
    });
});
const sections = await page.$$eval("header, nav, main, section, article, footer", nodes => nodes.slice(0, 24).map(node => {
  const heading = node.querySelector("h1,h2,h3")?.textContent || "";
  const text = (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 700);
  return { tag: node.tagName.toLowerCase(), heading: heading.trim().slice(0, 160), text };
}));
const links = await page.$$eval("a[href]", nodes => nodes.slice(0, 40).map(node => ({ text: (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120), href: node.href })));
const images = await page.$$eval("img[src]", nodes => nodes.slice(0, 30).map(node => ({ alt: node.alt || "", src: node.currentSrc || node.src })));
const styleHints = await page.evaluate(() => {
  const body = window.getComputedStyle(document.body);
  const colorCounts = new Map();
  const fontCounts = new Map();
  Array.from(document.querySelectorAll("body *")).slice(0, 300).forEach((node) => {
    const styles = window.getComputedStyle(node);
    [styles.color, styles.backgroundColor, styles.borderColor].forEach((value) => {
      if (value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
        colorCounts.set(value, (colorCounts.get(value) || 0) + 1);
      }
    });
    if (styles.fontFamily) fontCounts.set(styles.fontFamily, (fontCounts.get(styles.fontFamily) || 0) + 1);
  });
  const ranked = (map) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([value]) => value);
  return {
    colors: ranked(colorCounts).slice(0, 10),
    fonts: ranked(fontCounts).slice(0, 6),
    backgroundColor: body.backgroundColor,
    textColor: body.color,
  };
});
JSON.stringify({ title, description, domOutline, sections, textContent: textContent.replace(/\\s+/g, " ").slice(0, 6000), links, images, styleHints });
`.trim()

  const executeRes = await fetch(`https://api.firecrawl.dev/v2/browser/${encodeURIComponent(sessionId)}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      code: executeCode,
      language: "node",
      timeout: 60,
    }),
    signal: params.signal,
  })

  if (!executeRes.ok) {
    const text = await executeRes.text().catch(() => "")
    throw new Error(`Firecrawl browser execute failed: ${executeRes.status} ${text}`)
  }

  const executePayload = await executeRes.json().catch(() => ({})) as Record<string, unknown>
  if (typeof executePayload.error === "string" && executePayload.error.trim()) {
    throw new Error(executePayload.error.trim())
  }

  const evidence = parseFirecrawlExecuteResult(executePayload, params.targetUrl, params.intent)
  const summary = summarizeWebEvidence(evidence)
  return {
    summary,
    liveUrl,
    sessionId,
    baseUrl: getOrigin(liveUrl),
    pageTitle: evidence.title || params.targetUrl,
    evidence,
  }
}

async function runFirecrawlSearch(params: {
  query: string
  apiKey: string
  signal?: AbortSignal
}) {
  const searchRes = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      query: params.query,
      limit: 5,
    }),
    signal: params.signal,
  })

  if (!searchRes.ok) {
    throw new Error(`Firecrawl search failed with ${searchRes.status}`)
  }

  const searchData = await searchRes.json().catch(() => null)
  const rawResults = Array.isArray(searchData?.data?.web)
    ? searchData.data.web
    : Array.isArray(searchData?.data)
      ? searchData.data
      : []

  return normalizeFirecrawlSearchResults(rawResults)
}

async function runFirecrawlScrapeFallback(params: {
  targetUrl: string
  apiKey: string
  intent: AgentWebIntent
  signal?: AbortSignal
  fallbackReason: string
}): Promise<WebEvidence> {
  const scrapeRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      url: params.targetUrl,
      formats: ["markdown", "html", "screenshot"],
      onlyMainContent: false,
    }),
    signal: params.signal,
  })

  if (!scrapeRes.ok) {
    const text = await scrapeRes.text().catch(() => "")
    throw new Error(`Firecrawl scrape failed: ${scrapeRes.status} ${text}`)
  }

  const data = await scrapeRes.json().catch(() => null)
  const payload = data?.data ?? data ?? {}
  const metadata = payload?.metadata && typeof payload.metadata === "object"
    ? payload.metadata as Record<string, unknown>
    : {}
  const title = typeof metadata.title === "string" ? metadata.title.trim() : ""
  const description = typeof metadata.description === "string" ? metadata.description.trim() : ""
  const markdown = typeof payload?.markdown === "string" ? payload.markdown.trim() : ""
  const html = typeof payload?.html === "string" ? payload.html.trim() : ""
  const screenshot = typeof payload?.screenshot === "string" ? payload.screenshot.trim() : ""

  return {
    provider: "firecrawl",
    sourceUrl: params.targetUrl,
    intent: params.intent,
    ...(title ? { title } : {}),
    ...(description ? { description: description.slice(0, 500) } : {}),
    textContent: (markdown || html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 6000),
    ...(screenshot ? { screenshotSummary: `Screenshot captured: ${screenshot}` } : {}),
    fallbackReason: params.fallbackReason,
  }
}

function buildHeuristicWebPlan(prompt: string): AgentWebPlan {
  const urls = extractUrls(prompt)
  const intent = inferWebIntent(prompt)
  const needsSearch = urls.length === 0 && intent === "research"
  const shouldInspect = urls.length > 0
  const actions: AgentWebAction[] = []

  if (needsSearch) actions.push("search_web")
  if (shouldInspect) actions.push("inspect_page", "collect_dom")
  if (!actions.length) actions.push("skip")
  actions.push("generate_frontend")

  return {
    actions,
    targetUrls: urls,
    searchQuery: needsSearch ? prompt : "",
    intent,
    reason: urls.length
      ? "The prompt includes a URL, so Firecrawl should inspect it before generation."
      : needsSearch
        ? "The prompt asks for external research."
        : "No specific web context is required.",
  }
}

function parseAgentWebPlan(text: string, prompt: string): AgentWebPlan {
  const fallback = buildHeuristicWebPlan(prompt)
  const parsed = extractJson(text) as Partial<AgentWebPlan> | null
  if (!parsed) return fallback

  const actions = Array.isArray(parsed.actions)
    ? parsed.actions.map(normalizeAgentWebAction).filter((action): action is AgentWebAction => Boolean(action))
    : []
  const targetUrls = Array.isArray(parsed.targetUrls)
    ? parsed.targetUrls.filter((url): url is string => typeof url === "string" && url.startsWith("http")).slice(0, 3)
    : []
  const promptUrls = extractUrls(prompt)
  const mergedTargetUrls = Array.from(new Set([...promptUrls, ...targetUrls])).slice(0, 3)
  const intent = normalizeAgentWebIntent(parsed.intent) || fallback.intent
  const searchQuery = typeof parsed.searchQuery === "string" && parsed.searchQuery.trim()
    ? parsed.searchQuery.trim().slice(0, 500)
    : fallback.searchQuery
  const reason = typeof parsed.reason === "string" && parsed.reason.trim()
    ? parsed.reason.trim().slice(0, 500)
    : fallback.reason

  const nextActions = actions.length ? actions : fallback.actions
  if (mergedTargetUrls.length && !nextActions.includes("inspect_page")) {
    nextActions.unshift("inspect_page", "collect_dom")
  }
  if (!nextActions.includes("generate_frontend")) nextActions.push("generate_frontend")

  return {
    actions: Array.from(new Set(nextActions)),
    targetUrls: mergedTargetUrls,
    searchQuery,
    intent,
    reason,
  }
}

async function createAgentWebPlan(prompt: string, planText: string): Promise<AgentWebPlan> {
  const heuristic = buildHeuristicWebPlan(prompt)
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_COMPUTER_MODEL,
      max_tokens: 250,
      temperature: 0,
      system: `
You are planning autonomous web tool use for an AI website/app builder.

Available actions:
- search_web
- inspect_page
- collect_dom
- scrape_fallback
- generate_frontend
- skip

Rules:
- Return ONLY JSON.
- Detected URLs strongly favor inspect_page and collect_dom.
- Clone/reference URLs require page inspection.
- Research/latest/current/competitor requests may use search_web.
- Vague build prompts without URLs should usually skip web tools.
- TinyFish is not a browser; it is only fallback scrape context and is not part of this plan.

Format:
{
  "actions": ["..."],
  "targetUrls": ["https://..."],
  "searchQuery": "query or empty string",
  "intent": "clone|reference|research|build|edit|unknown",
  "reason": "short reason"
}
`,
      messages: [
        {
          role: "user",
          content: `User request:\n${prompt}\n\nPlanning context:\n${planText || "none"}\n\nHeuristic default:\n${JSON.stringify(heuristic)}`,
        },
      ],
    })

    return parseAgentWebPlan(extractTextFromAnthropicContent(response.content), prompt)
  } catch (err) {
    console.error("Computer web plan failed:", err)
    return heuristic
  }
}

function buildAgentGenerationPrompt(params: {
  prompt: string
  planText: string
  webEvidence: WebEvidence[]
}) {
  const contextSections = [
    params.planText.trim()
      ? `Agent plan:\n${params.planText.trim()}`
      : "",
    params.webEvidence.length
      ? `Agent web context:\n${formatWebEvidenceList(params.webEvidence)}`
      : "",
  ].filter(Boolean)

  if (!contextSections.length) return params.prompt

  return `Build the app requested by the user using the agent context below.

User request:
${params.prompt}

${contextSections.join("\n\n")}

Use the context to make better product, layout, and content decisions. Preserve the original user request as the highest priority and do not invent unrelated scope.

If the request is to clone or recreate a website, build a frontend-only recreation with maintainable React/Tailwind, responsive layout, and local-only interactions. Do not clone backend behavior, authentication, payments, private data, or remote scripts unless the user explicitly asks for backend work later.`
}

export async function POST(req: Request) {
  let activeDocRef: DocumentReference | null = null
  let activeRunId: string | null = null

  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => null)
    const parsed = runRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const docRef = adminDb.collection("computerSessions").doc(parsed.data.sessionId)
    activeDocRef = docRef
    const docSnap = await docRef.get()

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const data = docSnap.data() as { ownerId?: string; prompt?: unknown; model?: unknown; timeline?: unknown }
    if (data.ownerId !== uid) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const storedPrompt = typeof data.prompt === "string" ? data.prompt.trim() : ""
    const prompt = parsed.data.prompt?.trim() || storedPrompt || "No prompt provided"
    const builderModel = typeof data.model === "string" && data.model.trim()
      ? data.model.trim()
      : "GPT-4-1 Mini"
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization") || ""
    const now = new Date()
    const runId = crypto.randomUUID()
    activeRunId = runId

    const runStartedEvent: ComputerTimelineEvent = {
      id: crypto.randomUUID(),
      title: "Run started",
      description: "User initiated a computer run.",
      status: "complete",
      kind: "user",
      createdAt: now.toISOString(),
    }

    await adminDb.runTransaction(async (transaction) => {
      const transactionSnap = await transaction.get(docRef)
      const transactionData = transactionSnap.data() as Record<string, unknown> | undefined

      if (transactionData?.status === "running") {
        throw new Error("RUN_ALREADY_IN_PROGRESS")
      }

      const timeline = Array.isArray(transactionData?.timeline)
        ? (transactionData?.timeline as ComputerTimelineEvent[])
        : []

      transaction.update(docRef, {
        currentRunId: runId,
        status: "running",
        previewUrl: null,
        timeline: [...timeline, { ...runStartedEvent, runId, index: timeline.length }],
        updatedAt: now,
      })
    })

    const appendRunEvent = async (event: ComputerTimelineEvent) =>
      appendEvent(docRef, event, runId)

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run already superseded" })
    }

    await appendRunEvent({
      id: crypto.randomUUID(),
      title: "Understanding request",
      description: undefined,
      status: "complete",
      kind: "understanding",
      createdAt: new Date().toISOString(),
    })

    const understandingNarration = await anthropic.messages.create({
      model: CLAUDE_COMPUTER_MODEL,
      max_tokens: 160,
      temperature: 0.3,
      system: "You are an autonomous agent narrating your reasoning. First person. 2-3 sentences. Plain text. No markdown.",
      messages: [{
        role: "user",
        content: `User request: ${prompt}\n\nIn 2-3 sentences, explain what you understand this request to be and what your first instinct is for how to approach it.`
      }]
    }).catch(() => null)

    const understandingText = understandingNarration
      ? extractTextFromAnthropicContent(understandingNarration.content)
      : null

    if (understandingText) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Understanding insight",
        description: understandingText,
        status: "complete",
        kind: "understanding",
        createdAt: new Date().toISOString(),
      })
    }

    let planText = ""

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_COMPUTER_MODEL,
        max_tokens: 500,
        temperature: 0.2,
        system: `
You are an expert product and software planning agent.

Your job is to take a user prompt and produce a clear execution plan.

Rules:
- No code
- No assumptions about tools
- No fake capabilities
- Focus on real-world steps
- Keep it structured and concise
`,
        messages: [
          {
            role: "user",
            content: `User request: ${prompt}`,
          },
        ],
      })

      planText =
        extractTextFromAnthropicContent(response.content) || "No plan generated."

      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Planning execution",
        description: planText,
        status: "complete",
        kind: "planning",
        createdAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error("Computer planning failed:", err)
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Planning failed",
        description: "Failed to generate plan.",
        status: "error",
        kind: "planning",
        createdAt: new Date().toISOString(),
      })
    }

    const webPlan = await createAgentWebPlan(prompt, planText)

    await appendRunEvent({
      id: crypto.randomUUID(),
      title: "Web plan",
      description: `${webPlan.reason}\nActions: ${webPlan.actions.join(", ")}`,
      status: "complete",
      kind: "planning",
      createdAt: new Date().toISOString(),
    })

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY
    const tinyFishApiKey = process.env.TINYFISH_API_KEY
    const webEvidence: WebEvidence[] = []
    let searchResults: Array<{ title: string; url: string; description?: string }> = []

    if (webPlan.actions.includes("skip")) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Web skipped",
        description: webPlan.reason,
        status: "complete",
        kind: "research",
        createdAt: new Date().toISOString(),
      })
    }

    if (webPlan.actions.includes("search_web")) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Researching web",
        description: webPlan.searchQuery || prompt,
        status: "running",
        kind: "research",
        createdAt: new Date().toISOString(),
      })

      try {
        if (!firecrawlApiKey) throw new Error("Missing FIRECRAWL_API_KEY")
        searchResults = await runFirecrawlSearch({
          query: webPlan.searchQuery || prompt,
          apiKey: firecrawlApiKey,
        })

        const searchEvidence: WebEvidence = {
          provider: "firecrawl",
          sourceUrl: "firecrawl:search",
          intent: webPlan.intent,
          searchResults,
        }
        webEvidence.push(searchEvidence)

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Research complete",
          description: summarizeWebEvidence(searchEvidence),
          status: "complete",
          kind: "research",
          createdAt: new Date().toISOString(),
        })

        const researchNarration = await anthropic.messages.create({
          model: CLAUDE_COMPUTER_MODEL,
          max_tokens: 160,
          temperature: 0.3,
          system: "You are an autonomous agent narrating your reasoning. First person. 2-3 sentences. Plain text. No markdown.",
          messages: [{
            role: "user",
            content: `User request: ${prompt}\n\nSearch results summary:\n${summarizeWebEvidence(searchEvidence)}\n\nIn 2-3 sentences, describe what you found in these results and how you plan to use this information in the build.`
          }]
        }).catch(() => null)

        const researchText = researchNarration
          ? extractTextFromAnthropicContent(researchNarration.content)
          : null

        if (researchText) {
          await appendRunEvent({
            id: crypto.randomUUID(),
            title: "Research insight",
            description: researchText,
            status: "complete",
            kind: "research",
            createdAt: new Date().toISOString(),
          })
        }
      } catch (err) {
        console.error("Computer Firecrawl search failed:", err)
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Research failed",
          description: err instanceof Error ? err.message : "Unable to fetch web results.",
          status: "error",
          kind: "research",
          createdAt: new Date().toISOString(),
        })
      }
    }

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    const targetUrls = Array.from(
      new Set([
        ...webPlan.targetUrls,
        ...(webPlan.actions.includes("inspect_page") || webPlan.actions.includes("collect_dom")
          ? [getFirstEvidenceUrl(searchResults)].filter((url): url is string => Boolean(url))
          : []),
      ])
    ).slice(0, 2)

    if ((webPlan.actions.includes("inspect_page") || webPlan.actions.includes("collect_dom")) && targetUrls.length === 0) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Browser skipped",
        description: "No target URL was available for Firecrawl inspection.",
        status: "complete",
        kind: "browser",
        createdAt: new Date().toISOString(),
      })
    }

    for (const targetUrl of targetUrls) {
      if (!(await isActiveRun(docRef, runId))) {
        return NextResponse.json({ ok: false, message: "Run no longer active" })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 75000)
      const appendBrowserLiveEvent = async (inspection: RemoteBrowserInspection) => {
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Browser live",
          description: "Firecrawl remote browser is available.",
          status: "complete",
          kind: "browser",
          createdAt: new Date().toISOString(),
          metadata: {
            targetUrl,
            browserLiveUrl: inspection.liveUrl,
            browserSessionId: inspection.sessionId || null,
            browserBaseUrl: inspection.baseUrl || null,
            browserProvider: "firecrawl",
            pageTitle: inspection.pageTitle || targetUrl,
          },
        })
      }

      try {
        if (!firecrawlApiKey) throw new Error("Missing FIRECRAWL_API_KEY")
        const inspection = await runFirecrawlBrowserInspection({
          targetUrl,
          apiKey: firecrawlApiKey,
          signal: controller.signal,
          intent: webPlan.intent,
          onLiveUrl: appendBrowserLiveEvent,
        })

        webEvidence.push(inspection.evidence)

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Page inspected",
          description: inspection.summary || "Firecrawl collected page context.",
          status: "complete",
          kind: "browser",
          createdAt: new Date().toISOString(),
          metadata: {
            targetUrl,
            browserLiveUrl: inspection.liveUrl,
            browserSessionId: inspection.sessionId || null,
            browserBaseUrl: inspection.baseUrl || null,
            browserProvider: "firecrawl",
            pageTitle: inspection.pageTitle || targetUrl,
          },
        })

        const browserNarration = await anthropic.messages.create({
          model: CLAUDE_COMPUTER_MODEL,
          max_tokens: 160,
          temperature: 0.3,
          system: "You are an autonomous agent narrating your reasoning. First person. 2-3 sentences. Plain text. No markdown.",
          messages: [{
            role: "user",
            content: `User request: ${prompt}\n\nPage inspected: ${targetUrl}\nPage title: ${inspection.pageTitle}\n\nWhat I found:\n${inspection.summary.slice(0, 800)}\n\nIn 2-3 sentences, describe what stood out on this page and what specific elements you plan to incorporate or recreate.`
          }]
        }).catch(() => null)

        const browserText = browserNarration
          ? extractTextFromAnthropicContent(browserNarration.content)
          : null

        if (browserText) {
          await appendRunEvent({
            id: crypto.randomUUID(),
            title: "Browser insight",
            description: browserText,
            status: "complete",
            kind: "browser",
            createdAt: new Date().toISOString(),
          })
        }
      } catch (browserErr) {
        console.error("Firecrawl browser failed:", browserErr)
        const browserFailure = browserErr instanceof Error ? browserErr.message : "Firecrawl browser failed"

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Browser fallback",
          description: "Firecrawl browser was unavailable, collecting scrape context.",
          status: "complete",
          kind: "browser",
          createdAt: new Date().toISOString(),
        })

        try {
          if (!firecrawlApiKey) throw new Error("Missing FIRECRAWL_API_KEY")
          const scrapeEvidence = await runFirecrawlScrapeFallback({
            targetUrl,
            apiKey: firecrawlApiKey,
            intent: webPlan.intent,
            signal: controller.signal,
            fallbackReason: browserFailure,
          })
          webEvidence.push(scrapeEvidence)

          await appendRunEvent({
            id: crypto.randomUUID(),
            title: "Scrape context collected",
            description: summarizeWebEvidence(scrapeEvidence),
            status: "complete",
            kind: "research",
            createdAt: new Date().toISOString(),
          })
        } catch (firecrawlScrapeErr) {
          const firecrawlScrapeFailure = firecrawlScrapeErr instanceof Error
            ? firecrawlScrapeErr.message
            : "Firecrawl scrape failed"

          if (!tinyFishApiKey) {
            await appendRunEvent({
              id: crypto.randomUUID(),
              title: "Scrape failed",
              description: firecrawlScrapeFailure,
              status: "error",
              kind: "research",
              createdAt: new Date().toISOString(),
            })
          } else {
            try {
              const tinyFishEvidence = await runTinyFishScrapeFallback({
                targetUrl,
                prompt,
                apiKey: tinyFishApiKey,
                signal: controller.signal,
                intent: webPlan.intent,
                fallbackReason: firecrawlScrapeFailure,
              })
              webEvidence.push(tinyFishEvidence)

              await appendRunEvent({
                id: crypto.randomUUID(),
                title: "Fallback scrape collected",
                description: summarizeWebEvidence(tinyFishEvidence),
                status: "complete",
                kind: "research",
                createdAt: new Date().toISOString(),
                metadata: {
                  targetUrl,
                  browserProvider: "tinyfish",
                },
              })
            } catch (tinyFishErr) {
              await appendRunEvent({
                id: crypto.randomUUID(),
                title: "Scrape failed",
                description: tinyFishErr instanceof Error ? tinyFishErr.message : "TinyFish fallback failed",
                status: "error",
                kind: "research",
                createdAt: new Date().toISOString(),
              })
            }
          }
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    const usableWebEvidence = webEvidence.filter(hasUsableEvidence)

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    // — Generation decision phase —
    let generationDecision: GenerationDecision = { shouldGenerate: true, reason: "builder_run" }

    try {
      const generationDecisionRes = await anthropic.messages.create({
        model: CLAUDE_COMPUTER_MODEL,
        temperature: 0,
        max_tokens: 120,
        system: `
You are deciding whether code generation is required.

Rules:
- Return ONLY JSON
- No markdown
- Be conservative
- Only generate code if necessary

Format:
{
  "shouldGenerate": boolean,
  "reason": string
}
`,
        messages: [
          {
            role: "user",
            content: `User request: ${prompt}

Planning:
${planText || "none"}

Research:
${formatWebEvidenceList(usableWebEvidence) || "none"}

Browser:
${formatWebEvidenceList(usableWebEvidence.filter((evidence) => evidence.sourceUrl.startsWith("http"))) || "none"}`,
          },
        ],
      })

      generationDecision = parseGenerationDecision(
        extractTextFromAnthropicContent(generationDecisionRes.content)
      )
    } catch (err) {
      console.error("Computer generation decision failed:", err)
      generationDecision = { shouldGenerate: true, reason: "decision_failed" }
    }

    if (!generationDecision.shouldGenerate) {
      generationDecision = { shouldGenerate: true, reason: generationDecision.reason || "builder_run" }
    }

    await appendRunEvent({
      id: crypto.randomUUID(),
      title: "Generation decision",
      description: generationDecision.shouldGenerate
        ? `Generation required: ${generationDecision.reason}`
        : `Generation skipped: ${generationDecision.reason}`,
      status: "complete",
      kind: "code",
      createdAt: new Date().toISOString(),
    })

    const buildNarration = await anthropic.messages.create({
      model: CLAUDE_COMPUTER_MODEL,
      max_tokens: 160,
      temperature: 0.3,
      system: "You are an autonomous agent narrating your reasoning. First person. 2-3 sentences. Plain text. No markdown.",
      messages: [{
        role: "user",
        content: `User request: ${prompt}\n\nPlan:\n${planText.slice(0, 600)}\n\nResearch summary:\n${formatWebEvidenceList(usableWebEvidence).slice(0, 400)}\n\nIn 2-3 sentences, explain your concrete approach to building this — what you will prioritise, what it will look like, and what framework or structure you will use.`
      }]
    }).catch(() => null)

    const buildText = buildNarration
      ? extractTextFromAnthropicContent(buildNarration.content)
      : null

    if (buildText) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Build approach",
        description: buildText,
        status: "complete",
        kind: "code",
        createdAt: new Date().toISOString(),
      })
    }

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    const requestOrigin = new URL(req.url).origin
    const baseUrl = process.env.BASE_URL || process.env.NEXTAUTH_URL || requestOrigin
    const generationPrompt = buildAgentGenerationPrompt({
      prompt,
      planText,
      webEvidence: usableWebEvidence,
    })
    let generatedFiles: GeneratedFile[] = []

    if (generationDecision.shouldGenerate) {
      let genData: unknown = null
      let generationFailed = false
      let generationError = ""

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 90000)
        let genRes: Response

        try {
          genRes = await fetch(`${baseUrl}/api/generate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
            },
            body: JSON.stringify({
              prompt: generationPrompt,
              model: builderModel,
            }),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeout)
        }

        generatedFiles = await parseGenerateResponse(genRes)
        genData = { files: generatedFiles }

        if (!genRes.ok || generatedFiles.length === 0) {
          generationFailed = true
        } else {
          await appendRunEvent({
            id: crypto.randomUUID(),
            title: "Code generated",
            description: `${generatedFiles.length} files generated`,
            status: "complete",
            kind: "code",
            createdAt: new Date().toISOString(),
          })

          // Persist generated project for reuse (only if session not already linked)
          try {
            const sessionSnap = await docRef.get()
            const sessionData = sessionSnap.data() || {}
            if (!sessionData?.projectId) {
              const projectRef = adminDb.collection("projects").doc()
              await projectRef.set({
                files: generatedFiles,
                createdAt: new Date(),
                updatedAt: new Date(),
                ownerId: uid,
                name: `Computer project ${runId.slice(0, 8)}`,
                prompt,
                messages: [
                  {
                    role: "user",
                    content: prompt,
                    timestamp: new Date().toISOString(),
                  },
                ],
                source: "computer",
                status: "complete",
              })

              await docRef.update({ projectId: projectRef.id })

              await appendRunEvent({
                id: crypto.randomUUID(),
                title: "Project created",
                description: projectRef.id,
                status: "complete",
                kind: "user",
                createdAt: new Date().toISOString(),
                metadata: { projectId: projectRef.id },
              })
            }
          } catch (err) {
            console.error("Persisting generated project failed:", err)
            await appendRunEvent({
              id: crypto.randomUUID(),
              title: "Project persist failed",
              description: err instanceof Error ? err.message : String(err),
              status: "error",
              kind: "user",
              createdAt: new Date().toISOString(),
            })
          }
        }
      } catch (err) {
        console.error("Computer generation failed:", err)
        generationError = err instanceof Error ? err.message : "Generation failed"
        generationFailed = true
      }

      if (generationFailed) {
        // — Classify failure —
        let classification: FailureClassification = { category: "unknown", reason: "default" }

        try {
          const failureRes = await anthropic.messages.create({
            model: CLAUDE_COMPUTER_MODEL,
            temperature: 0,
            max_tokens: 120,
            system: `
You classify code generation failures.

Rules:
- Return ONLY JSON
- No markdown

Categories:
- syntax_error
- missing_dependency
- invalid_request
- unknown

Format:
{
  "category": "...",
  "reason": "..."
}
`,
            messages: [
              {
                role: "user",
                content: `Prompt: ${prompt}
Generation result: ${JSON.stringify(genData)}`,
              },
            ],
          })

          classification = parseFailureClassification(
            extractTextFromAnthropicContent(failureRes.content)
          )
        } catch (err) {
          console.error("Computer failure classification failed:", err)
          classification = { category: "unknown", reason: "classification_failed" }
        }

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Generation failed",
          description: generationError || `${classification.category}: ${classification.reason}`,
          status: "error",
          kind: "code",
          createdAt: new Date().toISOString(),
        })

        // — Single fix attempt (never for invalid_request) —
        if (classification.category !== "invalid_request" && generatedFiles.length > 0) {
          const fixPrompt = `You are fixing an existing codebase.

Original user request:
${prompt}

Failure:
${classification.category} - ${classification.reason}

Instructions:
- Modify ONLY the necessary parts of the code
- Do NOT rewrite the entire project
- Keep existing structure intact
- Fix only the root cause`

          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 90000)
            let fixRes: Response

            try {
              fixRes = await fetch(`${baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: authHeader,
                },
              body: JSON.stringify({
                prompt: fixPrompt,
                  model: builderModel,
                  existingFiles: generatedFiles,
                  creationMode: "build",
                }),
                signal: controller.signal,
              })
            } finally {
              clearTimeout(timeout)
            }

            const fixedFiles = await parseGenerateResponse(fixRes)

            if (fixedFiles.length > 0) {
              generatedFiles = fixedFiles
            }

            await appendRunEvent({
              id: crypto.randomUUID(),
              title: fixRes.ok ? "Fix applied" : "Fix failed",
              description: fixRes.ok
                ? fixedFiles.length
                  ? `${fixedFiles.length} files updated`
                  : "Fix applied with no file changes"
                : "Fix attempt did not succeed.",
              status: fixRes.ok ? "complete" : "error",
              kind: "code",
              createdAt: new Date().toISOString(),
            })
          } catch (err) {
            console.error("Computer fix attempt failed:", err)
            await appendRunEvent({
              id: crypto.randomUUID(),
              title: "Fix failed",
              description: err instanceof Error ? err.message : "Unable to apply fix.",
              status: "error",
              kind: "code",
              createdAt: new Date().toISOString(),
            })
          }
          // STOP — no further retries
        }
      }
    }

    // — Sandbox validation phase —
    if (!generatedFiles.length) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Preview skipped",
        description: "No files generated",
        status: "complete",
        kind: "sandbox",
        createdAt: new Date().toISOString(),
      })
    }

    const hasEntry =
      generatedFiles.some((f) => typeof f?.path === "string" && f.path === "package.json") &&
      generatedFiles.some((f) => typeof f?.path === "string" && f.path.includes("main.tsx"))

    if (generatedFiles.length > 0 && !hasEntry) {
      await appendRunEvent({
        id: crypto.randomUUID(),
        title: "Preview skipped",
        description: "Missing required project files",
        status: "complete",
        kind: "sandbox",
        createdAt: new Date().toISOString(),
      })
    }

    if (generatedFiles.length > 0 && hasEntry) {
      let sandboxSuccess = false
      let sandboxUrl: string | null = null
      let sandboxErrors = ""
      let sandboxLogs = ""

      try {
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Starting sandbox",
          description: "Running the generated app in a preview environment.",
          status: "running",
          kind: "sandbox",
          createdAt: new Date().toISOString(),
        })

        const sessionForSandbox = await docRef.get()
        const sandboxProjectId = typeof sessionForSandbox.data()?.projectId === "string"
          ? sessionForSandbox.data()?.projectId
          : undefined

        const sandboxRes = await fetch(`${baseUrl}/api/sandbox`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ files: generatedFiles, projectId: sandboxProjectId }),
        })

        // Sandbox route streams NDJSON — consume all lines to find success/error events
        const sandboxText = await sandboxRes.text().catch(() => "")
        if (!sandboxRes.ok) {
          const parsed = extractJson(sandboxText)
          sandboxErrors =
            typeof parsed?.error === "string"
              ? parsed.error
              : sandboxText || `Sandbox failed with ${sandboxRes.status}`
        }
        for (const line of sandboxText.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const event = JSON.parse(trimmed)
            if (event?.type === "success") {
              sandboxSuccess = true
              const nextSandboxUrl =
                typeof event?.url === "string"
                  ? event.url
                  : typeof event?.previewUrl === "string"
                  ? event.previewUrl
                  : typeof event?.data?.url === "string"
                  ? event.data.url
                  : null

              if (!sandboxUrl && nextSandboxUrl) {
                sandboxUrl = nextSandboxUrl

                if (await isActiveRun(docRef, runId)) {
                  await docRef.update({
                    previewUrl: sandboxUrl,
                    updatedAt: new Date(),
                  })

                  await appendRunEvent({
                    id: crypto.randomUUID(),
                    title: "Preview ready",
                    description: sandboxUrl || undefined,
                    status: "complete",
                    kind: "sandbox",
                    createdAt: new Date().toISOString(),
                  })
                }
              }
            } else if (event?.type === "error") {
              sandboxErrors = typeof event.error === "string"
                ? event.error.slice(0, 1000)
                : "Unknown runtime error"
              const devLog = typeof event.logs?.dev === "string"
                ? event.logs.dev.slice(0, 1000)
                : ""
              if (devLog) sandboxLogs = devLog
            } else if (event?.type === "log") {
              const chunk = typeof event.data === "string" ? event.data.trim() : ""
              if (chunk) sandboxLogs = (sandboxLogs + "\n" + chunk).slice(-2000)
            }
          } catch {}
        }
      } catch (err) {
        console.error("Computer sandbox call failed:", err)
        sandboxErrors = err instanceof Error ? err.message : "Sandbox call failed"
      }

      if (sandboxSuccess) {
        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Sandbox run successful",
          description: "Application started without runtime errors.",
          status: "complete",
          kind: "sandbox",
          createdAt: new Date().toISOString(),
        })
      } else {
        const errorDescription = (sandboxErrors || sandboxLogs || "Unknown runtime error").slice(0, 800)

        await appendRunEvent({
          id: crypto.randomUUID(),
          title: "Sandbox error",
          description: errorDescription,
          status: "error",
          kind: "sandbox",
          createdAt: new Date().toISOString(),
        })

        // — Runtime fix decision —
        let shouldFix = false

        try {
          const runtimeDecisionRes = await anthropic.messages.create({
            model: CLAUDE_COMPUTER_MODEL,
            temperature: 0,
            max_tokens: 120,
            system: `
Decide if runtime errors should be fixed.

Return ONLY JSON.

Format:
{
  "shouldFix": boolean,
  "reason": string
}
`,
            messages: [
              {
                role: "user",
                content: `Runtime error:\n${sandboxErrors || sandboxLogs}\n\nOriginal prompt:\n${prompt}`,
              },
            ],
          })

          const runtimeDecisionText = extractTextFromAnthropicContent(runtimeDecisionRes.content)
          const parsed = extractJson(runtimeDecisionText)
          shouldFix = Boolean(
            parsed &&
            typeof parsed.shouldFix === "boolean" &&
            parsed.shouldFix
          )
        } catch (err) {
          console.error("Computer runtime fix decision failed:", err)
          shouldFix = false
        }

        if (shouldFix && generatedFiles.length > 0) {
          const runtimeFixPrompt = `Fix runtime errors in this codebase.

Error:
${sandboxErrors || sandboxLogs}

Rules:
- Fix only the root issue
- Do NOT rewrite entire project
- Keep changes minimal`

          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 90000)
            let runtimeFixRes: Response

            try {
              runtimeFixRes = await fetch(`${baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: authHeader,
                },
                body: JSON.stringify({
                  prompt: runtimeFixPrompt,
                  model: builderModel,
                  existingFiles: generatedFiles,
                  creationMode: "build",
                }),
                signal: controller.signal,
              })
            } finally {
              clearTimeout(timeout)
            }

            const runtimeFixedFiles = await parseGenerateResponse(runtimeFixRes)

            if (runtimeFixedFiles.length > 0) {
              generatedFiles = runtimeFixedFiles
            }

            await appendRunEvent({
              id: crypto.randomUUID(),
              title: runtimeFixRes.ok ? "Runtime fix applied" : "Runtime fix failed",
              description: runtimeFixRes.ok
                ? runtimeFixedFiles.length
                  ? `${runtimeFixedFiles.length} files updated`
                  : "Fix applied with no file changes"
                : "Runtime fix attempt did not succeed.",
              status: runtimeFixRes.ok ? "complete" : "error",
              kind: "sandbox",
              createdAt: new Date().toISOString(),
            })
          } catch (err) {
            console.error("Computer runtime fix failed:", err)
            await appendRunEvent({
              id: crypto.randomUUID(),
              title: "Runtime fix failed",
              description: err instanceof Error ? err.message : "Unable to apply runtime fix.",
              status: "error",
              kind: "sandbox",
              createdAt: new Date().toISOString(),
            })
          }
          // STOP — no further retries
        }
      }
    }

    if (!(await isActiveRun(docRef, runId))) {
      return NextResponse.json({ ok: false, message: "Run no longer active" })
    }

    await docRef.update({
      status: "complete",
      currentRunId: null,
      updatedAt: new Date(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed"
    const status = message === "RUN_ALREADY_IN_PROGRESS"
      ? 409
      : message.includes("Authorization")
      ? 401
      : 500

    if (activeDocRef && activeRunId && status !== 409) {
      try {
        await appendEvent(
          activeDocRef,
          {
            id: crypto.randomUUID(),
            title: "Run failed",
            description: message,
            status: "error",
            kind: "planning",
            createdAt: new Date().toISOString(),
          },
          activeRunId
        )
        await activeDocRef.update({
          status: "error",
          currentRunId: null,
          updatedAt: new Date(),
        })
      } catch {}
    }

    return NextResponse.json({ error: message }, { status })
  }
}
