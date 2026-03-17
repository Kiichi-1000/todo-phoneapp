import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { LayoutRectangle } from 'react-native';
import { GridArea } from '@/types/database';

interface AreaLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  todoId: string;
  sourceArea: GridArea;
  sourceIndex: number;
}

interface DragDropContextType {
  dragState: DragState | null;
  hoveredArea: GridArea | null;
  startDrag: (todoId: string, sourceArea: GridArea, sourceIndex: number) => void;
  endDrag: () => void;
  updateHoveredArea: (absoluteX: number, absoluteY: number) => void;
  registerArea: (area: GridArea, layout: AreaLayout) => void;
  getHoveredArea: (absoluteX: number, absoluteY: number) => GridArea | null;
}

const DragDropContext = createContext<DragDropContextType>({
  dragState: null,
  hoveredArea: null,
  startDrag: () => {},
  endDrag: () => {},
  updateHoveredArea: () => {},
  registerArea: () => {},
  getHoveredArea: () => null,
});

export function DragDropProvider({ children }: { children: ReactNode }) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredArea, setHoveredArea] = useState<GridArea | null>(null);
  const areaLayouts = useRef<Record<string, AreaLayout>>({});

  const startDrag = useCallback((todoId: string, sourceArea: GridArea, sourceIndex: number) => {
    setDragState({ todoId, sourceArea, sourceIndex });
  }, []);

  const endDrag = useCallback(() => {
    setDragState(null);
    setHoveredArea(null);
  }, []);

  const registerArea = useCallback((area: GridArea, layout: AreaLayout) => {
    areaLayouts.current[area] = layout;
  }, []);

  const getHoveredArea = useCallback((absoluteX: number, absoluteY: number): GridArea | null => {
    const areas: GridArea[] = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];
    for (const area of areas) {
      const layout = areaLayouts.current[area];
      if (!layout) continue;
      if (
        absoluteX >= layout.x &&
        absoluteX <= layout.x + layout.width &&
        absoluteY >= layout.y &&
        absoluteY <= layout.y + layout.height
      ) {
        return area;
      }
    }
    return null;
  }, []);

  const updateHoveredArea = useCallback((absoluteX: number, absoluteY: number) => {
    const area = getHoveredArea(absoluteX, absoluteY);
    setHoveredArea(area);
  }, [getHoveredArea]);

  return (
    <DragDropContext.Provider
      value={{
        dragState,
        hoveredArea,
        startDrag,
        endDrag,
        updateHoveredArea,
        registerArea,
        getHoveredArea,
      }}
    >
      {children}
    </DragDropContext.Provider>
  );
}

export const useDragDrop = () => useContext(DragDropContext);
