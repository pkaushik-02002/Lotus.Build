import OpenAI from "openai"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { DEFAULT_PLANS } from "@/lib/firebase"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const nvidia = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
})

const DEFAULT_MODEL = "GPT-4-1 Mini"
const OPENAI_MODEL_MAP: Record<string, string> = {
  "o3-mini": "o3-mini",
  "GPT-4-1 Mini": "gpt-4.1-mini",
  "GPT-4-1": "gpt-4.1",
}

const CURATED_NVIDIA_MODELS = [
  "minimaxai/minimax-m2.1",
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-405b-instruct",
  "deepseek-ai/deepseek-r1",
  "qwen/qwen2.5-coder-32b-instruct",
  "mistralai/mistral-small-3.1-24b-instruct",
  "google/gemma-3-27b-it",
]

const OPEN_SOURCE_MODEL_PATTERNS = [
  "meta/",
  "mistralai/",
  "deepseek-ai/",
  "qwen/",
  "google/gemma",
  "minimaxai/",
  "moonshotai/",
  "nvidia/",
]

let cachedNvidiaModels: { models: string[]; expiresAt: number } | null = null

type ParsedFileBlock = {
  path: string
  content: string
}

type ProjectFileInput = {
  path: string
  content: string
}

type Provider = "openai" | "nvidia"

type StreamState = {
  usageInfo: any
  streamedLength: number
}

const FILE_SELECTION_LIMIT = 8
const FILE_CONTENT_SCAN_LIMIT = 1500
const PROMPT_KEYWORD_LIMIT = 12
const OPENAI_TIMEOUT_MS = 90000
const MAX_PROMPT_CHARS = 12000
const CODE_GENERATION_OUTPUT_RULES = `You are a code generation engine.

CRITICAL OUTPUT RULES:
- You MUST output ONLY file blocks.
- Each file MUST be in this format:

===FILE: path===
file content
===END_FILE===

- DO NOT output explanations
- DO NOT output markdown
- DO NOT output JSON
- DO NOT output text outside file blocks

If you do not follow this format, the output will be rejected.

Always generate at least:
- index.html
- package.json
- src/App.tsx
- src/main.tsx
- src/index.css

TECH STACK:
- Generate a Vite + React + TypeScript app.
- Use Tailwind CSS for styling.
- Do NOT use external UI kits.
- Do NOT use placeholder text like "Lorem ipsum".
- Ensure all imports exist and every dependency appears in package.json.

DESIGN QUALITY BAR:
- Produce premium, production-quality UI comparable to Linear, Notion, and Framer.
- Avoid generic, templated, AI-like layouts.
- Use clean, minimal, modern composition with clear hierarchy.
- Prefer fewer sections that are better executed.
- Before final output, self-check that the layout is intentional, spacing is consistent, hierarchy is strong, and copy is meaningful.
- Follow the shared design system below exactly so separate runs feel visually consistent.

DESIGN SYSTEM TOKENS:
- src/index.css MUST include:
:root {
  --radius: 12px;
  --radius-lg: 16px;
  --container: 72rem;
}
- src/index.css MUST include:
body {
  font-family: system-ui, -apple-system, sans-serif;
}
- Use Tailwind utilities for styling. Do not introduce a separate component library.

LAYOUT RULES:
- Default landing page hierarchy: Hero, Features, Proof, Pricing, Footer.
- ALL primary layout containers MUST use exactly: max-w-6xl mx-auto px-6.
- ALL page sections MUST use exactly: py-20.
- Do NOT use random section spacing like py-12, py-16, py-24, my-20, or custom spacing.
- Avoid clutter and decorative filler.
- Hero must have a strong two-line-max headline, clear CTA, concise supporting text, and optionally a refined preview/code/product card.
- Features must be 3 to 4 items max using grid grid-cols-1 md:grid-cols-3 gap-6.
- Testimonials/proof cards should feel realistic, concise, and credible.
- Pricing should include 3 tiers with the middle tier subtly highlighted when pricing is relevant.

TYPOGRAPHY RULES:
- Use Tailwind defaults with a strong scale.
- Hero text MUST use exactly: text-5xl md:text-6xl font-semibold tracking-tight.
- Section titles MUST use exactly: text-2xl md:text-3xl font-semibold.
- Body copy MUST use exactly: text-sm text-zinc-600.
- Keep copy concise, specific, and domain-aware.

COLOR AND VISUAL RULES:
- Use a neutral zinc/stone base.
- Use one accent color only.
- Background should be refined, such as bg-white or bg-[#0b0b0c].
- Use text-zinc-900 or text-white for primary text.
- NO rainbow gradients.
- NO neon/glow spam.
- NO generic stock-layout decoration.
- Do NOT mix radius styles randomly.
- Cards MUST use exactly: rounded-xl border border-zinc-200 p-6 bg-white.
- Dark cards may use a consistent equivalent only when the whole page is dark.
- Use shadow-sm only; avoid heavy shadows.
- Avoid glassmorphism unless it is extremely subtle and necessary.

COMPONENT RULES:
- Write clean, semantic React components.
- Keep component structure simple and readable.
- No unused imports.
- No inline styles unless necessary.
- Use small icons only when they improve scanning.
- If using icons, prefer lucide-react and include it in package.json.
- Primary buttons MUST use exactly: px-5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-medium.
- Secondary buttons MUST use exactly: px-5 py-2.5 rounded-lg border border-zinc-300 text-sm.
- Grids MUST use only one of these patterns: grid grid-cols-1 md:grid-cols-3 gap-6 OR grid grid-cols-1 md:grid-cols-2 gap-8.
- Do NOT use inconsistent colors, random border radius values, or one-off spacing systems.

ANIMATION RULES:
- Keep animation minimal.
- Use Framer Motion only for fade-in and slight translateY.
- Duration must be 0.3s to 0.5s.
- No bouncing, spinning, flashy effects, or excessive stagger.

RESPONSIVE RULES:
- The app must work at 320px, 768px, and desktop widths.
- index.html MUST include a viewport meta tag.
- Avoid fixed widths that break mobile.
- Use min-w-0 and overflow-hidden where needed.
- Touch targets should be at least 44px on mobile.

SELF-CHECK BEFORE OUTPUT:
- Confirm every section uses py-20.
- Confirm every main container uses max-w-6xl mx-auto px-6.
- Confirm every card uses rounded-xl border border-zinc-200 p-6 bg-white or one consistent dark equivalent.
- Confirm buttons use the exact primary/secondary classes above.
- Confirm typography uses the exact scale above.
- If any file is inconsistent, fix it once before returning file blocks.`
const STRICT_FILE_FORMAT_RETRY_PROMPT = `Your previous response did not follow the required file format.

You MUST output ONLY file blocks using:

===FILE: path===
content
===END_FILE===

Do not include anything else.`
const PROMPT_KEYWORD_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "build",
  "change",
  "create",
  "file",
  "for",
  "from",
  "in",
  "into",
  "make",
  "page",
  "project",
  "section",
  "site",
  "the",
  "this",
  "to",
  "update",
  "with",
])

