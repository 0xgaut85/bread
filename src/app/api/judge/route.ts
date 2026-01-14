/**
 * AI Judge for Task Submissions
 *
 * Uses Claude 3 Haiku with vision capability to analyze diverse submissions:
 * - Images: Memes, logos, artwork, UI designs, infographics
 * - Code: Apps, smart contracts, scripts, websites
 * - Text: Threads, articles, documentation, copywriting
 * - Links: X/Twitter posts, GitHub repos, deployed apps
 * - Mixed: Combinations of the above
 *
 * Features:
 * - Dynamic criteria generation for unknown task types
 * - X/Twitter post content fetching
 * - Vision analysis for images
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import {
  getEscrowPublicKey,
  transferUsdcFromEscrow,
} from "@/lib/solana";

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

interface SubmissionForJudging {
  id: string;
  content: string;
  type: string;
  submitter: {
    id: string;
    name: string | null;
    walletAddress: string;
  };
}

interface JudgingCriteria {
  name: string;
  criteria: string[];
  weights: string;
}

// Predefined task categories with judging criteria
const PREDEFINED_CRITERIA: Record<string, JudgingCriteria> = {
  // Creative/Visual
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
  LOGO: {
    name: "Logo Design",
    criteria: [
      "Visual appeal and aesthetics",
      "Brand relevance and messaging",
      "Versatility (works at different sizes)",
      "Memorability and uniqueness",
      "Professional execution",
      "Color usage and typography",
    ],
    weights: "Visual Appeal (25%), Brand Fit (25%), Versatility (15%), Memorability (15%), Execution (10%), Colors/Type (10%)",
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
  UI_UX: {
    name: "UI/UX Design",
    criteria: [
      "User experience and flow",
      "Visual design and aesthetics",
      "Accessibility and usability",
      "Consistency and coherence",
      "Innovation and creativity",
      "Adherence to best practices",
    ],
    weights: "UX Flow (25%), Visual Design (20%), Accessibility (20%), Consistency (15%), Innovation (10%), Best Practices (10%)",
  },

  // Content/Writing
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
  ARTICLE: {
    name: "Article/Blog Post",
    criteria: [
      "Depth of research and accuracy",
      "Writing quality and readability",
      "Structure and organization",
      "SEO and discoverability",
      "Originality of insights",
      "Practical value to readers",
    ],
    weights: "Research (25%), Writing (20%), Structure (20%), SEO (15%), Originality (10%), Practical Value (10%)",
  },
  DOCUMENTATION: {
    name: "Documentation",
    criteria: [
      "Clarity and comprehensiveness",
      "Technical accuracy",
      "Organization and navigation",
      "Code examples and illustrations",
      "Beginner-friendliness",
      "Maintenance considerations",
    ],
    weights: "Clarity (25%), Accuracy (25%), Organization (20%), Examples (15%), Accessibility (10%), Maintainability (5%)",
  },

  // Technical/Code
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
  APP: {
    name: "Application/Website",
    criteria: [
      "Functionality and features",
      "User experience and design",
      "Performance and responsiveness",
      "Code quality (if visible)",
      "Innovation and uniqueness",
      "Completeness and polish",
    ],
    weights: "Functionality (25%), UX/Design (25%), Performance (15%), Code Quality (15%), Innovation (10%), Polish (10%)",
  },
  SMART_CONTRACT: {
    name: "Smart Contract",
    criteria: [
      "Security and audit-readiness",
      "Gas efficiency and optimization",
      "Functionality and correctness",
      "Code readability and documentation",
      "Test coverage",
      "Innovation in design",
    ],
    weights: "Security (30%), Gas Efficiency (20%), Functionality (20%), Documentation (15%), Tests (10%), Innovation (5%)",
  },

  // Marketing/Business
  MARKETING: {
    name: "Marketing Content",
    criteria: [
      "Message clarity and impact",
      "Target audience alignment",
      "Brand consistency",
      "Call-to-action effectiveness",
      "Visual/creative appeal",
      "Conversion potential",
    ],
    weights: "Message Impact (25%), Audience Fit (20%), Brand Consistency (20%), CTA (15%), Creative Appeal (10%), Conversion (10%)",
  },
  VIDEO: {
    name: "Video Content",
    criteria: [
      "Production quality",
      "Content value and engagement",
      "Pacing and storytelling",
      "Audio quality",
      "Visual creativity",
      "Message delivery",
    ],
    weights: "Production (25%), Content Value (25%), Storytelling (20%), Audio (10%), Visuals (10%), Message (10%)",
  },
};

// Judge submissions for a task
export async function POST(request: Request) {
  try {
    // Check for admin authorization
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }

    // Get task and submissions
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        submissions: {
          include: {
            submitter: {
              select: {
                id: true,
                name: true,
                walletAddress: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.submissions.length === 0) {
      return NextResponse.json(
        { error: "No submissions to judge" },
        { status: 400 }
      );
    }

    // Update task status to judging
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "JUDGING" },
    });

    let winnerId: string;
    let scores: Record<string, { score: number; reasoning: string }> = {};

    if (anthropic) {
      // Determine judging approach based on submissions
      const hasImages = task.submissions.some(
        (s) => s.type === "IMAGE" || isImageUrl(s.content)
      );

      // Detect category or generate dynamic criteria
      const detectedCategory = detectTaskCategory(task.category, task.title, task.description);
      let judgingConfig: JudgingCriteria;

      if (PREDEFINED_CRITERIA[detectedCategory]) {
        judgingConfig = PREDEFINED_CRITERIA[detectedCategory];
        console.log(`[Judge] Using predefined criteria: ${detectedCategory}`);
      } else {
        // Generate dynamic criteria for unknown task types
        console.log(`[Judge] Generating dynamic criteria for: ${task.title}`);
        judgingConfig = await generateDynamicCriteria(task.title, task.description);
      }

      // Enrich submissions with fetched content (X posts, etc.)
      const enrichedSubmissions = await enrichSubmissions(task.submissions);

      console.log(`[Judge] Has images: ${hasImages}`);
      console.log(`[Judge] Submissions enriched: ${enrichedSubmissions.length}`);

      if (hasImages) {
        // Use vision-enabled judging
        const result = await judgeWithClaudeVision(
          task.title,
          task.description,
          enrichedSubmissions,
          judgingConfig
        );
        winnerId = result.winnerId;
        scores = result.scores;
      } else {
        // Use text-only judging
        const result = await judgeWithClaude(
          task.title,
          task.description,
          enrichedSubmissions,
          judgingConfig
        );
        winnerId = result.winnerId;
        scores = result.scores;
      }
    } else {
      // Fallback: random selection
      const randomIndex = Math.floor(Math.random() * task.submissions.length);
      winnerId = task.submissions[randomIndex].id;
      task.submissions.forEach((sub) => {
        scores[sub.id] = {
          score: sub.id === winnerId ? 100 : Math.floor(Math.random() * 80),
          reasoning: "AI judging not available - random selection",
        };
      });
    }

    // Update submissions with scores
    await Promise.all(
      task.submissions.map((sub) =>
        prisma.submission.update({
          where: { id: sub.id },
          data: {
            score: scores[sub.id]?.score || 0,
            aiReasoning: scores[sub.id]?.reasoning || "",
            isWinner: sub.id === winnerId,
          },
        })
      )
    );

    // Get winner details
    const winner = await prisma.submission.findUnique({
      where: { id: winnerId },
      include: { submitter: true },
    });

    if (!winner) {
      throw new Error("Winner not found");
    }

    const escrowAddress = getEscrowPublicKey();

    // Try to transfer USDC to winner
    const transfer = await transferUsdcFromEscrow(
      winner.submitter.walletAddress,
      task.reward
    );

    // Create escrow transaction record
    await prisma.escrowTransaction.create({
      data: {
        type: "RELEASE",
        amount: task.reward,
        fromWallet: escrowAddress,
        toWallet: winner.submitter.walletAddress,
        status: transfer.success ? "CONFIRMED" : "PENDING",
        txSignature: transfer.signature || null,
        taskId: task.id,
      },
    });

    // Update task status based on payment success
    const newStatus = transfer.success ? "COMPLETED" : "PAYMENT_PENDING";
    await prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus },
    });

    return NextResponse.json({
      success: true,
      winnerId,
      winnerWallet: winner.submitter.walletAddress,
      scores,
      status: newStatus,
      transfer: {
        success: transfer.success,
        signature: transfer.signature,
        error: transfer.error,
      },
    });
  } catch (error) {
    console.error("Judge error:", error);
    return NextResponse.json(
      { error: "Failed to judge submissions" },
      { status: 500 }
    );
  }
}

/**
 * Generate dynamic judging criteria for unknown task types
 */
