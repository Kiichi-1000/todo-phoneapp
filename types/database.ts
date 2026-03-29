export type WorkspaceType = 'four_grid' | 'individual' | 'note';
export type GridArea = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly';

export type Workspace = {
  id: string;
  user_id: string;
  title: string;
  type: WorkspaceType;
  date: string;
  area_titles?: {
    top_left?: string;
    top_right?: string;
    bottom_left?: string;
    bottom_right?: string;
  };
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  id: string;
  user_id: string;
  default_workspace_type: WorkspaceType;
  todo_schedule_sync: boolean;
  created_at: string;
  updated_at: string;
};

export type Schedule = {
  id: string;
  user_id: string;
  date: string;
  start_minutes: number;
  end_minutes: number;
  title: string;
  color: string;
  is_from_todo: boolean;
  source_todo_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Todo = {
  id: string;
  workspace_id: string;
  content: string;
  is_completed: boolean;
  due_date: string | null;
  grid_area: GridArea | null;
  position_x: number | null;
  position_y: number | null;
  order: number;
  created_at: string;
  completed_at: string | null;
  reminder_at: string | null;
  notification_id: string | null;
};

export type Reminder = {
  id: string;
  todo_id: string;
  reminder_time: string;
  repeat_type: RepeatType;
  minutes_before: number[];
  is_active: boolean;
};

export type RoutineSlot = 'morning' | 'daytime' | 'evening';

export type RoutineTemplate = {
  id: string;
  user_id: string;
  updated_at: string;
};

export type RoutineTemplateItem = {
  id: string;
  template_id: string;
  slot: RoutineSlot;
  sort_order: number;
  title: string;
  short_label: string | null;
  is_active: boolean;
  today_only_date: string | null;
  created_at: string;
  updated_at: string;
};

export type RoutineCompletion = {
  id: string;
  user_id: string;
  item_id: string;
  date: string;
  completed_at: string;
};

export type RoutineSkip = {
  id: string;
  user_id: string;
  item_id: string;
  date: string;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: Workspace;
        Insert: Omit<Workspace, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          area_titles?: Workspace['area_titles'];
        };
        Update: Partial<Omit<Workspace, 'id' | 'created_at' | 'updated_at'>> & {
          area_titles?: Workspace['area_titles'];
        };
        Relationships: [];
      };
      user_settings: {
        Row: UserSettings;
        Insert: Omit<UserSettings, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<UserSettings, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      todos: {
        Row: Todo;
        Insert: Omit<Todo, 'id' | 'created_at' | 'order'> & {
          id?: string;
          created_at?: string;
          order?: number;
        };
        Update: Partial<Omit<Todo, 'id'>>;
        Relationships: [
          {
            foreignKeyName: 'todos_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          }
        ];
      };
      reminders: {
        Row: Reminder;
        Insert: Omit<Reminder, 'id'> & {
          id?: string;
        };
        Update: Partial<Omit<Reminder, 'id'>>;
        Relationships: [
          {
            foreignKeyName: 'reminders_todo_id_fkey';
            columns: ['todo_id'];
            referencedRelation: 'todos';
            referencedColumns: ['id'];
          }
        ];
      };
      schedules: {
        Row: Schedule;
        Insert: Omit<Schedule, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Schedule, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [
          {
            foreignKeyName: 'schedules_source_todo_id_fkey';
            columns: ['source_todo_id'];
            referencedRelation: 'todos';
            referencedColumns: ['id'];
          }
        ];
      };
      routine_templates: {
        Row: RoutineTemplate;
        Insert: {
          id?: string;
          user_id: string;
          updated_at?: string;
        };
        Update: Partial<Pick<RoutineTemplate, 'updated_at'>>;
        Relationships: [];
      };
      routine_template_items: {
        Row: RoutineTemplateItem;
        Insert: {
          id?: string;
          template_id: string;
          slot: RoutineSlot;
          sort_order?: number;
          title?: string;
          short_label?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<RoutineTemplateItem, 'id' | 'template_id' | 'created_at'> & {
            created_at?: string;
          }
        >;
        Relationships: [
          {
            foreignKeyName: 'routine_template_items_template_id_fkey';
            columns: ['template_id'];
            referencedRelation: 'routine_templates';
            referencedColumns: ['id'];
          }
        ];
      };
      routine_completions: {
        Row: RoutineCompletion;
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          date: string;
          completed_at?: string;
        };
        Update: Partial<Pick<RoutineCompletion, 'completed_at'>>;
        Relationships: [
          {
            foreignKeyName: 'routine_completions_item_id_fkey';
            columns: ['item_id'];
            referencedRelation: 'routine_template_items';
            referencedColumns: ['id'];
          }
        ];
      };
      routine_skips: {
        Row: RoutineSkip;
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          date: string;
        };
        Update: Partial<Pick<RoutineSkip, 'date'>>;
        Relationships: [
          {
            foreignKeyName: 'routine_skips_item_id_fkey';
            columns: ['item_id'];
            referencedRelation: 'routine_template_items';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
