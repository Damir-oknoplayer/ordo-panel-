import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Используется только на сервере (в API-роутах), никогда в браузере.
// service role key даёт полный доступ к базе в обход RLS —
// поэтому он хранится только в переменных окружения сервера.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
