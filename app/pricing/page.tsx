"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/ui/navbar"
import { FooterSection } from "@/components/sections/footer-section"
import { Check, ArrowLeft, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import {
  PLAN_DISPLAY,
  DEFAULT_PLANS_FALLBACK,
  planIdForDisplay,
  getPaidPlanTiers,
  type PlanForApi,
  type PlanId,
} from "@/lib/plans"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function PricingPage() {
  const router = useRouter()
  const { user, userData, loading: authLoading } = useAuth()
  const [plans, setPlans] = useState<PlanForApi[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  /** Selected tier index per plan id (paid plans only). */
  const [selectedTierByPlanId, setSelectedTierByPlanId] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch("/api/stripe/plans")
      .then((r) => r.json())
      .then((data) => {
        const apiPlans = Array.isArray(data.plans) ? data.plans : []
        // Always show all plans: merge API response with fallback so free, pro, team are never missing
        const merged = DEFAULT_PLANS_FALLBACK.map((fallback) => {
          const fromApi = apiPlans.find(
            (p: PlanForApi) => planIdForDisplay(p.id) === planIdForDisplay(fallback.id)
          )
          return fromApi
            ? { ...fallback, ...fromApi, priceId: fromApi.priceId ?? fallback.priceId }
            : fallback
        })
        setPlans(merged)
      })
      .catch(() => setPlans(DEFAULT_PLANS_FALLBACK))
      .finally(() => setLoading(false))
  }, [])

  const formatPrice = (cents: number, interval: string) => {
    if (cents === 0) return { price: "$0", period: interval === "forever" ? "forever" : "/mo" }
    const dollars = cents / 100
    return {
      price: `$${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}`,
      period: interval === "year" ? "/year" : "/mo",
    }
  }

  const handleSubscribe = async (priceId: string, quantity = 1) => {
    if (!user) {
      router.push("/login?redirect=/pricing")
      return
    }
    setCheckoutLoading(priceId)
    try {
      const idToken = await user.getIdToken()
      const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          priceId,
          quantity,
          successUrl: `${baseUrl}/projects?checkout=success`,
          cancelUrl: `${baseUrl}/pricing?checkout=cancelled`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Checkout failed")
      if (data.url) window.location.href = data.url
      else throw new Error("No checkout URL")
    } catch (e) {
      console.error(e)
      setCheckoutLoading(null)
      alert(e instanceof Error ? e.message : "Checkout failed")
    }
  }

  const displayPlans = plans.length > 0 ? plans : DEFAULT_PLANS_FALLBACK

  const currentPlanId = userData?.planId ? planIdForDisplay(userData.planId) : null
  const fallbackPlanName =
    currentPlanId ? currentPlanId.charAt(0).toUpperCase() + currentPlanId.slice(1) : "Free"
  const planName = userData?.planName || fallbackPlanName
  const tokensUsed = userData?.tokenUsage?.used ?? 0
  const baselineLimitByPlan: Record<PlanId, number> = { free: 10000, pro: 50000, team: 500000 }
  const tokensLimit = userData
    ? Math.max(
        0,
        Number(userData.tokensLimit ?? 0),
        Number(userData.tokenUsage?.used ?? 0) + Number(userData.tokenUsage?.remaining ?? 0),
        currentPlanId ? baselineLimitByPlan[currentPlanId as PlanId] : 0
      )
    : 0
  const remaining = userData ? Math.max(0, userData.tokenUsage?.remaining ?? tokensLimit - tokensUsed) : 0

  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-950">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(245,158,11,0.08),transparent)]" />
      <div className="fixed inset-0 -z-10 bg-[linear-gradient(to_bottom,rgba(9,9,11,0.98),rgb(9,9,11))]" />

      <Navbar />
      <div className="pt-20 sm:pt-28 pb-16 sm:pb-24 px-4 sm:px-6 lg:px-8 safe-area-inset-top safe-area-inset-bottom">
        <div className="max-w-7xl mx-auto w-full min-w-0">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/40 px-4 py-2 text-sm text-zinc-400 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800/50 hover:text-zinc-200 mb-8 sm:mb-10 touch-manipulation"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-4 h-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to home</span>
          </Link>

          {/* Header */}
          <div className="mb-10 sm:mb-14 rounded-3xl border border-zinc-800/70 bg-zinc-900/35 p-6 sm:p-8 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.95)]">
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-amber-400/90">
              Pricing
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl md:text-5xl mb-3">
              Plans & credits
            </h1>
            <p className="max-w-xl text-base text-zinc-500 sm:text-lg">
              Manage your subscription and credit balance. Choose the tier that fits your workflow.
            </p>
          </div>

          {/* Plan summary + credits (when logged in) */}
          {user && userData && (
            <div className="mb-10 sm:mb-12">
              <div className="flex flex-col gap-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-xl shadow-black/20">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/10 ring-1 ring-amber-500/20">
                      <span className="font-display text-lg font-semibold text-amber-400">
                        {(planName || "Free").charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-100 truncate">You&apos;re on {planName}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {userData.tokenUsage?.periodEnd
                          ? `Renews ${new Date(userData.tokenUsage.periodEnd).toLocaleDateString()}`
                          : "Current period"}
                      </p>
                    </div>
                  </div>
                  <Link href="/settings" className="shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-zinc-600/80 bg-zinc-800/50 text-zinc-200 shadow-sm transition-all hover:border-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-100"
                    >
                      Manage
                    </Button>
                  </Link>
                </div>

                <div>
                  <p className="mb-3 font-semibold text-zinc-100">Credits remaining</p>
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-bold tabular-nums text-zinc-100">
                      {remaining}
                    </span>
                    <span className="text-sm text-zinc-500">
                      of {tokensLimit.toLocaleString()}
                    </span>
                  </div>
                  <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-zinc-800/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500 ease-out"
                      style={{ width: `${tokensLimit ? Math.min(100, (remaining / tokensLimit) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="mb-3 flex items-center gap-2 text-sm text-zinc-500">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    Credits used first
                  </p>
                  <div className="flex flex-col gap-1.5 text-sm text-zinc-500">
                    <p className="flex items-center gap-2">
                      <X className="h-4 w-4 shrink-0 text-red-400/80" />
                      No credits will rollover
                    </p>
                    <p className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-amber-400" />
                      Credits reset at period end
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Plan cards */}
          {loading ? (
            <div className="flex justify-center py-24">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-amber-400/80" />
                <p className="text-sm text-zinc-500">Loading plans…</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 sm:gap-6">
              {displayPlans.map((plan) => {
                const planKey = planIdForDisplay(plan.id) as PlanId
                const display = PLAN_DISPLAY[planKey] || PLAN_DISPLAY.pro
                const recommended = display.recommended ?? false
                const isFree = plan.id === "free" || planKey === "free"
                const tiers = !isFree ? getPaidPlanTiers(plan) : []
                const selectedTierIndex = tiers.length ? (selectedTierByPlanId[plan.id] ?? 0) : 0
                const selectedTier = tiers[selectedTierIndex] ?? null
                const effectivePrice = selectedTier ? selectedTier.priceCents : plan.price
                const effectiveTokens = selectedTier ? selectedTier.tokensPerMonth : plan.tokensPerMonth
                const effectiveQuantity = selectedTier?.quantity ?? 1
                const effectivePriceId = selectedTier?.priceId ?? plan.priceId
                const hasPriceId = !!effectivePriceId
                const { price: priceStr, period } = formatPrice(effectivePrice, plan.interval)
                const features = display.features.length ? display.features : plan.features

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "flex min-h-0 flex-col rounded-2xl border transition-all duration-300",
                      "p-6 sm:p-7 lg:p-8",
                      "backdrop-blur-sm shadow-xl shadow-black/10",
                      recommended
                        ? "border-amber-500/40 bg-gradient-to-b from-zinc-900/95 to-zinc-900/80 ring-1 ring-amber-500/20 shadow-amber-500/5"
                        : "border-zinc-800/80 bg-zinc-900/60 hover:border-zinc-700/80 hover:bg-zinc-900/70 hover:shadow-2xl hover:shadow-black/15"
                    )}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <h2 className="font-display text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl truncate">
                        {plan.name}
                      </h2>
                      {recommended && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold tracking-wide text-amber-400 ring-1 ring-amber-500/30">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="mb-5 line-clamp-2 text-sm leading-relaxed text-zinc-500 sm:text-base">
                      {display.description}
                    </p>

                    <div className="mb-1 flex items-baseline gap-1.5">
                      <span className="font-display text-3xl font-bold tabular-nums tracking-tight text-zinc-100 sm:text-4xl">
                        {priceStr}
                      </span>
                      <span className="text-base text-zinc-500">{period}</span>
                    </div>

                    {isFree ? (
                      <p className="mb-6 text-sm text-zinc-500">
                        {plan.tokensPerMonth.toLocaleString()} tokens/month
                      </p>
                    ) : tiers.length > 0 ? (
                      <div className="mb-6">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Monthly tokens
                        </p>
                        <Select
                          value={String(selectedTierIndex)}
                          onValueChange={(v) =>
                            setSelectedTierByPlanId((prev) => ({ ...prev, [plan.id]: Number(v) }))
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-12 w-full rounded-xl border border-zinc-700/80 bg-zinc-800/60 py-3 px-4 text-zinc-200 transition-all",
                              "hover:border-zinc-600 hover:bg-zinc-800/80",
                              "focus:ring-2 focus:ring-amber-500/30 focus:ring-offset-0 focus:ring-offset-zinc-900"
                            )}
                          >
                            <SelectValue>
                              <span className="font-semibold">
                                {effectiveTokens >= 1000
                                  ? `${(effectiveTokens / 1000).toFixed(effectiveTokens % 1000 === 0 ? 0 : 1)}k`
                                  : effectiveTokens.toLocaleString()}{" "}
                                tokens /mo
                              </span>
                              <span className="ml-2 font-normal text-zinc-500">
                                · {priceStr}
                                {period}
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent
                            className="max-h-[280px] rounded-xl border-zinc-700/80 bg-zinc-900/95 p-1 backdrop-blur-xl"
                            align="start"
                          >
                            {tiers.map((tier, i) => {
                              const tierPrice = formatPrice(tier.priceCents, plan.interval)
                              return (
                                <SelectItem
                                  key={i}
                                  value={String(i)}
                                  className="flex flex-col items-start gap-0.5 rounded-lg py-3 pl-3 pr-8 text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100 data-[highlighted]:bg-zinc-800"
                                >
                                  <span className="font-semibold">
                                    {tier.tokensPerMonth >= 1000
                                      ? `${(tier.tokensPerMonth / 1000).toFixed(tier.tokensPerMonth % 1000 === 0 ? 0 : 1)}k`
                                      : tier.tokensPerMonth.toLocaleString()}{" "}
                                    tokens /mo
                                  </span>
                                  <span className="text-xs text-zinc-500">
                                    {tierPrice.price}
                                    {tierPrice.period}
                                  </span>
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <p className="mb-6 text-sm text-zinc-500">
                        {plan.tokensPerMonth.toLocaleString()} tokens/month
                      </p>
                    )}

                    <ul className="mb-8 flex-1 space-y-3 min-h-0">
                      {features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 min-w-0">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                            <Check className="h-3 w-3 text-amber-400" strokeWidth={2.5} />
                          </span>
                          <span className="text-sm leading-snug text-zinc-400 break-words sm:text-base">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto w-full min-w-0">
                      {isFree ? (
                        <Link href="/projects" className="block w-full">
                          <Button
                            variant="outline"
                            className="h-12 w-full rounded-xl border-zinc-600/80 bg-zinc-800/40 font-medium text-zinc-200 shadow-sm transition-all hover:border-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-100"
                          >
                            Start Building
                          </Button>
                        </Link>
                      ) : hasPriceId ? (
                        <Button
                          disabled={!!checkoutLoading || authLoading}
                          className={cn(
                            "h-12 w-full rounded-xl font-semibold shadow-lg transition-all hover:shadow-xl active:scale-[0.99] border-0",
                            recommended
                              ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                              : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                          )}
                          onClick={() => handleSubscribe(effectivePriceId!, effectiveQuantity)}
                        >
                          {checkoutLoading === effectivePriceId ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            `Subscribe to ${plan.name}`
                          )}
                        </Button>
                      ) : (
                        <Button
                          disabled
                          className={cn(
                            "h-12 w-full rounded-xl font-semibold border-0 opacity-70",
                            recommended
                              ? "bg-amber-500/80 text-zinc-950"
                              : "bg-zinc-800 text-zinc-400"
                          )}
                        >
                          Subscribe to {plan.name}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="mt-12 text-center text-sm text-zinc-500 px-2 sm:mt-16">
            Questions?{" "}
            <Link
              href="/help"
              className="font-medium text-amber-400 underline-offset-4 transition-colors hover:text-amber-300"
            >
              Visit Help & Support
            </Link>
          </p>
        </div>
      </div>
      <FooterSection />
    </main>
  )
}
