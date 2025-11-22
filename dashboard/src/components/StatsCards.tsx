import type { DashboardStats } from '../types';
import { Activity, DollarSign, Clock, Database } from 'lucide-react';

interface Props {
  stats: DashboardStats;
}

export default function StatsCards({ stats }: Props) {
  const cards = [
    {
      label: 'Total Requests',
      value: stats.totalRequests,
      icon: Activity,
      color: 'text-blue-400',
    },
    {
      label: 'Total Cost',
      value: `$${stats.totalCost.toFixed(4)}`,
      icon: DollarSign,
      color: 'text-green-400',
    },
    {
      label: 'Avg Latency',
      value: `${(stats.avgLatency / 1000).toFixed(2)}s`,
      icon: Clock,
      color: 'text-yellow-400',
    },
    {
      label: 'Total Tokens',
      value: stats.totalTokens.toLocaleString(),
      icon: Database,
      color: 'text-purple-400',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
      {cards.map((card) => (
        <div key={card.label} style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{card.label}</span>
            <card.icon size={20} className={card.color} style={{ opacity: 0.8 }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
