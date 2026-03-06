"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Props = {
  open: boolean
  loading?: boolean
  error?: string
  onClose: () => void
  onConnect: () => void
}

export function SupabaseConnectModal({ open, loading, error, onClose, onConnect }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Supabase</DialogTitle>
          <DialogDescription>
            Authenticate with Supabase via OAuth to list and link your projects.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-zinc-300">
            Cancel
          </Button>
          <Button type="button" onClick={onConnect} className="bg-zinc-900 text-white hover:bg-black" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Connect Supabase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

