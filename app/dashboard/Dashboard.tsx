'use client';

import DashboardClient from '@/components/Dashboard';

export default function Dashboard(props: { userId: string; userEmail: string; userName: string }) {
  return <DashboardClient {...props} />;
}