function dedupeFilesByPath(files: ProjectFileInput[]) {
  const seen = new Set<string>()
  return files.filter((file) => {
    const path = typeof file.path === "string" ? file.path : ""
    if (!path || seen.has(path)) return false
    seen.add(path)
    return true
  })
}

function isCoreContextFile(path: string) {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase()
  return (
    normalizedPath === "app.tsx" ||
    normalizedPath === "main.tsx" ||
    normalizedPath.endsWith("/app.tsx") ||
    normalizedPath.endsWith("/main.tsx")
  )
}

function extractPromptKeywords(prompt: string) {
  return Array.from(
    new Set(
      prompt
        .toLowerCase()
        .replace(/[^a-z0-9/_.\-\s]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !PROMPT_KEYWORD_STOPWORDS.has(token))
    )
  ).slice(0, PROMPT_KEYWORD_LIMIT)
}

function scoreFileForPrompt(file: ProjectFileInput, keywords: string[]) {
  if (isCoreContextFile(file.path)) return Number.MAX_SAFE_INTEGER

  const normalizedPath = file.path.toLowerCase()
  const fileName = normalizedPath.split("/").pop() || normalizedPath
  const contentPreview = file.content.slice(0, FILE_CONTENT_SCAN_LIMIT).toLowerCase()
  let score = 0

  for (const keyword of keywords) {
    if (fileName.includes(keyword)) score += 8
    else if (normalizedPath.includes(keyword)) score += 5
    if (contentPreview.includes(keyword)) score += 2
  }

  return score
}

function extractRelativeImports(content: string): string[] {
  const importRegex = /from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g
  const imports: string[] = []
  let match: RegExpExecArray | null

  while ((match = importRegex.exec(content)) !== null) {
    const raw = match[1] || match[2]
    if (raw && raw.startsWith(".")) {
      imports.push(raw)
    }
  }

  return imports
}

function resolveImportPath(basePath: string, relativePath: string): string {
  const baseDir = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/")) : ""
  const combined = `${baseDir}/${relativePath}`

  const normalizedParts: string[] = []
  for (const part of combined.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      normalizedParts.pop()
      continue
    }
    normalizedParts.push(part)
  }

  return normalizedParts.join("/")
}

