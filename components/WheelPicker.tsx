import { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;

interface Props {
  items: { label: string; value: number }[];
  selectedValue: number;
  onValueChange: (value: number) => void;
  width?: number;
}

export default function WheelPicker({ items, selectedValue, onValueChange, width = 72 }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const isUserScroll = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIndex = items.findIndex(item => item.value === selectedValue);

  useEffect(() => {
    if (!isUserScroll.current && scrollRef.current) {
      const targetY = Math.max(0, selectedIndex) * ITEM_HEIGHT;
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: targetY, animated: false });
      }, 50);
    }
  }, [selectedIndex]);

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(index, items.length - 1));

    scrollRef.current?.scrollTo({ y: clampedIndex * ITEM_HEIGHT, animated: true });

    if (items[clampedIndex] && items[clampedIndex].value !== selectedValue) {
      onValueChange(items[clampedIndex].value);
    }
    isUserScroll.current = false;
  }, [items, selectedValue, onValueChange]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScroll.current = true;

    if (Platform.OS === 'web') {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        handleScrollEnd(e);
      }, 100);
    }
  }, [handleScrollEnd]);

  const paddingVertical = (PICKER_HEIGHT - ITEM_HEIGHT) / 2;

  return (
    <View style={[styles.container, { width, height: PICKER_HEIGHT }]}>
      <View style={styles.selectionIndicator} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: paddingVertical, paddingBottom: paddingVertical }}
      >
        {items.map((item, index) => {
          const isSelected = item.value === selectedValue;
          return (
            <View key={`${item.value}-${index}`} style={styles.item}>
              <Text style={[
                styles.itemText,
                isSelected && styles.itemTextSelected,
              ]}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  selectionIndicator: {
    position: 'absolute',
    top: (PICKER_HEIGHT - ITEM_HEIGHT) / 2,
    left: 4,
    right: 4,
    height: ITEM_HEIGHT,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    zIndex: 0,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 20,
    fontWeight: '400',
    color: '#bbb',
  },
  itemTextSelected: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111',
  },
});
