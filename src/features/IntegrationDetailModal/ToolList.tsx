'use client';

import { Block, Collapse, Empty, Flexbox, Highlighter, Icon, Markdown, Text } from '@lobehub/ui';
import { Loader2, Wrench } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToolStore } from '@/store/tool';

import { useDetailContext } from './DetailProvider';
import { styles } from './styles';

interface ToolItem {
  description?: string;
  inputSchema?: any;
  name: string;
}

const ToolList = memo(() => {
  const { t } = useTranslation(['plugin', 'discover']);
  const { type, identifier, serverName } = useDetailContext();
  const [activeKey, setActiveKey] = useState<string[]>([]);

  // Fetch tools using SWR hooks from store
  const { data: klavisTools = [], isLoading: klavisToolsLoading } = useToolStore((s) =>
    s.useFetchServerTools(type === 'klavis' ? serverName : undefined),
  );
  const { data: lobehubTools = [], isLoading: lobehubToolsLoading } = useToolStore((s) =>
    s.useFetchProviderTools(type === 'lobehub' ? identifier : undefined),
  );

  const tools: ToolItem[] = type === 'klavis' ? klavisTools : lobehubTools;
  const isLoading = type === 'klavis' ? klavisToolsLoading : lobehubToolsLoading;

  if (isLoading) {
    return (
      <Flexbox align="center" justify="center" style={{ minHeight: 200 }}>
        <Icon icon={Loader2} size={24} spin />
      </Flexbox>
    );
  }

  if (tools.length === 0) {
    return (
      <Block variant="outlined">
        <Empty
          description={t('mcpEmpty.tools')}
          descriptionProps={{ fontSize: 14 }}
          icon={Wrench}
          style={{ maxWidth: 400 }}
        />
      </Block>
    );
  }

  return (
    <Collapse
      activeKey={activeKey}
      expandIconPlacement="end"
      gap={8}
      items={tools.map((item) => ({
        children: (
          <Flexbox gap={16}>
            {item.description && (
              <Flexbox gap={8}>
                <span className={styles.sectionTitle}>
                  {t('mcp.details.schema.tools.instructions', { ns: 'discover' })}
                </span>
                <Markdown>{item.description}</Markdown>
              </Flexbox>
            )}
            {item.inputSchema && (
              <Flexbox gap={8}>
                <span className={styles.sectionTitle}>
                  {t('mcp.details.schema.tools.inputSchema', { ns: 'discover' })}
                </span>
                <Highlighter language="json" style={{ fontSize: 12 }} variant="borderless">
                  {JSON.stringify(item.inputSchema, null, 2)}
                </Highlighter>
              </Flexbox>
            )}
          </Flexbox>
        ),
        desc: item.description && (
          <Text ellipsis style={{ maxWidth: 500 }} type="secondary">
            {item.description}
          </Text>
        ),
        key: item.name,
        label: <span className={styles.code}>{item.name}</span>,
      }))}
      onChange={setActiveKey}
      variant="outlined"
    />
  );
});

export default ToolList;