function collectDependencyFiles(
  files: ProjectFileInput[],
  seedFiles: ProjectFileInput[]
): ProjectFileInput[] {
  const fileMap = new Map(files.map((f) => [f.path, f]))
  const visited = new Set<string>()
  const result: ProjectFileInput[] = []

  const stack = [...seedFiles]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current.path)) continue

    visited.add(current.path)
    result.push(current)

    const imports = extractRelativeImports(current.content)

    for (const imp of imports) {
      const resolved = resolveImportPath(current.path, imp)

      const candidates = [
        resolved,
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}.js`,
        `${resolved}.jsx`,
        `${resolved}/index.tsx`,
        `${resolved}/index.ts`,
      ]

      for (const candidate of candidates) {
        const found = fileMap.get(candidate)
        if (found && !visited.has(found.path)) {
          stack.push(found)
        }
      }
    }
  }

  return result
}

function trimPromptFilesToBudget(
  prompt: string,
  files: ProjectFileInput[]
): ProjectFileInput[] {
  let totalLength = prompt.length
  const result: ProjectFileInput[] = []

  for (const file of files) {
    const fileLength = file.path.length + file.content.length + 50

    if (totalLength + fileLength > MAX_PROMPT_CHARS) break

    result.push(file)
    totalLength += fileLength
  }

  return result
}

function buildFollowUpUserMessage(
  prompt: string,
  files: ProjectFileInput[]
) {
  return `The user wants these changes or additions to their existing project:\n\n${prompt}\n\nCurrent project files (only modify or add as needed; do not output unchanged files):\n${files.map((f) => `\n--- FILE: ${f.path} ---\n${f.content}\n--- END ${f.path} ---`).join("")}`
}

function selectRelevantFiles(existingFiles: ProjectFileInput[], prompt: string) {
  const dedupedFiles = dedupeFilesByPath(existingFiles)
  if (dedupedFiles.length <= FILE_SELECTION_LIMIT) return dedupedFiles

  const keywords = extractPromptKeywords(prompt)
  const coreFiles = dedupedFiles.filter((file) => isCoreContextFile(file.path))
  const rankedNonCoreFiles = dedupedFiles
    .filter((file) => !isCoreContextFile(file.path))
    .map((file, index) => ({
      file,
      index,
      score: scoreFileForPrompt(file, keywords),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.file)

  const topKeywordFiles = rankedNonCoreFiles.slice(0, FILE_SELECTION_LIMIT)

  const dependencyExpanded = collectDependencyFiles(
    dedupedFiles,
    [...coreFiles, ...topKeywordFiles]
  )

  return dedupeFilesByPath(dependencyExpanded).slice(0, FILE_SELECTION_LIMIT * 2)
}

function isOpenSourceNvidiaModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase()
  return OPEN_SOURCE_MODEL_PATTERNS.some((pattern) => normalized.includes(pattern))
}

async function getNvidiaModels(): Promise<string[]> {
  const now = Date.now()
  if (cachedNvidiaModels && cachedNvidiaModels.expiresAt > now) {
    return cachedNvidiaModels.models
  }

  const fallbackModels = [...CURATED_NVIDIA_MODELS].sort((a, b) => a.localeCompare(b))
  const apiKey = process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY
  if (!apiKey) {
    cachedNvidiaModels = { models: fallbackModels, expiresAt: now + 5 * 60 * 1000 }
    return fallbackModels
  }

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(`NVIDIA models request failed with ${response.status}`)
    }

    const data = await response.json() as { data?: Array<{ id?: string }> }
    const discoveredModels = (data.data || [])
      .map((entry) => entry.id?.trim())
      .filter((id): id is string => Boolean(id && isOpenSourceNvidiaModel(id)))

    const mergedModels = Array.from(new Set([...CURATED_NVIDIA_MODELS, ...discoveredModels]))
      .sort((a, b) => a.localeCompare(b))

    cachedNvidiaModels = { models: mergedModels, expiresAt: now + 10 * 60 * 1000 }
    return mergedModels
  } catch (error) {
    console.error("Failed to load NVIDIA models:", error)
    cachedNvidiaModels = { models: fallbackModels, expiresAt: now + 5 * 60 * 1000 }
    return fallbackModels
  }
}

async function resolveModel(model: string) {
  if (OPENAI_MODEL_MAP[model]) {
    return {
      client: openai,
      selectedModel: OPENAI_MODEL_MAP[model],
      provider: "openai" as const,
    }
  }

  const nvidiaModels = await getNvidiaModels()
  if (nvidiaModels.includes(model)) {
    return {
      client: nvidia,
      selectedModel: model,
      provider: "nvidia" as const,
    }
  }

  return {
    client: openai,
    selectedModel: OPENAI_MODEL_MAP[DEFAULT_MODEL],
    provider: "openai" as const,
  }
}

function getFirstDayOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function getPeriodEndDate(raw: unknown): Date | null {
  if (!raw) return null
  if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate()
  }
  const d = new Date(raw as string | number)
  return isNaN(d.getTime()) ? null : d
}

function parseFileBlocks(content: string): ParsedFileBlock[] {
  const files: ParsedFileBlock[] = []
  const fileRegex = /===FILE:\s*(.*?)===([\s\S]*?)===END_FILE===/g
  let match: RegExpExecArray | null

  while ((match = fileRegex.exec(content)) !== null) {
    const path = match[1].trim()
    const fileContent = match[2]
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim()

    if (path) {
      files.push({ path, content: fileContent })
    }
  }

  return files
}

function assertValidFileBlockOutput(content: string) {
  if (!content.includes("===FILE:")) {
    throw new Error("Invalid generator output: no file blocks")
  }

  const fileBlocks = parseFileBlocks(content)
  if (fileBlocks.length === 0) {
    throw new Error("Invalid generator output: no parseable file blocks")
  }

  return fileBlocks
}

function validateGeneratedFiles(generatedContent: string, existingFiles?: { path: string; content: string }[]) {
  const fileBlocks = parseFileBlocks(generatedContent)
  const availablePaths = new Set([
    ...fileBlocks.map((file) => file.path),
    ...(existingFiles || []).map((file) => file.path),
    "src/main.tsx",
    "src/index.css",
    "src/App.tsx",
    "vite.config.ts",
    "package.json",
    "index.html",
  ])
  const issues = new Set<string>()

  // Check for mandatory CSS files
  const hasIndexCss = fileBlocks.some(f => f.path === "src/index.css")
  const hasTailwindConfig = fileBlocks.some(f => f.path === "tailwind.config.ts")
  const hasPostcssConfig = fileBlocks.some(f => f.path === "postcss.config.js")
  
  if (!hasIndexCss) {
    issues.add("Missing mandatory file: src/index.css (required for CSS styling)")
  }
  if (!hasTailwindConfig) {
    issues.add("Missing mandatory file: tailwind.config.ts (required for Tailwind compilation)")
  }
  if (!hasPostcssConfig) {
    issues.add("Missing mandatory file: postcss.config.js (required for PostCSS processing)")
  }

  for (const file of fileBlocks) {
    const isCodeFile = /\.(tsx|ts|jsx|js)$/.test(file.path)
    if (!isCodeFile) continue

    const importRegex = /from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g
    let match: RegExpExecArray | null
    while ((match = importRegex.exec(file.content)) !== null) {
      const rawImport = match[1] || match[2]
      if (!rawImport) continue

      const importerDir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""
      const normalizedBase = rawImport
        .replace(/^\.\//, importerDir ? `${importerDir}/` : "")
        .replace(/\.\.\//g, "")
      const candidatePaths = [
        normalizedBase,
        `${normalizedBase}.ts`,
        `${normalizedBase}.tsx`,
        `${normalizedBase}.js`,
        `${normalizedBase}.jsx`,
        `${normalizedBase}.css`,
        `${normalizedBase}/index.ts`,
        `${normalizedBase}/index.tsx`,
      ]

      const hasMatch = candidatePaths.some((candidate) => availablePaths.has(candidate))
      if (!hasMatch) {
        issues.add(`Missing import target "${rawImport}" referenced from ${file.path}`)
      }
    }

    const missingAssetMatches = file.content.match(/["'](?:\/|\.\/)[^"']+\.(svg|png|jpg|jpeg|webp|gif|ico)["']/g) || []
    for (const asset of missingAssetMatches) {
      const assetPath = asset.slice(1, -1)
      const normalizedAssetPath = assetPath.startsWith("/")
        ? `public${assetPath}`
        : `${file.path.slice(0, Math.max(file.path.lastIndexOf("/"), 0))}/${assetPath.replace(/^\.\//, "")}`
      if (!availablePaths.has(normalizedAssetPath) && !availablePaths.has(assetPath)) {
        issues.add(`Missing asset "${assetPath}" referenced from ${file.path}`)
      }
    }
  }

  return {
    fileBlocks,
    issues: Array.from(issues),
  }
}

