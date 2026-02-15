import { Navbar } from "@/components/ui/navbar"
import { LenisProvider } from "@/components/providers/lenis-provider"
import { CreateAfterLogin } from "@/components/create-after-login"
import { FooterSection } from "@/components/sections/footer-section"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { Blocks, ShieldCheck, Sparkles, Gauge } from "lucide-react"

const featureItems = [
  {
    icon: Sparkles,
    title: "Prompt to Product",
    description: "Describe your idea and get a working website in seconds.",
  },
  {
    icon: Blocks,
    title: "Live Editing",
    description: "Refine sections instantly with guided, contextual updates.",
  },
  {
    icon: Gauge,
    title: "Fast Iteration",
    description: "Go from rough concept to polished launch-ready pages quickly.",
  },
  {
    icon: ShieldCheck,
    title: "Production Quality",
    description: "Clean outputs designed for real companies and real customers.",
  },
]

const metrics = [
  { value: "50K+", label: "Apps Built" },
  { value: "100M+", label: "Lines Generated" },
  { value: "<30s", label: "Average Build Time" },
  { value: "98%", label: "User Satisfaction" },
]

const useCases = [
  {
    title: "SaaS Launch",
    description: "Create your homepage, pricing, and onboarding flow in one guided session.",
  },
  {
    title: "Client Prototyping",
    description: "Ship polished concept sites for clients without long design-engineering loops.",
  },
  {
    title: "Founder Validation",
    description: "Test ideas quickly with premium-looking websites built from plain language.",
  },
]

const testimonials = [
  {
    text: "I built a complete SaaS dashboard in 30 minutes. What would have taken weeks was done in a single prompt session.",
    name: "Sarah Chen",
    role: "Indie Hacker",
  },
  {
    text: "BuildKit is like having a senior developer on demand. It understands exactly what I want to build.",
    name: "Marcus Johnson",
    role: "Startup Founder",
  },
  {
    text: "We use BuildKit to prototype client projects. It's 10x faster than our previous workflow.",
    name: "Emily Rodriguez",
    role: "Agency Owner",
  },
  {
    text: "As a non-developer, I finally built my dream app without getting blocked by complexity.",
    name: "David Park",
    role: "Product Designer",
  },
]

export default function Home() {
  return (
    <LenisProvider>
      <CreateAfterLogin />
      <main className="relative min-h-screen overflow-x-clip bg-[#f5f5f2] text-[#1f1f1f]">
        <Navbar />

        <section className="relative px-4 pb-14 pt-28 sm:px-6 sm:pb-16 sm:pt-32 lg:px-8">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl md:text-6xl lg:text-7xl">
              Describe your idea.
              <span className="block text-zinc-700">We build it.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-sm leading-relaxed text-zinc-500 sm:text-base md:text-lg">
              Turn your ideas into full-stack web applications with AI. Just describe what you want to build and watch it come to life.
            </p>
            <div className="mx-auto mt-10 flex max-w-3xl justify-center">
              <AnimatedAIInput />
            </div>
          </div>
        </section>

        <section className="relative px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-lg font-medium tracking-tight text-zinc-700 sm:text-xl">
              The fastest way for founders to turn intent into a live website.
            </p>
          </div>
        </section>

        <section id="features" className="relative px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-3">
            {featureItems.map((item, idx) => {
              const Icon = item.icon
              return (
                <article
                  key={item.title}
                  className={`min-w-0 flex-1 rounded-3xl px-5 py-6 sm:min-w-[280px] ${
                    idx % 2 === 0 ? "bg-[#ecece6]" : "bg-[#e8e7df]"
                  }`}
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-zinc-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-zinc-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="relative mt-6 bg-[linear-gradient(180deg,#ecece6_0%,#e6e5dd_100%)] px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 text-center md:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <p className="font-display text-4xl font-bold leading-none text-zinc-900 sm:text-5xl">{metric.value}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-zinc-600 sm:text-sm">{metric.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative bg-[#ecece6] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
            {useCases.map((useCase) => (
              <article key={useCase.title}>
                <h3 className="text-xl font-semibold tracking-tight text-zinc-900">{useCase.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{useCase.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="testimonials" className="relative bg-[#ecece6] px-4 pb-14 pt-6 sm:px-6 sm:pb-16 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Testimonials</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Loved by builders</h2>
              </div>
              <p className="hidden text-sm text-zinc-500 sm:block">Scroll to read more stories</p>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300">
              {testimonials.map((testimonial, idx) => (
                <blockquote
                  key={`${testimonial.name}-${idx}`}
                  className="w-[300px] shrink-0 rounded-2xl border border-zinc-200 bg-white/75 p-5 backdrop-blur-[1px] sm:w-[340px]"
                >
                  <p className="text-sm leading-relaxed text-zinc-700">"{testimonial.text}"</p>
                  <footer className="mt-4">
                    <p className="text-sm font-medium text-zinc-900">{testimonial.name}</p>
                    <p className="text-xs text-zinc-500">{testimonial.role}</p>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <FooterSection />
      </main>
    </LenisProvider>
  )
}

