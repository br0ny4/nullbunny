import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from './App';

describe('App navigation', () => {
  test('marks current route as active in sidebar', async () => {
    window.history.pushState({}, '', '/reports');
    render(<App />);

    const current = await screen.findByRole('link', { name: '报告中心' });
    expect(current).toHaveAttribute('aria-current', 'page');
  });
});
