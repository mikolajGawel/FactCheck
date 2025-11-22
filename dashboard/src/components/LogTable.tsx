import { useState, useMemo } from 'react';
import type { LogEntry } from '../types';
import { format } from 'date-fns';
import { ArrowUpDown, ExternalLink } from 'lucide-react';

interface Props {
  logs: LogEntry[];
}

type SortField = 'created_at' | 'model' | 'latency' | 'total_cost' | 'tokens_completion';
type SortDirection = 'asc' | 'desc';

export default function LogTable({ logs }: Props) {
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedLogs = useMemo(() => {
    return logs
      .filter(log => {
        const search = filter.toLowerCase();
        return (
          log.data.model.toLowerCase().includes(search) ||
          (log.data.article_title?.toLowerCase() || '').includes(search) ||
          (log.data.url?.toLowerCase() || '').includes(search)
        );
      })
      .sort((a, b) => {
        const aValue = a.data[sortField] ?? 0;
        const bValue = b.data[sortField] ?? 0;
        
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [logs, filter, sortField, sortDirection]);

  const Th = ({ field, label }: { field: SortField, label: string }) => (
    <th 
      onClick={() => handleSort(field)}
      style={{ 
        padding: '1rem', 
        textAlign: 'left', 
        cursor: 'pointer', 
        borderBottom: '1px solid var(--border-color)',
        color: 'var(--text-secondary)',
        fontSize: '0.875rem',
        fontWeight: 600
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {label}
        <ArrowUpDown size={14} />
      </div>
    </th>
  );

  return (
    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <input
          type="text"
          placeholder="Filter by model, title, or URL..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            outline: 'none'
          }}
        />
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th field="created_at" label="Time" />
              <Th field="model" label="Model" />
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Article</th>
              <Th field="latency" label="Latency" />
              <Th field="tokens_completion" label="Tokens" />
              <Th field="total_cost" label="Cost" />
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedLogs.map((log) => (
              <tr key={log.data.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  {format(new Date(log.data.created_at), 'MMM d, HH:mm:ss')}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  <span style={{ 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '0.25rem', 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.75rem'
                  }}>
                    {log.data.model.split('/').pop()}
                  </span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 500 }}>{log.data.article_title || 'Unknown Title'}</span>
                    {log.data.url && (
                      <a 
                        href={log.data.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                      >
                        {new URL(log.data.url).hostname}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  {(log.data.latency / 1000).toFixed(2)}s
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  {log.data.tokens_completion.toLocaleString()}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                  ${log.data.total_cost.toFixed(5)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
