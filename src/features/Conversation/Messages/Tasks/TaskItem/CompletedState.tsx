'use client';

import { type TaskDetail } from '@lobechat/types';
import { Flexbox, Markdown } from '@lobehub/ui';
import { Footprints, Timer, Wrench } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { styles } from './styles';

interface CompletedStateProps {
  content?: string;
  expanded?: boolean;
  taskDetail: TaskDetail;
}

const CompletedState = memo<CompletedStateProps>(({ taskDetail, content, expanded }) => {
  const { t } = useTranslation('chat');

  const { duration, totalToolCalls, totalSteps, totalCost } = taskDetail;

  // Format duration
  const formattedDuration = useMemo(() => {
    if (!duration) return null;
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60_000) return `${(duration / 1000).toFixed(1)}s`;
    const minutes = Math.floor(duration / 60_000);
    const seconds = ((duration % 60_000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }, [duration]);

  // Format cost
  const formattedCost = useMemo(() => {
    if (!totalCost) return null;
    if (totalCost < 0.01) return `$${totalCost.toFixed(4)}`;
    return `$${totalCost.toFixed(2)}`;
  }, [totalCost]);

  const hasContent = content && content.trim().length > 0;
  const hasMetrics =
    formattedDuration ||
    (totalSteps !== undefined && totalSteps > 0) ||
    (totalToolCalls !== undefined && totalToolCalls > 0) ||
    formattedCost;

  return (
    <Flexbox gap={8}>
      {/* Metrics Row */}
      {hasMetrics && (
        <Flexbox align="center" gap={12} horizontal justify="space-between" wrap="wrap">
          {/* Left side: Duration */}
          <Flexbox align="center" gap={8} horizontal>
            {formattedDuration && (
              <div className={styles.metricItem}>
                <Timer size={12} />
                <span className={styles.metricValue}>{formattedDuration}</span>
              </div>
            )}
          </Flexbox>

          {/* Right side: Steps, Tool Calls, Cost */}
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
            {formattedCost && (
              <>
                {((totalSteps !== undefined && totalSteps > 0) ||
                  (totalToolCalls !== undefined && totalToolCalls > 0)) && (
                  <div className={styles.separator} />
                )}
                <div className={styles.metricItem}>
                  <span className={styles.metricValue}>{formattedCost}</span>
                </div>
              </>
            )}
          </Flexbox>
        </Flexbox>
      )}

      {/* Expanded Content */}
      {hasContent && expanded && (
        <div className={styles.collapseContent}>
          <Markdown>{content}</Markdown>
        </div>
      )}
    </Flexbox>
  );
});

CompletedState.displayName = 'CompletedState';

export default CompletedState;
