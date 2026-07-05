import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Platform, Modal, Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Bell, Trash2, Pencil, GripVertical, MoveRight, CalendarClock, FileText } from 'lucide-react-native';
import { minutesToTimeString } from '@/lib/scheduleUtils';
import { formatReminderDisplay } from './ReminderPicker';
import { Todo, GridArea } from '@/types/database';
import { FourGridSkin, getThemeForSkin } from '@/lib/fourGridSkin';
import { useLanguage } from '@/contexts/LanguageContext';

const AREA_ORDER: GridArea[] = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];

interface DraggableTodoItemProps {
  todo: Todo;
  area: GridArea;
  index: number;
  isEditing: boolean;
  editingText: string;
  onEditTextChange: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (todo: Todo) => void;
  onToggle: (todo: Todo) => void;
  onDelete: (todoId: string) => void;
  onReminderPress: (todo: Todo) => void;
  onClearReminder: (todo: Todo) => void;
  onSchedulePress?: (todo: Todo) => void;
  onShowDetail?: (todo: Todo) => void;
  isReorderMode?: boolean;
  isDragging?: boolean;
  onDragHandle?: () => void;
  gridTitles?: Record<GridArea, string>;
  onMoveToArea?: (todo: Todo, targetArea: GridArea) => void;
  skin?: FourGridSkin;
  borderLeftColorOverride?: string;
}

