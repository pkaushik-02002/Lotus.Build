import crypto from "crypto"

const GITHUB_API = "https://api.github.com"

type GithubRequestInit = {
  method?: string
  token?: string
  accept?: string
  body?: unknown
}

export type GitHubInstallation = {
  id: number
  account?: { login?: string; type?: string } | null
}

export type GitHubRepo = {
  id: number
  name: string
  full_name: string
  private?: boolean
  owner?: { login?: string } | null
  default_branch?: string
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value?.trim()) throw new Error(`${name} is not configured`)
  return value.trim()
}

function getGithubAppPrivateKey(): string {
  const raw = getRequiredEnv("GITHUB_APP_PRIVATE_KEY")
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw
}

async function githubRequest<T = any>(path: string, init: GithubRequestInit = {}): Promise<{ ok: boolean; status: number; json: T; text: string }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: init.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const text = await res.text().catch(() => "")
  let json: T = {} as T
  try {
    json = text ? (JSON.parse(text) as T) : ({} as T)
  } catch {
    json = {} as T
  }
  return { ok: res.ok, status: res.status, json, text }
}

export function createGitHubAppJwt(): string {
  const appId = getRequiredEnv("GITHUB_APP_ID")
  const pem = getGithubAppPrivateKey()
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    })
  ).toString("base64url")
  const unsigned = `${header}.${payload}`
  const signer = crypto.createSign("RSA-SHA256")
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(pem).toString("base64url")
  return `${unsigned}.${signature}`
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const jwt = createGitHubAppJwt()
  const res = await githubRequest<{ token?: string; message?: string }>(
    `/app/installations/${installationId}/access_tokens`,
    { method: "POST", token: jwt }
  )
  if (!res.ok || !res.json?.token) {
    throw new Error(res.json?.message || `Failed to create installation token (${res.status})`)
  }
  return res.json.token
}

export async function getUserInstallations(userAccessToken: string): Promise<GitHubInstallation[]> {
  const res = await githubRequest<{ installations?: GitHubInstallation[]; message?: string }>(
    "/user/installations",
    { token: userAccessToken }
  )
  if (!res.ok) throw new Error(res.json?.message || `Failed to load installations (${res.status})`)
  return Array.isArray(res.json?.installations) ? res.json.installations : []
}

export async function getUserInstallationRepos(userAccessToken: string, installationId: number): Promise<GitHubRepo[]> {
  const res = await githubRequest<{ repositories?: GitHubRepo[]; message?: string }>(
    `/user/installations/${installationId}/repositories`,
    { token: userAccessToken }
  )
  if (!res.ok) throw new Error(res.json?.message || `Failed to load repositories (${res.status})`)
  return Array.isArray(res.json?.repositories) ? res.json.repositories : []
}

