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

/**
 * サブスクリプション利用規約 (Paywall フッターから参照)。
 * Apple Paywall ガイドライン (4.10) では、サブスクリプション加入前にこれらの URL を
 * 表示する必要がある。RC Paywall Builder にも同じ URL を入れる。
 */
export function getLegalSubscriptionUrl(): string {
  const override = Constants.expoConfig?.extra?.legalSubscriptionUrl as string | undefined;
  if (override) return override;
  // 直接 subscription.html を返す (hub の #subscription-doc アンカーではなく、全文ページに直リンク)
  // 理由: RC Paywall や ASC からはアンカー無しの常駐ページ URL の方が信頼性が高い
  return `${hubBase()}subscription.html`;
}

/**
 * 特定商取引法に基づく表記 (日本のみ法令上必要)。
 * 設定 > 法務リンクから参照、または日本ユーザー向けに常時表示しても良い。
 */
export function getLegalTokushohoUrl(): string {
  const override = Constants.expoConfig?.extra?.legalTokushohoUrl as string | undefined;
  if (override) return override;
  return `${hubBase()}tokushoho.html`;
}
