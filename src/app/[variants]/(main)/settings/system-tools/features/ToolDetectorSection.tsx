'use client';

import { type ToolStatus } from '@lobechat/electron-client-ipc';
import {
  Button,
  CopyButton,
  Flexbox,
  Form,
  type FormGroupItemType,
  Icon,
  Skeleton,
  Tag,
  Text,
  Tooltip,
} from '@lobehub/ui';
import { CheckCircle2, Loader2Icon, RefreshCw, XCircle } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FORM_STYLE } from '@/const/layoutTokens';
import { toolDetectorService } from '@/services/electron/toolDetector';

/**
 * Predefined tool configurations by category
 * This allows us to always show all tools even if not detected
 */
const TOOL_CATEGORIES = {
  'content-search': {
    descKey: 'settingSystemTools.category.contentSearch.desc',
    titleKey: 'settingSystemTools.category.contentSearch',
    tools: [
      { descKey: 'settingSystemTools.tools.rg.desc', name: 'rg' },
      { descKey: 'settingSystemTools.tools.ag.desc', name: 'ag' },
      { descKey: 'settingSystemTools.tools.grep.desc', name: 'grep' },
    ],
  },
  'file-search': {
    descKey: 'settingSystemTools.category.fileSearch.desc',
    titleKey: 'settingSystemTools.category.fileSearch',
    tools: [
      { descKey: 'settingSystemTools.tools.mdfind.desc', name: 'mdfind' },
      { descKey: 'settingSystemTools.tools.fd.desc', name: 'fd' },
      { descKey: 'settingSystemTools.tools.find.desc', name: 'find' },
    ],
  },
} as const;

interface ToolStatusDisplayProps {
  isDetecting?: boolean;
  status?: ToolStatus;
}

const ToolStatusDisplay = memo<ToolStatusDisplayProps>(({ status, isDetecting }) => {
  const { t } = useTranslation('setting');

  if (isDetecting) {
    return (
      <Flexbox align="center" gap={8} horizontal>
        <Icon icon={Loader2Icon} size={16} spin style={{ opacity: 0.5 }} />
        <Text type="secondary">{t('settingSystemTools.detecting')}</Text>
      </Flexbox>
    );
  }

  if (!status) {
    return (
      <Flexbox align="center" gap={8} horizontal>
        <Icon color="var(--ant-color-text-quaternary)" icon={XCircle} size={16} />
        <Text type="secondary">{t('settingSystemTools.status.notDetected')}</Text>
      </Flexbox>
    );
  }

  return (
    <Flexbox align="center" gap={8} horizontal wrap="wrap">
      {status.available ? (
        <>
          <Icon color="var(--ant-color-success)" icon={CheckCircle2} size={16} />
          <Text type="success">{t('settingSystemTools.status.available')}</Text>
          {status.version && (
            <Tag color="processing" style={{ marginInlineStart: 4 }}>
              {status.version}
            </Tag>
          )}
          {status.path && (
            <Tooltip title={status.path}>
              <Flexbox align="center" gap={4} horizontal style={{ maxWidth: 200 }}>
                <Text ellipsis style={{ fontSize: 12 }} type="secondary">
                  {status.path}
                </Text>
                <CopyButton content={status.path} size="small" />
              </Flexbox>
            </Tooltip>
          )}
        </>
      ) : (
        <>
          <Icon color="var(--ant-color-error)" icon={XCircle} size={16} />
          <Text type="secondary">{t('settingSystemTools.status.unavailable')}</Text>
          {status.error && (
            <Tooltip title={status.error}>
              <Text ellipsis style={{ fontSize: 12, maxWidth: 200 }} type="secondary">
                ({status.error})
              </Text>
            </Tooltip>
          )}
        </>
      )}
    </Flexbox>
  );
});

const ToolDetectorSection = memo(() => {
  const { t } = useTranslation('setting');
  const [toolStatuses, setToolStatuses] = useState<Record<string, ToolStatus>>({});
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);

  const detectTools = useCallback(async (force = false) => {
    try {
      if (force) {
        setDetecting(true);
      }
      const statuses = await toolDetectorService.detectAllTools(force);
      setToolStatuses(statuses);
    } catch (error) {
      console.error('Failed to detect tools:', error);
    } finally {
      setLoading(false);
      setDetecting(false);
    }
  }, []);

  // Auto-detect on mount
  useEffect(() => {
    detectTools(true);
  }, [detectTools]);

  const handleRedetect = useCallback(() => {
    detectTools(true);
  }, [detectTools]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 8 }} title={false} />;
  }

  const formItems: FormGroupItemType[] = Object.entries(TOOL_CATEGORIES).map(
    ([, categoryConfig]) => ({
      children: categoryConfig.tools.map((tool) => ({
        children: <ToolStatusDisplay isDetecting={detecting} status={toolStatuses[tool.name]} />,
        desc: t(tool.descKey),
        label: tool.name,
        minWidth: undefined,
      })),
      desc: t(categoryConfig.descKey),
      title: t(categoryConfig.titleKey),
    }),
  );

  return (
    <Form
      collapsible={false}
      footer={
        <Flexbox
          align="center"
          gap={16}
          horizontal
          justify="flex-end"
          style={{ marginBlockStart: 8 }}
        >
          <Text type="secondary">{t('settingSystemTools.autoSelectDesc')}</Text>
          <Button
            icon={<Icon icon={RefreshCw} spin={detecting} />}
            loading={detecting}
            onClick={handleRedetect}
          >
            {t('settingSystemTools.redetect')}
          </Button>
        </Flexbox>
      }
      items={formItems}
      itemsType={'group'}
      variant={'filled'}
      {...FORM_STYLE}
    />
  );
});

export default ToolDetectorSection;
