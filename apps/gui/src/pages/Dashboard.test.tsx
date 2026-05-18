import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Dashboard from './Dashboard';

function mockFetch(responses: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      json: async () => responses[url] ?? {},
    })) as unknown as typeof fetch,
  );
}

describe('Dashboard', () => {
  test('shows chart fallback while chart module is loading', () => {
    mockFetch({
      '/api/sys/stats': {
        cpuUsage: 10,
        memoryUsage: { heapUsed: 100 * 1024 * 1024 },
        activeTasks: 1,
      },
    });

    render(<Dashboard />);
    expect(screen.getByText('加载图表中...')).toBeInTheDocument();
  });

  test('renders real task data from /api/tasks instead of mock cards', async () => {
    const mockTasks = [
      {
        id: 'task-1',
        name: 'My Recon Scan',
        type: 'recon',
        status: 'completed',
        progress: 100,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T01:00:00.000Z',
      },
      {
        id: 'task-2',
        name: 'Production Vuln Scan',
        type: 'web-vuln',
        status: 'failed',
        progress: 45,
        createdAt: '2025-01-02T00:00:00.000Z',
        updatedAt: '2025-01-02T00:30:00.000Z',
      },
    ];

    mockFetch({
      '/api/tasks': mockTasks,
      '/api/sys/stats': {
        cpuUsage: 10,
        memoryUsage: { heapUsed: 100 * 1024 * 1024 },
        activeTasks: 2,
      },
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('My Recon Scan')).toBeInTheDocument();
    });
    expect(screen.getByText('Production Vuln Scan')).toBeInTheDocument();

    expect(screen.queryByText('LLM Security Scan')).not.toBeInTheDocument();
    expect(screen.queryByText('Web Vulnerability Scan')).not.toBeInTheDocument();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
