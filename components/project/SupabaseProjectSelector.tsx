"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type ProjectItem = { id: string; name: string; region?: string }

type Props = {
  open: boolean
  projects: ProjectItem[]
  selectedId: string
  loading?: boolean
  onClose: () => void
  onChange: (id: string) => void
  onConfirm: () => void
}

export function SupabaseProjectSelector({
  open,
  projects,
  selectedId,
  loading,
  onClose,
  onChange,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Supabase Project</DialogTitle>
          <DialogDescription>
            Choose which Supabase project this Builder project should use.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                selectedId === p.id
                  ? "border-zinc-400 bg-white text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
              }`}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-zinc-500">{p.region || "Unknown region"}</div>
            </button>
          ))}
          {projects.length === 0 ? <p className="px-2 py-6 text-center text-xs text-zinc-500">No projects found.</p> : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-zinc-300">
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!selectedId || loading} className="bg-zinc-900 text-white hover:bg-black">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Link Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

