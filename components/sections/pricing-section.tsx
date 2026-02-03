import { Check } from "lucide-react"
import Link from "next/link"
import { PLAN_DISPLAY, DEFAULT_PLANS_FALLBACK, planIdForDisplay, type PlanId } from "@/lib/plans"
import { cn } from "@/lib/utils"

const SECTION_PLANS = DEFAULT_PLANS_FALLBACK.map((plan) => {
  const planKey = planIdForDisplay(plan.id) as PlanId
  const display = PLAN_DISPLAY[planKey] || PLAN_DISPLAY.pro
  const priceStr = plan.price === 0 ? "$0" : `$${(plan.price / 100).toFixed(0)}`
  const period = plan.interval === "forever" ? "forever" : plan.interval === "year" ? "/year" : "/mo"
  return {
    id: plan.id,
    name: plan.name,
    description: display.description,
    price: priceStr,
    period,
    features: display.features.length ? display.features : plan.features,
    recommended: display.recommended ?? false,
    isFree: plan.id === "free" || planKey === "free",
  }
})

export function PricingSection() {
  return (
    <section id="pricing" className="px-4 sm:px-6 py-16 sm:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-xs sm:text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3 sm:mb-4">
            Pricing
          </p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-zinc-100 mb-3 sm:mb-4">
            Build without limits
          </h2>
          <p className="text-zinc-500 max-w-xl mx-auto text-balance text-sm sm:text-base md:text-lg">
            Start free, scale as you grow. No credit card required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {SECTION_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "p-6 sm:p-8 rounded-xl sm:rounded-2xl border flex flex-col h-full transition-all duration-200",
                plan.recommended
                  ? "border-amber-500/50 bg-zinc-900/80 shadow-lg shadow-amber-500/5"
                  : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <h3 className="font-heading text-xl font-semibold text-zinc-100 truncate">
                  {plan.name}
                </h3>
                {plan.recommended && (
                  <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-500 mb-5 line-clamp-2">{plan.description}</p>

              <div className="mb-5">
                <span className="font-display text-3xl sm:text-4xl font-bold text-zinc-100">
                  {plan.price}
                </span>
                <span className="text-sm text-zinc-500 ml-1">{plan.period}</span>
              </div>

              <ul className="space-y-2.5 sm:space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 min-w-0">
                    <Check className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                    <span className="text-sm text-zinc-400 break-words">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.isFree ? "/projects" : "/pricing"}
                className={cn(
                  "block w-full py-3 px-6 text-center rounded-lg font-medium text-sm transition-colors mt-auto",
                  plan.recommended
                    ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                    : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700"
                )}
              >
                {plan.isFree ? "Start Building" : "View plans"}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
