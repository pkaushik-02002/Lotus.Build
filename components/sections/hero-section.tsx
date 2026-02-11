"use client"

import { Sparkles } from "lucide-react"
import { motion } from "motion/react"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion"

export function HeroSection() {
  // Function to set input value and focus the textarea
  const handleSuggestionClick = (suggestion: string) => {
    // Find the textarea element and set its value
    setTimeout(() => {
      const textarea = document.querySelector('#ai-input-hero') as HTMLTextAreaElement
      if (textarea) {
        textarea.value = suggestion
        textarea.focus()
        // Trigger the input event to update the AnimatedAIInput component
        const event = new Event('input', { bubbles: true })
        textarea.dispatchEvent(event)
      }
    }, 100)
  }

  const suggestions = [
    "Build a SaaS landing page",
    "Task management app",
    "E-commerce store",
    "Blog with markdown",
  ]

  return (
    <section className="relative flex min-h-screen items-center px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-900/60 via-transparent to-transparent" />
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2rem] border border-zinc-800/70 bg-zinc-900/40 px-5 py-10 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:px-8 sm:py-14 lg:px-14 lg:py-16"
        >
          <div aria-hidden className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-zinc-300/10 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-zinc-400/10 blur-3xl" />

          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-2">
              <Sparkles className="h-4 w-4 text-zinc-400" />
              <span className="text-sm text-zinc-400">AI powered full-stack application builder </span>
            </div>

            <h1 className="mb-6 font-display text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              <span className="block text-zinc-100">Describe your idea.</span>
              <span className="bg-gradient-to-r from-zinc-500 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                We build it.
              </span>
            </h1>

            <p className="mb-8 max-w-2xl text-base leading-relaxed text-zinc-500 text-balance sm:text-lg md:text-xl">
              Turn your ideas into full-stack web applications with AI. Just describe what you want to build and watch your
              app come to life in seconds.
            </p>

            <AnimatedAIInput />

            <div className="mt-6 w-full max-w-3xl">
              <div className="scrollbar-hidden flex flex-row flex-nowrap items-center justify-start gap-2 overflow-x-auto pb-2 sm:justify-center">
                {suggestions.map((suggestion, index) => (
                  <PromptSuggestion
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="shrink-0"
                  >
                    {suggestion}
                  </PromptSuggestion>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
