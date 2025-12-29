'use client';

import isEqual from 'fast-deep-equal';
import { type MouseEventHandler, memo, useCallback } from 'react';

import { MESSAGE_ACTION_BAR_PORTAL_ATTRIBUTES } from '@/const/messageActionPortal';
import { ChatItem } from '@/features/Conversation/ChatItem';
import { useNewScreen } from '@/features/Conversation/Messages/components/useNewScreen';

import { useAgentMeta } from '../../hooks';
import { dataSelectors, messageStateSelectors, useConversationStore } from '../../store';
import {
  useSetMessageItemActionElementPortialContext,
  useSetMessageItemActionTypeContext,
} from '../Contexts/message-action-context';
import Usage from '../components/Extras/Usage';
import MessageBranch from '../components/MessageBranch';
import Group from './components/Group';

const actionBarHolder = (
  <div
    {...{ [MESSAGE_ACTION_BAR_PORTAL_ATTRIBUTES.assistantGroup]: '' }}
    style={{ height: '28px' }}
  />
);
interface GroupMessageProps {
  disableEditing?: boolean;
  id: string;
  index: number;
  isLatestItem?: boolean;
}

const GroupMessage = memo<GroupMessageProps>(({ id, index, disableEditing, isLatestItem }) => {
  // Get message and actionsConfig from ConversationStore
  const item = useConversationStore(dataSelectors.getDisplayMessageById(id), isEqual)!;

  const { agentId, usage, createdAt, children, performance, model, provider, branch } = item;
  const avatar = useAgentMeta(agentId);

  // Get editing state from ConversationStore
  const creating = useConversationStore(messageStateSelectors.isMessageCreating(id));
  const newScreen = useNewScreen({ creating, isLatestItem });

  const setMessageItemActionElementPortialContext = useSetMessageItemActionElementPortialContext();
  const setMessageItemActionTypeContext = useSetMessageItemActionTypeContext();

  const onMouseEnter: MouseEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (disableEditing) return;
      setMessageItemActionElementPortialContext(e.currentTarget);
      setMessageItemActionTypeContext({ id, index, type: 'assistantGroup' });
    },
    [
      disableEditing,
      id,
      index,
      setMessageItemActionElementPortialContext,
      setMessageItemActionTypeContext,
    ],
  );

  return (
    <ChatItem
      actions={
        !disableEditing && (
          <>
            {branch && (
              <MessageBranch
                activeBranchIndex={branch.activeBranchIndex}
                count={branch.count}
                messageId={id}
              />
            )}
            {actionBarHolder}
          </>
        )
      }
      avatar={avatar}
      newScreen={newScreen}
      onMouseEnter={onMouseEnter}
      placement={'left'}
      showTitle
      time={createdAt}
    >
      {children && children.length > 0 && (
        <Group blocks={children} disableEditing={disableEditing} id={id} messageIndex={index} />
      )}
      {model && (
        <Usage model={model} performance={performance} provider={provider!} usage={usage} />
      )}
    </ChatItem>
  );
}, isEqual);

export default GroupMessage;
