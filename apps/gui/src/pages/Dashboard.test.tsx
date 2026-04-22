import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Dashboard from './Dashboard';

describe('Dashboard', () => {
  test('shows chart fallback while chart module is loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          cpuUsage: 10,
          memoryUsage: { heapUsed: 100 * 1024 * 1024 },
          activeTasks: 1
        })
      })) as unknown as typeof fetch
    );

    render(<Dashboard />);
    expect(screen.getByText('加载图表中...')).toBeInTheDocument();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
