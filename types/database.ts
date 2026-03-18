export type WorkspaceType = 'four_grid' | 'individual' | 'note';
export type GridArea = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Workspace {
  id: string;
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
}

export interface UserSettings {
  id: string;
  default_workspace_type: WorkspaceType;
  todo_schedule_sync: boolean;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
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
}

export interface Todo {
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
}

export interface Reminder {
  id: string;
  todo_id: string;
  reminder_time: string;
  repeat_type: RepeatType;
  minutes_before: number[];
  is_active: boolean;
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: Workspace;
        Insert: Omit<Workspace, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Workspace, 'id' | 'created_at' | 'updated_at'>>;
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
        Insert: Omit<Todo, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Todo, 'id' | 'created_at'>>;
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
}
