# Smart Reasoning Display - Automatic Step Parsing

## Overview

The `SmartReasoningDisplay` component automatically parses numbered reasoning steps and displays them as **individual timeline items** instead of a collapsed section.

## Features

✨ **Automatic Parsing**
- Parses numbered lists (1. 2. 3. etc) from reasoning text
- Each step becomes a separate timeline item
- Beautiful timeline visualization automatically applied

🎯 **Perfect For**
- Claude-style agent reasoning display
- Breaking down complex processes into steps
- Showing thinking process transparently
- Streaming reasoning as it arrives

## Usage

### Basic Example

```tsx
import { SmartReasoningDisplay } from "@/components/prompt-kit"

const reasoningText = `1. Analyzing your request and understanding scope.
2. Planning application structure and components.
3. Creating files...`

export function MyComponent() {
  return (
    <SmartReasoningDisplay
      reasoningText={reasoningText}
      isStreaming={false}
    />
  )
}
```

This will render as:
```
✓ Analyzing your request and understanding scope.
✓ Planning application structure and components.
→ Creating files...
```

Each step as a **separate timeline item** with status indicators!

### With Streaming

```tsx
export function StreamingReasoningExample() {
  const [reasoning, setReasoning] = useState("")
  const [isStreaming, setIsStreaming] = useState(true)

  return (
    <SmartReasoningDisplay
      reasoningText={reasoning}
      isStreaming={isStreaming}
      onStepToggle={(stepId) => console.log("Toggled:", stepId)}
    />
  )
}
```

### Advanced: Manual Step Control

```tsx
import { parseReasoningSteps, AgentTimeline } from "@/components/prompt-kit"

const reasoningText = `1. First step description
2. Second step description
3. Third step description`

// Parse into steps
const steps = parseReasoningSteps(reasoningText)

// Modify steps as needed
const customSteps = steps.map((step, idx) => ({
  ...step,
  status: idx === 0 ? "running" : idx < 2 ? "completed" : "pending",
  duration: idx < 2 ? "1.2s" : undefined,
}))

export function CustomReasoningTimeline() {
  return (
    <AgentTimeline
      steps={customSteps}
      isStreaming={steps.some(s => s.status === "running")}
    />
  )
}
```

## Real-World Example

### Claude Agent-Style Reasoning

```tsx
import { SmartReasoningDisplay } from "@/components/prompt-kit"

const reasoningFromAgent = `1. Analyzing the user request to understand what needs to be built.
2. Examining the existing project structure and dependencies.
3. Planning the component architecture and file organization.
4. Generating the necessary TypeScript types and interfaces.
5. Creating the React components with proper hooks and state management.
6. Writing styling with Tailwind CSS classes.
7. Adding error handling and edge cases.
8. Finalizing and preparing the output.`

export function AgentReasoningDisplay() {
  return (
    <div className="p-8">
      <h2 className="text-lg font-semibold mb-6">AI Agent Reasoning Process</h2>
      <SmartReasoningDisplay
        reasoningText={reasoningFromAgent}
        isStreaming={false}
      />
    </div>
  )
}
```

Output: Shows 8 separate timeline items, each representing one step!

## Parsing Details

The `parseReasoningSteps` function:
- ✅ Matches lines starting with numbers: `1. 2. 3. etc`
- ✅ Handles different spacing and indentation
- ✅ Extracts the step text after the number
- ✅ Creates TimelineStep objects with:
  - Status: `"completed"` (by default)
  - Duration: `"0.5s"` (default)
  - Type: `"reasoning"`
  - Title: The extracted step text

### Example Parsing

**Input:**
```
1. Analyzing your request and understanding scope.
2. Planning application structure and components.
3. Creating files...
```

**Output:**
```tsx
[
  {
    id: "reasoning-step-1",
    type: "reasoning",
    title: "Analyzing your request and understanding scope.",
    status: "completed",
    duration: "0.5s"
  },
  {
    id: "reasoning-step-2",
    type: "reasoning",
    title: "Planning application structure and components.",
    status: "completed",
    duration: "0.5s"
  },
  {
    id: "reasoning-step-3",
    type: "reasoning",
    title: "Creating files...",
    status: "completed",
    duration: "0.5s"
  }
]
```

