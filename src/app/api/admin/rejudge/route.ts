/**
 * Admin endpoint to re-judge a completed task with proper AI analysis
 * POST /api/admin/rejudge
 * Body: { taskId: string }
 * Requires ADMIN_API_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120; // 2 minutes for image processing

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Fetch image as base64
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    const mediaType = contentType.includes('png') ? 'image/png' : 
                     contentType.includes('gif') ? 'image/gif' : 
                     contentType.includes('webp') ? 'image/webp' : 'image/jpeg';
    
    return { base64, mediaType };
  } catch (error) {
    console.error(`Failed to fetch image from ${url}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin auth
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!anthropic) {
      return NextResponse.json({ error: "Anthropic API not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    // Get task with submissions
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        submissions: {
          include: {
            submitter: true
          }
        }
      }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.submissions.length === 0) {
      return NextResponse.json({ error: "No submissions to judge" }, { status: 400 });
    }

    console.log(`[Rejudge] Starting rejudge for task: ${task.title} (${task.id})`);
    console.log(`[Rejudge] Submissions: ${task.submissions.length}`);

    // Build content array with images
    const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
    
    // Add text intro
    content.push({
      type: 'text',
      text: `You are judging submissions for a task.

Task: ${task.title}
Description: ${task.description}
Category: ${task.category}
Submission Type: ${task.submissionType}

Please analyze each submission and judge them based on:
1. Quality and creativity
2. Relevance to the task requirements
3. Effort and execution
4. Overall impact

I will show you each submission with its ID and submitter name.`
    });

    // Add each submission
    for (let i = 0; i < task.submissions.length; i++) {
      const sub = task.submissions[i];
      const submitterName = sub.submitter.name || sub.submitter.walletAddress.slice(0, 8);
      
      content.push({
        type: 'text',
        text: `\n\nSubmission ${i + 1} (ID: ${sub.id}) by ${submitterName}:`
      });

      // Handle different submission types - content field stores the URL or text
      if (task.submissionType === 'IMAGE' && sub.content) {
        // For images, content contains the image URL (could be data URL or http URL)
        const imageData = await fetchImageAsBase64(sub.content);
        if (imageData) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageData.base64
            }
          });
          console.log(`[Rejudge] Loaded image for submission ${i + 1}`);
        } else {
          content.push({
            type: 'text',
            text: `[Image could not be loaded from URL]`
          });
        }
      } else if (task.submissionType === 'LINK' && sub.content) {
        content.push({
          type: 'text',
          text: `Link: ${sub.content}`
        });
      } else if (sub.content) {
        content.push({
          type: 'text',
          text: `Content: ${sub.content}`
        });
      }
    }

    // Build the expected JSON structure
    const submissionIds = task.submissions.map(s => `"${s.id}": { "score": 0-100, "reasoning": "detailed explanation" }`).join(',\n    ');

    // Add final instruction
    content.push({
      type: 'text',
      text: `

Now please judge all submissions. For each one, provide a score from 0-100 and detailed reasoning explaining your evaluation.

Return your response as JSON with this exact format:
{
  "winner_id": "the ID of the best submission",
  "scores": {
    ${submissionIds}
  }
}`
    });

    console.log(`[Rejudge] Calling Claude...`);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log(`[Rejudge] Claude response received`);

    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Rejudge] No JSON found in response:', text);
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`[Rejudge] Winner: ${result.winner_id}`);

    // Update submissions with new scores and reasoning
    const updates = [];
    for (const sub of task.submissions) {
      const scoreData = result.scores[sub.id];
      if (scoreData) {
        updates.push({
          id: sub.id,
          submitter: sub.submitter.name || sub.submitter.walletAddress.slice(0, 8),
          score: scoreData.score,
          reasoning: scoreData.reasoning,
          isWinner: sub.id === result.winner_id
        });

        await prisma.submission.update({
          where: { id: sub.id },
          data: {
            score: scoreData.score,
            aiReasoning: scoreData.reasoning,
            isWinner: sub.id === result.winner_id
          }
        });
      }
    }

    console.log(`[Rejudge] Updated ${updates.length} submissions`);

    return NextResponse.json({
      success: true,
      taskId: task.id,
      taskTitle: task.title,
      winnerId: result.winner_id,
      updates
    });

  } catch (error) {
    console.error("[Rejudge] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rejudge failed" },
      { status: 500 }
    );
  }
}
