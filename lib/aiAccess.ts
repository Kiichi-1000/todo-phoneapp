// Client-side access gate for paid features (AI chat / Goal setting).
//
// サーバ側の supabase/functions/ai-chat/access.ts と同じロジックを Supabase クライアントで再実装。
// 「画面を開いた瞬間に paywall を出すか」を即座に判定したい局面のためのチェック。
//
// 判定優先順 (AI 機能の場合):
//   1. user_subscriptions.status が 'active' / 'trialing' で current_period_end > now
//      AND plan が 'standard' または 'pro'
//      → 全機能 OK
//   1'. plan が 'basic' の場合 → AI 機能拒否 (basic_plan_no_ai 専用理由)
//      Basic プランは ToSche 基本機能(ワークスペース等)のみで AI 機能は含まない。
//   2. ai_promo_redemptions の valid_until > now
//      → プロモコードで一時的にアクセス権付与中
//   3. app_release_promos の期間内
//      → リリース時の無料体験キャンペーン
//   4. 上記いずれも該当しない
//      → 課金壁 (paywall) を出す

import { supabase } from '@/lib/supabase';

export type AccessReason =
  | 'active_subscription'
  | 'promo'
  | 'release_promo'
  | 'basic_plan_no_ai'
  | 'none';

export interface AccessResult {
  allowed: boolean;
  reason: AccessReason;
  /** いつまで有効か (期限あるとき) */
  expiresAt: string | null;
}

const NO_ACCESS: AccessResult = { allowed: false, reason: 'none', expiresAt: null };

/**
 * 現在のユーザーが有料機能 (AI / Goals) を使えるかを判定する。
 * RLS が効いているので auth されたユーザーのレコードしか返らない = 安全。
 *
 * 注意: ネットワーク 1〜3 往復するので画面を開いてからモーダルが開くまで数百 ms 程度の
 * ラグが発生する。早い段階で結果を得るために useFocusEffect ではなく useEffect[]で呼ぶ。
 */
