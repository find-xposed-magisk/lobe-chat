import { LayersEnum, MemorySourceType } from '@lobechat/types';
import { serve } from '@upstash/workflow/nextjs';

import {
  MemoryExtractionExecutor,
  type MemoryExtractionPayloadInput,
  normalizeMemoryExtractionPayload,
} from '@/server/services/memory/userMemory/extract';

const CEP_LAYERS: LayersEnum[] = [LayersEnum.Context, LayersEnum.Experience, LayersEnum.Preference];
const IDENTITY_LAYERS: LayersEnum[] = [LayersEnum.Identity];

export const { POST } = serve<MemoryExtractionPayloadInput>(async (context) => {
  const payload = normalizeMemoryExtractionPayload(context.requestPayload || {});

  console.log('[chat-topic][batch] Starting batch topic processing workflow', {
    topicIds: payload.topicIds,
    userIds: payload.userIds,
  });

  if (!payload.userIds.length) {
    return { message: 'No user id provided for topic batch.', processedTopics: 0, processedUsers: 0 };
  }
  if (!payload.topicIds.length) {
    return { message: 'No topic ids provided for extraction.', processedTopics: 0, processedUsers: 0 };
  }
  if (!payload.sources.includes(MemorySourceType.ChatTopic)) {
    return { message: 'Source not supported in topic batch.', processedTopics: 0, processedUsers: 0 };
  }

  const userId = payload.userIds[0];
  const executor = await MemoryExtractionExecutor.create();

  // CEP: run in parallel across the batch
  await Promise.all(
    payload.topicIds.map((topicId, index) =>
      context.run(
        `memory:user-memory:extract:users:${userId}:topics:${topicId}:cep:${index}`,
        () =>
          executor.extractTopic({
            forceAll: payload.forceAll,
            forceTopics: payload.forceTopics,
            from: payload.from,
            layers: CEP_LAYERS,
            source: MemorySourceType.ChatTopic,
            to: payload.to,
            topicId,
            userId,
          }),
      ),
    ),
  );

  // Identity: run sequentially for the batch
  for (const [index, topicId] of payload.topicIds.entries()) {
    await context.run(
      `memory:user-memory:extract:users:${userId}:topics:${topicId}:identity:${index}`,
      () =>
        executor.extractTopic({
          forceAll: payload.forceAll,
          forceTopics: payload.forceTopics,
          from: payload.from,
          layers: IDENTITY_LAYERS,
          source: MemorySourceType.ChatTopic,
          to: payload.to,
          topicId,
          userId,
        }),
    );
  }

  console.log('[chat-topic][batch] Batch topic processing workflow completed', {
    processedTopics: payload.topicIds.length,
  });

  return {
    processedTopics: payload.topicIds.length,
    processedUsers: payload.userIds.length,
  };
});
