export type DialogStatus = 'new' | 'waiting' | 'in_progress' | 'closed';

export interface Dialog {
  id: string;
  telegram_chat_id: number;
  client_name: string;
  client_username: string | null;
  status: DialogStatus;
  assigned_to: string | null;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string;
  draft_text: string | null;
  is_bot_blocked: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  dialog_id: string;
  sender_type: 'client' | 'staff' | 'system';
  staff_id: string | null;
  telegram_message_id: number | null;
  content_type: 'text' | 'photo' | 'document' | 'voice';
  text_body: string | null;
  file_url: string | null;
  file_name: string | null;
  caption: string | null;
  reply_to_message_id: string | null;
  is_internal_note: boolean;
  is_forwarded: boolean;
  forwarded_from: string | null;
  is_deleted: boolean;
  send_status: 'sending' | 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface CannedReply {
  id: string;
  shortcut: string;
  body: string;
  has_variables: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}