## Custom Formatting

To customize the parsed steps after parsing:

```tsx
import { parseReasoningSteps } from "@/components/prompt-kit"

const reasoningText = `1. First task
2. Second task
3. Third task`

const steps = parseReasoningSteps(reasoningText)

// Add extra details
const enhancedSteps = steps.map((step, idx) => ({
  ...step,
  status: idx === 0 ? "running" : "completed",
  duration: idx === 0 ? undefined : "0.8s",
  description: `Step ${idx + 1} of ${steps.length}`,
}))

export function EnhancedReasoning() {
  return (
    <SmartReasoningDisplay
      reasoningText={reasoningText}
    />
  )
}
```

## Comparison: Old vs New

### Old Way (Collapsed)
```
Show reasoning
1. Analyzing your request and understanding scope.
2. Planning application structure and components.
3. Creating files...
```
❌ All compressed in one collapsible section

### New Way (Individual Steps)
```
✓ Analyzing your request and understanding scope.          0.5s
✓ Planning application structure and components.           0.5s
→ Creating files... (running)
```
✅ Each step as a beautiful timeline item!

## Integration Tips

### 1. With Chat Interface

```tsx
export function ChatWithReasoning() {
  const [messages, setMessages] = useState([])
  
  const handleStreamMessage = (chunk) => {
    if (chunk.type === "reasoning") {
      // Use SmartReasoningDisplay for reasoning blocks
      return <SmartReasoningDisplay reasoningText={chunk.content} />
    }
    return <p>{chunk.content}</p>
  }

  return (
    <div>
      {messages.map(msg => handleStreamMessage(msg))}
    </div>
  )
}
```

### 2. With Code Generation

```tsx
import { SmartReasoningDisplay, AgentTimeline } from "@/components/prompt-kit"

export function CodeGeneratorWithReasoning() {
  const [reasoning, setReasoning] = useState("")
  const [generatedCode, setGeneratedCode] = useState("")

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold mb-4">Agent Reasoning</h3>
        <SmartReasoningDisplay reasoningText={reasoning} />
      </div>
      
      <div>
        <h3 className="text-sm font-semibold mb-4">Generated Code</h3>
        <pre className="bg-slate-900 p-4 rounded text-sm text-slate-100 overflow-x-auto">
          {generatedCode}
        </pre>
      </div>
    </div>
  )
}
```

### 3. With Tool Calls and File Operations

```tsx
export function FullAgentWorkflow() {
  const [reasoning, setReasoning] = useState("")
  const steps = parseReasoningSteps(reasoning)
  
  // Add tool calls and file operations
  const enrichedSteps = steps.map(step => ({
    ...step,
    toolCalls: [{
      id: `tool-${step.id}`,
      name: "execute",
      status: "completed" as const,
    }],
    fileOperations: [{
      id: `file-${step.id}`,
      type: "create" as const,
      filePath: `output-${step.id}.ts`,
      status: "completed" as const,
    }],
  }))

  return <AgentTimeline steps={enrichedSteps} />
}
```

## Props

```tsx
interface SmartReasoningDisplayProps {
  reasoningText: string        // The reasoning text to parse
  isStreaming?: boolean        // Show streaming indicator
  onStepToggle?: (stepId: string) => void  // Callback when step is toggled
}
```

## Tips & Best Practices

1. **Format consistently** - Use `1. 2. 3.` format for best parsing
2. **Clear titles** - Each step should be descriptive
3. **Handle long text** - Works with any reasonable step count
4. **Streaming updates** - Set `isStreaming={true}` while reasoning is being generated
5. **Post-process if needed** - Use `parseReasoningSteps()` for custom modifications

## See Also

- [AgentTimeline](USAGE.md#componentsagent-timeline) - Main timeline component
- [TimelineStep](USAGE.md#type-definitions) - Step type definitions
- [File Operations](USAGE.md#file-operations) - For displaying file changes
