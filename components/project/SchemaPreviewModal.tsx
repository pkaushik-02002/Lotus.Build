"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Props = {
  open: boolean
  tables: string[]
  sql: string
  pushing?: boolean
  generating?: boolean
  error?: string
  onClose: () => void
  onPush: () => void
}

export function SchemaPreviewModal({
  open,
  tables,
  sql,
  pushing,
  generating,
  error,
  onClose,
  onPush,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Database schema ready</DialogTitle>
          <DialogDescription>
            Review detected tables and push SQL schema to Supabase.
          </DialogDescription>
        </DialogHeader>

        {generating ? (
          <div className="flex items-center text-sm text-zinc-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating schema...
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Tables detected</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tables.map((t) => (
                  <span key={t} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700">
                    {t}
                  </span>
                ))}
                {tables.length === 0 ? <span className="text-xs text-zinc-500">No tables detected</span> : null}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">View SQL</p>
              <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap text-xs text-zinc-800">{sql}</pre>
            </div>
          </>
        )}

        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-zinc-300">
            Cancel
          </Button>
          <Button type="button" onClick={onPush} disabled={!sql || generating || pushing} className="bg-zinc-900 text-white hover:bg-black">
            {pushing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Push to Supabase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