function injectMissingCssFiles(fileBlocks: ParsedFileBlock[]): ParsedFileBlock[] {
  const paths = new Set(fileBlocks.map(f => f.path))
  const injected = [...fileBlocks]

  // Inject missing tailwind.config.ts
  if (!paths.has("tailwind.config.ts")) {
    injected.push({
      path: "tailwind.config.ts",
      content: `import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        xl: "var(--radius)",
        lg: "calc(var(--radius) - 2px)",
        md: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
} satisfies Config`
    })
  }

  // Inject missing postcss.config.js
  if (!paths.has("postcss.config.js")) {
    injected.push({
      path: "postcss.config.js",
      content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`
    })
  }

  // Inject missing src/index.css with proper Tailwind imports
  if (!paths.has("src/index.css")) {
    injected.push({
      path: "src/index.css",
      content: `@import 'tailwindcss';

:root {
  --radius: 12px;
  --radius-lg: 16px;
  --container: 72rem;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
}

@layer base {
  * {
    @apply border-border;
  }
  
  body {
    @apply bg-background text-foreground;
  }
}`
    })
  }

  // Ensure src/main.tsx imports index.css
  const mainTsxIndex = injected.findIndex(f => f.path === "src/main.tsx")
  if (mainTsxIndex !== -1) {
    const mainContent = injected[mainTsxIndex].content
    if (!mainContent.includes("import './index.css'") && !mainContent.includes('import "./index.css"')) {
      // Add import at the top after React imports
      const lines = mainContent.split('\n')
      let insertIdx = 0
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("import React") || lines[i].includes("import react")) {
          insertIdx = i + 1
        }
      }
      lines.splice(insertIdx, 0, "import './index.css'")
      injected[mainTsxIndex].content = lines.join('\n')
    }
  }

  return injected
}

async function generateWithNvidiaValidation(params: {
  client: OpenAI
  selectedModel: string
  systemPrompt: string
  userMessageContent: string
  existingFiles?: { path: string; content: string }[]
}) {
  const initial = await params.client.chat.completions.create({
    model: params.selectedModel,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessageContent },
    ],
    max_tokens: 8000,
  })

  let finalContent = initial.choices[0]?.message?.content || ""
  let usageInfo: any = initial.usage || null
  try {
    assertValidFileBlockOutput(finalContent)
  } catch {
    const retried = await params.client.chat.completions.create({
      model: params.selectedModel,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userMessageContent },
        { role: "assistant", content: finalContent },
        { role: "user", content: STRICT_FILE_FORMAT_RETRY_PROMPT },
      ],
      max_tokens: 8000,
    })

    finalContent = retried.choices[0]?.message?.content || ""
    usageInfo = retried.usage || usageInfo
    assertValidFileBlockOutput(finalContent)
  }

  let validation = validateGeneratedFiles(finalContent, params.existingFiles)

  if (validation.issues.length > 0) {
    const repairPrompt = `Your previous output had build-breaking issues. Repair the project and return the complete corrected response in the exact same streaming file format.

Detected issues:
${validation.issues.map((issue) => `- ${issue}`).join("\n")}

Rules:
- Keep the same app intent and design direction.
- CRITICAL: Ensure src/index.css, tailwind.config.ts, and postcss.config.js are included and properly configured.
- Ensure src/main.tsx imports './index.css' at the top.
- Fix all missing imports, missing components, and missing assets.
- Do not explain the fixes.
- Return exactly one AGENT_MESSAGE and the corrected file blocks only.
- Do not wrap files in JSON or markdown.`

    const repaired = await params.client.chat.completions.create({
      model: params.selectedModel,
      messages: [
        { role: "system", content: `${params.systemPrompt}\n\nYou must repair invalid output when issues are reported.` },
        { role: "user", content: params.userMessageContent },
        { role: "assistant", content: finalContent },
        { role: "user", content: repairPrompt },
      ],
      max_tokens: 8000,
    })

    finalContent = repaired.choices[0]?.message?.content || finalContent
    usageInfo = repaired.usage || usageInfo
    validation = validateGeneratedFiles(finalContent, params.existingFiles)
  }

  // Inject missing CSS files as fallback
  let finalFileBlocks = validation.fileBlocks
  if (!finalFileBlocks.some(f => f.path === "tailwind.config.ts") ||
      !finalFileBlocks.some(f => f.path === "postcss.config.js") ||
      !finalFileBlocks.some(f => f.path === "src/index.css")) {
    finalFileBlocks = injectMissingCssFiles(finalFileBlocks)
    // Reconstruct content from injected blocks
    finalContent = finalFileBlocks.map(f => `===FILE: ${f.path}===\n${f.content}\n===END_FILE===`).join('\n')
  }

  return {
    finalContent,
    usageInfo,
    streamedLength: finalContent.length,
    remainingIssues: validation.issues,
  }
}

async function salvageWithOpenAI(params: {
  systemPrompt: string
  userMessageContent: string
  brokenContent: string
  issues: string[]
}) {
  const salvagePrompt = `Repair the broken project output below and return a fully corrected response in the exact required file streaming format.

Detected issues:
${params.issues.map((issue) => `- ${issue}`).join("\n")}

Broken output:
${params.brokenContent}

Rules:
- Keep the same product request and overall intent.
- CRITICAL: Ensure src/index.css, tailwind.config.ts, and postcss.config.js are included and properly configured.
- Ensure src/main.tsx imports './index.css' at the top.
- Return exactly one AGENT_MESSAGE and then only ===FILE=== blocks.
- Ensure every import resolves and every referenced component exists.
- Do not leave placeholders or missing files.`

  const repaired = await openai.chat.completions.create({
    model: OPENAI_MODEL_MAP[DEFAULT_MODEL],
    messages: [
      { role: "system", content: `${params.systemPrompt}\n\nYou are repairing an invalid project output into a buildable final result.` },
      { role: "user", content: params.userMessageContent },
      { role: "user", content: salvagePrompt },
    ],
    max_tokens: 8000,
  })

  let content = repaired.choices[0]?.message?.content || params.brokenContent
  
  // Inject missing CSS files if needed
  const fileBlocks = parseFileBlocks(content)
  if (!fileBlocks.some(f => f.path === "tailwind.config.ts") ||
      !fileBlocks.some(f => f.path === "postcss.config.js") ||
      !fileBlocks.some(f => f.path === "src/index.css")) {
    const injectedBlocks = injectMissingCssFiles(fileBlocks)
    content = injectedBlocks.map(f => `===FILE: ${f.path}===\n${f.content}\n===END_FILE===`).join('\n')
  }

  return {
    content,
    usage: repaired.usage || null,
  }
}

async function repairInvalidFileFormatWithOpenAI(params: {
  systemPrompt: string
  userMessageContent: string
  brokenContent: string
}) {
  const repaired = await openai.chat.completions.create({
    model: OPENAI_MODEL_MAP[DEFAULT_MODEL],
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessageContent },
      { role: "assistant", content: params.brokenContent },
      { role: "user", content: STRICT_FILE_FORMAT_RETRY_PROMPT },
    ],
    max_tokens: 8000,
  })

  const content = repaired.choices[0]?.message?.content || ""
  assertValidFileBlockOutput(content)

  return {
    content,
    usage: repaired.usage || null,
  }
}

async function streamWithResolvedProvider(params: {
  client: OpenAI
  provider: Provider
  selectedModel: string
  systemPrompt: string
  userMessageContent: string
  existingFiles?: { path: string; content: string }[]
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
  state: StreamState
}) {
  if (params.provider === "nvidia") {
    const validated = await generateWithNvidiaValidation({
      client: params.client,
      selectedModel: params.selectedModel,
      systemPrompt: params.systemPrompt,
      userMessageContent: params.userMessageContent,
      existingFiles: params.existingFiles,
    })
    params.state.usageInfo = validated.usageInfo
    params.state.streamedLength = validated.streamedLength
    try {
      assertValidFileBlockOutput(validated.finalContent)
    } catch {
      const repaired = await repairInvalidFileFormatWithOpenAI({
        systemPrompt: params.systemPrompt,
        userMessageContent: params.userMessageContent,
        brokenContent: validated.finalContent,
      })
      params.state.usageInfo = repaired.usage || params.state.usageInfo
      params.state.streamedLength = repaired.content.length
      params.controller.enqueue(params.encoder.encode(repaired.content))
      return
    }

    if (validated.remainingIssues.length > 0) {
      console.warn("NVIDIA generation still has unresolved validation issues:", validated.remainingIssues)
      const salvaged = await salvageWithOpenAI({
        systemPrompt: params.systemPrompt,
        userMessageContent: params.userMessageContent,
        brokenContent: validated.finalContent,
        issues: validated.remainingIssues,
      })
      assertValidFileBlockOutput(salvaged.content)
      params.state.usageInfo = salvaged.usage || params.state.usageInfo
      params.state.streamedLength = salvaged.content.length
      params.controller.enqueue(params.encoder.encode(salvaged.content))
    } else {
      params.controller.enqueue(params.encoder.encode(validated.finalContent))
    }
    return
  }

  const createOpenAICompletion = async (userMessage: string) => {
    const controllerAbort = new AbortController()
    const timeoutId = setTimeout(() => {
      controllerAbort.abort()
    }, OPENAI_TIMEOUT_MS)

    try {
      const completion = await params.client.chat.completions.create({
        model: params.selectedModel,
        stream: true,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 8000,
        stream_options: { include_usage: true } as any,
      }, { signal: controllerAbort.signal })
      clearTimeout(timeoutId)
      return completion
    } catch (err: any) {
      clearTimeout(timeoutId)

      if (err?.name === "AbortError") {
        console.error("OpenAI request aborted due to timeout")
        throw new Error("MODEL_TIMEOUT")
      }

      throw err
    }
  }

  const streamCompletionToText = async (completion: Awaited<ReturnType<typeof createOpenAICompletion>>) => {
    let output = ""

    for await (const chunk of completion) {
      if ((chunk as any).usage) params.state.usageInfo = (chunk as any).usage
      if ((chunk as any).choices && (chunk as any).choices[0]?.usage) {
        params.state.usageInfo = (chunk as any).choices[0].usage
      }
      const content = chunk.choices[0]?.delta?.content
      if (content) output += content
    }

    return output
  }

  let completion
  let basePrompt = params.userMessageContent

  if (params.userMessageContent.includes("\n\nCurrent project files")) {
    basePrompt = params.userMessageContent.split("\n\nCurrent project files")[0]
  }

  try {
    completion = await createOpenAICompletion(params.userMessageContent)
  } catch (err: any) {
    if (err?.message === "MODEL_TIMEOUT" && params.existingFiles?.length) {
      const retrySeedFiles = selectRelevantFiles(params.existingFiles, params.userMessageContent)
      const reducedCount = Math.max(2, Math.ceil(retrySeedFiles.length / 2))
      const reducedFiles = trimPromptFilesToBudget(
        params.userMessageContent,
        retrySeedFiles.slice(0, reducedCount)
      )
      const retryUserMessage = buildFollowUpUserMessage(
        basePrompt,
        reducedFiles
      )
      completion = await createOpenAICompletion(retryUserMessage)
    } else {
      throw err
    }
  }

  let output = await streamCompletionToText(completion)

  try {
    assertValidFileBlockOutput(output)
  } catch {
    const retryCompletion = await createOpenAICompletion(
      `${params.userMessageContent}\n\n${STRICT_FILE_FORMAT_RETRY_PROMPT}`
    )
    output = await streamCompletionToText(retryCompletion)
    assertValidFileBlockOutput(output)
  }

  params.state.streamedLength += output.length
  params.controller.enqueue(params.encoder.encode(output))
}

async function runBuilderRuntime(params: {
  client: OpenAI
  provider: Provider
  selectedModel: string
  systemPrompt: string
  userMessageContent: string
  existingFiles?: { path: string; content: string }[]
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
  state: StreamState
}) {
  await streamWithResolvedProvider(params)
}

export async function GET() {
  const nvidiaModels = await getNvidiaModels()
  return Response.json({
    defaultModel: DEFAULT_MODEL,
    models: [...Object.keys(OPENAI_MODEL_MAP), ...nvidiaModels],
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    prompt: string
    model?: string
    idToken?: string
    existingFiles?: { path: string; content: string }[]
    cloneContext?: { title: string; description: string; markdown: string; sourceUrl: string }
  } | null
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const {
    prompt,
    model = DEFAULT_MODEL,
    idToken,
    existingFiles,
  } = body

  // authenticate user via Firebase ID token (body) or Authorization Bearer token (header)
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
  const authToken = (idToken && idToken.trim()) || bearerToken
  if (!authToken) {
    return new Response(JSON.stringify({ error: 'Missing idToken' }), { status: 401 })
  }

  let uid: string
  try {
    const decoded = await adminAuth.verifyIdToken(authToken)
    uid = decoded.uid
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid idToken' }), { status: 401 })
  }

  // Check if token period has ended → reset monthly, then check remaining tokens
  try {
    const userRef = adminDb.collection('users').doc(uid)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
    }
    const userData = userSnap.data() as any

    const planId = userData?.planId || 'free'
    const planTokensPerMonth = userData?.tokensLimit != null ? Number(userData.tokensLimit) : (DEFAULT_PLANS[planId as keyof typeof DEFAULT_PLANS]?.tokensPerMonth || DEFAULT_PLANS.free.tokensPerMonth)

    const periodEnd = getPeriodEndDate(userData?.tokenUsage?.periodEnd)
    const now = new Date()
    const shouldReset = !periodEnd || isNaN(periodEnd.getTime()) || now >= periodEnd

    if (shouldReset) {
      const nextPeriodEnd = getFirstDayOfNextMonth(now)
      await userRef.update({
        tokenUsage: {
          used: 0,
          remaining: planTokensPerMonth,
          periodStart: Timestamp.fromDate(now),
          periodEnd: Timestamp.fromDate(nextPeriodEnd),
        },
      })
      console.log('Token period reset - User:', uid, 'Next periodEnd:', nextPeriodEnd.toISOString())
    }

    let remaining = shouldReset ? planTokensPerMonth : userData?.tokenUsage?.remaining

    if (remaining === undefined || remaining === null) {
      if (userData?.tokensLimit != null && userData?.tokensUsed !== undefined) {
        remaining = userData.tokensLimit - userData.tokensUsed
      } else {
        remaining = planTokensPerMonth
      }
    }
    remaining = Math.max(0, Number(remaining))

    console.log('Token check - User:', uid, 'Plan:', planId, 'Plan Tokens:', planTokensPerMonth, 'Remaining:', remaining, 'TokenUsage:', userData?.tokenUsage)
    if (remaining <= 0) {
      return new Response(JSON.stringify({ error: 'Insufficient tokens' }), { status: 402 })
    }
  } catch (e) {
    console.error('Token check failed', e)
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
  }

  const { client, selectedModel, provider } = await resolveModel(model)
  const isFollowUp = Array.isArray(existingFiles) && existingFiles.length > 0
  let promptFiles = isFollowUp ? selectRelevantFiles(existingFiles || [], prompt) : []

  if (isFollowUp) {
    promptFiles = trimPromptFilesToBudget(prompt, promptFiles)
  }

  const systemPromptFollowUp = `You are an expert React developer. The user is asking for CHANGES or ADDITIONS to an existing project. You will receive the current project files.

INTENT CLASSIFICATION (do this first, silently):
Classify the user request into one of:
- STYLE: color, font, spacing, animation, visual tweak → max 1-2 files
- CONTENT: text, copy, labels, images → max 1-2 files
- COMPONENT: add/remove/modify a single UI section → max 3 files
- FEATURE: new functionality, state, logic → touch only affected files
- PAGE: new route/page → only new files + App.tsx routing
- REFACTOR: restructure existing code → affected files only

SCOPE RULES based on classification:
- STYLE/CONTENT: return ONLY the single file containing that element. Never touch package.json, vite.config.ts, or unrelated components.
- COMPONENT: return only the component file + its direct parent if wiring is needed.
- FEATURE: return only files that need new imports, state, or logic. Do not rewrite files that only need 1-2 line changes — use diffs instead.
- PAGE/REFACTOR: still do not rewrite unchanged files.

HARD RULES:
- Never rewrite a file just to "clean it up"
- Never return package.json unless a new dependency is genuinely needed
- If a file needs fewer than 5 line changes, use unified diff format not full file
- If you are about to return more than 4 files for a STYLE or CONTENT request, stop and reconsider

PRODUCTION STANDARD (FOLLOW-UP):
- Maintain or elevate the existing design quality.
- Never downgrade visual polish when making changes.
- Match the domain aesthetic already established.
- Keep all existing content — only change what was asked.
- If adding new sections, they must match the visual language of existing sections exactly.
- Never introduce placeholder content in follow-up edits.

UI STANDARD: When adding or changing UI, keep it modern and polished—distinctive typography, intentional colors, generous spacing, subtle motion (Framer Motion). Avoid generic "AI slop" aesthetics. Match or elevate the existing design language.

RESPONSIVE: Preserve or improve responsiveness on all devices. Use Tailwind breakpoints (sm:, md:, lg:) for layout and typography; avoid fixed widths that break on small screens; ensure touch targets are at least 44px on mobile; prevent horizontal overflow (max-w-full, min-w-0, overflow-hidden where needed). Generated UI must work on phone, tablet, and desktop.

DEPENDENCIES (CRITICAL):
- Before using ANY new import/package in your code, you MUST add it to package.json dependencies or devDependencies.
- NEVER import from react-icons subpackages like react-icons/hi2, react-icons/hi, react-icons/md etc unless "react-icons" is already in package.json.
- If you use react-icons, add "react-icons": "^5.0.0" to package.json dependencies AND import only from react-icons/fa or react-icons/fa6 — these are the most stable subpackages.
- NEVER use HiOutlineMenu, HiOutlineBars3 or any Hi* icon — they are unreliable across versions.
- PREFER lucide-react for ALL icons. It is always available and has zero subpackage issues. Only use react-icons when lucide-react does not have what you need.
- If you import lucide-react, add "lucide-react": "^0.400.0" to dependencies if not already present.
- If you use framer-motion, add "framer-motion": "^11.0.0" to dependencies.
- Check the existing package.json first. Only add packages that are truly needed and don't already exist.
- NEVER use packages that don't exist on npm (e.g., @shadcn/ui).

CRITICAL: Do NOT regenerate the entire project. Output ONLY:
1. One AGENT_MESSAGE (see below).
2. For each file that you MODIFY: output that file in ===FILE: path=== ... ===END_FILE===. Inside the block you may use EITHER:
   - Unified diff format (so only the change is applied). You MUST include the --- and +++ file header lines first; never output only @@ hunk lines:
     --- a/path/to/file.tsx
     +++ b/path/to/file.tsx
     @@ -start,count +start,count @@
     -old line
     +new line
   - OR the COMPLETE new file content (full replacement).
3. For each NEW file (file that does not exist yet): output ===FILE: path=== complete file content ===END_FILE===.
Do NOT output any file that is unchanged. Do NOT output the full project; only changed or new files.

Use this exact streaming format for every file you output:
===FILE: path/to/file.tsx===
[unified diff OR full file content]
===END_FILE===

AGENT MESSAGE (required): First, output exactly one conversational reply in this format on a single line (no newlines inside):
===AGENT_MESSAGE=== Your brief friendly reply, e.g. "I'll add a dark mode toggle to the header." Keep it to 1-3 sentences. ===END_AGENT_MESSAGE===
Then immediately output the file blocks. No other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

BACKEND DETECTION: If the user's request clearly implies a need for a backend, database, or persistent data, output at the very end (after all ===END_FILE=== blocks):
===META: suggestsBackend=true===
Only when the app would clearly benefit from a database or backend.`

  const systemPromptNew = `You are an expert React developer. Generate a complete, working Vite + React + TypeScript application based on the user's request.

PRODUCTION-GRADE OUTPUT (MANDATORY — NO EXCEPTIONS):
- You are building real websites for real businesses. Every output must be production-ready, not a demo.
- ZERO placeholder content. If you don't know the actual content, infer it intelligently from context. A bakery prompt means you write real bakery copy, real menu items, real opening hours format, real address format.
- ZERO generic AI layouts. No default hero-features-cta-footer cookie cutter. Design for the specific domain.
- Typography: always pair a display/heading font with a body font using Google Fonts @import. Build a real type scale.
- Colors: build a CSS custom property palette. Never default to Tailwind gray alone. Pick colors that match the domain.
- Every interactive element has a hover state, focus state, and transition.
- Framer Motion for entrance animations, stagger effects on lists, and scroll-triggered reveals.
- Components split logically — one responsibility per file.
- Mobile-first responsive, tested mentally at 320px/768px/1280px.
- Copy must sound human and domain-appropriate, not marketing slop. Write like the actual business owner would.
- Images: use picsum.photos or unsplash.it with relevant dimensions and descriptive seeds — never broken image paths.
- Real navigation with smooth scroll to sections.
- Footer with actual useful links, not empty nav items.

DOMAIN INTELLIGENCE (CRITICAL):
Before writing a single line of code, identify the domain and apply appropriate design language:
- Food/hospitality: warm colors, serif headings, appetite-triggering copy, menu/hours/location sections
- SaaS/Tech: clean density, data-forward, professional blues or neutrals, feature comparison tables, pricing tiers
- Creative/Agency: bold typography, asymmetric layouts, portfolio-style presentation
- Health/Wellness: calming palette, trust signals, clean minimal layout
- Finance/Legal: authoritative, trust-first, conservative palette, clear CTAs
- E-commerce: product-first, conversion-optimized, clear pricing, social proof prominent

RESPONSIVE — ALL DEVICES (MANDATORY):
- Every generated site MUST work on mobile, tablet, and desktop. No exceptions.
- index.html MUST include: <meta name="viewport" content="width=device-width, initial-scale=1" />.
- Use a mobile-first approach: base styles for small screens, then Tailwind breakpoints (sm:, md:, lg:, xl:) to enhance for larger screens.
- Avoid fixed pixel widths for main containers; use max-w-*, w-full, and flex/grid that adapts. Use min-w-0 and overflow-hidden where needed to prevent horizontal scroll.
- Buttons and interactive elements MUST be at least 44x44px on touch targets (e.g. min-h-[44px] min-w-[44px] or p-3) on mobile.
- Typography: use responsive text sizes (e.g. text-base sm:text-lg), and ensure line-length stays readable on narrow viewports.
- Test mentally for: 320px (phone), 768px (tablet), 1024px+ (desktop). The layout must not break or overflow at any width.

You must respond with a STREAMING file format. Output each file in this exact format:

===FILE: path/to/file.tsx===
[file content here]
===END_FILE===

Generate files in this order (ALL MANDATORY):
1. package.json - Dependencies first (MUST include tailwindcss, postcss, autoprefixer)
2. vite.config.ts
3. tailwind.config.ts - ALWAYS (required for Tailwind compilation)
4. postcss.config.js - ALWAYS (required for Tailwind compilation)
5. index.html
6. src/main.tsx - MUST import './index.css'
7. src/App.tsx
8. src/index.css - ALWAYS (must include @import 'tailwindcss' and custom properties)
9. src/components/*.tsx - Any necessary components
10. src/lib/*.ts - Utility functions if needed

Use these technologies:
- TypeScript
- Vite + React
- Tailwind CSS (only if requested or if it clearly improves the UI)
- Framer Motion for animations when appropriate

Dependencies requirements (MUST follow):
- package.json MUST include react and react-dom in dependencies.
- package.json MUST include vite and @vitejs/plugin-react in devDependencies.
- If TypeScript is used (it is), include typescript, @types/react, and @types/react-dom in devDependencies.
- CRITICAL: Before using ANY import in your code, you MUST add that package to package.json dependencies first.
- Common packages you might use:
  * react-icons (for icons like FaIcon, AiIcon, MdIcon, etc.)
  * framer-motion (for animations)
  * lucide-react (for icons)
  * clsx or classnames (for conditional classes)
  * date-fns (for date utilities)
- NEVER import from react-icons subpackages like react-icons/hi2, react-icons/hi, react-icons/md etc unless "react-icons" is already in package.json.
- If you use react-icons, add "react-icons": "^5.0.0" to package.json dependencies AND import only from react-icons/fa or react-icons/fa6 — these are the most stable subpackages.
- NEVER use HiOutlineMenu, HiOutlineBars3 or any Hi* icon — they are unreliable across versions.
- PREFER lucide-react for ALL icons. It is always available and has zero subpackage issues. Only use react-icons when lucide-react does not have what you need.
- If you import lucide-react, add "lucide-react": "^0.400.0" to dependencies if not already present.
- If you use Tailwind CSS, include tailwindcss, postcss, and autoprefixer in devDependencies.
- Do not reference any package in code unless it exists in package.json.
- NEVER use packages that don't exist on npm (e.g., @shadcn/ui is not a real package).

Ensure the dev server binds to 0.0.0.0 and uses a known port (prefer port 3000). If you use Vite, configure it accordingly.

Make the code production-ready with proper error handling, accessibility, and responsive design.
Create organized folder structures with components in /src/components, utilities in /src/lib, etc.

AGENT MESSAGE (required): First, output exactly one conversational reply in this format on a single line (no newlines inside):
===AGENT_MESSAGE=== Your brief friendly reply to the user, e.g. "I'll help you build Cookie Clicker - a mobile app where the user can press on a cookie and a score will increment. When incremented, the new score should be displayed for users on any device. I'll add animations when the cookie is pressed." Keep it to 1-3 sentences. ===END_AGENT_MESSAGE===
Then immediately output the file blocks. Do not include any other text between ===END_AGENT_MESSAGE=== and the first ===FILE===.

QUALITY BAR: Before finalising output, ask yourself: "Would a real business owner pay a design agency for this?" If no — redesign it. The output must be distinctive, professional, and domain-appropriate. Never ship AI slop.

BACKEND DETECTION: If the user's request clearly implies a need for a backend, database, or persistent data (e.g. user accounts, login/signup, saving data, todos, forms that persist, dashboards with data, CRUD, API, auth), then at the very end of your response output exactly this line on its own line (after all ===END_FILE=== blocks):
===META: suggestsBackend=true===
Do NOT output this for purely static sites, landing pages, or UI-only apps with no data persistence. Only when the app would clearly benefit from a database or backend.`

  const nvidiaReliabilityPrompt = `
OPEN-SOURCE MODEL RELIABILITY RULES (MANDATORY):
- Output a COMPLETE, internally consistent project update. Do not reference files, components, images, icons, fonts, or utilities that you do not also include or that do not already exist.
- Before finishing, mentally verify that every import path you reference exists with the exact same filename and casing.
- If App.tsx imports "./components/Footer", you MUST also output src/components/Footer.tsx unless it already exists in the provided files.
- Do not invent asset paths like /icon.svg, /icon-light-32x32.png, ./assets/foo.png, or font files unless you also create them.
- Prefer fewer files with complete implementations over many partially implemented files.
- Avoid placeholder imports, TODO stubs, and references to components you did not define.
- Keep the output buildable in Vite on the first run.
- Perform a final self-check before finishing:
  1. Every import resolves.
  2. Every component used is defined.
  3. Every asset referenced exists.
  4. package.json includes every dependency used.
  5. No file is omitted if another file depends on it.`

  const systemPrompt = CODE_GENERATION_OUTPUT_RULES
  const finalSystemPrompt = provider === "nvidia"
    ? `${systemPrompt}\n\n${nvidiaReliabilityPrompt}`
    : systemPrompt

  // Build user message: for follow-up include current files so the model can edit them
  const clonePrefix = body.cloneContext
    ? `REFERENCE SITE TO CLONE:\nURL: ${body.cloneContext.sourceUrl}\nTitle: ${body.cloneContext.title}\nDescription: ${body.cloneContext.description}\n\nSite content:\n${body.cloneContext.markdown}\n\nUse the above as the content and structural reference. Recreate it as a modern React app matching the layout, sections, copy, and visual hierarchy. Do not copy CSS — rebuild with Tailwind.\n\n`
    : ""

  const userMessageContent = isFollowUp
    ? buildFollowUpUserMessage(clonePrefix + prompt, promptFiles)
    : `Create a Vite + React + TypeScript application: ${clonePrefix}${prompt}`

  const encoder = new TextEncoder()
  const streamState: StreamState = {
    usageInfo: null,
    streamedLength: 0,
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runBuilderRuntime({
          client,
          provider,
          selectedModel,
          systemPrompt: finalSystemPrompt,
          userMessageContent,
          existingFiles,
          controller,
          encoder,
          state: streamState,
        })

        // Realistic token count: API usage when present, else ~4 chars per token (OpenAI-style)
        const promptLength = userMessageContent.length
        const completionLength = streamState.streamedLength
        const fallbackTokens = Math.ceil((promptLength + completionLength) / 4)
        const tokensToCharge = streamState.usageInfo
          ? (streamState.usageInfo.total_tokens ?? (streamState.usageInfo.prompt_tokens || 0) + (streamState.usageInfo.completion_tokens || 0))
          : (fallbackTokens > 0 ? fallbackTokens : 0)

        // when stream finishes, attempt to deduct tokens in a transaction
        try {
          if (tokensToCharge > 0) {
              const userRef = adminDb.collection('users').doc(uid)
              await adminDb.runTransaction(async (tx) => {
                const snap = await tx.get(userRef)
                if (!snap.exists) throw new Error('user-not-found')
                const data = snap.data() as any
                
                // Get user's plan token limit
                const planId = data?.planId || 'free'
                const planTokensPerMonth = data?.tokensLimit != null ? Number(data.tokensLimit) : (DEFAULT_PLANS[planId as keyof typeof DEFAULT_PLANS]?.tokensPerMonth || DEFAULT_PLANS.free.tokensPerMonth)
                
                let remaining = data?.tokenUsage?.remaining
                
                // Migration: if tokenUsage doesn't exist but tokensLimit/tokensUsed does, use those
                if (remaining === undefined || remaining === null) {
                  if (data?.tokensLimit && data?.tokensUsed !== undefined) {
                    remaining = data.tokensLimit - data.tokensUsed
                  } else {
                    remaining = planTokensPerMonth
                  }
                }
                // Never use negative remaining (robust against bad data)
                remaining = Math.max(0, Number(remaining))
                
                console.log('Transaction - User Plan:', planId, 'Plan Tokens:', planTokensPerMonth, 'Charging tokens:', tokensToCharge, 'Remaining before:', remaining)
                
                // Always deduct available credits for a completed generation.
                // If actual usage is higher than remaining, consume remaining and clamp to 0.
                if (tokensToCharge > planTokensPerMonth) {
                  console.warn(`Generation used ${tokensToCharge} tokens while ${planId} plan monthly allowance is ${planTokensPerMonth}.`)
                }
                if (remaining < tokensToCharge) {
                  console.warn(`User ${uid} has ${remaining} tokens but generation used ${tokensToCharge}; consuming remaining balance.`)
                }
                const actualCharge = Math.min(tokensToCharge, remaining)
                const currentUsed = data?.tokenUsage?.used || data?.tokensUsed || 0
                const newUsed = currentUsed + Math.max(0, actualCharge)
                const newRemaining = Math.max(0, remaining - Math.max(0, actualCharge))
                console.log('Transaction - New tokens - Used:', newUsed, 'Remaining:', newRemaining)
                const updatePayload: Record<string, unknown> = {}
                updatePayload['tokenUsage.used'] = newUsed
                updatePayload['tokenUsage.remaining'] = newRemaining
                tx.update(userRef, updatePayload)
              })
          }
        } catch (e) {
          console.error('Failed to charge tokens after generation:', e)
          // note: stream already delivered; cannot retract, but we surface server log
          // The generation already succeeded, so we log the error but don't crash
        }

        controller.close()
      } catch (err: any) {
        console.error('Stream error', err)

        if (err?.message === "MODEL_TIMEOUT") {
          controller.error(err)
          return
        }

        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
