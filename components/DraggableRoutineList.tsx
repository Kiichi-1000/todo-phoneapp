import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Check, CircleCheck as CheckCircle, GripVertical, Trash2, EyeOff, CalendarOff } from 'lucide-react-native';
import { RoutineTemplateItem } from '@/types/database';

const ITEM_HEIGHT = 58;
const ITEM_MARGIN = 10;
const TOTAL_HEIGHT = ITEM_HEIGHT + ITEM_MARGIN;

interface Props {
  items: RoutineTemplateItem[];
  completedItemIds: Set<string>;
  accentColor: string;
  onToggle: (itemId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (item: RoutineTemplateItem) => void;
  onDeactivate?: (item: RoutineTemplateItem) => void;
  onSkipToday?: (item: RoutineTemplateItem) => void;
}

function DraggableItem({
  item,
  index,
  completed,
  accentColor,
  isDragging,
  dragIndex,
  dragTranslateY,
  onToggle,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  onLongPress,
  totalItems,
}: {
  item: RoutineTemplateItem;
  index: number;
  completed: boolean;
  accentColor: string;
  isDragging: boolean;
  dragIndex: number;
  dragTranslateY: number;
  onToggle: (itemId: string) => void;
  onDragStart: (index: number) => void;
  onDragUpdate: (translationY: number) => void;
  onDragEnd: () => void;
  onLongPress: (item: RoutineTemplateItem) => void;
  totalItems: number;
}) {
  const scale = useSharedValue(1);
  const zIdx = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const isActive = useSharedValue(false);

  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
      isActive.value = true;
      scale.value = withSpring(1.04);
      zIdx.value = 100;
      runOnJS(onDragStart)(index);
    });

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (isActive.value) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((e) => {
      offsetY.value = e.translationY;
      runOnJS(onDragUpdate)(e.translationY);
    })
    .onEnd(() => {
      isActive.value = false;
      scale.value = withSpring(1);
      offsetY.value = withTiming(0, { duration: 200 });
      zIdx.value = 0;
      runOnJS(onDragEnd)();
    })
    .onFinalize(() => {
      isActive.value = false;
      scale.value = withSpring(1);
      offsetY.value = withTiming(0, { duration: 200 });
      zIdx.value = 0;
    });

  const composedGesture = Gesture.Simultaneous(longPressGesture, panGesture);

  const isBeingDragged = isDragging && dragIndex === index;
  const displacement = isDragging && !isBeingDragged
    ? (() => {
        const rawTarget = dragIndex + Math.round(dragTranslateY / TOTAL_HEIGHT);
        const target = Math.max(0, Math.min(totalItems - 1, rawTarget));
        if (dragIndex < index && target >= index) return -TOTAL_HEIGHT;
        if (dragIndex > index && target <= index) return TOTAL_HEIGHT;
        return 0;
      })()
    : 0;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: isActive.value ? offsetY.value : withTiming(displacement, { duration: 200 }) },
      { scale: scale.value },
    ],
    zIndex: zIdx.value,
    elevation: isActive.value ? 8 : 0,
  }));

  return (
    <Animated.View style={[styles.card, completed && styles.cardDone, animatedStyle, isBeingDragged && styles.cardDragging]}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={styles.dragHandle}>
          <GripVertical size={16} color="#ccc" />
        </Animated.View>
      </GestureDetector>
      <TouchableOpacity
        style={styles.cardBody}
        onPress={() => onToggle(item.id)}
        onLongPress={() => onLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, completed && { backgroundColor: accentColor, borderColor: accentColor }]}>
          {completed && <Check size={14} color="#fff" strokeWidth={3} />}
        </View>
        <Text style={[styles.cardText, completed && styles.cardTextDone]} numberOfLines={2}>
          {item.short_label?.trim() || item.title}
        </Text>
        {item.today_only_date && (
          <View style={styles.todayBadge}>
            <Text style={styles.todayBadgeText}>TODAY</Text>
          </View>
        )}
        {completed && (
          <CheckCircle size={18} color={accentColor} style={{ marginLeft: 4 }} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function DraggableRoutineList({
  items,
  completedItemIds,
  accentColor,
  onToggle,
  onReorder,
  onDelete,
  onDeactivate,
  onSkipToday,
}: Props) {
  const [dragIndex, setDragIndex] = useState(-1);
  const [dragTranslateY, setDragTranslateY] = useState(0);
  const [menuItem, setMenuItem] = useState<RoutineTemplateItem | null>(null);
  const isDragging = dragIndex >= 0;

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
    setDragTranslateY(0);
  }, []);

  const handleDragUpdate = useCallback((translationY: number) => {
    setDragTranslateY(translationY);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex < 0) return;
    const rawTarget = dragIndex + Math.round(dragTranslateY / TOTAL_HEIGHT);
    const target = Math.max(0, Math.min(items.length - 1, rawTarget));
    if (target !== dragIndex) {
      onReorder(dragIndex, target);
    }
    setDragIndex(-1);
    setDragTranslateY(0);
  }, [dragIndex, dragTranslateY, items.length, onReorder]);

  const handleLongPress = useCallback((item: RoutineTemplateItem) => {
    setMenuItem(item);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuItem(null);
  }, []);

  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <DraggableItem
          key={item.id}
          item={item}
          index={index}
          completed={completedItemIds.has(item.id)}
          accentColor={accentColor}
          isDragging={isDragging}
          dragIndex={dragIndex}
          dragTranslateY={dragTranslateY}
          onToggle={onToggle}
          onDragStart={handleDragStart}
          onDragUpdate={handleDragUpdate}
          onDragEnd={handleDragEnd}
          onLongPress={handleLongPress}
          totalItems={items.length}
        />
      ))}

      <Modal
        visible={menuItem !== null}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={closeMenu}
        >
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle} numberOfLines={1}>
              {menuItem?.short_label?.trim() || menuItem?.title || ''}
            </Text>

            {onSkipToday && menuItem && !menuItem.today_only_date && (
              <TouchableOpacity
                style={styles.menuAction}
                onPress={() => {
                  const item = menuItem;
                  closeMenu();
                  if (item) onSkipToday(item);
                }}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: '#E3F2FD' }]}>
                  <CalendarOff size={18} color="#1976D2" />
                </View>
                <View style={styles.menuActionContent}>
                  <Text style={styles.menuActionLabel}>今日だけスキップ</Text>
                  <Text style={styles.menuActionDesc}>今日のリストから非表示にします</Text>
                </View>
              </TouchableOpacity>
            )}

            {onDeactivate && menuItem && !menuItem.today_only_date && (
              <TouchableOpacity
                style={styles.menuAction}
                onPress={() => {
                  const item = menuItem;
                  closeMenu();
                  if (item) onDeactivate(item);
                }}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: '#FFF3E0' }]}>
                  <EyeOff size={18} color="#E8954A" />
                </View>
                <View style={styles.menuActionContent}>
                  <Text style={styles.menuActionLabel}>非表示にする</Text>
                  <Text style={styles.menuActionDesc}>テンプレートから無効化します</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => {
                const item = menuItem;
                closeMenu();
                if (item) onDelete(item);
              }}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#FFEBEE' }]}>
                <Trash2 size={18} color="#E8654A" />
              </View>
              <View style={styles.menuActionContent}>
                <Text style={[styles.menuActionLabel, { color: '#E8654A' }]}>削除する</Text>
                <Text style={styles.menuActionDesc}>
                  {menuItem?.today_only_date ? 'この今日だけのタスクを削除します' : 'テンプレートから完全に削除します'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuCancelBtn} onPress={closeMenu}>
              <Text style={styles.menuCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    height: ITEM_HEIGHT,
    marginBottom: ITEM_MARGIN,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  cardDone: {
    backgroundColor: '#fafafa',
    borderColor: '#f0f0f0',
  },
  cardDragging: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      web: {
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
      },
    }),
    borderColor: '#ddd',
  },
  dragHandle: {
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#d0d0d0',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    fontSize: 15,
    color: '#222',
    lineHeight: 22,
  },
  cardTextDone: {
    color: '#aaa',
    textDecorationLine: 'line-through',
  },
  todayBadge: {
    backgroundColor: '#E8654A',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  todayBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  menuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuActionContent: {
    flex: 1,
  },
  menuActionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  menuActionDesc: {
    fontSize: 12,
    color: '#999',
    lineHeight: 16,
  },
  menuCancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
});
