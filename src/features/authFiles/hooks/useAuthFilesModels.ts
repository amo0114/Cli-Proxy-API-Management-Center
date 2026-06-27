import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useConfigStore, useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import { normalizeProviderKey } from '@/features/authFiles/constants';
import type { ModelAlias, OpenAIProviderConfig } from '@/types/provider';

type ModelsError = 'unsupported' | null;

const normalizeMatchText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const readTextField = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const readObjectField = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const isOpenCodeGoFile = (item: AuthFileItem): boolean =>
  normalizeProviderKey(String(item.type || item.provider || '')) === 'opencode-go';

const modelAliasToAuthFileModel = (model: ModelAlias): AuthFileModelItem | null => {
  const name = readTextField(model.name);
  if (!name) return null;
  return {
    id: name,
    display_name: readTextField(model.alias) || name,
    type: model.image ? 'image' : undefined,
  };
};

const isAuthFileModelItem = (model: AuthFileModelItem | null): model is AuthFileModelItem =>
  model !== null;

const buildOpenCodeGoMatchKeys = (item: AuthFileItem): Set<string> => {
  const credential = readObjectField(item.opencode_go);
  const values = [
    item.name,
    item.provider,
    item.type,
    item.authIndex,
    item['auth_index'],
    item.workspace_id,
    item.workspaceId,
    item.credential_id,
    item.credentialId,
    credential?.name,
    credential?.workspace_id,
    credential?.workspaceId,
    credential?.id,
    credential?.credential_id,
    credential?.credentialId,
  ];
  return new Set(values.map(normalizeMatchText).filter(Boolean));
};

const getProviderOpenCodeGoScore = (
  provider: OpenAIProviderConfig,
  matchKeys: Set<string>
): number => {
  const providerName = normalizeMatchText(provider.name);
  const providerPrefix = normalizeMatchText(provider.prefix);
  const providerBaseUrl = normalizeMatchText(provider.baseUrl);
  const providerHeaders = normalizeMatchText(JSON.stringify(provider.headers ?? {}));
  const providerAuthIndex = normalizeMatchText(provider.authIndex);
  const apiKeyAuthIndexMatched = (provider.apiKeyEntries ?? []).some((entry) => {
    const authIndex = normalizeMatchText(entry.authIndex);
    return Boolean(authIndex && matchKeys.has(authIndex));
  });
  const linkedCredentialId = normalizeMatchText(
    provider.opencode_go_credential_id ?? provider.opencodeGoCredentialId
  );
  const linkedWorkspaceId = normalizeMatchText(
    provider.opencode_go_workspace_id ?? provider.opencodeGoWorkspaceId
  );

  let score = 0;
  if (apiKeyAuthIndexMatched) score += 100;
  if (providerAuthIndex && matchKeys.has(providerAuthIndex)) score += 80;
  if (linkedCredentialId && matchKeys.has(linkedCredentialId)) score += 80;
  if (linkedWorkspaceId && matchKeys.has(linkedWorkspaceId)) score += 50;
  if (providerName.includes('opencode')) score += 40;
  if (providerPrefix.includes('opencode')) score += 20;
  if (providerBaseUrl.includes('opencode')) score += 30;
  if (providerHeaders.includes('opencode')) score += 20;
  if (providerName.includes('opencode') && matchKeys.has(providerName)) score += 30;
  if (providerPrefix.includes('opencode') && matchKeys.has(providerPrefix)) score += 20;
  if (provider.disabled) score -= 10;

  return score;
};

const getOpenCodeGoProviderModels = async (item: AuthFileItem): Promise<AuthFileModelItem[]> => {
  if (!isOpenCodeGoFile(item)) return [];

  let providers: OpenAIProviderConfig[] = [];
  try {
    const config = useConfigStore.getState().config;
    providers =
      config?.openaiCompatibility ??
      ((await useConfigStore
        .getState()
        .fetchConfig('openai-compatibility')) as OpenAIProviderConfig[] | undefined) ??
      [];
  } catch {
    return [];
  }

  const providersWithModels = providers.filter((provider) => (provider.models?.length ?? 0) > 0);
  if (providersWithModels.length === 0) return [];

  const matchKeys = buildOpenCodeGoMatchKeys(item);
  const scoredProviders = providersWithModels
    .map((provider) => ({
      provider,
      score: getProviderOpenCodeGoScore(provider, matchKeys),
    }))
    .sort((a, b) => b.score - a.score);
  const selectedProvider = scoredProviders[0]?.score > 0 ? scoredProviders[0].provider : null;

  return selectedProvider?.models?.map(modelAliasToAuthFileModel).filter(isAuthFileModelItem) ?? [];
};

export type UseAuthFilesModelsResult = {
  modelsModalOpen: boolean;
  modelsLoading: boolean;
  modelsList: AuthFileModelItem[];
  modelsFileName: string;
  modelsFileType: string;
  modelsError: ModelsError;
  showModels: (item: AuthFileItem) => Promise<void>;
  closeModelsModal: () => void;
};

export function useAuthFilesModels(): UseAuthFilesModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<ModelsError>(null);
  const modelsCacheRef = useRef<Map<string, AuthFileModelItem[]>>(new Map());

  const closeModelsModal = useCallback(() => {
    setModelsModalOpen(false);
  }, []);

  const showModels = useCallback(
    async (item: AuthFileItem) => {
      setModelsFileName(item.name);
      setModelsFileType(item.type || '');
      setModelsList([]);
      setModelsError(null);
      setModelsModalOpen(true);

      const cached = modelsCacheRef.current.get(item.name);
      if (cached) {
        setModelsList(cached);
        setModelsLoading(false);
        return;
      }

      setModelsLoading(true);
      try {
        const models = await authFilesApi.getModelsForAuthFile(item.name);
        const resolvedModels = models.length > 0 ? models : await getOpenCodeGoProviderModels(item);
        modelsCacheRef.current.set(item.name, resolvedModels);
        setModelsList(resolvedModels);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '';
        const fallbackModels = await getOpenCodeGoProviderModels(item);
        if (fallbackModels.length > 0) {
          modelsCacheRef.current.set(item.name, fallbackModels);
          setModelsList(fallbackModels);
          return;
        }
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('Not Found')
        ) {
          setModelsError('unsupported');
        } else {
          showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
        }
      } finally {
        setModelsLoading(false);
      }
    },
    [showNotification, t]
  );

  return {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  };
}
