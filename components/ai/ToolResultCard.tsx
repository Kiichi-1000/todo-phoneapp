import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import {
  Check,
  Plus,
  Trash2,
  Calendar,
  ListChecks,
  Search,
  AlertCircle,
  AlertTriangle,
  Pencil,
  ListTodo,
  Sunrise,
  BarChart3,
  HelpCircle,
  Grid3x3,
  ArrowUpRight,
  Target,
} from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

type ChoiceVariant = 'primary' | 'destructive' | 'secondary';

interface ToolChoice {
  id: string;
  label: string;
  prompt?: string;     // tap → send this text as a new user message
  nav?: string;        // tap → navigate to this route (mutually exclusive with prompt)
  variant?: ChoiceVariant;
}

interface Props {
  toolName: string;
  ok: boolean;
  data?: any;
  error?: string;
  onChoiceTap?: (prompt: string) => void;
  onNavTap?: (route: string) => void;
  choicesDisabled?: boolean;
}

type Lang = 'ja' | 'en';
type LabelEntry = { ja: string; en: string; icon: any; color: string };

const TOOL_LABELS: Record<string, LabelEntry> = {
  // Workspace
  create_todo: { ja: 'ワークスペースに追加', en: 'Added to workspace', icon: Plus, color: '#3B82F6' },
  update_todo: { ja: 'タスクを更新', en: 'Task updated', icon: Check, color: '#10B981' },
  delete_todo: { ja: 'タスクを削除', en: 'Task deleted', icon: Trash2, color: '#EF4444' },
  list_todos: { ja: 'タスク一覧', en: 'Task list', icon: ListTodo, color: '#64748B' },
  list_workspace_areas: { ja: 'エリア構成', en: 'Workspace areas', icon: Grid3x3, color: '#64748B' },
  // Schedule
  create_schedule: { ja: 'スケジュールに追加', en: 'Added to schedule', icon: Calendar, color: '#3B82F6' },
  update_schedule: { ja: '予定を更新', en: 'Event updated', icon: Pencil, color: '#10B981' },
  delete_schedule: { ja: '予定を削除', en: 'Event deleted', icon: Trash2, color: '#EF4444' },
  list_schedules: { ja: '予定一覧', en: 'Event list', icon: Calendar, color: '#64748B' },
  // Routine
  add_routine_item: { ja: 'ルーティン追加', en: 'Routine added', icon: Plus, color: '#8B5CF6' },
  update_routine_item: { ja: 'ルーティン更新', en: 'Routine updated', icon: Pencil, color: '#10B981' },
  delete_routine_item: { ja: 'ルーティン削除', en: 'Routine deleted', icon: Trash2, color: '#EF4444' },
  list_routine_for_date: { ja: 'ルーティン一覧', en: 'Routine list', icon: Sunrise, color: '#64748B' },
  list_routine_template: { ja: 'ルーティンテンプレート', en: 'Routine template', icon: Sunrise, color: '#64748B' },
  toggle_routine_completion: { ja: 'チェックを切り替え', en: 'Toggled completion', icon: Check, color: '#10B981' },
  // Other
  request_confirmation: { ja: '確認', en: 'Confirm', icon: HelpCircle, color: '#0EA5E9' },
  redirect_to_goal_coach: { ja: '目標設定AIへ', en: 'Open Goal Coach', icon: Target, color: '#8B5CF6' },
  get_stats: { ja: '統計データ', en: 'Statistics', icon: BarChart3, color: '#64748B' },
  get_current_context: { ja: '現在の状況', en: 'Current context', icon: Search, color: '#64748B' },
};

