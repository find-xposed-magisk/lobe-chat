'use client';

import { Flexbox } from '@lobehub/ui';
import type { Klavis } from 'klavis';
import { useState } from 'react';

import { useToolStore } from '@/store/tool';

import { DetailProvider, type IntegrationType } from './DetailProvider';
import Header from './Header';
import Nav, { type TabKey } from './Nav';
import Overview from './Overview';
import ToolList from './ToolList';

export type { IntegrationType } from './DetailProvider';

export interface IntegrationDetailContentProps {
  identifier: string;
  serverName?: Klavis.McpServerName;
  type: IntegrationType;
}

export const IntegrationDetailContent = ({
  type,
  identifier,
  serverName,
}: IntegrationDetailContentProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Fetch tools count for Nav badge (always fetch to show count in tab)
  const { data: klavisTools = [] } = useToolStore((s) =>
    s.useFetchServerTools(type === 'klavis' ? serverName : undefined),
  );
  const { data: lobehubTools = [] } = useToolStore((s) =>
    s.useFetchProviderTools(type === 'lobehub' ? identifier : undefined),
  );
  const toolsCount = type === 'klavis' ? klavisTools.length : lobehubTools.length;

  return (
    <DetailProvider identifier={identifier} serverName={serverName} type={type}>
      <Flexbox gap={16}>
        <Header />
        <Nav activeTab={activeTab} setActiveTab={setActiveTab} toolsCount={toolsCount} />
        {activeTab === 'overview' ? <Overview /> : <ToolList />}
      </Flexbox>
    </DetailProvider>
  );
};
