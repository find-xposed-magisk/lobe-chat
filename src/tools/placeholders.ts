import { LocalSystemApiName, LocalSystemManifest } from '@lobechat/builtin-tool-local-system';
import {
  WebBrowsingManifest,
  WebBrowsingPlaceholders,
} from '@lobechat/builtin-tool-web-browsing/client';
import { type BuiltinPlaceholder } from '@lobechat/types';

import { ListFiles as LocalSystemListFiles } from './local-system/Placeholder/ListFiles';
import LocalSystemSearchFiles from './local-system/Placeholder/SearchFiles';

/**
 * Builtin tools placeholders registry
 * Organized by toolset (identifier) -> API name
 */
export const BuiltinToolPlaceholders: Record<string, Record<string, any>> = {
  [LocalSystemManifest.identifier]: {
    [LocalSystemApiName.searchLocalFiles]: LocalSystemSearchFiles,
    [LocalSystemApiName.listLocalFiles]: LocalSystemListFiles,
  },
  [WebBrowsingManifest.identifier]: WebBrowsingPlaceholders as Record<string, any>,
};

/**
 * Get builtin placeholder component for a specific API
 * @param identifier - Tool identifier (e.g., 'lobe-local-system')
 * @param apiName - API name (e.g., 'searchLocalFiles')
 */
export const getBuiltinPlaceholder = (
  identifier?: string,
  apiName?: string,
): BuiltinPlaceholder | undefined => {
  if (!identifier || !apiName) return undefined;

  const toolset = BuiltinToolPlaceholders[identifier];
  if (!toolset) return undefined;

  return toolset[apiName];
};
