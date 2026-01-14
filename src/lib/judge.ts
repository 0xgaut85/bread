/**
 * Shared AI Judging Utilities
 * 
 * Provides common judging logic used across:
 * - /api/tasks/[id]/complete
 * - /api/judge
 * - /api/cron/judge
 */

import Anthropic from "@anthropic-ai/sdk";

// Lazy-initialize Anthropic client
let _anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (_anthropic) return _anthropic;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export interface SubmissionForJudging {
  id: string;
  content: string;
  type: string;
  submitter: {
    id: string;
    name: string | null;
    walletAddress: string;
  };
}

export interface JudgingResult {
  winnerId: string;
  scores: Record<string, { score: number; reasoning: string }>;
}

export interface JudgingCriteria {
  name: string;
  criteria: string[];
  weights: string;
}

/**
 * Predefined judging criteria for common task types
 */
export const PREDEFINED_CRITERIA: Record<string, JudgingCriteria> = {
  MEME: {
    name: "Meme",
    criteria: [
      "Humor and entertainment value",
      "Relevance to the topic/brand",
      "Visual quality and design",
      "Meme potential (shareability)",
      "Originality and creativity",
    ],
    weights: "Humor (30%), Relevance (25%), Quality (20%), Shareability (15%), Originality (10%)",
  },
  THREAD: {
    name: "Thread/Content",
    criteria: [
      "Quality of writing and clarity",
      "Engagement and hook factor",
      "Information value and accuracy",
      "Structure and flow",
      "Relevance to the topic",
      "Call-to-action effectiveness",
    ],
    weights: "Writing Quality (25%), Engagement (25%), Information Value (20%), Structure (15%), Relevance (10%), CTA (5%)",
  },
  DESIGN: {
    name: "Design/Artwork",
    criteria: [
      "Visual impact and aesthetics",
      "Technical skill and execution",
      "Creativity and originality",
      "Relevance to the brief",
      "Composition and layout",
      "Color theory and harmony",
    ],
    weights: "Visual Impact (25%), Technical Skill (20%), Creativity (20%), Relevance (15%), Composition (10%), Color (10%)",
  },
  CODE: {
    name: "Code/Development",
    criteria: [
      "Functionality and correctness",
      "Code quality and best practices",
      "Performance and efficiency",
      "Security considerations",
      "Documentation and comments",
      "Innovation and problem-solving",
    ],
    weights: "Functionality (30%), Code Quality (20%), Performance (15%), Security (15%), Documentation (10%), Innovation (10%)",
  },
  OTHER: {
    name: "General Task",
    criteria: [
      "Quality of execution",
      "Relevance to the task requirements",
      "Creativity and originality",
      "Completeness and polish",
      "Professional presentation",
      "Overall value delivered",
    ],
    weights: "Execution (25%), Relevance (25%), Creativity (20%), Completeness (15%), Presentation (10%), Value (5%)",
  },
};

/**
 * Detect task category from metadata
 */
export function detectTaskCategory(
  category: string,
  title: string,
  description: string
): string {
  // Check explicit category first
  if (category && PREDEFINED_CRITERIA[category]) {
    return category;
  }

  const text = `${title} ${description}`.toLowerCase();

  // Auto-detect from title/description
  if (text.includes("meme") || text.includes("funny")) return "MEME";
  if (text.includes("thread") || text.includes("tweet")) return "THREAD";
  if (text.includes("design") || text.includes("logo") || text.includes("artwork")) return "DESIGN";
  if (text.includes("code") || text.includes("script") || text.includes("bot") || text.includes("app")) return "CODE";

  return "OTHER";
}

/**
 * Create fallback result when AI judging fails
 */
export function createFallbackResult(
  submissions: SubmissionForJudging[],
  reason: string
): JudgingResult {
  const randomIndex = Math.floor(Math.random() * submissions.length);
  const winnerId = submissions[randomIndex].id;
  const scores: Record<string, { score: number; reasoning: string }> = {};

  submissions.forEach((sub) => {
    scores[sub.id] = {
      score: sub.id === winnerId ? 100 : Math.floor(Math.random() * 80) + 20,
      reasoning: reason,
    };
  });

  return { winnerId, scores };
}

