import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Check, CircleCheck as CheckCircle, GripVertical } from 'lucide-react-native';
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
}

interface ItemLayout {
  y: number;
  height: number;
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
        const dragCurrent = index;
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
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.card, completed && styles.cardDone, animatedStyle, isBeingDragged && styles.cardDragging]}>
        <TouchableOpacity
          style={styles.dragHandle}
          activeOpacity={0.6}
        >
          <GripVertical size={16} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardBody}
          onPress={() => onToggle(item.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, completed && { backgroundColor: accentColor, borderColor: accentColor }]}>
            {completed && <Check size={14} color="#fff" strokeWidth={3} />}
          </View>
          <Text style={[styles.cardText, completed && styles.cardTextDone]} numberOfLines={2}>
            {item.short_label?.trim() || item.title}
          </Text>
          {completed && (
            <CheckCircle size={18} color={accentColor} style={{ marginLeft: 8 }} />
          )}
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

export default function DraggableRoutineList({ items, completedItemIds, accentColor, onToggle, onReorder }: Props) {
  const [dragIndex, setDragIndex] = useState(-1);
  const [dragTranslateY, setDragTranslateY] = useState(0);
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
          totalItems={items.length}
        />
      ))}
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
});
