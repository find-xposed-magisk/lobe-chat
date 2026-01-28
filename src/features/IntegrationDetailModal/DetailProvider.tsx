'use client';

import {
  type KlavisServerType,
  type LobehubSkillProviderType,
  getKlavisServerByServerIdentifier,
  getLobehubSkillProviderById,
} from '@lobechat/const';
import type { Klavis } from 'klavis';
import React, { type ReactNode, createContext, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useToolStore } from '@/store/tool';
import { klavisStoreSelectors, lobehubSkillStoreSelectors } from '@/store/tool/selectors';
import { KlavisServerStatus } from '@/store/tool/slices/klavisStore';
import { LobehubSkillStatus } from '@/store/tool/slices/lobehubSkillStore/types';

export type IntegrationType = 'klavis' | 'lobehub';

export interface DetailContextValue {
  author: string;
  authorUrl?: string;
  config: KlavisServerType | LobehubSkillProviderType;
  description: string;
  icon: string | React.ComponentType<any>;
  identifier: string;
  introduction: string;
  isConnected: boolean;
  label: string;
  localizedDescription: string;
  localizedIntroduction: string;
  serverName?: Klavis.McpServerName;
  type: IntegrationType;
}

const DetailContext = createContext<DetailContextValue | null>(null);

export const useDetailContext = () => {
  const context = useContext(DetailContext);
  if (!context) {
    throw new Error('useDetailContext must be used within DetailProvider');
  }
  return context;
};

interface DetailProviderProps {
  children: ReactNode;
  identifier: string;
  serverName?: Klavis.McpServerName;
  type: IntegrationType;
}

export const DetailProvider = ({ children, type, identifier, serverName }: DetailProviderProps) => {
  const { t } = useTranslation(['setting']);

  const config = useMemo((): KlavisServerType | LobehubSkillProviderType | undefined => {
    if (type === 'klavis') {
      return getKlavisServerByServerIdentifier(identifier);
    }
    return getLobehubSkillProviderById(identifier);
  }, [type, identifier]);

  const klavisServers = useToolStore(klavisStoreSelectors.getServers);
  const lobehubSkillServers = useToolStore(lobehubSkillStoreSelectors.getServers);

  const serverState = useMemo(() => {
    if (type === 'klavis') {
      return klavisServers.find((s) => s.identifier === identifier);
    }
    return lobehubSkillServers.find((s) => s.identifier === identifier);
  }, [type, identifier, klavisServers, lobehubSkillServers]);

  const isConnected = useMemo(() => {
    if (!serverState) return false;
    if (type === 'klavis') {
      return serverState.status === KlavisServerStatus.CONNECTED;
    }
    return serverState.status === LobehubSkillStatus.CONNECTED;
  }, [type, serverState]);

  if (!config) return null;

  const { author, authorUrl, description, icon, introduction, label } = config;

  const i18nIdentifier =
    type === 'klavis'
      ? (config as KlavisServerType).identifier
      : (config as LobehubSkillProviderType).id;
  const i18nPrefix = type === 'klavis' ? 'tools.klavis.servers' : 'tools.lobehubSkill.providers';

  const localizedDescription = t(`${i18nPrefix}.${i18nIdentifier}.description`, {
    defaultValue: description,
  });
  const localizedIntroduction = t(`${i18nPrefix}.${i18nIdentifier}.introduction`, {
    defaultValue: introduction,
  });

  const value: DetailContextValue = {
    author,
    authorUrl,
    config,
    description,
    icon,
    identifier,
    introduction,
    isConnected,
    label,
    localizedDescription,
    localizedIntroduction,
    serverName,
    type,
  };

  return <DetailContext.Provider value={value}>{children}</DetailContext.Provider>;
};
