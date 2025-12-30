'use client';

import { type TaskCurrentActivity, type TaskDetail } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { Footprints, Loader2, Timer, Wrench } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';

import { styles } from './styles';

// Progress increases by 5% every 30 seconds, max 95%
const PROGRESS_INTERVAL = 30_000;
const PROGRESS_INCREMENT = 5;
const MAX_PROGRESS = 95;

// Format elapsed time as mm:ss or hh:mm:ss
const formatElapsedTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

// Format tool name from identifier and apiName
const formatToolName = (activity: TaskCurrentActivity): string => {
  if (activity.identifier && activity.apiName) {
    return `${activity.identifier}/${activity.apiName}`;
  }
  return activity.identifier || activity.apiName || '';
};

interface ProcessingStateProps {
  messageId: string;
  taskDetail: TaskDetail;
}

const ProcessingState = memo<ProcessingStateProps>(({ taskDetail, messageId }) => {
  const { t } = useTranslation('chat');
  const [progress, setProgress] = useState(5);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Get polling hook and check if there's an active operation polling
  const [useEnablePollingTaskStatus, operations] = useChatStore((s) => [
    s.useEnablePollingTaskStatus,
    s.operations,
  ]);

  // Check if exec_async_task is already polling for this message
  const hasActiveOperationPolling = Object.values(operations).some(
    (op) =>
      op.status === 'running' &&
      op.type === 'execAgentRuntime' &&
      op.context?.messageId === messageId,
  );

  // Enable polling only when no active operation is already polling
  const { data } = useEnablePollingTaskStatus(
    taskDetail.threadId,
    messageId,
    !hasActiveOperationPolling,
  );

  const currentActivity = data?.currentActivity;
  const { totalToolCalls, totalSteps, startedAt } = taskDetail;

  // Calculate initial progress and elapsed time based on startedAt
  useEffect(() => {
    if (startedAt) {
      const startTime = new Date(startedAt).getTime();
      const elapsed = Math.max(0, Date.now() - startTime);
      const intervals = Math.floor(elapsed / PROGRESS_INTERVAL);
      const initialProgress = Math.min(5 + intervals * PROGRESS_INCREMENT, MAX_PROGRESS);
      setProgress(initialProgress);
      setElapsedTime(elapsed);
    }
  }, [startedAt]);

  // Timer for updating elapsed time every second
  useEffect(() => {
    if (!startedAt) return;

    const timer = setInterval(() => {
      const startTime = new Date(startedAt).getTime();
      setElapsedTime(Math.max(0, Date.now() - startTime));
    }, 1000);

    return () => clearInterval(timer);
  }, [startedAt]);

  // Progress timer - increment every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => Math.min(prev + PROGRESS_INCREMENT, MAX_PROGRESS));
    }, PROGRESS_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  // Render current activity text
  const renderActivityText = () => {
    if (!currentActivity) return null;

    switch (currentActivity.type) {
      case 'tool_calling': {
        const toolName = formatToolName(currentActivity);
        return toolName ? t('task.activity.toolCalling', { toolName }) : t('task.activity.calling');
      }
      case 'tool_result': {
        const toolName = formatToolName(currentActivity);
        return toolName
          ? t('task.activity.toolResult', { toolName })
          : t('task.activity.gotResult');
      }
      case 'generating': {
        return t('task.activity.generating');
      }
      default: {
        return null;
      }
    }
  };

  const hasMetrics =
    startedAt ||
    (totalSteps !== undefined && totalSteps > 0) ||
    (totalToolCalls !== undefined && totalToolCalls > 0);

  return (
    <Flexbox gap={8}>
      {/* Current Activity */}
      {currentActivity && (
        <Flexbox align="center" gap={8} horizontal>
          <Loader2 className={styles.spin} size={12} />
          <span className={styles.activityText}>{renderActivityText()}</span>
        </Flexbox>
      )}

      {/* Progress Bar */}
      <div className={styles.progress}>
        <div className={styles.progressBar} style={{ width: `${progress}%` }} />
        <div className={styles.progressShimmer} />
      </div>

      {/* Footer with metrics */}
      {hasMetrics && (
        <Flexbox
          align="center"
          className={styles.footer}
          gap={12}
          horizontal
          justify="space-between"
          wrap="wrap"
        >
          {/* Left side: Elapsed Time */}
          <Flexbox align="center" gap={8} horizontal>
            {startedAt && (
              <div className={styles.metricItem}>
                <Timer size={12} />
                <span className={styles.metricValue}>{formatElapsedTime(elapsedTime)}</span>
              </div>
            )}
          </Flexbox>

          {/* Right side: Steps, Tool Calls */}
          <Flexbox align="center" gap={12} horizontal>
            {totalSteps !== undefined && totalSteps > 0 && (
              <div className={styles.metricItem}>
                <Footprints size={12} />
                <span className={styles.metricValue}>{totalSteps}</span>
                <span>{t('task.metrics.stepsShort')}</span>
              </div>
            )}
            {totalToolCalls !== undefined && totalToolCalls > 0 && (
              <>
                {totalSteps !== undefined && totalSteps > 0 && <div className={styles.separator} />}
                <div className={styles.metricItem}>
                  <Wrench size={12} />
                  <span className={styles.metricValue}>{totalToolCalls}</span>
                  <span>{t('task.metrics.toolCallsShort')}</span>
                </div>
              </>
            )}
          </Flexbox>
        </Flexbox>
      )}
    </Flexbox>
  );
});

ProcessingState.displayName = 'ProcessingState';

export default ProcessingState;