/**
 * Parse and validate AI response JSON
 */
export function parseJudgingResponse(
  responseText: string,
  submissions: SubmissionForJudging[]
): JudgingResult {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in AI response");
  }

  const result = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!result.winnerId || typeof result.winnerId !== "string") {
    throw new Error("Invalid or missing winnerId in response");
  }
  if (!result.scores || typeof result.scores !== "object") {
    throw new Error("Invalid or missing scores in response");
  }

  // Validate winnerId exists in submissions
  const validWinner = submissions.find((s) => s.id === result.winnerId);
  if (!validWinner) {
    console.warn("[Judge] AI returned invalid winnerId, using first submission");
    result.winnerId = submissions[0].id;
  }

  return result;
}

/**
 * Build the judging prompt
 */
export function buildJudgingPrompt(
  taskTitle: string,
  taskDescription: string,
  submissions: SubmissionForJudging[],
  criteria: JudgingCriteria
): string {
  return `You are an expert judge evaluating ${submissions.length} submissions for a task.

## Task Details
**Title:** ${taskTitle}
**Description:** ${taskDescription}
**Category:** ${criteria.name}

## Judging Criteria
${criteria.criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

**Scoring Weights:** ${criteria.weights}

## Submissions

${submissions
  .map(
    (s, i) => `### Submission ${i + 1}
**ID:** ${s.id}
**Submitter:** ${s.submitter.name || s.submitter.walletAddress.slice(0, 8)}
**Type:** ${s.type}
**Content:**
${s.content.length > 2000 ? s.content.slice(0, 2000) + "..." : s.content}
`
  )
  .join("\n---\n")}

---

## Your Judgment
Evaluate all submissions based on the criteria above.

Respond with JSON only (no other text):
{
  "winnerId": "id_of_best_submission",
  "scores": {
    "submission_id": {
      "score": 0-100,
      "reasoning": "Brief explanation"
    }
  }
}

Be fair and thorough!`;
}

/**
 * Judge submissions using Claude AI
 * 
 * @param task - Task details with submissions
 * @returns Judging result with winner and scores
 */
export async function judgeSubmissions(task: {
  id: string;
  title: string;
  description: string;
  category: string;
  submissions: SubmissionForJudging[];
}): Promise<JudgingResult> {
  // If only one submission, it wins automatically
  if (task.submissions.length === 1) {
    const winnerId = task.submissions[0].id;
    return {
      winnerId,
      scores: {
        [winnerId]: {
          score: 100,
          reasoning: "Only submission - automatic winner",
        },
      },
    };
  }

  const anthropic = getAnthropicClient();

  // If no AI available, use fallback
  if (!anthropic) {
    console.log("[Judge] No AI available, using random selection");
    return createFallbackResult(task.submissions, "AI judging not available - random selection");
  }

  // Get judging criteria
  const detectedCategory = detectTaskCategory(task.category, task.title, task.description);
  const criteria = PREDEFINED_CRITERIA[detectedCategory] || PREDEFINED_CRITERIA.OTHER;

  // Build prompt
  const prompt = buildJudgingPrompt(task.title, task.description, task.submissions, criteria);

  try {
    console.log(`[Judge] Analyzing ${task.submissions.length} submissions for task ${task.id}...`);

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

    return parseJudgingResponse(content.text, task.submissions);
  } catch (error) {
    console.error("[Judge] AI judging failed:", error);
    return createFallbackResult(task.submissions, "AI judging failed - fallback selection");
  }
}

/**
 * Check if a URL points to an image
 */
export function isImageUrl(url: string): boolean {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some((ext) => lowerUrl.includes(ext));
}

/**
 * Get image media type from URL
 */
export function getImageMediaType(url: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".png")) return "image/png";
  if (lowerUrl.includes(".gif")) return "image/gif";
  if (lowerUrl.includes(".webp")) return "image/webp";
  return "image/jpeg";
}
