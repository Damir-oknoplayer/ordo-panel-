import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const admin = createAdminClient();

  const { data: staff } = await admin.from('staff_profiles').select('id, full_name');
  const { data: messages } = await admin.from('messages').select('staff_id, sender_type').eq('sender_type', 'staff');
  const { data: dialogs } = await admin.from('dialogs').select('assigned_to, status');

  const perStaff = (staff || []).map((s) => ({
    id: s.id,
    name: s.full_name,
    messagesSent: (messages || []).filter((m) => m.staff_id === s.id).length,
    dialogsHandled: (dialogs || []).filter((d) => d.assigned_to === s.id).length,
    dialogsClosed: (dialogs || []).filter((d) => d.assigned_to === s.id && d.status === 'closed').length
  }));

  const waitingNow = (dialogs || []).filter((d) => d.status === 'new' || d.status === 'waiting').length;

  return NextResponse.json({ perStaff, waitingNow, totalDialogs: (dialogs || []).length });
}
