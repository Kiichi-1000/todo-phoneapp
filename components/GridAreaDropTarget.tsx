import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Keyboard, Platform,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { Todo, GridArea } from '@/types/database';
import DraggableTodoItem from './DraggableTodoItem';
import { FourGridSkin, FourGridTheme, getThemeForSkin } from '@/lib/fourGridSkin';
import { useLanguage } from '@/contexts/LanguageContext';

interface GridAreaDropTargetProps {
  area: GridArea;
  gridTitles: Record<GridArea, string>;
  editingArea: GridArea | null;
  editingAreaName: string;
  setEditingAreaName: (name: string) => void;
  saveAreaName: () => void;
  cancelEditingAreaName: () => void;
  startEditingAreaName: (area: GridArea) => void;
  progress: number;
  areaTodos: Todo[];
  editingTodo: Todo | null;
  editingTodoText: string;
  setEditingTodoText: (text: string) => void;
  saveEditingTodo: () => void;
  cancelEditingTodo: () => void;
  startEditingTodo: (todo: Todo) => void;
  toggleTodo: (todo: Todo) => void;
  deleteTodo: (todoId: string) => void;
  onQuickAdd: (area: GridArea, content: string) => void;
  onReminderPress: (todo: Todo) => void;
  onClearReminder: (todo: Todo) => void;
  onSchedulePress?: (todo: Todo) => void;
  isReorderMode?: boolean;
  onReorderEnd?: (area: GridArea, reorderedAreaTodos: Todo[]) => void;
  onMoveToArea?: (todo: Todo, targetArea: GridArea) => void;
  onActivateReorderMode?: () => void;
  skin?: FourGridSkin;
  todoBorderLeftColor?: string;
}

function InlineAddInput({
  area,
  onQuickAdd,
  theme,
}: {
  area: GridArea;
  onQuickAdd: (area: GridArea, content: string) => void;
  theme: FourGridTheme;
}) {
  const [text, setText] = useState('');
  const { t } = useLanguage();

  const handleSubmit = () => {
    if (text.trim()) {
      onQuickAdd(area, text.trim());
      setText('');
    }
    Keyboard.dismiss();
  };

  return (
    <TextInput
      style={[
        styles.inlineAddInput,
        { color: theme.inlineAddColor, borderBottomColor: theme.inlineAddBorder },
      ]}
      value={text}
      onChangeText={setText}
      placeholder={t('workspace.addTaskPlaceholder')}
      placeholderTextColor={theme.inlineAddPlaceholder}
      maxLength={100}
      onSubmitEditing={handleSubmit}
      blurOnSubmit
      returnKeyType="done"
    />
  );
}

