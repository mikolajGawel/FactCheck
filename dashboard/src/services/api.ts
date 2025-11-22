import type { LogEntry } from '../types';

const API_URL = '/api/logs';

export async function fetchLogs(): Promise<LogEntry[]> {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error('Failed to fetch logs');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
}
