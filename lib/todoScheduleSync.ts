import { supabase } from '@/lib/supabase';

const DEFAULT_TODO_SCHEDULE_COLOR = '#E8654A';

export async function upsertScheduleFromTodoSchedule(
  userId: string,
  todoId: string,
  content: string,
  date: string,
  startMin: number,
  endMin: number,
  color?: string | null,
): Promise<void> {
  const { data: existing } = await supabase
    .from('schedules')
    .select('id, color')
    .eq('user_id', userId)
    .eq('source_todo_id', todoId)
    .eq('is_from_todo', true)
    .maybeSingle() as { data: { id: string; color: string } | null; error: any };

  if (existing) {
    await supabase
      .from('schedules')
      .update({
        date,
        start_minutes: startMin,
        end_minutes: endMin,
        title: content,
        color: color ?? existing.color,
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('schedules').insert({
      user_id: userId,
      date,
      start_minutes: startMin,
      end_minutes: endMin,
      title: content,
      color: color ?? DEFAULT_TODO_SCHEDULE_COLOR,
      is_from_todo: true,
      source_todo_id: todoId,
    });
  }
}

export async function deleteScheduleFromTodo(
  userId: string,
  todoId: string,
): Promise<void> {
  await supabase
    .from('schedules')
    .delete()
    .eq('user_id', userId)
    .eq('source_todo_id', todoId)
    .eq('is_from_todo', true);
}
