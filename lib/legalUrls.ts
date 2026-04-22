import Constants from 'expo-constants';

/** 一覧・各文書への入口（末尾スラッシュあり） */
const DEFAULT_LEGAL_HUB = 'https://todo-phoneapp.pages.dev/legal/tosche/';

function hubBase(): string {
  const fromExtra = Constants.expoConfig?.extra?.legalDocsHubUrl as string | undefined;
  const raw = fromExtra || DEFAULT_LEGAL_HUB;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/** 利用規約・プライバシー共通の掲載ページ（アンカーで該当箇所へ） */
export function getLegalDocumentsHubUrl(): string {
  return hubBase();
}

export function getLegalTermsUrl(): string {
  const override = Constants.expoConfig?.extra?.legalTermsUrl as string | undefined;
  if (override) return override;
  return `${hubBase()}#terms-doc`;
}

export function getLegalPrivacyUrl(): string {
  const override = Constants.expoConfig?.extra?.legalPrivacyUrl as string | undefined;
  if (override) return override;
  return `${hubBase()}#privacy-doc`;
}
