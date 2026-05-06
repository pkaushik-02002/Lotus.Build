"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Navbar } from "@/components/ui/navbar"
import { FooterSection } from "@/components/sections/footer-section"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { lotusBuildFaqs } from "@/lib/lotus-build-site-content"
import { cn } from "@/lib/utils"
import {
  Search,
  Mail,
  Zap,
  Eye,
  Globe,
  Coins,
  Share2,
  ChevronRight,
  MessageCircle,
  BookOpen,
  ArrowUpRight,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Category config — maps FAQ indices to a category for tab filtering
// ---------------------------------------------------------------------------
const FAQ_CATEGORIES = [
  { key: "all", label: "All questions" },
  { key: "getting-started", label: "Getting started" },
  { key: "preview", label: "Preview & deploy" },
  { key: "billing", label: "Tokens & billing" },
  { key: "sharing", label: "Sharing" },
] as const

type CategoryKey = (typeof FAQ_CATEGORIES)[number]["key"]

// Map each FAQ index to a category key
const FAQ_CATEGORY_MAP: CategoryKey[] = [
  "getting-started", // How do I create a new project?
  "getting-started", // What can I build?
  "preview",         // How does the preview work?
  "preview",         // How do I deploy?
  "billing",         // What are tokens?
  "sharing",         // How do I share?
]

// ---------------------------------------------------------------------------
// Quick-action cards
// ---------------------------------------------------------------------------
const QUICK_LINKS = [
  {
    icon: Mail,
    title: "Email support",
    description: "Get a reply within 24 hours from our team.",
    href: "mailto:support@lotus-build.app",
    external: true,
  },
  {
    icon: Zap,
    title: "Start building",
    description: "Jump straight in and build your first project.",
    href: "/",
    external: false,
  },
  {
    icon: BookOpen,
    title: "Plans & pricing",
    description: "Compare plans and upgrade for more capacity.",
    href: "/pricing",
    external: false,
  },
  {
    icon: MessageCircle,
    title: "Account settings",
    description: "Manage your profile, billing, and integrations.",
    href: "/settings",
    external: false,
  },
] as const

// Icon for each category key
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "getting-started": Zap,
  preview: Eye,
  billing: Coins,
  sharing: Share2,
  all: BookOpen,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function HelpPage() {
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("all")

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return lotusBuildFaqs
      .map((faq, i) => ({ ...faq, originalIndex: i }))
      .filter(({ q: question, a: answer, originalIndex }) => {
        const matchesCategory =
          activeCategory === "all" || FAQ_CATEGORY_MAP[originalIndex] === activeCategory
        const matchesSearch =
          !q || question.toLowerCase().includes(q) || answer.toLowerCase().includes(q)
        return matchesCategory && matchesSearch
      })
  }, [query, activeCategory])

  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <Navbar />

      {/* ------------------------------------------------------------------ */}
      {/* Hero */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden px-4 pb-0 pt-28 sm:pt-32 lg:pt-36">
        {/* Subtle radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(214,203,186,0.35),transparent)]"
        />

        <div className="relative mx-auto max-w-2xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e2ddd3] bg-white/80 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 shadow-sm">
            <Globe className="h-3.5 w-3.5" />
            Help Center
          </div>

          <h1 className="mb-4 font-display text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl md:text-5xl">
            How can we help?
          </h1>
          <p className="mx-auto mb-10 max-w-md text-base text-zinc-500 sm:text-lg">
            Find answers to common questions or reach out and we'll get back to you quickly.
          </p>

          {/* Search */}
          <div className="relative mx-auto max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="help-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (e.target.value) setActiveCategory("all")
              }}
              placeholder="Search for answers…"
              className="w-full rounded-2xl border border-zinc-200 bg-white py-3.5 pl-11 pr-4 text-sm text-zinc-900 shadow-sm outline-none ring-0 transition-all placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-300/60"
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Quick-action cards */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-14 lg:py-16">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.title}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 transition-all duration-200 hover:border-zinc-300 hover:shadow-md"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-100 bg-[#f5f5f2] transition-colors group-hover:border-zinc-200 group-hover:bg-zinc-100">
                  <Icon className="h-4.5 w-4.5 text-zinc-600" />
                </div>
                <p className="mb-1 text-sm font-semibold text-zinc-900">{item.title}</p>
                <p className="text-xs leading-relaxed text-zinc-500">{item.description}</p>
                <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-zinc-300 transition-all group-hover:text-zinc-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            )
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FAQ */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6 sm:pb-24">
        {/* Section header */}
        <div className="mb-8">
          <h2 className="mb-1.5 text-xl font-semibold text-zinc-900 sm:text-2xl">
            Frequently asked questions
          </h2>
          <p className="text-sm text-zinc-500">
            {filteredFaqs.length === lotusBuildFaqs.length
              ? `${lotusBuildFaqs.length} questions`
              : `${filteredFaqs.length} of ${lotusBuildFaqs.length} questions`}
          </p>
        </div>

        {/* Category tabs */}
        {!query && (
          <div className="mb-6 flex flex-wrap gap-2">
            {FAQ_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.key] ?? BookOpen
              const isActive = activeCategory === cat.key
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                    isActive
                      ? "border-zinc-800 bg-zinc-900 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {cat.label}
                </button>
              )
            })}
          </div>
        )}

        {/* FAQ list */}
        {filteredFaqs.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <Accordion type="single" collapsible className="w-full">
              {filteredFaqs.map((faq, idx) => {
                const catKey = FAQ_CATEGORY_MAP[faq.originalIndex]
                const CatIcon = CATEGORY_ICONS[catKey] ?? BookOpen
                return (
                  <AccordionItem
                    key={faq.originalIndex}
                    value={`faq-${faq.originalIndex}`}
                    className={cn(
                      "border-b border-zinc-100 px-5 last:border-b-0 sm:px-6",
                      idx === 0 && "rounded-t-2xl",
                      idx === filteredFaqs.length - 1 && "rounded-b-2xl"
                    )}
                  >
                    <AccordionTrigger className="gap-3 py-4 text-left text-sm font-medium text-zinc-900 hover:text-zinc-900 hover:no-underline sm:py-5 [&>svg]:shrink-0 [&>svg]:text-zinc-400">
                      <span className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#f0ede8]">
                          <CatIcon className="h-3 w-3 text-zinc-500" />
                        </span>
                        <span>{faq.q}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 pl-8 pt-0 text-sm leading-relaxed text-zinc-500">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center">
            <Search className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-700">No results for "{query}"</p>
            <p className="mt-1 text-xs text-zinc-400">Try a different term or browse all categories.</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Still need help CTA */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Still have a question?</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                Our team usually responds within a few hours.
              </p>
            </div>
            <Link
              href="mailto:support@lotus-build.app"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              <Mail className="h-4 w-4" />
              Contact support
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  )
}
