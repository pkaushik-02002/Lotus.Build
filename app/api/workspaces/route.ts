import { NextResponse } from "next/server"
import { adminDb, adminAuth } from "@/lib/firebase-admin"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type WorkspaceRole = "owner" | "builder"
type CompanyProfileInput = {
  companyName: string
  industry: string
  existingWebsite: string | null
  teamSize: string
  productFocus: string
  companyDescription: string | null
}

function serializeDoc(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString()
    } else {
      out[k] = v
    }
  }
  return out
}

export async function GET(req: Request) {
  try {
    const uid = await requireUserUid(req)

    const membershipSnap = await adminDb
      .collection("workspace_members")
      .where("userId", "==", uid)
      .get()

    const workspaceIds = membershipSnap.docs
      .map((d) => (d.data() as any)?.workspaceId)
      .filter((v): v is string => typeof v === "string" && v.length > 0)

    const workspaces = await Promise.all(
      workspaceIds.map(async (wid) => {
        const wsSnap = await adminDb.collection("workspaces").doc(wid).get()
        if (!wsSnap.exists) return null
        return serializeDoc({ id: wsSnap.id, ...(wsSnap.data() as any) })
      })
    )

    return NextResponse.json({ workspaces: workspaces.filter(Boolean) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: message.includes("Authorization") ? 401 : 500 })
  }
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserUid(req)
    const body = await req.json().catch(() => ({}))

    const name = typeof body?.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "Missing workspace name" }, { status: 400 })
    }

    const workspaceType = body?.workspaceType === "company" ? "company" : "team"
    const companyInput = (body?.companyProfile ?? {}) as Partial<CompanyProfileInput>
    const rawExistingWebsite =
      typeof (companyInput as any).existingWebsite === "string"
        ? (companyInput as any).existingWebsite
        : typeof (companyInput as any).website === "string"
          ? (companyInput as any).website
          : ""
    const rawCompanyDescription =
      typeof (companyInput as any).companyDescription === "string"
        ? (companyInput as any).companyDescription
        : ""
    const companyProfile: CompanyProfileInput | null =
      workspaceType === "company"
        ? {
            companyName: typeof companyInput.companyName === "string" ? companyInput.companyName.trim() : "",
            industry: typeof companyInput.industry === "string" ? companyInput.industry.trim() : "",
            existingWebsite: rawExistingWebsite.trim() || null,
            teamSize: typeof companyInput.teamSize === "string" ? companyInput.teamSize.trim() : "",
            productFocus: typeof companyInput.productFocus === "string" ? companyInput.productFocus.trim() : "",
            companyDescription: rawCompanyDescription.trim() || null,
          }
        : null

    if (workspaceType === "company") {
      const missing =
        !companyProfile?.companyName ||
        !companyProfile.industry ||
        !companyProfile.teamSize ||
        !companyProfile.productFocus
      if (missing) {
        return NextResponse.json({ error: "Missing company profile fields" }, { status: 400 })
      }
    }

    const wsRef = adminDb.collection("workspaces").doc()
    const aiContextPrompt =
      workspaceType === "company" && companyProfile
        ? [
            `Company context: ${companyProfile.companyName} (${companyProfile.industry}), team size ${companyProfile.teamSize}, product focus ${companyProfile.productFocus}.`,
            companyProfile.companyDescription ? `Description: ${companyProfile.companyDescription}.` : "",
            companyProfile.existingWebsite ? `Existing website: ${companyProfile.existingWebsite}.` : "",
          ]
            .filter(Boolean)
            .join(" ")
        : null

    await wsRef.set({
      name,
      ownerId: uid,
      createdAt: new Date(),
      plan: "free",
      tokensUsed: 0,
      workspaceType,
      companyProfile,
      aiContextPrompt,
    })

    const memberDocId = `${wsRef.id}_${uid}`
    await adminDb.collection("workspace_members").doc(memberDocId).set({
      workspaceId: wsRef.id,
      userId: uid,
      role: "owner" satisfies WorkspaceRole,
      createdAt: new Date(),
    })

    if (workspaceType === "company" && companyProfile) {
      const companyRef = adminDb.collection("company_profiles").doc(wsRef.id)
      await companyRef.set({
        workspaceId: wsRef.id,
        ownerId: uid,
        ...companyProfile,
        aiContextPrompt,
        createdAt: new Date(),
      })

      const starterTemplates = [
        {
          key: "landing",
          title: `${companyProfile.companyName} marketing landing page`,
          prompt: `Build a modern landing page for ${companyProfile.companyName} in ${companyProfile.industry}. Product focus: ${companyProfile.productFocus}. Include hero, features, social proof, and CTA.`,
        },
        {
          key: "dashboard",
          title: `${companyProfile.companyName} customer dashboard`,
          prompt: `Build a customer dashboard for ${companyProfile.companyName}. Team size: ${companyProfile.teamSize}. Product focus: ${companyProfile.productFocus}. Include auth-ready layout, usage cards, and activity timeline.`,
        },
        {
          key: "docs",
          title: `${companyProfile.companyName} documentation site`,
          prompt: `Build a docs/help center for ${companyProfile.companyName}${companyProfile.existingWebsite ? ` (${companyProfile.existingWebsite})` : ""} focused on ${companyProfile.productFocus}. Include search, sidebar navigation, and article templates.`,
        },
      ]

      const batch = adminDb.batch()
      starterTemplates.forEach((template) => {
        const ref = adminDb.collection("workspace_templates").doc()
        batch.set(ref, {
          workspaceId: wsRef.id,
          ownerId: uid,
          ...template,
          createdAt: new Date(),
        })
      })
      await batch.commit()
    }

    return NextResponse.json({
      workspaceId: wsRef.id,
      workspaceType,
      companyDashboardUrl: workspaceType === "company" ? `/projects?workspace=${wsRef.id}&view=company` : null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: message }, { status: message.includes("Authorization") ? 401 : 500 })
  }
}