export default function GridAreaDropTarget({
  area,
  gridTitles,
  editingArea,
  editingAreaName,
  setEditingAreaName,
  saveAreaName,
  cancelEditingAreaName,
  startEditingAreaName,
  progress,
  areaTodos,
  editingTodo,
  editingTodoText,
  setEditingTodoText,
  saveEditingTodo,
  cancelEditingTodo,
  startEditingTodo,
  toggleTodo,
  deleteTodo,
  onQuickAdd,
  onReminderPress,
  onClearReminder,
  onSchedulePress,
  isReorderMode = false,
  onReorderEnd,
  onMoveToArea,
  onActivateReorderMode,
  skin = 'postit',
  todoBorderLeftColor,
}: GridAreaDropTargetProps) {
  const [dragSession, setDragSession] = useState(0);
  const theme = useMemo(() => getThemeForSkin(skin), [skin]);
  const { t } = useLanguage();

  const activateReorderGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(300)
        .maxDistance(10)
        .runOnJS(true)
        .onStart(() => {
          if (!isReorderMode) {
            onActivateReorderMode?.();
          }
        }),
    [isReorderMode, onActivateReorderMode]
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Todo>) => (
      <View pointerEvents="auto">
        <ScaleDecorator activeScale={1.05}>
          <DraggableTodoItem
            todo={item}
            area={area}
            index={0}
            isEditing={editingTodo?.id === item.id}
            editingText={editingTodoText}
            onEditTextChange={setEditingTodoText}
            onSaveEdit={saveEditingTodo}
            onCancelEdit={cancelEditingTodo}
            onStartEdit={startEditingTodo}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onReminderPress={onReminderPress}
            onClearReminder={onClearReminder}
            onSchedulePress={onSchedulePress}
            isReorderMode={isReorderMode}
            isDragging={isActive}
            onDragHandle={drag}
            gridTitles={gridTitles}
            onMoveToArea={onMoveToArea}
            skin={skin}
            borderLeftColorOverride={todoBorderLeftColor}
          />
        </ScaleDecorator>
      </View>
    ),
    [
      area,
      editingTodo,
      editingTodoText,
      setEditingTodoText,
      saveEditingTodo,
      cancelEditingTodo,
      startEditingTodo,
      toggleTodo,
      deleteTodo,
      onReminderPress,
      onClearReminder,
      onSchedulePress,
      isReorderMode,
      gridTitles,
      onMoveToArea,
      skin,
      todoBorderLeftColor,
    ]
  );

  const handleDragEnd = useCallback(
    ({ data, from, to }: { data: Todo[]; from: number; to: number }) => {
      if (from === to) return;
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onReorderEnd?.(area, data);
      setDragSession(s => s + 1);
    },
    [area, onReorderEnd]
  );

  const handlePlaceholderIndexChange = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  }, []);

  return (
    <View
      style={[
        styles.gridAreaOuter,
        {
          backgroundColor: theme.cellBg,
          borderColor: theme.cellBorderColor,
          borderWidth: theme.cellBorderWidth,
          borderRadius: theme.cellBorderRadius,
          shadowColor: theme.cellShadowColor,
          shadowOffset: theme.cellShadowOffset,
          shadowOpacity: theme.cellShadowOpacity,
          shadowRadius: theme.cellShadowRadius,
          elevation: theme.cellElevation,
        },
        isReorderMode && styles.gridAreaReorder,
      ]}
    >
      <GestureDetector gesture={activateReorderGesture}>
        <View style={styles.gridCellHitLayer} collapsable={false} />
      </GestureDetector>
      <View pointerEvents="box-none" style={styles.gridAreaInner}>
        <View pointerEvents="box-none" style={styles.areaHeader}>
          {editingArea === area ? (
            <View pointerEvents="auto" style={styles.areaNameEditContainer}>
              <TextInput
                style={styles.areaNameInput}
                value={editingAreaName}
                onChangeText={setEditingAreaName}
                onSubmitEditing={saveAreaName}
                onBlur={saveAreaName}
                autoFocus
                maxLength={20}
                placeholder={t('workspace.areaNamePlaceholder')}
                placeholderTextColor="#999"
              />
              <TouchableOpacity style={styles.saveAreaNameButton} onPress={saveAreaName}>
                <Text style={styles.saveAreaNameButtonText}>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelAreaNameButton} onPress={cancelEditingAreaName}>
                <Text style={styles.cancelAreaNameButtonText}>x</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.areaTitleTouch}
              onPress={() => startEditingAreaName(area)}
              disabled={isReorderMode}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.areaTitle,
                  {
                    color: theme.titleColor,
                    fontStyle: theme.titleFontStyle,
                    fontWeight: theme.titleFontWeight,
                    letterSpacing: theme.titleLetterSpacing,
                  },
                  theme.titleUnderline
                    ? {
                        textDecorationLine: 'underline',
                        textDecorationStyle: theme.titleUnderlineStyle,
                        textDecorationColor: theme.titleUnderlineColor,
                      }
                    : { textDecorationLine: 'none' },
                ]}
              >
                {gridTitles[area]}
              </Text>
            </TouchableOpacity>
          )}
          <View pointerEvents="auto" style={styles.areaProgressWrap}>
            <Text style={styles.areaProgress}>{progress}%</Text>
          </View>
        </View>

        <View
          pointerEvents="box-none"
          style={[
            styles.progressBar,
            {
              backgroundColor: theme.progressTrack,
              borderColor: theme.progressTrackBorder,
              borderWidth: theme.progressTrackBorderWidth,
              borderRadius: theme.progressBarRadius,
            },
          ]}
        >
          <View
            pointerEvents="auto"
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: theme.progressFill,
                borderRadius: Math.max(theme.progressBarRadius - 1, 0),
              },
            ]}
          />
        </View>

        <View style={styles.todoListWrap} pointerEvents="box-none">
          <DraggableFlatList<Todo>
            key={`${area}-dnd-${dragSession}`}
            data={areaTodos}
            extraData={areaTodos.map(t => `${t.id}:${t.order}`).join('|')}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onDragEnd={handleDragEnd}
            onPlaceholderIndexChange={handlePlaceholderIndexChange}
            activationDistance={isReorderMode ? 8 : 10000}
            autoscrollSpeed={120}
            autoscrollThreshold={36}
            containerStyle={styles.todoList}
            keyboardShouldPersistTaps="handled"
          />
        </View>

        {!isReorderMode && (
          <View pointerEvents="auto">
            <InlineAddInput area={area} onQuickAdd={onQuickAdd} theme={theme} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gridAreaOuter: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    backgroundColor: '#fffacd',
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    borderWidth: 0.5,
    borderColor: '#f0e68c',
  },
  gridCellHitLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: 'transparent',
  },
  gridAreaInner: {
    flex: 1,
    minHeight: 0,
    zIndex: 1,
    padding: 12,
  },
  gridAreaReorder: {
    borderWidth: 1.5,
    borderColor: '#8e44ad',
    borderStyle: 'dashed',
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  areaTitleTouch: {
    alignSelf: 'flex-start',
    maxWidth: '78%',
  },
  areaTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#2c3e50',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dashed',
    textDecorationColor: '#e74c3c',
  },
  areaNameEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaNameInput: {
    flex: 1,
    fontSize: 14,
    color: '#2c3e50',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#d4af37',
    marginRight: 4,
  },
  saveAreaNameButton: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
  },
  saveAreaNameButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  cancelAreaNameButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelAreaNameButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  areaProgressWrap: { marginLeft: 8 },
  areaProgress: { fontSize: 12, color: '#666' },
  progressBar: {
    height: 4,
    backgroundColor: '#f5f5dc',
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d4af37',
  },
  progressFill: { height: '100%', backgroundColor: '#ff6b6b', borderRadius: 1 },
  todoListWrap: {
    flex: 1,
    minHeight: 0,
  },
  todoList: { flex: 1 },
  inlineAddInput: {
    fontSize: 12,
    color: '#2c3e50',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 175, 55, 0.3)',
    opacity: 0.8,
  },
});
