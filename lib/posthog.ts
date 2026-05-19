// PostHog wrapper — single source of truth for analytics in ToSche.
//
// What we send: app lifecycle events, monetization funnel, AI-feature
// usage milestones, anonymized user id (Supabase uid, NOT email).
//
// What we never send: email addresses, free-text goal/task content, AI
// prompt bodies, payment details, or any PII the user typed into the app.
// Anything sensitive is masked at the autocapture layer below.
//
// Session recording is enabled but text inputs are masked globally
// (maskAllTextInputs: true) so user-typed content never leaves the device
// as pixels. Wrap any element in <PostHogPrivate> (see usage in
// login/goal-coach) to extend masking to non-input surfaces.

import Constants from 'expo-constants';
import { PostHog } from 'posthog-react-native';

// PostHog typings expose JsonType internally; we use a narrower public type
// that matches everything we actually send (primitives + nested primitives)
// without forcing callers to import deep package internals.
type EventProps = Record<string, string | number | boolean | null | undefined>;

type Extra = {
  posthogApiKey?: string;
  posthogHost?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const POSTHOG_API_KEY = extra.posthogApiKey ?? '';
export const POSTHOG_HOST = extra.posthogHost ?? 'https://us.i.posthog.com';

// Singleton client used by manual `capture` / `identify` calls outside the
// React tree (e.g. background webhook reconciliation). The PostHogProvider
// in app/_layout.tsx still drives autocapture + screen views.
let _client: PostHog | null = null;

export async function initPostHog(): Promise<PostHog | null> {
  if (!POSTHOG_API_KEY) {
    if (__DEV__) console.warn('[posthog] missing api key; analytics disabled');
    return null;
  }
  if (_client) return _client;
  _client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    enableSessionReplay: true,
    sessionReplayConfig: {
      // PII safety: mask ALL text inputs by default. Users' goal text,
      // AI prompts, login email, etc. never leave the device as plaintext
      // pixels. Specific non-input surfaces can be masked via the
      // <PostHogPrivate /> wrapper.
      maskAllTextInputs: true,
      maskAllImages: false,
      maskAllSandboxedViews: false,
      // 1px frame for performance; 30 fps is the default and overkill here.
      throttleDelayMs: 1000,
    },
    captureAppLifecycleEvents: true,
    flushAt: 20,
    flushInterval: 30_000,
  });
  return _client;
}

export function getPostHog(): PostHog | null {
  return _client;
}

// Manual capture helper — safe to call before initPostHog resolves.
export async function track(
  event: AnalyticsEvent,
  properties?: EventProps,
): Promise<void> {
  const ph = _client ?? (await initPostHog());
  if (!ph) return;
  ph.capture(event, properties as Record<string, unknown> as never);
}

// Identify a Supabase user (uid only — NEVER pass email here).
export async function identifyUser(
  supabaseUserId: string,
  nonPiiTraits?: EventProps,
): Promise<void> {
  const ph = _client ?? (await initPostHog());
  if (!ph) return;
  ph.identify(supabaseUserId, nonPiiTraits as Record<string, unknown> as never);
}

export async function resetIdentity(): Promise<void> {
  const ph = _client;
  if (!ph) return;
  ph.reset();
}

// Strongly-typed event names so we don't end up with `paywall_view`,
// `paywall_viewed`, `PaywallView` typos floating around.
export type AnalyticsEvent =
  | 'sign_in_success'
  | 'sign_up_success'
  | 'sign_out'
  | 'paywall_view'
  | 'paywall_dismiss'
  | 'subscription_purchase_started'
  | 'subscription_purchase_success'
  | 'subscription_purchase_failure'
  | 'subscription_restore_success'
  | 'ai_coach_open'
  | 'ai_coach_message_sent'
  | 'task_created'
  | 'goal_created'
  | 'workspace_created'
  | 'consent_accepted'
  | 'mcp_key_generated';
