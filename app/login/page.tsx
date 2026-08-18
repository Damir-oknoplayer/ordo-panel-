'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('Неверный email или пароль');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 32, width: 340, display: 'flex', flexDirection: 'column', gap: 14
      }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Вход в панель</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          Обращения клиентов из Telegram
        </p>
        <input
          type="email" placeholder="Email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
        />
        <input
          type="password" placeholder="Пароль" required value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
        />
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={loading} className="btn btn-primary" style={{ padding: 11 }}>
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