export default function DraggableTodoItem({
  todo,
  isEditing,
  editingText,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onToggle,
  onDelete,
  onReminderPress,
  onClearReminder,
  onSchedulePress,
  onShowDetail,
  isReorderMode = false,
  isDragging = false,
  onDragHandle,
  area,
  gridTitles,
  onMoveToArea,
  skin = 'postit',
  borderLeftColorOverride,
}: DraggableTodoItemProps) {
  const { t } = useLanguage();
  const theme = getThemeForSkin(skin);
  const effectiveBorderLeftColor = borderLeftColorOverride ?? theme.todoBorderLeftColor;
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);
  const [areaPickerPosition, setAreaPickerPosition] = useState({ x: 0, y: 0 });
  const itemRef = useRef<View>(null);
  const moveButtonRef = useRef<View>(null);

  const wiggle = useSharedValue(0);

  useEffect(() => {
    if (isReorderMode && !isDragging) {
      wiggle.value = withRepeat(
        withSequence(
          withTiming(-1.2, { duration: 90 }),
          withTiming(1.2, { duration: 90 }),
          withTiming(-1.0, { duration: 90 }),
          withTiming(1.0, { duration: 90 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(wiggle);
      wiggle.value = withTiming(0, { duration: 120 });
    }
  }, [isReorderMode, isDragging, wiggle]);

  const wiggleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wiggle.value}deg` }],
  }));

  const showMenu = () => {
    if (itemRef.current) {
      itemRef.current.measureInWindow((x, y, width, height) => {
        setMenuPosition({ x, y: y + height });
        setMenuVisible(true);
      });
    } else {
      setMenuVisible(true);
    }
  };

  const handleLongPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    showMenu();
  };

  // On Android, Modal dismiss doesn't properly restore the parent's touch
  // responder chain, causing onLongPress on TouchableOpacity/Pressable to
  // stop firing after the first menu interaction.  Deferring the callback
  // by one frame lets the Modal fully tear down its native Dialog before
  // the parent processes the action (which may open another Modal).
  const closeMenuAndRun = useCallback((action: () => void) => {
    setMenuVisible(false);
    if (Platform.OS === 'android') {
      requestAnimationFrame(() => action());
    } else {
      action();
    }
  }, []);

  const handleDragStart = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    onDragHandle?.();
  };

  const showAreaPicker = () => {
    if (moveButtonRef.current) {
      moveButtonRef.current.measureInWindow((x, y, width, height) => {
        setAreaPickerPosition({ x: Math.max(8, x - 140), y: y + height + 4 });
        setAreaPickerVisible(true);
      });
    } else {
      setAreaPickerVisible(true);
    }
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  };

  const handleSelectArea = (target: GridArea) => {
    setAreaPickerVisible(false);
    onMoveToArea?.(todo, target);
  };

  const otherAreas = AREA_ORDER.filter(a => a !== area);

  if (isEditing) {
    return (
      <View
        style={[
          styles.todoItem,
          { borderRadius: theme.todoBorderRadius, borderLeftWidth: theme.todoBorderLeftWidth },
          styles.todoItemEditingInline,
        ]}
      >
        <View style={styles.todoItemInner}>
          <TouchableOpacity style={styles.checkbox} onPress={() => onToggle(todo)}>
            {todo.is_completed && <View style={styles.checkboxFilled} />}
          </TouchableOpacity>
          <TextInput
            style={[styles.todoText, { color: theme.todoTextColor }, styles.todoEditInlineInput]}
            value={editingText}
            onChangeText={onEditTextChange}
            multiline
            autoFocus
            maxLength={100}
            onSubmitEditing={onSaveEdit}
          />
        </View>
        <View style={styles.todoEditInlineButtons}>
          <TouchableOpacity style={styles.todoEditInlineSave} onPress={onSaveEdit}>
            <Text style={styles.todoEditInlineSaveText}>{t('common.save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.todoEditInlineCancel} onPress={onCancelEdit}>
            <Text style={styles.todoEditInlineCancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <Animated.View
        style={[
          styles.todoItem,
          {
            backgroundColor: theme.todoBg,
            borderLeftColor: effectiveBorderLeftColor,
            borderLeftWidth: theme.todoBorderLeftWidth,
            borderRadius: theme.todoBorderRadius,
          },
          isReorderMode && styles.todoItemReorder,
          isDragging && [styles.todoItemDragging, { backgroundColor: theme.todoDraggingBg }],
          wiggleStyle,
        ]}
      >
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={400}
        >
          <View ref={itemRef} style={styles.todoItemInner}>
            {isReorderMode && (
              <Pressable
                style={styles.gripHandle}
                onPressIn={handleDragStart}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <GripVertical size={14} color="#8e44ad" />
              </Pressable>
            )}

            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => { if (!isReorderMode) onToggle(todo); }}
              disabled={isReorderMode}
            >
              {todo.is_completed && <View style={styles.checkboxFilled} />}
            </TouchableOpacity>

            <View style={styles.todoTextContainer}>
              <Text
                style={[
                  styles.todoText,
                  { color: theme.todoTextColor },
                  todo.is_completed && [styles.todoTextCompleted, { color: theme.todoTextCompletedColor }],
                ]}
              >
                {todo.content}
              </Text>
            </View>

            {todo.reminder_at && (
              <Bell size={10} color="#e67e22" style={styles.reminderDot} />
            )}

            {isReorderMode && onMoveToArea && (
              <TouchableOpacity
                ref={moveButtonRef}
                style={styles.moveAreaButton}
                onPress={showAreaPicker}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MoveRight size={14} color="#8e44ad" />
              </TouchableOpacity>
            )}
          </View>

          {todo.schedule_start_minutes != null && (
            <View style={styles.scheduleBadge}>
              <CalendarClock size={9} color="#3b82f6" />
              <Text style={styles.scheduleBadgeText}>
                {minutesToTimeString(todo.schedule_start_minutes)}
                {todo.schedule_end_minutes != null ? `〜${minutesToTimeString(todo.schedule_end_minutes)}` : ''}
              </Text>
            </View>
          )}
        </Pressable>
      </Animated.View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menu, { top: menuPosition.y, left: menuPosition.x }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeMenuAndRun(() => onStartEdit(todo))}
            >
              <Pencil size={15} color="#3498db" />
              <Text style={[styles.menuItemText, { color: '#3498db' }]}>{t('workspace.editTask')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeMenuAndRun(() => onShowDetail?.(todo))}
            >
              <FileText size={15} color="#16a085" />
              <Text style={[styles.menuItemText, { color: '#16a085' }]}>{t('workspace.showTaskDetail')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeMenuAndRun(() => onSchedulePress?.(todo))}
            >
              <CalendarClock size={15} color="#3b82f6" />
              <Text style={[styles.menuItemText, { color: '#3b82f6' }]}>
                {todo.schedule_start_minutes != null ? t('workspace.scheduleChange') : t('workspace.scheduleSet')}
              </Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeMenuAndRun(() => onDelete(todo.id))}
            >
              <Trash2 size={15} color="#e74c3c" />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>{t('workspace.deleteTask')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={areaPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAreaPickerVisible(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setAreaPickerVisible(false)}
        >
          <View
            style={[
              styles.areaPicker,
              { top: areaPickerPosition.y, left: areaPickerPosition.x },
            ]}
          >
            <Text style={styles.areaPickerTitle}>{t('workspace.moveToAreaTitle')}</Text>
            {otherAreas.map((a) => (
              <TouchableOpacity
                key={a}
                style={styles.areaPickerItem}
                onPress={() => handleSelectArea(a)}
              >
                <MoveRight size={13} color="#8e44ad" />
                <Text style={styles.areaPickerItemText}>
                  {gridTitles?.[a] ?? a}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  todoItem: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6b6b',
  },
  todoItemReorder: {
    borderLeftColor: '#8e44ad',
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  todoItemDragging: {
    backgroundColor: '#fffacd',
    borderLeftColor: '#8e44ad',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  todoItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gripHandle: {
    paddingRight: 4,
    opacity: 0.7,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: '#2c3e50',
    borderRadius: 2,
    marginRight: 8,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  checkboxFilled: {
    width: 10,
    height: 10,
    backgroundColor: '#27ae60',
    borderRadius: 1,
  },
  todoTextContainer: {
    flex: 1,
  },
  todoText: {
    flex: 1,
    fontSize: 13,
    color: '#2c3e50',
    lineHeight: 18,
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#7f8c8d',
    opacity: 0.7,
  },
  reminderDot: {
    marginLeft: 4,
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 26,
    marginTop: 2,
  },
  scheduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 26,
    marginTop: 2,
  },
  scheduleBadgeText: {
    fontSize: 10,
    color: '#3b82f6',
    fontWeight: '500',
  },
  reminderBadgeText: {
    fontSize: 10,
    color: '#e67e22',
  },
  todoItemEditingInline: {
    borderLeftColor: '#3498db',
    backgroundColor: 'rgba(52, 152, 219, 0.08)',
  },
  todoEditInlineInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#3498db',
    paddingVertical: 2,
    minHeight: 20,
  },
  todoEditInlineButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
    marginLeft: 26,
  },
  todoEditInlineSave: {
    backgroundColor: '#27ae60',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  todoEditInlineSaveText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  todoEditInlineCancel: {
    backgroundColor: '#95a5a6',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  todoEditInlineCancelText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: { fontSize: 14, color: '#2c3e50', fontWeight: '500' },
  menuItemDanger: { color: '#e74c3c' },
  menuDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 12,
    marginVertical: 2,
  },
  moveAreaButton: {
    marginLeft: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(142, 68, 173, 0.12)',
  },
  areaPicker: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 6,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(142, 68, 173, 0.2)',
  },
  areaPickerTitle: {
    fontSize: 11,
    color: '#7f8c8d',
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  areaPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  areaPickerItemText: {
    fontSize: 13,
    color: '#2c3e50',
    fontWeight: '500',
  },
});
