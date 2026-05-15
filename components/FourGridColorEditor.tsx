import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Platform,
} from 'react-native';
import { X, Check, RotateCcw } from 'lucide-react-native';
import {
  GridArea,
  FourGridTodoBorderColors,
  DEFAULT_FOUR_GRID_TODO_BORDER_COLORS,
} from '@/types/database';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  colors: FourGridTodoBorderColors;
  onChange: (area: GridArea, color: string) => void;
  onResetAll: () => void;
}

const COLOR_PALETTE: string[] = [
  '#FF6B6B', '#F06292', '#BA68C8', '#9575CD',
  '#7986CB', '#4D96FF', '#3b82f6', '#42A5F5',
  '#26C6DA', '#26A69A', '#6BCB77', '#9CCC65',
  '#D4E157', '#FFD93D', '#FFB74D', '#FF8A65',
  '#A1887F', '#90A4AE', '#222222', '#888888',
];

export default function FourGridColorEditor({ colors, onChange, onResetAll }: Props) {
  const { t } = useLanguage();
  const [openArea, setOpenArea] = useState<GridArea | null>(null);

  const areas = useMemo<{ key: GridArea; label: string }[]>(
    () => [
      { key: 'top_left', label: t('settings.areaTopLeft') },
      { key: 'top_right', label: t('settings.areaTopRight') },
      { key: 'bottom_left', label: t('settings.areaBottomLeft') },
      { key: 'bottom_right', label: t('settings.areaBottomRight') },
    ],
    [t]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{t('settings.fourGridBorderColors')}</Text>
          <Text style={styles.description}>{t('settings.fourGridBorderColorsDesc')}</Text>
        </View>
        <TouchableOpacity style={styles.resetBtn} onPress={onResetAll}>
          <RotateCcw size={14} color="#555" />
          <Text style={styles.resetBtnText}>{t('settings.resetDefault')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.preview}>
        <View style={styles.previewRow}>
          <View style={styles.previewCell}>
            <View style={[styles.previewStripe, { backgroundColor: colors.top_left }]} />
          </View>
          <View style={styles.previewCell}>
            <View style={[styles.previewStripe, { backgroundColor: colors.top_right }]} />
          </View>
        </View>
        <View style={styles.previewRow}>
          <View style={styles.previewCell}>
            <View style={[styles.previewStripe, { backgroundColor: colors.bottom_left }]} />
          </View>
          <View style={styles.previewCell}>
            <View style={[styles.previewStripe, { backgroundColor: colors.bottom_right }]} />
          </View>
        </View>
      </View>

      <View style={styles.areaList}>
        {areas.map(a => (
          <TouchableOpacity
            key={a.key}
            style={styles.areaRow}
            activeOpacity={0.7}
            onPress={() => setOpenArea(a.key)}
          >
            <View style={[styles.areaSwatch, { backgroundColor: colors[a.key] }]} />
            <Text style={styles.areaLabel}>{a.label}</Text>
            <Text style={styles.areaHex}>{colors[a.key].toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal
        visible={openArea !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpenArea(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {openArea ? `${areas.find(a => a.key === openArea)?.label} — ${t('settings.fourGridColorsPickTitle')}` : ''}
            </Text>
            <TouchableOpacity onPress={() => setOpenArea(null)} style={styles.modalCloseBtn}>
              <X size={20} color="#555" />
            </TouchableOpacity>
          </View>

          <View style={styles.paletteWrap}>
            {COLOR_PALETTE.map(c => {
              const active = openArea !== null && colors[openArea] === c;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.paletteSwatch, { backgroundColor: c }, active && styles.paletteSwatchActive]}
                  onPress={() => {
                    if (openArea) {
                      onChange(openArea, c);
                      setOpenArea(null);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  {active && <Check size={16} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.resetSingleBtn}
              onPress={() => {
                if (openArea) {
                  onChange(openArea, DEFAULT_FOUR_GRID_TODO_BORDER_COLORS[openArea]);
                  setOpenArea(null);
                }
              }}
            >
              <RotateCcw size={14} color="#555" />
              <Text style={styles.resetSingleBtnText}>{t('settings.resetThisArea')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    padding: 14,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f1f1',
  },
  resetBtnText: {
    fontSize: 11,
    color: '#555',
    marginLeft: 4,
    fontWeight: '500',
  },
  preview: {
    width: 140,
    height: 100,
    alignSelf: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 6,
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    flex: 1,
  },
  previewCell: {
    flex: 1,
    margin: 2,
    borderRadius: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  previewStripe: {
    width: 4,
    height: '100%',
  },
  areaList: {
    gap: 6,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  areaSwatch: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 12,
  },
  areaLabel: {
    flex: 1,
    fontSize: 14,
    color: '#222',
    fontWeight: '500',
  },
  areaHex: {
    fontSize: 11,
    color: '#888',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as any,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  paletteWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
    justifyContent: 'center',
  },
  paletteSwatch: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paletteSwatchActive: {
    borderWidth: 3,
    borderColor: '#222',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  resetSingleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  resetSingleBtnText: {
    fontSize: 14,
    color: '#555',
    marginLeft: 6,
    fontWeight: '500',
  },
});
