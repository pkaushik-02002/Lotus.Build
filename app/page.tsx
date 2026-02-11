import { Navbar } from "@/components/ui/navbar"
import { HeroSection } from "@/components/sections/hero-section"
import { ImpactSection } from "@/components/sections/impact-section"
import { TestimonialsSection } from "@/components/sections/testimonials-section"
import { CtaSection } from "@/components/sections/cta-section"
import { FooterSection } from "@/components/sections/footer-section"
import { LenisProvider } from "@/components/providers/lenis-provider"
import { CreateAfterLogin } from "@/components/create-after-login"

export default function Home() {
  return (
    <LenisProvider>
      <CreateAfterLogin />
      <main className="relative min-h-screen overflow-hidden bg-zinc-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.07),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.06),transparent_30%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:60px_60px]"
        />
        <Navbar />
        <HeroSection />
        <ImpactSection />
        <TestimonialsSection />
        <CtaSection />
        <FooterSection />
      </main>
    </LenisProvider>
  )
}
