import { useEffect, useState } from 'react';
import type { LogEntry, DashboardStats } from '../types';
import { fetchLogs } from '../services/api';
import StatsCards from './StatsCards';
import Charts from './Charts';
import LogTable from './LogTable';
import { RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchLogs();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const stats: DashboardStats = {
    totalRequests: logs.length,
    totalCost: logs.reduce((acc, log) => acc + (log.data.total_cost || 0), 0),
    avgLatency: logs.length ? logs.reduce((acc, log) => acc + (log.data.latency || 0), 0) / logs.length : 0,
    totalTokens: logs.reduce((acc, log) => acc + (log.data.tokens_completion || 0) + (log.data.tokens_prompt || 0), 0),
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>LLM Evaluation Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Real-time performance metrics for fact-checking analysis</p>
        </div>
        <button 
          onClick={loadData}
          disabled={loading}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.75rem 1.5rem', 
            backgroundColor: 'var(--accent-primary)', 
            color: 'white', 
            border: 'none', 
            borderRadius: '0.5rem',
            fontWeight: 600,
            opacity: loading ? 0.7 : 1
          }}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </header>

      <StatsCards stats={stats} />
      <Charts logs={logs} />
      <LogTable logs={logs} />
    </div>
  );
}
