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

export type FourGridTodoBorderColors = {
  top_left: string;
  top_right: string;
  bottom_left: string;
  bottom_right: string;
};

export const DEFAULT_FOUR_GRID_TODO_BORDER_COLORS: FourGridTodoBorderColors = {
  top_left: '#FF6B6B',
  top_right: '#FFD93D',
  bottom_left: '#4D96FF',
  bottom_right: '#6BCB77',
};

export type UserSettings = {
  id: string;
  user_id: string;
  default_workspace_type: WorkspaceType;
  todo_schedule_sync: boolean;
  start_time_notification_enabled: boolean;
  preferred_language: 'ja' | 'en';
  four_grid_todo_border_colors: FourGridTodoBorderColors;
  goal_reminders_enabled: boolean;
  goal_reminder_hour: number;
  voice_input_mode: 'raw' | 'clean' | 'summary' | 'bullet';
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
  description: string | null;
  color: string;
  is_from_todo: boolean;
  source_todo_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Todo = {
  id: string;
  user_id: string;
  workspace_id: string;
  content: string;
  description: string | null;
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
  schedule_start_minutes: number | null;
  schedule_end_minutes: number | null;
  schedule_notify_before: number | null;
  schedule_color: string | null;
  goal_id: string | null;
  course_name: string | null;
  repeat_rule: 'weekly' | null;
  notification_offsets: string | null; // comma-separated: "1d,2d,1h,2h"
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

// ============================================================
// AI agent infrastructure (v2.0)
// ============================================================

export type SubscriptionStatus =
  | 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'promo' | 'none';
// ASC 実商品の3階層 (basic/standard/pro)。
// 旧値 (ai_light/ai_standard/promo) は後方互換のため温存
// (DB migration 20260515 の plan CHECK 制約と一致させること)。
export type SubscriptionPlan =
  | 'basic'
  | 'standard'
  | 'pro'
  | 'ai_light'
  | 'ai_standard'
  | 'promo';
export type BillingCycle = 'monthly' | 'half_year' | 'yearly';
export type Platform = 'ios' | 'android' | 'web';
export type AIProvider = 'anthropic' | 'openai';
export type TokenTransactionKind =
  | 'grant' | 'carryover' | 'consume' | 'expire' | 'refund' | 'promo_grant' | 'admin_adjust';
export type PromoGrantKind = 'free_access' | 'token_grant';

export type UserSubscription = {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  billing_cycle: BillingCycle | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_grant_at: string | null;
  revenuecat_user_id: string | null;
  product_id: string | null;
  platform: Platform | null;
  created_at: string;
  updated_at: string;
};

export type AITokenBalance = {
  id: string;
  user_id: string;
  current_grant_yen: number;
  current_grant_expires_at: string | null;
  carryover_yen: number;
  carryover_expires_at: string | null;
  total_granted_yen: number;
  total_consumed_yen: number;
  total_expired_yen: number;
  last_consumed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AITokenTransaction = {
  id: string;
  user_id: string;
  kind: TokenTransactionKind;
  amount_yen: number;
  balance_after_yen: number;
  api_provider: AIProvider | null;
  api_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  conversation_id: string | null;
  message_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AIPromoCode = {
  code: string;
  description: string | null;
  grant_kind: PromoGrantKind;
  duration_days: number | null;
  token_yen: number | null;
  max_redemptions: number | null;
  current_redemptions: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type AIPromoRedemption = {
  id: string;
  user_id: string;
  code: string;
  redeemed_at: string;
  valid_until: string | null;
  granted_token_yen: number | null;
};

export type AIConversation = {
  id: string;
  user_id: string;
  title: string | null;
  message_count: number;
  total_cost_yen: number;
  mode: 'general' | 'goal_coach';
  created_at: string;
  last_message_at: string;
};

export type AIMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
};

export type UserMemory = {
  user_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
};

export type GoalLevel = 'long_term' | 'yearly' | 'half_year' | 'monthly';

export type Goal = {
  id: string;
  user_id: string;
  level: GoalLevel;
  parent_id: string | null;
  title: string;
  description: string | null;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type GoalMilestone = {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  target_date: string | null; // YYYY-MM-DD
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AppReleasePromo = {
  release_version: string;
  description: string | null;
  promo_starts_at: string;
  promo_ends_at: string;
  is_active: boolean;
  created_at: string;
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
        Insert: {
          id?: string;
          user_id: string;
          default_workspace_type?: WorkspaceType;
          todo_schedule_sync?: boolean;
          start_time_notification_enabled?: boolean;
          preferred_language?: 'ja' | 'en';
          four_grid_todo_border_colors?: FourGridTodoBorderColors;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<UserSettings, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      todos: {
        Row: Todo;
        Insert: {
          id?: string;
          user_id: string;
          workspace_id: string;
          content: string;
          description?: string | null;
          is_completed?: boolean;
          due_date?: string | null;
          grid_area?: GridArea | null;
          position_x?: number | null;
          position_y?: number | null;
          order?: number;
          created_at?: string;
          completed_at?: string | null;
          reminder_at?: string | null;
          notification_id?: string | null;
          course_name?: string | null;
          repeat_rule?: 'weekly' | null;
          notification_offsets?: string | null;
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
        Insert: Omit<Schedule, 'id' | 'created_at' | 'updated_at' | 'description'> & {
          id?: string;
          description?: string | null;
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
      user_subscriptions: {
        Row: UserSubscription;
        Insert: Omit<UserSubscription, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<UserSubscription, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      ai_token_balances: {
        Row: AITokenBalance;
        Insert: Omit<AITokenBalance, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<AITokenBalance, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      ai_token_transactions: {
        Row: AITokenTransaction;
        Insert: Omit<AITokenTransaction, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      ai_promo_codes: {
        Row: AIPromoCode;
        Insert: Omit<AIPromoCode, 'created_at' | 'current_redemptions'> & {
          current_redemptions?: number;
          created_at?: string;
        };
        Update: Partial<Omit<AIPromoCode, 'code' | 'created_at'>>;
        Relationships: [];
      };
      ai_promo_redemptions: {
        Row: AIPromoRedemption;
        Insert: Omit<AIPromoRedemption, 'id' | 'redeemed_at'> & {
          id?: string;
          redeemed_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'ai_promo_redemptions_code_fkey';
            columns: ['code'];
            referencedRelation: 'ai_promo_codes';
            referencedColumns: ['code'];
          }
        ];
      };
      app_release_promos: {
        Row: AppReleasePromo;
        Insert: Omit<AppReleasePromo, 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Omit<AppReleasePromo, 'release_version' | 'created_at'>>;
        Relationships: [];
      };
      goal_milestones: {
        Row: GoalMilestone;
        Insert: Omit<GoalMilestone, 'id' | 'created_at' | 'updated_at' | 'is_completed' | 'completed_at' | 'sort_order'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          is_completed?: boolean;
          completed_at?: string | null;
          sort_order?: number;
        };
        Update: Partial<Omit<GoalMilestone, 'id' | 'user_id' | 'goal_id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'goal_milestones_goal_id_fkey';
            columns: ['goal_id'];
            referencedRelation: 'goals';
            referencedColumns: ['id'];
          }
        ];
      };
      goals: {
        Row: Goal;
        Insert: Omit<Goal, 'id' | 'created_at' | 'updated_at' | 'is_completed' | 'completed_at' | 'sort_order'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          is_completed?: boolean;
          completed_at?: string | null;
          sort_order?: number;
        };
        Update: Partial<Omit<Goal, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'goals_parent_id_fkey';
            columns: ['parent_id'];
            referencedRelation: 'goals';
            referencedColumns: ['id'];
          }
        ];
      };
      ai_conversations: {
        Row: AIConversation;
        Insert: Omit<AIConversation, 'id' | 'created_at' | 'last_message_at' | 'message_count' | 'total_cost_yen'> & {
          id?: string;
          created_at?: string;
          last_message_at?: string;
          message_count?: number;
          total_cost_yen?: number;
        };
        Update: Partial<Omit<AIConversation, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      ai_messages: {
        Row: AIMessage;
        Insert: Omit<AIMessage, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'ai_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            referencedRelation: 'ai_conversations';
            referencedColumns: ['id'];
          }
        ];
      };
      ai_shared_context: {
        Row: {
          user_id: string;
          content: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          content?: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_memory: {
        Row: UserMemory;
        Insert: Omit<UserMemory, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<UserMemory, 'user_id' | 'key' | 'created_at'>>;
        Relationships: [];
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
