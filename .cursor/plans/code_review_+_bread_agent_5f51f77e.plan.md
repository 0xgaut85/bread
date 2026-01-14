---
name: Code Review + Bread Agent
overview: Comprehensive code review identifying potential issues, edge cases, and logic problems, followed by implementation of a Bread Agent chat widget for user assistance.
todos:
  - id: fix-race-condition
    content: Add status check before task completion to prevent duplicate judging
    status: completed
  - id: fix-json-parse
    content: Wrap all AI JSON parsing in try-catch with fallback
    status: completed
  - id: extract-judge-util
    content: Extract shared judging logic to src/lib/judge.ts
    status: completed
  - id: add-submission-validation
    content: Add minimum content length validation for submissions
    status: completed
  - id: create-chat-api
    content: Create /api/chat endpoint with Claude Haiku and docs context
    status: completed
  - id: create-chat-component
    content: Build BreadAgent floating chat widget component
    status: completed
    dependencies:
      - create-chat-api
  - id: integrate-chat
    content: Add BreadAgent to layout.tsx
    status: completed
    dependencies:
      - create-chat-component
---

# Code Review + Bread Agent Chat Widget

## Part 1: Code Review Findings

### Critical Issues

**1. Race Condition in Task Completion** ([`src/app/api/tasks/[id]/complete/route.ts`](src/app/api/tasks/[id]/complete/route.ts))

- **Issue**: If the scheduler and cron job both trigger completion simultaneously, task could be judged twice
- **Fix**: Add database-level lock or check status before proceeding with `status: "OPEN"` in the WHERE clause of the initial update

**2. Missing Transaction Rollback** ([`src/app/api/tasks/route.ts`](src/app/api/tasks/route.ts))

- **Issue**: If task creation fails after escrow transaction is verified, funds are locked but no task exists
- **Fix**: Wrap task creation in a Prisma transaction, log failed creations for manual review

**3. AI Judging JSON Parsing** ([`src/app/api/judge/route.ts`](src/app/api/judge/route.ts) lines 877-880)

- **Issue**: `JSON.parse(jsonMatch[0])` can throw if AI returns malformed JSON, crashing the request
- **Fix**: Wrap in try-catch with fallback to random selection (already exists in some places but not all)

### Medium Issues

**4. Scheduler Memory Leak** ([`src/lib/scheduler.ts`](src/lib/scheduler.ts))

- **Issue**: `scheduledJudgments` Map grows indefinitely if tasks are never completed
- **Fix**: Add periodic cleanup of stale entries

**5. Nonce Timing Attack** ([`src/lib/nonce-store.ts`](src/lib/nonce-store.ts))

- **Issue**: Nonce comparison uses string equality which could be timing-vulnerable
- **Fix**: Use constant-time comparison for security-sensitive comparisons

**6. Escrow Balance Race** ([`src/app/api/tasks/[id]/complete/route.ts`](src/app/api/tasks/[id]/complete/route.ts) lines 168-206)

- **Issue**: Balance check and transfer are not atomic - another task could drain escrow between check and transfer
- **Fix**: Already has retry logic, but should add a queue for payment ordering

### Edge Cases to Handle

**7. Empty Submission Content**

- Users could submit empty strings - add validation for minimum content length

**8. Deadline Timezone Issues**

- All deadlines use server time - ensure consistent UTC handling

**9. Large Image Uploads**

- Base64 images in submissions could bloat database - consider external storage

**10. Duplicate Task Titles**

- No uniqueness constraint - could confuse users

### Code Quality Issues

**11. Duplicate Judging Logic**

- `judgeSubmissions` function is duplicated in 3 files with slight variations
- Should be extracted to a shared utility

**12. Missing Error Boundaries**

- Frontend pages lack error boundaries for graceful failure

---

## Part 2: Bread Agent Chat Widget

### Overview

Add a floating chat button (bottom-right corner) with the bread logo that opens a chat interface. The agent will answer questions about Bread using a playful web3 intern persona.

### Implementation

**1. Create Chat API Endpoint** - [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts)

- Use Claude 3 Haiku (cheap, fast)
- System prompt with web3 intern personality
- Feed all docs content as context
- Style rules: no em dashes, no comma before "and", playful but not ghetto

**2. Create Chat Component** - [`src/components/chat/BreadAgent.tsx`](src/components/chat/BreadAgent.tsx)

- Floating button with bread logo (bottom-right, 60x60px)
- Expandable chat panel (400x500px)
- Message history with user/agent distinction
- Typing indicator
- Close button

**3. Add to Layout** - [`src/app/layout.tsx`](src/app/layout.tsx)

- Include BreadAgent component globally

### Agent Personality

```
You are the Bread Agent - a helpful but slightly chaotic web3 intern who works at bread.markets.
You know everything about the platform but explain things like you're texting a friend.
Rules:
- Never use em dashes (use regular dashes instead)
- Never put a comma before "and"
- Be playful and use some web3 slang (gm, wagmi, lfg, ser) but don't overdo it
- Keep responses concise and helpful
- You can be a bit funny but stay professional enough to actually help
```

### Knowledge Base

Concatenate all docs content:

- Introduction
- Getting Started  
- API Reference
- x402 Protocol
- Integration guides

### UI Design

- Button: Circular, black background, bread logo, subtle glow on hover
- Chat panel: Dark theme matching site, rounded corners, smooth slide-up animation
- Messages: User messages right-aligned (green), agent messages left-aligned (gray)
- Input: Full-width text field with send button
```mermaid
flowchart TB
    subgraph UI [Chat Widget]
        Button[Floating Button]
        Panel[Chat Panel]
        Input[Message Input]
        Messages[Message List]
    end
    
    subgraph API [Backend]
        ChatRoute[/api/chat]
        Anthropic[Claude Haiku]
        DocsContext[Docs Knowledge]
    end
    
    Button -->|Click| Panel
    Input -->|Submit| ChatRoute
    ChatRoute --> Anthropic
    DocsContext -->|System Prompt| Anthropic
    Anthropic -->|Response| Messages
```


---

## Implementation Todos