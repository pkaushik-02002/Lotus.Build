import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { LiquidCtaButton } from "@/components/buttons/liquid-cta-button"

export function CtaSection() {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-zinc-800/70 bg-zinc-900/40 px-6 py-12 text-center backdrop-blur-xl sm:px-10 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-zinc-200/10 blur-3xl" />
        <h2 className="font-display text-4xl md:text-5xl font-bold text-zinc-100 mb-6">Start building today</h2>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-zinc-500 text-balance">
          Join thousands of builders creating full-stack applications with AI. No coding required.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link href="/">
            <LiquidCtaButton>Start Building Free</LiquidCtaButton>
          </Link>
          <Link
            href="#features"
            className="group flex items-center gap-2 px-6 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <span>See how it works</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </Link>
        </div>
      </div>
    </section>
  )
}
