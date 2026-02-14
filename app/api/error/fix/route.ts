import OpenAI from "openai"
import { applyPatch } from "diff"
import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { assertProjectCanEdit } from "@/lib/project-access"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type ProjectFile = { path: string; content: string }
type FixPatch = { file: string; diff: string }
type FixPayload = { patches?: FixPatch[]; explanation?: string }

function extractJson(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function parseFileMentions(input: string): string[] {
  if (!input) return []
  const matches = input.match(/[A-Za-z0-9_./\\-]+\.(tsx?|jsx?|css|scss|json|mjs|cjs|js)/g) || []
  return [...new Set(matches.map((m) => m.replace(/\\/g, "/")))]
}

function pickContextFiles(files: ProjectFile[], errorText: string, expanded: boolean): ProjectFile[] {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const picked = new Set<string>()
  const mentions = parseFileMentions(errorText)

  for (const m of mentions) {
    if (byPath.has(m)) picked.add(m)
  }

  const important = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "next.config.js",
    "next.config.ts",
    "src/main.tsx",
    "src/App.tsx",
    "src/index.css",
  ]
  for (const p of important) {
    if (byPath.has(p)) picked.add(p)
  }

  const limit = expanded ? 20 : 10
  for (const f of files) {
    if (picked.size >= limit) break
    if (/\.(tsx?|jsx?|css|scss|json)$/.test(f.path)) picked.add(f.path)
  }

  return [...picked]
    .map((p) => byPath.get(p))
    .filter((f): f is ProjectFile => !!f)
}

function normalizeDiff(file: string, diffText: string): string {
  const text = String(diffText || "").trim()
  if (!text) return text
  if (text.includes("--- ") && text.includes("+++ ")) return text
  return `--- a/${file}\n+++ b/${file}\n${text}`
}

function applyPatches(files: ProjectFile[], patches: FixPatch[]) {
  const next = files.map((f) => ({ ...f }))
  const indexByPath = new Map(next.map((f, i) => [f.path, i]))

  for (const patch of patches) {
    const file = patch.file?.trim()
    if (!file) continue
    const idx = indexByPath.get(file)
    const current = idx == null ? "" : next[idx].content
    const normalized = normalizeDiff(file, patch.diff)
    const patched = applyPatch(current, normalized)
    if (patched === false) {
      throw new Error(`Patch failed for ${file}`)
    }
    if (idx == null) {
      next.push({ path: file, content: patched })
      indexByPath.set(file, next.length - 1)
    } else {
      next[idx] = { ...next[idx], content: patched }
    }
  }

  return next
}

async function runAiFix(params: {
  errorMessage: string
  failureCategory?: string | null
  failureReason?: string | null
  logsTail?: string | null
  files: ProjectFile[]
  expanded: boolean
  previousAttemptError?: string | null
}) {
  const {
    errorMessage,
    failureCategory,
    failureReason,
    logsTail,
    files,
    expanded,
    previousAttemptError,
  } = params

  const context = pickContextFiles(files, `${errorMessage}\n${logsTail || ""}`, expanded)
  const fileContext = context
    .map((f) => `--- FILE: ${f.path} ---\n${f.content.slice(0, 12000)}\n--- END FILE ---`)
    .join("\n\n")

  const prompt = [
    "You are fixing a failing website project build/preview.",
    "Return ONLY valid JSON with this shape:",
    '{"patches":[{"file":"relative/path","diff":"@@ ..."}],"explanation":"..."}',
    "Rules:",
    "- Minimal targeted diffs only.",
    "- Do not rewrite entire files unless required.",
    "- If package missing, include package.json patch.",
    "",
    `Error: ${errorMessage}`,
    failureCategory ? `Category: ${failureCategory}` : "",
    failureReason ? `Reason: ${failureReason}` : "",
    logsTail ? `Logs:\n${logsTail.slice(-12000)}` : "",
    previousAttemptError ? `Previous failed attempt context: ${previousAttemptError}` : "",
    "",
    "Project context files:",
    fileContext,
  ]
    .filter(Boolean)
    .join("\n")

  const resp = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: "You generate precise code repair patches in JSON only." },
      { role: "user", content: prompt },
    ],
  })

  const content = resp.choices?.[0]?.message?.content || ""
  const parsed = JSON.parse(extractJson(content)) as FixPayload
  const patches = Array.isArray(parsed.patches) ? parsed.patches : []
  if (!patches.length) throw new Error("AI returned no patches")
  return { patches, explanation: parsed.explanation || "Applied minimal patch." }
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string
      error?: string
      logsTail?: string
      failureCategory?: string
      failureReason?: string
    }

    const projectId = String(body.projectId || "")
    if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
    if (!body.error) return NextResponse.json({ error: "Missing error context" }, { status: 400 })

    const { snap } = await assertProjectCanEdit(projectId, uid)
    const data = snap.data() as { files?: ProjectFile[] }
    const originalFiles = Array.isArray(data?.files) ? data.files : []
    if (!originalFiles.length) {
      return NextResponse.json({ error: "Project has no files to repair" }, { status: 400 })
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || ""
    const origin = new URL(req.url).origin

    let attemptError: string | null = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      const expanded = attempt === 2
      const currentSnap = await adminDb.collection("projects").doc(projectId).get()
      const currentFiles = (currentSnap.data()?.files as ProjectFile[]) || originalFiles
      const backup = currentFiles.map((f) => ({ ...f }))

      try {
        const ai = await runAiFix({
          errorMessage: String(body.error),
          failureCategory: body.failureCategory || null,
          failureReason: body.failureReason || null,
          logsTail: body.logsTail || "",
          files: currentFiles,
          expanded,
          previousAttemptError: attemptError,
        })

        const patchedFiles = applyPatches(currentFiles, ai.patches)

        await adminDb.collection("projects").doc(projectId).set(
          {
            files: patchedFiles,
            lastAutoFix: {
              appliedAt: new Date(),
              attempt,
              explanation: ai.explanation,
              sourceError: String(body.error),
            },
          },
          { merge: true }
        )

        const verifyRes = await fetch(`${origin}/api/projects/${encodeURIComponent(projectId)}/ensure-preview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({ force: true }),
        })
        const verifyJson = await verifyRes.json().catch(() => ({}))
        if (!verifyRes.ok || !verifyJson?.previewUrl) {
          throw new Error(String(verifyJson?.error || `Preview validation failed (${verifyRes.status})`))
        }

        return NextResponse.json({
          success: true,
          attempt,
          explanation: ai.explanation,
          patches: ai.patches,
          previewUrl: verifyJson.previewUrl,
          files: patchedFiles,
        })
      } catch (err: any) {
        attemptError = err?.message || "Unknown auto-fix error"
        await adminDb.collection("projects").doc(projectId).set({ files: backup }, { merge: true })
        console.error("[error-fix] attempt failed", { projectId, attempt, attemptError })
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Automatic fix could not resolve the issue after two attempts.",
        recommendation:
          "Try a narrower change request, then run Fix with AI again. You can also check build logs for the first failing file.",
      },
      { status: 422 }
    )
  } catch (err: any) {
    const message = err?.message || "Failed to run automatic fix"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

