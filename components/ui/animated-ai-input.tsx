"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

interface AnimatedAIInputProps {
  mode?: "create" | "chat";
  onSubmit?: (value: string, model: string) => void | Promise<void>;
  placeholder?: string;
  isLoading?: boolean;
  compact?: boolean;
  visualEditToggle?: { active: boolean; onToggle: () => void };
}

export function AnimatedAIInput({
  mode = "create",
  onSubmit,
  placeholder = "What can I help you build today?",
  isLoading = false,
  compact = false,
  visualEditToggle,
}: AnimatedAIInputProps) {
  const router = useRouter();
  const { user, userData } = useAuth();
  const [value, setValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [selectedModel, setSelectedModel] = useState("GPT-4-1 Mini");

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: compact ? 88 : 132,
    maxHeight: compact ? 220 : 360,
  });

  const isPaidUser = userData?.planId && userData.planId !== "free";
  const effectiveModel = autoMode ? "GPT-4-1 Mini" : selectedModel;
  const AI_MODELS = ["o3-mini", "Gemini 2.5 Flash", "Claude 3.5 Sonnet", "GPT-4-1 Mini", "GPT-4-1"];

  const PENDING_CREATE_KEY = "buildkit_pending_create";

  useEffect(() => {
    if (!isPaidUser) setAutoMode(true);
  }, [isPaidUser]);

  const handleSubmit = async () => {
    if (!value.trim() || isCreating || isLoading) return;

    if (mode === "chat" && onSubmit) {
      const submittedValue = value.trim();
      setValue("");
      adjustHeight(true);
      await onSubmit(submittedValue, effectiveModel);
      return;
    }

    if (mode === "create" && !user) {
      sessionStorage.setItem(
        PENDING_CREATE_KEY,
        JSON.stringify({ prompt: value.trim(), model: effectiveModel })
      );
      router.push("/login?redirect=" + encodeURIComponent("/"));
      return;
    }

    setIsCreating(true);
    try {
      const docRef = await addDoc(collection(db, "projects"), {
        prompt: value.trim(),
        model: effectiveModel,
        status: "pending",
        createdAt: serverTimestamp(),
        messages: [],
        ownerId: user?.uid ?? undefined,
        visibility: "private",
      });
      router.push(`/project/${docRef.id}`);
    } catch (error) {
      console.error("Error creating project:", error);
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isSubmitKey = (e.key === "Enter" && !e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === "Enter");
    if (isSubmitKey && value.trim() && !isCreating && !isLoading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = value.trim().length > 0 && !isCreating && !isLoading;

  return (
    <div className="group w-full max-w-2xl">
      <div
        className={cn(
          "relative rounded-3xl border bg-[#fcfcfa] shadow-sm transition-all duration-200",
          isFocused ? "border-zinc-400 ring-2 ring-zinc-300/60" : "border-zinc-200 hover:border-zinc-300"
        )}
      >
        <div className="relative px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5">
          <Textarea
            id="ai-input-hero"
            value={value}
            placeholder={placeholder}
            className={cn(
              "w-full resize-none border-none bg-transparent px-0 pb-16 pt-0 text-[15px] text-zinc-900 sm:text-base",
              "placeholder:text-zinc-500",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-300",
              compact ? "min-h-[88px]" : "min-h-[132px]"
            )}
            ref={textareaRef}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
          />

          <div className="absolute bottom-3 left-3 flex items-center gap-2 sm:bottom-4 sm:left-4">
            {mode === "chat" && visualEditToggle && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={visualEditToggle.onToggle}
                className={cn(
                  "h-8 rounded-full border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-50",
                  visualEditToggle.active && "border-zinc-400 text-zinc-900"
                )}
              >
                {visualEditToggle.active ? "Visual Edit On" : "Visual Edit"}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {autoMode ? "Model: Auto" : `Model: ${selectedModel}`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60 border-zinc-200 bg-white">
                <DropdownMenuLabel className="text-xs font-medium text-zinc-500">Response model</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => setAutoMode(true)}
                  className="text-zinc-800 focus:bg-zinc-100"
                >
                  Automatic
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isPaidUser ? (
                  AI_MODELS.map((model) => (
                    <DropdownMenuItem
                      key={model}
                      onSelect={() => {
                        setAutoMode(false);
                        setSelectedModel(model);
                      }}
                      className="flex items-center justify-between gap-2 text-zinc-800 focus:bg-zinc-100"
                    >
                      <span>{model}</span>
                      <span className="text-[11px] text-zinc-500">
                        {!autoMode && selectedModel === model ? "Selected" : ""}
                      </span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="px-2 py-2">
                    <p className="text-xs text-zinc-600">Custom model choice is available on paid plans.</p>
                    <Link href="/pricing" className="mt-2 inline-flex text-xs font-medium text-zinc-900 hover:text-black">
                      Upgrade
                    </Link>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <motion.button
            type="button"
            className={cn(
              "absolute bottom-3 right-3 sm:bottom-4 sm:right-4 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200",
              "focus-visible:ring-1 focus-visible:ring-zinc-300 focus-visible:ring-offset-0",
              canSubmit ? "bg-zinc-900 text-white hover:bg-black active:scale-95" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
            aria-label="Send message"
            disabled={!canSubmit}
            onClick={handleSubmit}
            whileTap={canSubmit ? { scale: 0.92 } : {}}
          >
            {isCreating || isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
