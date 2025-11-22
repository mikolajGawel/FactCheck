import type { LogEntry } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, ScatterChart, Scatter, ZAxis, Legend, Cell 
} from 'recharts';
import { format } from 'date-fns';
import React from 'react';

interface Props {
  logs: LogEntry[];
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#84cc16', '#6366f1', '#d946ef',
  '#14b8a6', '#f43f5e', '#eab308', '#a855f7', '#22c55e'
];

const shortenModelName = (name: string) => {
  const parts = name.split('/');
  if (parts.length > 1) {
    return parts.slice(1).join('/');
  }
  return name.length > 20 ? name.substring(0, 20) + '...' : name;
};

const formatDuration = (ms: number) => {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
};

export default function Charts({ logs }: Props) {
  const [showNonReasoning, setShowNonReasoning] = React.useState(true);
  const [normalizeCost, setNormalizeCost] = React.useState(false);
  const [normalizeSpeed, setNormalizeSpeed] = React.useState(false);
  const [normalizeScatterCost, setNormalizeScatterCost] = React.useState(false);

  // Aggregate data for charts
  const modelStats = logs.reduce((acc, log) => {
    const model = log.data.model;
    if (!acc[model]) {
      acc[model] = {
        count: 0,
        totalCost: 0,
        totalLatency: 0,
        totalGenTime: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalReasoningTokens: 0,
        tpsSamples: []
      };
    }
    
    const stats = acc[model];
    stats.count++;
    stats.totalCost += log.data.total_cost || 0;
    stats.totalLatency += log.data.latency || 0;
    stats.totalGenTime += log.data.generation_time || 0;
    stats.totalTokens += log.data.tokens_completion || 0;
    stats.totalInputTokens += log.data.tokens_prompt || 0;
    stats.totalReasoningTokens += log.data.native_tokens_reasoning || 0;

    if (log.data.generation_time > 0) {
      const tps = (log.data.tokens_completion || 0) / (log.data.generation_time / 1000);
      stats.tpsSamples.push(tps);
    }

    return acc;
  }, {} as Record<string, { 
    count: number; 
    totalCost: number; 
    totalLatency: number; 
    totalGenTime: number; 
    totalTokens: number; 
    totalInputTokens: number;
    totalReasoningTokens: number;
    tpsSamples: number[];
  }>);

  const chartData = Object.entries(modelStats).map(([name, stats]) => {
    const avgTps = stats.tpsSamples.length > 0 
      ? stats.tpsSamples.reduce((a, b) => a + b, 0) / stats.tpsSamples.length 
      : 0;
    
    const avgInputTokens = stats.totalInputTokens / stats.count;
    const avgCost = stats.totalCost / stats.count;
    const avgLatency = stats.totalLatency / stats.count;
    const avgGenTime = stats.totalGenTime / stats.count;

    const avgCostPer1kInput = avgInputTokens > 0 ? (avgCost / avgInputTokens) * 1000 : 0;
    
    // Normalize speed (time) per 1k input tokens
    // Time / (InputTokens / 1000)
    const avgLatencyPer1kInput = avgInputTokens > 0 ? avgLatency / (avgInputTokens / 1000) : 0;
    const avgGenTimePer1kInput = avgInputTokens > 0 ? avgGenTime / (avgInputTokens / 1000) : 0;

    const outputPer1kInput = stats.totalInputTokens > 0 
      ? (stats.totalTokens / stats.totalInputTokens) * 1000 
      : 0;
    
    const reasoningPer1kInput = stats.totalInputTokens > 0
      ? (stats.totalReasoningTokens / stats.totalInputTokens) * 1000
      : 0;
      
    // Ensure non-reasoning doesn't go negative if reasoning > total for some reason (data inconsistency)
    const nonReasoningPer1kInput = Math.max(0, outputPer1kInput - reasoningPer1kInput);

    return {
      name: shortenModelName(name),
      fullName: name,
      cost: stats.totalCost,
      avgCost,
      avgCostPer1kInput,
      avgLatency,
      avgGenTime,
      avgTotalTime: avgLatency + avgGenTime,
      avgLatencyPer1kInput,
      avgGenTimePer1kInput,
      avgTps: avgTps,
      outputInputRatio: stats.totalInputTokens > 0 ? stats.totalTokens / stats.totalInputTokens : 0,
      reasoningPer1kInput,
      nonReasoningPer1kInput
    };
  });

  const latencyData = logs.slice(-20).map(log => ({
    time: format(new Date(log.data.created_at), 'HH:mm:ss'),
    latency: log.data.latency / 1000, // Convert to seconds
    model: shortenModelName(log.data.model)
  }));

  // Custom Legend Payload
  const legendPayload = chartData.map((entry, index) => ({
    value: entry.name,
    color: COLORS[index % COLORS.length]
  }));

  const renderLegend = () => (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center', padding: '10px 0 0 0', margin: 0, listStyle: 'none' }}>
      {legendPayload.map((entry, index) => (
        <li key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span style={{ width: 10, height: 10, backgroundColor: entry.color, borderRadius: '2px' }} />
          {entry.value}
        </li>
      ))}
    </ul>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
      
      {/* Average Cost by Model */}
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Average Cost by Model</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={normalizeCost} 
              onChange={(e) => setNormalizeCost(e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            Per 1k Input Tokens
          </label>
        </div>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" tick={false} height={10} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} tick={{fill: 'var(--text-secondary)'}} tickFormatter={(value) => `$${value.toFixed(4)}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                formatter={(value: number) => [`$${value.toFixed(6)}`, normalizeCost ? 'Cost / 1k Input' : 'Avg Cost']}
              />
              <Legend content={renderLegend} />
              <Bar dataKey={normalizeCost ? "avgCostPer1kInput" : "avgCost"} name={normalizeCost ? "Cost / 1k Input" : "Avg Cost"}>
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TPS Chart */}
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Avg Tokens Per Second (TPS)</h3>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" tick={false} height={10} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} tick={{fill: 'var(--text-secondary)'}} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                formatter={(value: number) => [value.toFixed(2), 'TPS']}
              />
              <Legend content={renderLegend} />
              <Bar dataKey="avgTps" name="Avg TPS">
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Speed Breakdown */}
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Speed Breakdown</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={normalizeSpeed} 
              onChange={(e) => setNormalizeSpeed(e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            Per 1k Input Tokens
          </label>
        </div>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" tick={false} height={10} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} tick={{fill: 'var(--text-secondary)'}} tickFormatter={formatDuration} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                formatter={(value: number) => formatDuration(value)}
              />
              <Legend content={renderLegend} />
              <Bar dataKey={normalizeSpeed ? "avgLatencyPer1kInput" : "avgLatency"} stackId="a" name={normalizeSpeed ? "Latency / 1k Input" : "Avg Latency"}>
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-lat-${index}`} fill={COLORS[index % COLORS.length]} opacity={0.5} />
                ))}
              </Bar>
              <Bar dataKey={normalizeSpeed ? "avgGenTimePer1kInput" : "avgGenTime"} stackId="a" name={normalizeSpeed ? "Gen Time / 1k Input" : "Avg Gen Time"}>
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-gen-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Output Tokens per 1k Input Tokens */}
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Output Tokens per 1k Input Tokens</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showNonReasoning} 
              onChange={(e) => setShowNonReasoning(e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            Show Non-Reasoning
          </label>
        </div>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" tick={false} height={10} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} tick={{fill: 'var(--text-secondary)'}} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                formatter={(value: number, name: string) => [value.toFixed(0), name]}
              />
              <Legend content={renderLegend} />
              {showNonReasoning && (
                <Bar dataKey="nonReasoningPer1kInput" stackId="a" name="Non-Reasoning Tokens">
                  {chartData.map((_entry, index) => (
                    <Cell key={`cell-nonreasoning-${index}`} fill={COLORS[index % COLORS.length]} opacity={0.3} />
                  ))}
                </Bar>
              )}
              <Bar dataKey="reasoningPer1kInput" stackId="a" name="Reasoning Tokens">
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-reasoning-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TPS vs Cost Efficiency */}
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>TPS vs Cost Efficiency</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={normalizeScatterCost} 
              onChange={(e) => setNormalizeScatterCost(e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            Cost per 1k Input
          </label>
        </div>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis 
                type="number" 
                dataKey={normalizeScatterCost ? "avgCostPer1kInput" : "avgCost"} 
                name={normalizeScatterCost ? "Cost / 1k Input" : "Avg Cost"} 
                unit="$" 
                stroke="var(--text-secondary)" 
                tick={{fill: 'var(--text-secondary)'}} 
                tickFormatter={(val) => val.toFixed(normalizeScatterCost ? 6 : 4)} 
              />
              <YAxis type="number" dataKey="avgTps" name="Speed" unit=" TPS" stroke="var(--text-secondary)" tick={{fill: 'var(--text-secondary)'}} width={80} />
              <ZAxis type="number" dataKey="outputInputRatio" range={[50, 400]} name="Output/Input Ratio" />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '0.25rem' }}>
                        <p style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{data.fullName}</p>
                        <p>Cost: ${normalizeScatterCost ? data.avgCostPer1kInput.toFixed(7) : data.avgCost.toFixed(5)}</p>
                        <p>Speed: {data.avgTps.toFixed(2)} TPS</p>
                        <p>Out/In Ratio: {data.outputInputRatio.toFixed(2)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter name="Models" data={chartData} fill="var(--accent-primary)">
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Scatter>
              <Legend content={renderLegend} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Total Time vs Cost Efficiency */}
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Total Time vs Cost Efficiency</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={normalizeScatterCost} 
              onChange={(e) => setNormalizeScatterCost(e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            Cost per 1k Input
          </label>
        </div>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis 
                type="number" 
                dataKey={normalizeScatterCost ? "avgCostPer1kInput" : "avgCost"} 
                name={normalizeScatterCost ? "Cost / 1k Input" : "Avg Cost"} 
                unit="$" 
                stroke="var(--text-secondary)" 
                tick={{fill: 'var(--text-secondary)'}} 
                tickFormatter={(val) => val.toFixed(normalizeScatterCost ? 6 : 4)} 
              />
              <YAxis 
                type="number" 
                dataKey="avgTotalTime" 
                name="Total Time" 
                unit="ms" 
                stroke="var(--text-secondary)" 
                tick={{fill: 'var(--text-secondary)'}} 
                tickFormatter={(val) => formatDuration(val)}
                width={80} 
              />
              <ZAxis type="number" dataKey="outputInputRatio" range={[50, 400]} name="Output/Input Ratio" />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '0.25rem' }}>
                        <p style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{data.fullName}</p>
                        <p>Cost: ${normalizeScatterCost ? data.avgCostPer1kInput.toFixed(7) : data.avgCost.toFixed(5)}</p>
                        <p>Time: {formatDuration(data.avgTotalTime)}</p>
                        <p>Out/In Ratio: {data.outputInputRatio.toFixed(2)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter name="Models" data={chartData} fill="var(--accent-primary)">
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Scatter>
              <Legend content={renderLegend} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Latency Trend */}
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)', gridColumn: '1 / -1' }}>
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
