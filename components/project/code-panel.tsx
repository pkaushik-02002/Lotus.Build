"use client"

import { FileCode } from "lucide-react"
import Editor from "@monaco-editor/react"
import { cn } from "@/lib/utils"
import { ProjectFileTree, getLanguageFromPath } from "./file-tree"
import type { GeneratedFile } from "@/app/project/[id]/types"

export interface CodePanelProps {
  files: GeneratedFile[]
  selectedFile: GeneratedFile | null
  onSelectFile: (file: GeneratedFile) => void
  isGenerating?: boolean
}

export function CodePanel({ files, selectedFile, onSelectFile, isGenerating }: CodePanelProps) {
  return (
    <div className="flex h-full min-w-0 bg-[#fcfcfa]">
      <ProjectFileTree
        files={files}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
        isGenerating={isGenerating}
      />
      <div className="flex flex-1 flex-col bg-[#fcfcfa]">
        {!selectedFile ? (
          <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(244,244,245,0.92),_rgba(252,252,250,1)_56%)]">
            <div className="text-center text-zinc-500">Select a file</div>
          </div>
        ) : (
          <>
            <div className="flex h-11 items-center border-b border-zinc-200 bg-white px-4 shadow-sm">
              <FileCode className={cn("mr-2 h-4 w-4 text-zinc-500")} />
              <span className="text-sm text-zinc-700">{selectedFile.path}</span>
            </div>
            <div className="min-h-0 flex-1 bg-white">
              <Editor
                height="100%"
                language={getLanguageFromPath(selectedFile.path)}
                value={selectedFile.content}
                theme="vs-light"
                loading={
                  <div className="flex h-full items-center justify-center bg-[#fcfcfa]">
                    <div className="text-sm text-zinc-500">Loading editor...</div>
                  </div>
                }
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  automaticLayout: true,
                  padding: { top: 16 },
                  renderLineHighlight: "line",
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  },
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
