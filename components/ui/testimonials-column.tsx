"use client"

import React from "react"
import { motion } from "motion/react"

interface Testimonial {
  text: string
  name: string
  role: string
  image?: string
}

export const TestimonialsColumn = (props: {
  className?: string
  testimonials: Testimonial[]
  duration?: number
}) => {
  return (
    <div className={props.className}>
      <motion.div
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 10,
          repeat: Number.POSITIVE_INFINITY,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6"
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map(({ text, image, name, role }, i) => (
                <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8" key={i}>
                  <p className="leading-relaxed text-zinc-700">{text}</p>
                  <div className="flex items-center gap-3 mt-6">
                    {image ? (
                      <img
                        width={40}
                        height={40}
                        src={image}
                        alt={name}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-zinc-200"
                      />
                    ) : (
                      <div
                        className="h-10 w-10 rounded-full ring-2 ring-zinc-200 flex items-center justify-center bg-zinc-100 text-zinc-700 text-sm font-medium shrink-0"
                        aria-hidden
                      >
                        {name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-900 tracking-tight leading-5">{name}</span>
                      <span className="text-sm text-zinc-500 leading-5">{role}</span>
                    </div>
                  </div>
                </div>
              ))}
            </React.Fragment>
          )),
        ]}
      </motion.div>
    </div>
  )
}
