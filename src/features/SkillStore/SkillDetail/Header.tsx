'use client';

import { Flexbox, Icon, Text, useModalContext } from '@lobehub/ui';
import { Button } from 'antd';
import { cssVar } from 'antd-style';
import { Loader2, SquareArrowOutUpRight } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useSkillConnect } from '@/features/SkillStore/LobeHubList/useSkillConnect';

import { useDetailContext } from './DetailContext';
import { ICON_SIZE, styles } from './styles';

interface HeaderProps {
  type: 'klavis' | 'lobehub';
}

const Header = memo<HeaderProps>(({ type }) => {
  const { t } = useTranslation(['setting']);
  const { close } = useModalContext();
  const { identifier, serverName, icon, label, localizedDescription, isConnected } =
    useDetailContext();

  const {
    handleConnect,
    isConnecting,
    isConnected: hookIsConnected,
  } = useSkillConnect({
    identifier,
    serverName,
    type,
  });

  const hasTriggeredConnectRef = useRef(false);

  useEffect(() => {
    if (hasTriggeredConnectRef.current && hookIsConnected) {
      close();
    }
  }, [hookIsConnected, close]);

  const handleConnectWithTracking = async () => {
    hasTriggeredConnectRef.current = true;
    await handleConnect();
  };

  const renderIcon = () => {
    if (typeof icon === 'string') {
      return (
        <img
          alt={label}
          src={icon}
          style={{ maxHeight: ICON_SIZE, maxWidth: ICON_SIZE, objectFit: 'contain' }}
        />
      );
    }
    return <Icon fill={cssVar.colorText} icon={icon as any} size={ICON_SIZE} />;
  };

  const renderConnectButton = () => {
    if (isConnected) return null;

    if (isConnecting) {
      return (
        <Button disabled icon={<Icon icon={Loader2} spin />} type="default">
          {t('tools.klavis.connect', { defaultValue: 'Connect' })}
        </Button>
      );
    }

    return (
      <Button
        icon={<Icon icon={SquareArrowOutUpRight} />}
        onClick={handleConnectWithTracking}
        type="primary"
      >
        {t('tools.klavis.connect', { defaultValue: 'Connect' })}
      </Button>
    );
  };

  return (
    <Flexbox
      align="center"
      className={styles.header}
      horizontal
      justify="space-between"
      style={{ flexWrap: 'nowrap' }}
    >
      <Flexbox align="center" gap={16} horizontal>
        <div className={styles.icon}>{renderIcon()}</div>
        <Flexbox gap={4}>
          <span className={styles.title}>{label}</span>
          <Text style={{ fontSize: 14 }} type="secondary">
            {localizedDescription}
          </Text>
        </Flexbox>
      </Flexbox>
      {renderConnectButton()}
    </Flexbox>
  );
});

export default Header;
