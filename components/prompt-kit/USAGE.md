# Modern Reasoning Timeline Component

## Overview

The updated `Reasoning` component is now a **Claude-like agent timeline** with modern UI, dynamic tool calls, file operations, and smooth animations. It displays the reasoning process, tool execution, file creation/modifications, and results in a beautiful, interactive timeline.

## Features

✨ **Modern Timeline Design**
- Beautiful vertical timeline with animated indicators
- Color-coded status badges (pending, running, completed, error)
- Smooth animations and transitions using Framer Motion
- Responsive and dark-theme optimized

🔧 **Dynamic Tool Calls**
- Tool calls display inline with reasoning steps
- Expandable tool details showing input/output data
- Real-time status updates (pending → running → completed/error)
- Organized tool execution visualization

📁 **File Operations Visualization**
- Track file creation, reading, writing, deletion, modification, and movement
- Color-coded file operation icons for different types
- Expandable file content preview with syntax highlighting
- File metadata display (size, line count)
- Error handling for failed file operations

⚡ **Enhanced UX**
- Icon-based step type indicators (thinking, tool call, code, search, result, file operations)
- Duration tracking for completed steps
- Streaming indicator for ongoing processes
- Interactive expand/collapse for detailed content

## Components

### `AgentTimeline`

Main timeline component that renders reasoning steps with tool calls.

```tsx
import { AgentTimeline, type TimelineStep } from "@/components/prompt-kit"

const steps: TimelineStep[] = [
  {
    id: "1",
    type: "thinking",
    title: "Analyzing Requirements",
    description: "Understanding the user's request",
    status: "completed",
    duration: "0.8s",
  },
  {
    id: "2",
    type: "tool_call",
    title: "Searching Codebase",
    status: "running",
    toolCalls: [
      {
        id: "tc-1",
        name: "search_files",
        status: "running",
        input: { pattern: "*.tsx" },
      },
    ],
  },
  // ... more steps
]

export function MyComponent() {
  return (
    <AgentTimeline
      steps={steps}
      isStreaming={true}
      onStepToggle={(stepId) => console.log("Toggled step:", stepId)}
    />
  )
}
```

### Step Types

- **`thinking`** - Cognitive processing and analysis
- **`reasoning`** - Strategic planning and decision making
- **`tool_call`** - External tool execution (API, database, file search)
- **`code`** - Code generation and writing
- **`search`** - Information retrieval and searching
- **`file_operation`** - File system operations (create, read, write, delete, modify, move)
- **`result`** - Final output generation

### Status States

- **`pending`** - Not yet started
- **`running`** - Currently executing
- **`completed`** - Successfully finished
- **`error`** - Failed execution

### File Operation Types

- **`create`** - New file creation (green)
- **`read`** - File reading/access (blue)
- **`write`** - File content modification/writing (purple)
- **`modify`** - Editing existing file (orange)
- **`delete`** - File deletion (red)
- **`move`** - File relocation (yellow)

## SmartReasoningDisplay Component

✨ **New Feature:** Automatically parses numbered reasoning steps into individual timeline items!

Instead of collapsing all steps under one "Show reasoning" section, each step becomes a beautiful timeline item.

**Before (Collapsed):**
```
▼ Show reasoning
  1. Analyzing your request and understanding scope.
  2. Planning application structure and components.
  3. Creating files...
```

**After (Individual Steps):**
```
✓ Analyzing your request and understanding scope.                    0.5s
✓ Planning application structure and components.                     0.5s
→ Creating files... (running)
```

### Usage

```tsx
import { SmartReasoningDisplay } from "@/components/prompt-kit"

const reasoning = `1. Analyzing your request and understanding scope.
2. Planning application structure and components.
3. Creating files...`

export function MyComponent() {
  return (
    <SmartReasoningDisplay
      reasoningText={reasoning}
      isStreaming={false}
      onStepToggle={(stepId) => console.log("Toggled:", stepId)}
    />
  )
}
```

**See [SMART_REASONING.md](SMART_REASONING.md)** for detailed documentation, advanced examples, and integration tips.

## Usage Examples

### Basic Timeline

```tsx
<AgentTimeline
  steps={[
    {
      id: "1",
      type: "thinking",
      title: "Analyzing Request",
      description: "Understanding requirements",
      status: "completed",
      duration: "1.2s",
    },
    {
      id: "2",
      type: "tool_call",
      title: "Executing Tool",
      status: "running",
      toolCalls: [
        {
          id: "tc-1",
          name: "api_call",
          status: "running",
          input: { endpoint: "/api/data" },
        },
      ],
    },
  ]}
  isStreaming={true}
/>
```

### With Tool Calls

```tsx
const steps: TimelineStep[] = [
  {
    id: "search-step",
    type: "tool_call",
    title: "Searching Files",
    description: "Finding related components",
    status: "completed",
    duration: "0.9s",
    toolCalls: [
      {
        id: "search-1",
        name: "search_files",
        status: "completed",
        input: {
          pattern: "components/ui/*.tsx",
          directory: ".",
        },
        output: {
          count: 24,
          files: ["button.tsx", "card.tsx", "dialog.tsx"],
        },
      },
      {
        id: "read-1",
        name: "read_file",
        status: "completed",
        input: {
          path: "components/ui/button.tsx",
          lines: "1-50",
        },
        output: {
          content: "export function Button...",
          lineCount: 150,
        },
      },
    ],
  },
]
```

### With File Operations

```tsx
const steps: TimelineStep[] = [
  {
    id: "file-step",
    type: "file_operation",
    title: "Creating Component Files",
    description: "Writing new component files to disk",
    status: "completed",
    duration: "1.5s",
    fileOperations: [
      {
        id: "f-1",
        type: "create",
        filePath: "components/timeline.tsx",
        status: "completed",
        size: 2150,
        linesCount: 67,
        content: `"use client"

