import Constants from 'expo-constants';

const DEFAULT_TERMS = 'https://www.synthera.jp/legal/tosche/terms.html';
const DEFAULT_PRIVACY = 'https://www.synthera.jp/legal/tosche/privacy.html';

export function getLegalTermsUrl(): string {
  return (Constants.expoConfig?.extra?.legalTermsUrl as string | undefined) || DEFAULT_TERMS;
}

export function getLegalPrivacyUrl(): string {
  return (Constants.expoConfig?.extra?.legalPrivacyUrl as string | undefined) || DEFAULT_PRIVACY;
}
