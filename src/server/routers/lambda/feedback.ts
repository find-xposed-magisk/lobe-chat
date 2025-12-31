import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { UserModel } from '@/database/models/user';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const submitFeedbackSchema = z.object({
  clientInfo: z
    .object({
      language: z.string().optional(),
      screenResolution: z.string().optional(),
      timezone: z.string().optional(),
      url: z.string().optional(),
      userAgent: z.string().optional(),
      viewport: z.string().optional(),
    })
    .optional(),
  message: z.string().min(1).max(5000),
  screenshotUrl: z.string().url().optional(),
  title: z.string().min(1).max(200),
});

const feedbackProcedure = authedProcedure.use(serverDatabase).use(async ({ ctx, next }) => {
  return next({
    ctx: {
      userModel: new UserModel(ctx.serverDB, ctx.userId),
    },
  });
});

// Linear GraphQL API helper
async function createLinearIssue(params: {
  description: string;
  labelIds?: string[];
  teamId: string;
  title: string;
}): Promise<{ id: string; url: string }> {
  const LINEAR_API_KEY = process.env.LINEAR_API_KEY;

  if (!LINEAR_API_KEY) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Linear API key not configured',
    });
  }

  const query = `
    mutation IssueCreate($title: String!, $description: String!, $teamId: String!, $labelIds: [String!]) {
      issueCreate(input: {
        title: $title
        description: $description
        teamId: $teamId
        labelIds: $labelIds
      }) {
        success
        issue {
          id
          url
        }
      }
    }
  `;

  const variables: Record<string, any> = {
    description: params.description,
    teamId: params.teamId,
    title: params.title,
  };

  // Only include labelIds if provided
  if (params.labelIds && params.labelIds.length > 0) {
    variables.labelIds = params.labelIds;
  }

  const response = await fetch('https://api.linear.app/graphql', {
    body: JSON.stringify({ query, variables }),
    headers: {
      'Authorization': LINEAR_API_KEY,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Linear API error: ${response.statusText}`,
    });
  }

  const result: any = await response.json();

  if (result.errors) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Linear GraphQL error: ${result.errors[0]?.message}`,
    });
  }

  if (!result.data?.issueCreate?.success) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create Linear issue',
    });
  }

  return result.data.issueCreate.issue;
}

export const feedbackRouter = router({
  submitFeedback: feedbackProcedure.input(submitFeedbackSchema).mutation(async ({ ctx, input }) => {
    const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID;

    if (!LINEAR_TEAM_ID) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Linear team ID not configured',
      });
    }

    // 1. Get user email
    const userState = await ctx.userModel.getUserState(async () => ({}));

    // 2. Build description with email, screenshot, and client info
    let description = input.message;

    // Add user email
    if (userState.email) {
      description += `\n\n---\n**Submitted by**: ${userState.email}`;
    }

    // Add screenshot
    if (input.screenshotUrl) {
      description += `\n\n**Screenshot**: ${input.screenshotUrl}`;
    }

    // Add client information as a table
    if (input.clientInfo) {
      description += '\n\n## System Information\n\n';
      description += '| Property | Value |\n';
      description += '|----------|-------|\n';
      if (input.clientInfo.url) description += `| URL | ${input.clientInfo.url} |\n`;
      if (input.clientInfo.userAgent)
        description += `| User Agent | ${input.clientInfo.userAgent} |\n`;
      if (input.clientInfo.language)
        description += `| Language | ${input.clientInfo.language} |\n`;
      if (input.clientInfo.timezone)
        description += `| Timezone | ${input.clientInfo.timezone} |\n`;
      if (input.clientInfo.screenResolution)
        description += `| Screen | ${input.clientInfo.screenResolution} |\n`;
      if (input.clientInfo.viewport)
        description += `| Viewport | ${input.clientInfo.viewport} |\n`;
    }

    // 3. Get label ID if configured
    const LINEAR_FEEDBACK_LABEL_ID = process.env.LINEAR_FEEDBACK_LABEL_ID;
    const labelIds = LINEAR_FEEDBACK_LABEL_ID ? [LINEAR_FEEDBACK_LABEL_ID] : undefined;

    // 4. Create Linear issue via GraphQL API
    const issue = await createLinearIssue({
      description,
      labelIds,
      teamId: LINEAR_TEAM_ID,
      title: input.title,
    });

    return { issueId: issue.id, issueUrl: issue.url, success: true };
  }),
});

export type FeedbackRouter = typeof feedbackRouter;
