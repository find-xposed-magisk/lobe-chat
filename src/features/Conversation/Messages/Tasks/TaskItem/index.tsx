'use client';

import { Icon } from '@lobehub/ui';
import { Check, ChevronDown, Loader2, XCircle } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ThreadStatus } from '@/types/index';
import type { UIChatMessage } from '@/types/index';

import CompletedState from './CompletedState';
import ProcessingState from './ProcessingState';
import { styles } from './styles';

interface TaskItemProps {
  item: UIChatMessage;
}

const TaskItem = memo<TaskItemProps>(({ item }) => {
  const { t } = useTranslation('chat');
  const { id, content, metadata, taskDetail } = item;
  const [expanded, setExpanded] = useState(false);

  const title = taskDetail?.title || metadata?.taskTitle;
  const instruction = metadata?.instruction;
  const status = taskDetail?.status;

  // Check if task is processing
  const isProcessing =
    status === ThreadStatus.Processing ||
    status === ThreadStatus.InReview ||
    status === ThreadStatus.Pending ||
    status === ThreadStatus.Active ||
    status === ThreadStatus.Todo;

  const isCompleted = status === ThreadStatus.Completed;
  const isError = status === ThreadStatus.Failed || status === ThreadStatus.Cancel;
  const isInitializing = !taskDetail || !status;

  const hasContent = content && content.trim().length > 0;

  const getStatusIcon = () => {
    if (isCompleted) {
      return (
        <div className={`${styles.statusIcon} ${styles.statusIconCompleted}`}>
          <Check size={10} strokeWidth={3} />
        </div>
      );
    }
    if (isError) {
      return (
        <div className={`${styles.statusIcon} ${styles.statusIconError}`}>
          <XCircle size={10} />
        </div>
      );
    }
    if (isProcessing || isInitializing) {
      return (
        <div className={`${styles.statusIcon} ${styles.statusIconProcessing}`}>
          <Icon icon={Loader2} size={10} spin />
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.container}>
      {/* Header Row: Status Icon + Title/Instruction + Expand Toggle */}
      <div className={styles.headerRow}>
        {getStatusIcon()}
        <div className={styles.titleRow}>
          {title && <div className={styles.title}>{title}</div>}
          {instruction && <div className={styles.instruction}>{instruction}</div>}
        </div>
        {/* Expand/Collapse Toggle - only show for completed tasks with content */}
        {isCompleted && hasContent && (
          <div className={styles.expandToggle} onClick={() => setExpanded(!expanded)}>
            <ChevronDown
              size={14}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
            <span>{expanded ? t('messageAction.collapse') : t('messageAction.expand')}</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className={styles.mainContent}>
        {/* Initializing State - no taskDetail yet */}
        {isInitializing && (
          <div className={styles.initializingText}>{t('task.status.initializing')}</div>
        )}

        {/* Processing State */}
        {!isInitializing && isProcessing && taskDetail && (
          <ProcessingState messageId={id} taskDetail={taskDetail} />
        )}

        {/* Completed State */}
        {!isInitializing && isCompleted && taskDetail && (
          <CompletedState content={content} expanded={expanded} taskDetail={taskDetail} />
        )}
      </div>
    </div>
  );
}, Object.is);

TaskItem.displayName = 'TaskItem';

export default TaskItem;
