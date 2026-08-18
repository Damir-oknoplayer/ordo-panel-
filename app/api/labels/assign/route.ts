import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { dialogId, labelId, action } = await req.json(); // action: 'add' | 'remove'

  if (action === 'add') {
    const { error } = await supabase.from('dialog_labels').insert({ dialog_id: dialogId, label_id: labelId });
    if (error && !error.message.includes('duplicate')) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await supabase.from('dialog_labels').delete().eq('dialog_id', dialogId).eq('label_id', labelId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
