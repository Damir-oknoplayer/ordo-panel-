import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Dashboard from './Dashboard';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('staff_profiles').select('*').eq('id', user.id).maybeSingle();

  return <Dashboard userId={user.id} userEmail={user.email!} userName={profile?.full_name || user.email!} />;
}
