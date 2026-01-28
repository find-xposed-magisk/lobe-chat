'use client';

import { Flexbox, Icon, Tabs, Tag } from '@lobehub/ui';
import { BookOpenIcon, ListIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { styles } from './styles';

export type TabKey = 'overview' | 'tools';

interface NavProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  toolsCount: number;
}

const Nav = memo<NavProps>(({ activeTab, setActiveTab, toolsCount }) => {
  const { t } = useTranslation(['plugin']);

  return (
    <Flexbox className={styles.nav}>
      <Tabs
        activeKey={activeTab}
        items={[
          {
            icon: <Icon icon={BookOpenIcon} size={16} />,
            key: 'overview',
            label: t('integrationDetail.tabs.overview'),
          },
          {
            icon: <Icon icon={ListIcon} size={16} />,
            key: 'tools',
            label: (
              <Flexbox align="center" gap={6} horizontal style={{ display: 'inline-flex' }}>
                {t('integrationDetail.tabs.tools')}
                {toolsCount > 0 && <Tag>{toolsCount}</Tag>}
              </Flexbox>
            ),
          },
        ]}
        onChange={(key) => setActiveTab(key as TabKey)}
      />
    </Flexbox>
  );
});

export default Nav;