async function generateDynamicCriteria(
  taskTitle: string,
  taskDescription: string
): Promise<JudgingCriteria> {
  if (!anthropic) {
    return {
      name: "Custom Task",
      criteria: [
        "Quality of execution",
        "Relevance to the task requirements",
        "Creativity and originality",
        "Completeness and polish",
        "Professional presentation",
        "Overall value delivered",
      ],
      weights: "Execution (25%), Relevance (25%), Creativity (20%), Completeness (15%), Presentation (10%), Value (5%)",
    };
  }

  const prompt = `You are an expert at creating evaluation criteria for various types of work.

Given this task, create specific judging criteria:

**Task Title:** ${taskTitle}
**Task Description:** ${taskDescription}

Create 5-7 specific, measurable criteria that would fairly evaluate submissions for this exact task.

Respond with JSON in this exact format:
{
  "name": "Short category name (2-3 words)",
  "criteria": [
    "Criterion 1 - specific to this task",
    "Criterion 2 - specific to this task",
    "Criterion 3 - specific to this task",
    "Criterion 4 - specific to this task",
    "Criterion 5 - specific to this task"
  ],
  "weights": "Criterion1 (X%), Criterion2 (Y%), ... (must sum to 100%)"
}

Be specific to the task, not generic. For example:
- If it's "Design a mascot for a crypto project", include criteria like "Brand personality fit", "Memorability", "Versatility across media"
- If it's "Build a Discord bot", include criteria like "Feature completeness", "Response time", "Error handling", "User experience"`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[Judge] Generated criteria: ${parsed.name}`);
    return parsed;
  } catch (error) {
    console.error("[Judge] Failed to generate criteria:", error);
    return {
      name: "Custom Task",
      criteria: [
        "Quality of execution",
        "Relevance to the task requirements",
        "Creativity and originality",
        "Completeness and polish",
        "Professional presentation",
        "Overall value delivered",
      ],
      weights: "Execution (25%), Relevance (25%), Creativity (20%), Completeness (15%), Presentation (10%), Value (5%)",
    };
  }
}

/**
 * Enrich submissions by fetching content from URLs (X posts, etc.)
 */
async function enrichSubmissions(
  submissions: SubmissionForJudging[]
): Promise<(SubmissionForJudging & { fetchedContent?: string })[]> {
  return Promise.all(
    submissions.map(async (sub) => {
      // Check if it's an X/Twitter link
      if (isTwitterUrl(sub.content)) {
        const tweetContent = await fetchTweetContent(sub.content);
        if (tweetContent) {
          return { ...sub, fetchedContent: tweetContent };
        }
      }

      // Check if it's a GitHub link
      if (isGitHubUrl(sub.content)) {
        const repoInfo = await fetchGitHubInfo(sub.content);
        if (repoInfo) {
          return { ...sub, fetchedContent: repoInfo };
        }
      }

      return sub;
    })
  );
}

/**
 * Check if URL is a Twitter/X link
 */
function isTwitterUrl(url: string): boolean {
  return /^https?:\/\/(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url);
}

/**
 * Check if URL is a GitHub link
 */
function isGitHubUrl(url: string): boolean {
  return /^https?:\/\/github\.com\/[\w-]+\/[\w-]+/.test(url);
}

/**
 * Fetch tweet content from X/Twitter
 * Uses multiple methods to try to get the content
 */
async function fetchTweetContent(url: string): Promise<string | null> {
  try {
    // Extract tweet ID
    const match = url.match(/status\/(\d+)/);
    if (!match) return null;
    const tweetId = match[1];

    // Method 1: Try Nitter (open source Twitter frontend)
    const nitterInstances = [
      "nitter.net",
      "nitter.it",
      "nitter.privacydev.net",
    ];

    for (const instance of nitterInstances) {
      try {
        const nitterUrl = url.replace(/twitter\.com|x\.com/, instance);
        const response = await fetch(nitterUrl, {
          headers: { "User-Agent": "BreadJudge/1.0" },
        });

        if (response.ok) {
          const html = await response.text();
          // Extract tweet text from Nitter HTML
          const textMatch = html.match(/<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
          if (textMatch) {
            // Clean HTML tags
            const text = textMatch[1]
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (text.length > 10) {
              console.log(`[Judge] Fetched tweet via ${instance}`);
              return `[X/Twitter Post]\nURL: ${url}\nContent: ${text}`;
            }
          }
        }
      } catch {
        continue;
      }
    }

    // Method 2: Try publish.twitter.com oEmbed API
    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
      const response = await fetch(oembedUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.html) {
          // Extract text from oEmbed HTML
          const text = data.html
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .replace(/&mdash;.*$/, "")
            .trim();
          if (text.length > 10) {
            console.log("[Judge] Fetched tweet via oEmbed");
            return `[X/Twitter Post]\nURL: ${url}\nAuthor: ${data.author_name || "Unknown"}\nContent: ${text}`;
          }
        }
      }
    } catch {
      // Continue to fallback
    }

    // Fallback: Return URL with note
    console.log("[Judge] Could not fetch tweet content, using URL only");
    return `[X/Twitter Post]\nURL: ${url}\nNote: Tweet content could not be fetched. Judge should consider visiting the link or evaluating based on available context.`;
  } catch (error) {
    console.error("[Judge] Error fetching tweet:", error);
    return null;
  }
}

/**
 * Fetch GitHub repository info
 */
async function fetchGitHubInfo(url: string): Promise<string | null> {
  try {
    // Extract owner/repo from URL
    const match = url.match(/github\.com\/([\w-]+)\/([\w-]+)/);
    if (!match) return null;

    const [, owner, repo] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "BreadJudge/1.0",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();

    // Also try to fetch README
    let readme = "";
    try {
      const readmeResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
        {
          headers: {
            "User-Agent": "BreadJudge/1.0",
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      if (readmeResponse.ok) {
        const readmeData = await readmeResponse.json();
        if (readmeData.content) {
          const decoded = Buffer.from(readmeData.content, "base64").toString("utf-8");
          readme = decoded.slice(0, 2000); // First 2000 chars
        }
      }
    } catch {
      // README fetch failed, continue without it
    }

    console.log(`[Judge] Fetched GitHub repo: ${owner}/${repo}`);

    return `[GitHub Repository]
URL: ${url}
Name: ${data.name}
Description: ${data.description || "No description"}
Language: ${data.language || "Unknown"}
Stars: ${data.stargazers_count}
Forks: ${data.forks_count}
Created: ${data.created_at}
Last Updated: ${data.updated_at}
${readme ? `\nREADME (excerpt):\n${readme}` : ""}`;
  } catch (error) {
    console.error("[Judge] Error fetching GitHub info:", error);
    return null;
  }
}

/**
 * Detect task category from metadata and content
 */
function detectTaskCategory(
  category: string,
  title: string,
  description: string
): string {
  const text = `${title} ${description}`.toLowerCase();

  // Check explicit category first
  if (category && PREDEFINED_CRITERIA[category]) {
    return category;
  }

  // Auto-detect from title/description
  if (text.includes("logo") || text.includes("brand identity")) return "LOGO";
  if (text.includes("meme") || text.includes("funny")) return "MEME";
  if (text.includes("ui") || text.includes("ux") || text.includes("interface") || text.includes("figma")) return "UI_UX";
  if (text.includes("design") || text.includes("artwork") || text.includes("illustration")) return "DESIGN";
  if (text.includes("thread") || text.includes("tweet")) return "THREAD";
  if (text.includes("article") || text.includes("blog")) return "ARTICLE";
  if (text.includes("documentation") || text.includes("docs") || text.includes("readme")) return "DOCUMENTATION";
  if (text.includes("smart contract") || text.includes("solidity") || text.includes("anchor")) return "SMART_CONTRACT";
  if (text.includes("app") || text.includes("website") || text.includes("webapp") || text.includes("dapp")) return "APP";
  if (text.includes("code") || text.includes("script") || text.includes("bot") || text.includes("api")) return "CODE";
  if (text.includes("video") || text.includes("animation")) return "VIDEO";
  if (text.includes("marketing") || text.includes("ad") || text.includes("campaign")) return "MARKETING";

  // Return empty to trigger dynamic criteria generation
  return "";
}

/**
 * Check if a URL points to an image
 */
function isImageUrl(url: string): boolean {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some((ext) => lowerUrl.includes(ext));
}

/**
 * Get image media type from URL
 */
function getImageMediaType(url: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".png")) return "image/png";
  if (lowerUrl.includes(".gif")) return "image/gif";
  if (lowerUrl.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

/**
 * Fetch image and convert to base64 for Claude vision
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const fullUrl = url.startsWith("http")
      ? url
      : `${process.env.X402_PUBLIC_URL || "https://bread.markets"}${url}`;

    const response = await fetch(fullUrl, {
      headers: { "User-Agent": "BreadJudge/1.0" },
    });

    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  } catch (error) {
    console.error("Error fetching image:", error);
    return null;
  }
}

/**
 * Build the judging prompt with appropriate criteria
 */
function buildJudgingPrompt(
  taskTitle: string,
  taskDescription: string,
  judgingConfig: JudgingCriteria,
  submissionCount: number
): string {
  return `You are an expert judge evaluating ${submissionCount} submissions for a task.

## Task Details
**Title:** ${taskTitle}
**Description:** ${taskDescription}
**Category:** ${judgingConfig.name}

## Judging Criteria
Evaluate each submission based on these criteria:
${judgingConfig.criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

**Scoring Weights:** ${judgingConfig.weights}

## Instructions
1. Carefully analyze each submission
2. Score each on a scale of 0-100
3. Provide specific, constructive reasoning for each score
4. Select the best overall submission as the winner
5. Be fair, objective, and thorough

Consider:
- How well does the submission meet the task requirements?
- What are the strengths and weaknesses?
- How does it compare to other submissions?
- Would the task creator be satisfied with this work?

For X/Twitter posts: Evaluate the actual content, engagement potential, and how well it serves the task goal.
For GitHub repos: Consider code quality, documentation, and completeness.
For images: Analyze visual quality, creativity, and relevance.

`;
}

/**
 * Judge submissions with Claude Vision (for images/visual content)
 */
async function judgeWithClaudeVision(
  taskTitle: string,
  taskDescription: string,
  submissions: (SubmissionForJudging & { fetchedContent?: string })[],
  judgingConfig: JudgingCriteria
): Promise<{ winnerId: string; scores: Record<string, { score: number; reasoning: string }> }> {
  if (!anthropic) throw new Error("Anthropic not configured");

  const messageContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  // Add judging prompt
  messageContent.push({
    type: "text",
    text: buildJudgingPrompt(taskTitle, taskDescription, judgingConfig, submissions.length),
  });

  // Add each submission
  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];

    messageContent.push({
      type: "text",
      text: `\n---\n## Submission ${i + 1}\n**ID:** ${sub.id}\n**Submitter:** ${sub.submitter.name || sub.submitter.walletAddress.slice(0, 8)}\n**Type:** ${sub.type}\n`,
    });

    // Add fetched content if available (X posts, GitHub info)
    if (sub.fetchedContent) {
      messageContent.push({
        type: "text",
        text: `**Fetched Content:**\n${sub.fetchedContent}\n`,
      });
    }

    // Handle images
    if (sub.type === "IMAGE" || isImageUrl(sub.content)) {
      const base64 = await fetchImageAsBase64(sub.content);
      if (base64) {
        messageContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: getImageMediaType(sub.content),
            data: base64,
          },
        });
      } else {
        messageContent.push({
          type: "text",
          text: `[Image could not be loaded: ${sub.content}]`,
        });
      }
    } else if (!sub.fetchedContent) {
      // Text/link content (only if not already shown as fetched content)
      messageContent.push({
        type: "text",
        text: `**Content:**\n${sub.content}`,
      });
    }
  }

  // Final instruction
  messageContent.push({
    type: "text",
    text: `\n---\n\n## Your Judgment\nNow evaluate all ${submissions.length} submissions and respond with JSON:
\`\`\`json
{
  "winnerId": "id_of_best_submission",
  "scores": {
    "submission_id": {
      "score": 0-100,
      "reasoning": "Specific explanation referencing the criteria"
    }
  }
}
\`\`\`

Be thorough and fair. The best submission should win!`,
  });

  console.log(`[Judge] Analyzing ${submissions.length} submissions with vision...`);

  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 4096,
    messages: [{ role: "user", content: messageContent }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  try {
    const result = JSON.parse(jsonMatch[0]);
    // Validate result has required fields
    if (!result.winnerId || !result.scores) {
      throw new Error("Invalid response structure");
    }
    return result;
  } catch (parseError) {
    console.error("[Judge] Failed to parse AI response:", parseError);
    throw new Error("Failed to parse AI judgment response");
  }
}