export async function checkAiAccess(userId: string): Promise<AccessResult> {
  if (!userId) return NO_ACCESS;
  const now = new Date();
  const nowISO = now.toISOString();

  // 1) Active subscription (basic 以外なら AI 解放)
  let activeBasicSub: { current_period_end: string | null } | null = null;
  try {
    const { data: sub, error } = await supabase
      .from('user_subscriptions')
      .select('status, plan, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      // RLS 等の理由で取れなければ「未加入扱い」で paywall を出す方が安全側。
      console.warn('[checkAiAccess] user_subscriptions read failed', error.message);
    }
    if (
      sub &&
      (sub.status === 'active' || sub.status === 'trialing') &&
      sub.current_period_end &&
      new Date(sub.current_period_end) > now
    ) {
      if (sub.plan !== 'basic') {
        return {
          allowed: true,
          reason: 'active_subscription',
          expiresAt: sub.current_period_end,
        };
      }
      // Basic 契約者: AI プランではないので一旦保留し、promo / release_promo を評価。
      activeBasicSub = { current_period_end: sub.current_period_end };
    }
  } catch (e) {
    console.warn('[checkAiAccess] subscription check threw', e);
  }

  // 2) Promo redemption
  try {
    const { data: redemption } = await supabase
      .from('ai_promo_redemptions')
      .select('valid_until')
      .eq('user_id', userId)
      .gt('valid_until', nowISO)
      .order('valid_until', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (redemption?.valid_until) {
      return { allowed: true, reason: 'promo', expiresAt: redemption.valid_until };
    }
  } catch (e) {
    console.warn('[checkAiAccess] promo check threw', e);
  }

  // 3) Release-wide promo
  try {
    const { data: releasePromo } = await supabase
      .from('app_release_promos')
      .select('promo_ends_at')
      .eq('is_active', true)
      .lte('promo_starts_at', nowISO)
      .gte('promo_ends_at', nowISO)
      .order('promo_ends_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (releasePromo?.promo_ends_at) {
      return {
        allowed: true,
        reason: 'release_promo',
        expiresAt: releasePromo.promo_ends_at,
      };
    }
  } catch (e) {
    console.warn('[checkAiAccess] release promo check threw', e);
  }

  // 4) Basic 契約者は専用理由で拒否 (= UI 側で「Standard 以上にアップグレード」を促せる)
  if (activeBasicSub) {
    return {
      allowed: false,
      reason: 'basic_plan_no_ai',
      expiresAt: activeBasicSub.current_period_end,
    };
  }

  return NO_ACCESS;
}

// ----------------------------------------------------------------------------
// 「有料機能」全般 (= AI 以外のサブスク機能。Goals 閲覧/編集など) のアクセスチェック
//
// 想定:
//   - Basic / Standard / Pro いずれかの active 契約なら allowed
//   - 未契約・無料枠超過・期限切れなら not allowed
//   - Goal Coach (= 実際の AI 応答) は別途 checkAiAccess() で gate する
//
// この関数の使いどころ:
//   - GoalView (= 目標の作成/閲覧/編集 UI)。Basic でも触れる仕様
//   - その他「サブスク契約者専用」だが AI ではない機能
// ----------------------------------------------------------------------------

export interface PaidAccessResult {
  allowed: boolean;
  /** "any_subscription" | "promo" | "release_promo" | "none" */
  reason: 'any_subscription' | 'promo' | 'release_promo' | 'none';
  expiresAt: string | null;
  /** active なサブスクのプラン名 (basic / standard / pro)。allowed=true 時のみ意味あり */
  plan?: 'basic' | 'standard' | 'pro' | null;
}

export async function checkPaidAccess(userId: string): Promise<PaidAccessResult> {
  if (!userId) return { allowed: false, reason: 'none', expiresAt: null };
  const now = new Date();
  const nowISO = now.toISOString();

  // 1) Active subscription (plan 問わず)
  try {
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('status, plan, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (
      sub &&
      (sub.status === 'active' || sub.status === 'trialing') &&
      sub.current_period_end &&
      new Date(sub.current_period_end) > now
    ) {
      return {
        allowed: true,
        reason: 'any_subscription',
        expiresAt: sub.current_period_end,
        plan: (sub.plan as 'basic' | 'standard' | 'pro' | null) ?? null,
      };
    }
  } catch (e) {
    console.warn('[checkPaidAccess] subscription read threw', e);
  }

  // 2) Promo redemption — 一時的に有料機能を解放するクーポン
  try {
    const { data: redemption } = await supabase
      .from('ai_promo_redemptions')
      .select('valid_until')
      .eq('user_id', userId)
      .gt('valid_until', nowISO)
      .order('valid_until', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (redemption?.valid_until) {
      return { allowed: true, reason: 'promo', expiresAt: redemption.valid_until };
    }
  } catch (e) {
    console.warn('[checkPaidAccess] promo check threw', e);
  }

  // 3) Release-wide promo
  try {
    const { data: releasePromo } = await supabase
      .from('app_release_promos')
      .select('promo_ends_at')
      .eq('is_active', true)
      .lte('promo_starts_at', nowISO)
      .gte('promo_ends_at', nowISO)
      .order('promo_ends_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (releasePromo?.promo_ends_at) {
      return { allowed: true, reason: 'release_promo', expiresAt: releasePromo.promo_ends_at };
    }
  } catch (e) {
    console.warn('[checkPaidAccess] release promo check threw', e);
  }

  return { allowed: false, reason: 'none', expiresAt: null };
}

// ----------------------------------------------------------------------------
// ワークスペース新規作成のアクセスチェック
//
// 仕様 (v1.3 で実態に合わせて改訂):
//   - 本アプリは「日付に紐づくワークスペース」を訪問するたびに行を自動 INSERT する。
//     つまり workspaces テーブルの行数 ≠ ユーザーが実際に "使った" ページ数 となる。
//   - 「使った」とみなす定義: そのワークスペースに **タスク (todos) が1つでも紐付いた**
//     状態。タスク0件のワークスペースはノーカウント (= 訪問しただけ)。
//   - 100 件まで無料、101 件目から有料 (basic 以上のサブスク必須)。
//   - 任意プラン (Basic / Standard / Pro) のサブスク契約者 → 無制限。
//
// したがって判定は:
//   1) サブスク契約あり → allowed
//   2) todos テーブルで distinct workspace_id をカウント → 100 以上で拒否
//
// 呼び出し側 (WorkspacePage.tsx):
//   タスク追加直前に「このワークスペースの todos.length === 0」のときだけチェック。
//   既にタスクがあるワークスペースへの追加は無料 (カウント対象なので)。
// ----------------------------------------------------------------------------

export const FREE_WORKSPACE_LIMIT = 100;

export interface WorkspaceCreationAccess {
  allowed: boolean;
  reason: 'subscribed' | 'within_free_limit' | 'free_limit_reached';
  /** 現在「使ったワークスペース」の数 (= 少なくとも1タスクを持つ workspace 数) */
  count: number;
  /** 残り作成可能枚数 (サブスク契約者は Infinity 相当として -1) */
  remaining: number;
}

/**
 * 新規「使ったワークスペース」(= タスクを1つでも持つワークスペース) を増やせるか判定。
 * - サブスク契約 (basic/standard/pro いずれか) があれば常に allowed
 * - 未契約なら todos の distinct workspace_id 数で判定 (100 まで)
 */
export async function checkWorkspaceCreationAccess(
  userId: string,
): Promise<WorkspaceCreationAccess> {
  if (!userId) {
    return { allowed: false, reason: 'free_limit_reached', count: 0, remaining: 0 };
  }
  const now = new Date();

  // 1) サブスク契約があれば無制限
  try {
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('status, plan, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (
      sub &&
      (sub.status === 'active' || sub.status === 'trialing') &&
      sub.current_period_end &&
      new Date(sub.current_period_end) > now
    ) {
      return { allowed: true, reason: 'subscribed', count: -1, remaining: -1 };
    }
  } catch (e) {
    console.warn('[checkWorkspaceCreationAccess] subscription read threw', e);
  }

  // 2) todos の distinct workspace_id 数で判定 (= 「使ったワークスペース」のカウント)。
  //
  // supabase-js は count(distinct ...) を直接サポートしないため、
  // workspace_id 列だけを引いてクライアント側で Set ユニーク化する。
  // 通常ユーザーは未契約時点で <100 ワークスペース = todos 数百件程度なので問題なし。
  // (本格的なスケールが必要になったら Supabase RPC で SELECT count(DISTINCT) する関数化を)
  try {
    const { data: rows, error } = await supabase
      .from('todos')
      .select('workspace_id')
      .eq('user_id', userId);
    if (error) {
      console.warn('[checkWorkspaceCreationAccess] todos read failed', error.message);
      // 失敗時は保守的に作成許可 (UX を壊さない方向にフォールバック)
      return { allowed: true, reason: 'within_free_limit', count: 0, remaining: FREE_WORKSPACE_LIMIT };
    }
    const usedWorkspaceIds = new Set<string>();
    for (const r of rows ?? []) {
      const wid = (r as { workspace_id?: string | null }).workspace_id;
      if (wid) usedWorkspaceIds.add(wid);
    }
    const c = usedWorkspaceIds.size;
    if (c >= FREE_WORKSPACE_LIMIT) {
      return {
        allowed: false,
        reason: 'free_limit_reached',
        count: c,
        remaining: 0,
      };
    }
    return {
      allowed: true,
      reason: 'within_free_limit',
      count: c,
      remaining: FREE_WORKSPACE_LIMIT - c,
    };
  } catch (e) {
    console.warn('[checkWorkspaceCreationAccess] todos count threw', e);
    return { allowed: true, reason: 'within_free_limit', count: 0, remaining: FREE_WORKSPACE_LIMIT };
  }
}
