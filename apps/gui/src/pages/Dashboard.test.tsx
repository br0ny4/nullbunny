import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

function mockFetch(responses: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      json: async () => responses[url] ?? {},
    })) as unknown as typeof fetch,
  );
}

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
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

    renderWithRouter();
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

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('My Recon Scan')).toBeInTheDocument();
    });
    expect(screen.getByText('Production Vuln Scan')).toBeInTheDocument();

    expect(screen.queryByText('LLM Security Scan')).not.toBeInTheDocument();
    expect(screen.queryByText('Web Vulnerability Scan')).not.toBeInTheDocument();
  });

  test('task cards link to /tasks/:id', async () => {
    const mockTasks = [
      {
        id: 'task-abc',
        name: 'My Recon Scan',
        type: 'recon',
        status: 'completed',
        progress: 100,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T01:00:00.000Z',
      },
    ];

    mockFetch({
      '/api/tasks': mockTasks,
      '/api/sys/stats': {
        cpuUsage: 10,
        memoryUsage: { heapUsed: 100 * 1024 * 1024 },
        activeTasks: 1,
      },
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('My Recon Scan')).toBeInTheDocument();
    });

    const link = screen.getByText('My Recon Scan').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/tasks/task-abc');
  });

  test('has a quick "new scan" entry that links to /tasks/new', () => {
    mockFetch({
      '/api/sys/stats': {
        cpuUsage: 10,
        memoryUsage: { heapUsed: 100 * 1024 * 1024 },
        activeTasks: 0,
      },
    });

    renderWithRouter();

    const newScanLink = screen.getByText('新建扫描');
    expect(newScanLink).toBeInTheDocument();
    expect(newScanLink.closest('a')?.getAttribute('href')).toBe('/tasks/new');
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