function fmt(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function slotLabel(slot: string, lang: Lang): string {
  if (lang === 'en') {
    return slot === 'morning' ? 'Morning'
      : slot === 'daytime' ? 'Daytime'
      : slot === 'evening' ? 'Evening'
      : slot;
  }
  return slot === 'morning' ? '朝' : slot === 'daytime' ? '昼' : slot === 'evening' ? '夜' : slot;
}

// 「『X』」風のクォート。英語では引用符に切り替え。
function quote(s: string, lang: Lang): string {
  return lang === 'en' ? `“${s}”` : `『${s}』`;
}

function shortenSummary(toolName: string, data: any, lang: Lang): string {
  if (!data || typeof data !== 'object') return '';

  if (data.confirmation) return data.summary ?? '';
  if (data.conflict) {
    return data.message ?? (lang === 'en' ? 'Times overlap.' : '時間が重複しています。');
  }
  if (data.redirect) {
    return data.message ?? (lang === 'en' ? 'Handled by a dedicated AI.' : '専用のAIで対応します。');
  }

  if (toolName === 'create_todo' && data.todo?.content) {
    const title = quote(data.todo.content, lang);
    if (lang === 'en') {
      return data.area_title_used ? `${title} → ${data.area_title_used}` : title;
    }
    const area = data.area_title_used ? `${data.area_title_used}に` : '';
    return `${area}${title}`;
  }
  if (toolName === 'update_todo' && data.todo?.content) {
    const title = quote(data.todo.content, lang);
    if (lang === 'en') {
      return data.todo.is_completed ? `✓ ${title} completed` : `${title} updated`;
    }
    return data.todo.is_completed ? `✓ ${title}を完了` : `${title}を更新`;
  }
  if (toolName === 'delete_todo') return lang === 'en' ? 'Deleted' : '削除しました';
  if ((toolName === 'create_schedule' || toolName === 'update_schedule') && data.schedule?.title) {
    const s = data.schedule;
    return `${quote(s.title, lang)} ${fmt(s.start_minutes)}–${fmt(s.end_minutes)}`;
  }
  if (toolName === 'delete_schedule') return lang === 'en' ? 'Deleted' : '削除しました';
  if (toolName === 'list_todos' && Array.isArray(data.todos)) {
    return lang === 'en' ? `${data.todos.length} items` : `${data.todos.length} 件`;
  }
  if (toolName === 'list_workspace_areas' && data.area_titles) {
    const titles = Object.values(data.area_titles).filter(Boolean).join(' / ');
    return titles || (lang === 'en' ? 'No areas configured' : 'エリア未設定');
  }
  if (toolName === 'list_schedules' && Array.isArray(data.schedules)) {
    return lang === 'en' ? `${data.schedules.length} events` : `${data.schedules.length} 件`;
  }
  if (toolName === 'add_routine_item' && data.item?.title) {
    const slot = slotLabel(data.item.slot, lang);
    if (lang === 'en') {
      const todayOnly = data.item.today_only_date ? ' / today only' : '';
      return `${quote(data.item.title, lang)} (${slot}${todayOnly})`;
    }
    return `${quote(data.item.title, lang)}(${slot}${data.item.today_only_date ? ' / 今日のみ' : ''})`;
  }
  if (toolName === 'update_routine_item' && data.item?.title) {
    return lang === 'en'
      ? `${quote(data.item.title, lang)} updated`
      : `${quote(data.item.title, lang)}を更新`;
  }
  if (toolName === 'delete_routine_item') return lang === 'en' ? 'Deleted' : '削除しました';
  if (toolName === 'toggle_routine_completion') {
    if (lang === 'en') return data.completed ? '✓ Checked' : 'Unchecked';
    return data.completed ? '✓ チェックしました' : 'チェックを外しました';
  }
  if (toolName === 'list_routine_for_date' && data.slots) {
    const total =
      (data.slots.morning?.length ?? 0) +
      (data.slots.daytime?.length ?? 0) +
      (data.slots.evening?.length ?? 0);
    return lang === 'en' ? `${total} items` : `${total} 件`;
  }
  if (toolName === 'list_routine_template' && Array.isArray(data.items)) {
    return lang === 'en' ? `${data.items.length} items` : `${data.items.length} 件`;
  }
  if (toolName === 'get_stats' && data.todos && data.routines) {
    return lang === 'en'
      ? `Tasks ${data.todos.rate}% / Routines ${data.routines.rate}% (last ${data.range.days}d)`
      : `タスク ${data.todos.rate}% / ルーティン ${data.routines.rate}%(過去${data.range.days}日)`;
  }
  return '';
}

export default function ToolResultCard({ toolName, ok, data, error, onChoiceTap, onNavTap, choicesDisabled }: Props) {
  const { lang } = useLanguage();
  const fallback: LabelEntry = { ja: toolName, en: toolName, icon: ListChecks, color: '#64748B' };
  const meta = TOOL_LABELS[toolName] ?? fallback;
  const Icon = meta.icon;
  const isConflict = ok && data?.conflict === true;
  const isConfirmation = ok && data?.confirmation === true;
  const isRedirect = ok && data?.redirect === true;
  const summary = ok
    ? shortenSummary(toolName, data, lang)
    : (error ?? (lang === 'en' ? 'An error occurred' : 'エラーが発生しました'));
  const choices: ToolChoice[] = (isConflict || isConfirmation || isRedirect) && Array.isArray(data?.choices)
    ? data.choices
    : [];

  // Card style by status
  let cardStyle: any = styles.cardDefault;
  let iconBg = meta.color;
  let label = lang === 'en' ? meta.en : meta.ja;
  let CardIcon: any = Icon;

  if (!ok) {
    cardStyle = styles.cardError;
    iconBg = '#EF4444';
    CardIcon = AlertCircle;
    label = lang === 'en' ? 'Error' : 'エラー';
  } else if (isConfirmation) {
    cardStyle = styles.cardConfirm;
    iconBg = data?.destructive === false ? '#0EA5E9' : '#EF4444';
    CardIcon = data?.destructive === false ? HelpCircle : AlertTriangle;
    if (lang === 'en') {
      label = data?.destructive === false ? 'Confirm action' : 'Confirm delete';
    } else {
      label = data?.destructive === false ? '実行確認' : '削除確認';
    }
  } else if (isRedirect) {
    cardStyle = styles.cardRedirect;
    iconBg = '#8B5CF6';
    CardIcon = ArrowUpRight;
    label = lang === 'en' ? 'Open dedicated AI' : '専用AIへ移動';
  } else if (isConflict) {
    cardStyle = styles.cardConflict;
    iconBg = '#F59E0B';
    CardIcon = AlertTriangle;
    label = lang === 'en' ? 'Times overlap' : '時間が重複しています';
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, cardStyle]}>
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <CardIcon size={14} color="#fff" strokeWidth={2.4} />
        </View>
        <View style={styles.content}>
          <Text style={styles.label}>{label}</Text>
          {summary ? (
            <Text style={styles.summary} numberOfLines={4}>
              {summary}
            </Text>
          ) : null}
        </View>
      </View>

      {choices.length > 0 && (
        <View style={styles.choices}>
          {choices.map((c) => {
            const variant = c.variant ?? 'primary';
            const btnStyle =
              variant === 'destructive'
                ? styles.choiceDestructive
                : variant === 'secondary'
                ? styles.choiceSecondary
                : styles.choicePrimary;
            const textStyle =
              variant === 'destructive'
                ? styles.choiceDestructiveText
                : variant === 'secondary'
                ? styles.choiceSecondaryText
                : styles.choicePrimaryText;
            const handleTap = () => {
              if (choicesDisabled) return;
              if (c.nav) {
                onNavTap?.(c.nav);
              } else if (c.prompt) {
                onChoiceTap?.(c.prompt);
              }
            };
            return (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.choiceBtn,
                  btnStyle,
                  choicesDisabled && styles.choiceBtnDisabled,
                ]}
                onPress={handleTap}
                disabled={choicesDisabled}
                activeOpacity={0.7}
              >
                <Text style={[styles.choiceText, textStyle, choicesDisabled && styles.choiceTextDisabled]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
  default: {},
});

const btnShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  android: { elevation: 1 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: { marginVertical: 6, marginHorizontal: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    ...cardShadow,
  },
  cardDefault: {
    backgroundColor: '#fff',
    borderColor: '#E2E8F0',
  },
  cardError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  cardConfirm: {
    backgroundColor: '#FFF7F7',
    borderColor: '#FCA5A5',
  },
  cardConflict: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  cardRedirect: {
    backgroundColor: '#F5F3FF',
    borderColor: '#C4B5FD',
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  content: { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.3, textTransform: 'uppercase' },
  summary: { fontSize: 14, color: '#0F172A', marginTop: 3, lineHeight: 19, fontWeight: '500' },

  // Choices
  choices: { marginTop: 8, gap: 8 },
  choiceBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...btnShadow,
  },
  choiceBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  choicePrimary: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  choiceDestructive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  choiceSecondary: {
    backgroundColor: '#fff',
    borderColor: '#CBD5E1',
  },
  choiceText: { fontSize: 14, fontWeight: '600' },
  choicePrimaryText: { color: '#fff' },
  choiceDestructiveText: { color: '#fff' },
  choiceSecondaryText: { color: '#475569' },
  choiceTextDisabled: {},
});
