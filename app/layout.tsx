import './globals.css';

export const metadata = {
  title: 'Ordo Panel — обращения клиентов',
  description: 'Панель для переписки с клиентами через Telegram'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