/**
 * Judge text-based submissions with Claude
 */
async function judgeWithClaude(
  taskTitle: string,
  taskDescription: string,
  submissions: (SubmissionForJudging & { fetchedContent?: string })[],
  judgingConfig: JudgingCriteria
): Promise<{ winnerId: string; scores: Record<string, { score: number; reasoning: string }> }> {
  if (!anthropic) throw new Error("Anthropic not configured");

  const prompt = `${buildJudgingPrompt(taskTitle, taskDescription, judgingConfig, submissions.length)}

## Submissions

${submissions
  .map(
    (s, i) => `### Submission ${i + 1}
**ID:** ${s.id}
**Submitter:** ${s.submitter.name || s.submitter.walletAddress.slice(0, 8)}
**Type:** ${s.type}
${s.fetchedContent ? `**Fetched Content:**\n${s.fetchedContent}\n` : ""}
**Original Content:**
${s.content}
`
  )
  .join("\n---\n")}

---

## Your Judgment
Evaluate all submissions and respond with JSON:
\`\`\`json
{
  "winnerId": "id_of_best_submission",
  "scores": {
    "submission_id": {
      "score": 0-100,
      "reasoning": "Specific explanation referencing the criteria"
    }
  }
}
\`\`\`

Be thorough and fair!`;

  console.log(`[Judge] Analyzing ${submissions.length} text submissions...`);

  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  try {
    const result = JSON.parse(jsonMatch[0]);
    // Validate result has required fields
    if (!result.winnerId || !result.scores) {
      throw new Error("Invalid response structure");
    }
    return result;
  } catch (parseError) {
    console.error("[Judge] Failed to parse AI response:", parseError);
    throw new Error("Failed to parse AI judgment response");
  }
}
