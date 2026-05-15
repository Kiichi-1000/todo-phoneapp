import { View, Text, StyleSheet } from 'react-native';
import { Sparkles, Gift, Zap } from 'lucide-react-native';

interface Props {
  balanceYen: number | null;
  accessReason:
    | 'active_subscription'
    | 'promo'
    | 'release_promo'
    | 'basic_plan_no_ai'
    | 'none'
    | null;
  expiresAt?: string | null;
}

function formatYen(v: number): string {
  return Math.floor(v).toLocaleString('ja-JP');
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}まで`;
  } catch { return ''; }
}

export default function TokenBalanceBadge({ balanceYen, accessReason, expiresAt }: Props) {
  if (accessReason === null) return null;

  let label: string;
  let bg: string;
  let fg: string;
  let border: string;
  let Icon: any = Sparkles;
  let bold = false;

  if (accessReason === 'release_promo') {
    label = `試運転期間 ${expiresAt ? formatDateShort(expiresAt) : ''}`.trim();
    bg = '#FEF3C7';
    fg = '#92400E';
    border = '#FCD34D';
    Icon = Zap;
  } else if (accessReason === 'promo') {
    label = `クーポン ${expiresAt ? formatDateShort(expiresAt) : ''}`.trim();
    bg = '#DCFCE7';
    fg = '#166534';
    border = '#86EFAC';
    Icon = Gift;
  } else if (accessReason === 'active_subscription' && balanceYen !== null) {
    label = `残り ¥${formatYen(balanceYen)}`;
    if (balanceYen <= 100) {
      bg = '#FEE2E2'; fg = '#B91C1C'; border = '#FCA5A5'; bold = true;
    } else if (balanceYen <= 200) {
      bg = '#FEF3C7'; fg = '#92400E'; border = '#FCD34D'; bold = true;
    } else {
      bg = '#EEF2FF'; fg = '#3730A3'; border = '#C7D2FE';
    }
  } else {
    label = '未契約';
    bg = '#F3F4F6';
    fg = '#475569';
    border = '#CBD5E1';
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
      <Icon size={12} color={fg} strokeWidth={2.4} />
      <Text style={[styles.text, { color: fg, fontWeight: bold ? '700' : '600' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 5,
  },
  text: { fontSize: 11.5, letterSpacing: 0.2 },
});