import { useState } from "react"
import { motion } from "framer-motion"

export function Timeline({ steps }) {
  return (
    <div className="w-full space-y-4">
      {steps.map((step) => (
        <TimelineStep key={step.id} step={step} />
      ))}
    </div>
  )
}`,
      },
      {
        id: "f-2",
        type: "create",
        filePath: "components/timeline-step.tsx",
        status: "completed",
        size: 3200,
        linesCount: 98,
        contentPreview: `"use client"

import { Check, Loader2 } from "lucide-react"

export function TimelineStep({ step }) {
  return (
    <div className="flex gap-4 items-start">
      {/* Status indicator */}
      {/* Content */}
    </div>
  )
}`,
      },
      {
        id: "f-3",
        type: "write",
        filePath: "components/index.ts",
        status: "completed",
        contentPreview: `export { Timeline } from "./timeline"
export { TimelineStep } from "./timeline-step"
export type { TimelineStepProps } from "./timeline-step"`,
      },
    ],
  },
]
```

### With Error Handling

```tsx
const steps: TimelineStep[] = [
  {
    id: "exec-step",
    type: "tool_call",
    title: "Executing Command",
    status: "error",
    toolCalls: [
      {
        id: "exec-1",
        name: "execute_command",
        status: "error",
        input: {
          command: "npm install",
          directory: "./project",
        },
        error: "Failed to install dependencies: EACCES permission denied",
      },
    ],
  },
]
```

### With Code Generation

```tsx
const steps: TimelineStep[] = [
  {
    id: "code-step",
    type: "code",
    title: "Generating Component Code",
    description: "Creating the Timeline component",
    status: "completed",
    duration: "2.1s",
    toolName: "src/components/timeline.tsx",
    content: `export function Timeline({ steps }: TimelineProps) {
  return (
    <div className="w-full space-y-4">
      {steps.map((step) => (
        <TimelineStep key={step.id} step={step} />
      ))}
    </div>
  )
}`,
  },
]
```

## Type Definitions

```tsx
// Timeline step configuration
export interface TimelineStep {
  id: string
  type: StepType
  title: string
  description?: string
  content?: string
  status: StepStatus
  duration?: string
  toolName?: string
  expanded?: boolean
  toolCalls?: ToolCall[]
  fileOperations?: FileOperation[]
}

// Tool call execution details
export interface ToolCall {
  id: string
  name: string
  status: StepStatus
  input?: Record<string, any>
  output?: Record<string, any>
  error?: string
}

// File operation details
export interface FileOperation {
  id: string
  type: "create" | "read" | "write" | "delete" | "modify" | "move"
  filePath: string
  status: StepStatus
  content?: string           // Full file content
  contentPreview?: string    // Preview (for large files)
  size?: number             // File size in bytes
  linesCount?: number       // Number of lines
  error?: string            // Error message if failed
  success?: boolean         // Explicit success flag
}

// Props for AgentTimeline
export interface AgentTimelineProps {
  steps: TimelineStep[]
  isStreaming?: boolean
  onStepToggle?: (stepId: string) => void
}
```

## Styling & Customization

The component uses Tailwind CSS classes for styling. Customize via:

- **Colors**: Status indicators use `primary`, `emerald-500`, `red-500`, `blue-500`
- **Spacing**: Default spacing uses Tailwind's spacing scale
- **Animations**: Powered by Framer Motion for smooth transitions
- **Dark Mode**: Full support with transparent backgrounds

## Demo Component

Interactive demo component showing all features:

```tsx
import { AgentTimelineDemo } from "@/components/prompt-kit"

export function Page() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Agent Timeline Demo</h1>
      <AgentTimelineDemo />
    </div>
  )
}
```

## Backward Compatibility

Original `Reasoning`, `ReasoningTrigger`, and `ReasoningContent` components are still available for backward compatibility:

```tsx
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/prompt-kit"

export function OldStyle() {
  return (
    <Reasoning>
      <ReasoningTrigger>Show reasoning</ReasoningTrigger>
      <ReasoningContent>Reasoning process details...</ReasoningContent>
    </Reasoning>
  )
}
```

## Best Practices

1. **Keep steps logical** - Break down complex processes into clear, understandable steps
2. **Use appropriate icons** - Match step type to the actual operation being performed
3. **Provide descriptions** - Help users understand what each step does
4. **Show tool details** - Expand tool calls to display input/output for transparency
5. **Handle errors gracefully** - Use error status to indicate failures
6. **Track durations** - Show timing for completed steps to indicate efficiency
7. **File operations metadata** - Include file size and line count for created/modified files
8. **Content preview** - Use `contentPreview` for large files to avoid performance issues
9. **Error messages** - Provide clear, actionable error messages for failed file operations
10. **Color coding** - Leverage file operation type colors for quick visual identification

## Performance Tips

- Use `isStreaming={false}` when all steps are complete
- Lazy-load tool call details to avoid rendering large payloads
- Consider memoization if updating steps frequently
- Limit the number of visible tool calls per step

## Migration from Old Component

Old way:
```tsx
<Reasoning>
  <ReasoningTrigger>See reasoning</ReasoningTrigger>
  <ReasoningContent>{reasoningText}</ReasoningContent>
</Reasoning>
```

New way:
```tsx
<AgentTimeline
  steps={[
    {
      id: "reason",
      type: "reasoning",
      title: "Reasoning Process",
      content: reasoningText,
      status: "completed",
    },
  ]}
/>
```
