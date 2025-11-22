import type { LogEntry } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format } from 'date-fns';

interface Props {
  logs: LogEntry[];
}

export default function Charts({ logs }: Props) {
  // Aggregate data for charts
  const costByModel = logs.reduce((acc, log) => {
    const model = log.data.model;
    acc[model] = (acc[model] || 0) + (log.data.total_cost || 0);
    return acc;
  }, {} as Record<string, number>);

  const costData = Object.entries(costByModel).map(([name, value]) => ({ name, value }));

  const latencyData = logs.slice(-20).map(log => ({
    time: format(new Date(log.data.created_at), 'HH:mm:ss'),
    latency: log.data.latency / 1000, // Convert to seconds
    model: log.data.model
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Cost by Model</h3>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tick={{fill: 'var(--text-secondary)'}} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} tick={{fill: 'var(--text-secondary)'}} tickFormatter={(value) => `$${value.toFixed(3)}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
              />
              <Bar dataKey="value" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Latency Trend (Last 20 Requests)</h3>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tick={{fill: 'var(--text-secondary)'}} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} tick={{fill: 'var(--text-secondary)'}} unit="s" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
              />
              <Line type="monotone" dataKey="latency" stroke="var(--success)" strokeWidth={2} dot={{ fill: 'var(--success)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
