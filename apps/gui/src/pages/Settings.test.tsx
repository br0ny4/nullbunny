import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Settings from './Settings';

function mockFetch(responses: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, _init?: RequestInit) => ({
      json: async () => responses[url] ?? {},
      ok: true,
      status: 200,
    })) as unknown as typeof fetch,
  );
}

describe('Settings', () => {
  test('loads and displays saved settings from /api/settings', async () => {
    mockFetch({
      '/api/settings': {
        ollamaBaseUrl: 'http://192.168.1.1:11434',
        geminiApiKey: 'test-gemini-key',
        anthropicApiKey: 'test-anthropic-key',
      },
    });

    render(<Settings />);

    await waitFor(() => {
      const ollamaInput = screen.getByLabelText('Ollama Base URL') as HTMLInputElement;
      expect(ollamaInput.value).toBe('http://192.168.1.1:11434');
    });

    const geminiInput = screen.getByLabelText('Gemini API Key') as HTMLInputElement;
    expect(geminiInput.value).toBe('test-gemini-key');

    const anthropicInput = screen.getByLabelText('Anthropic API Key') as HTMLInputElement;
    expect(anthropicInput.value).toBe('test-anthropic-key');

    expect(screen.getByRole('button', { name: /保存配置/ })).toBeInTheDocument();
  });

  test('sends PUT /api/settings when form is submitted', async () => {
    const user = userEvent.setup();
    let putBody: unknown = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/settings' && init?.method === 'PUT') {
          putBody = JSON.parse(init.body as string);
          return { json: async () => ({ ok: true }), ok: true, status: 200 };
        }
        return { json: async () => ({}), ok: true, status: 200 };
      }) as unknown as typeof fetch,
    );

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /保存配置/ })).toBeInTheDocument();
    });

    const ollamaInput = screen.getByLabelText('Ollama Base URL') as HTMLInputElement;
    await user.clear(ollamaInput);
    await user.type(ollamaInput, 'http://10.0.0.1:9999');

    const geminiInput = screen.getByLabelText('Gemini API Key') as HTMLInputElement;
    await user.clear(geminiInput);
    await user.type(geminiInput, 'updated-gemini-key');

    const saveButton = screen.getByRole('button', { name: /保存配置/ });
    await user.click(saveButton);

    await waitFor(() => {
      expect(putBody).toEqual(
        expect.objectContaining({
          ollamaBaseUrl: 'http://10.0.0.1:9999',
          geminiApiKey: 'updated-gemini-key',
        }),
      );
    });
  });

  test('shows default placeholder when no settings saved', async () => {
    mockFetch({ '/api/settings': {} });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Ollama Base URL')).toBeInTheDocument();
    });

    const ollamaInput = screen.getByLabelText('Ollama Base URL') as HTMLInputElement;
    expect(ollamaInput.placeholder).toBe('http://127.0.0.1:11434');

    const geminiInput = screen.getByLabelText('Gemini API Key') as HTMLInputElement;
    expect(geminiInput.placeholder).toBe('AIzaSy...');
  });

  test('shows error message when save fails', async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/settings' && init?.method === 'PUT') {
          return { json: async () => ({ error: 'Save failed' }), ok: false, status: 500 };
        }
        return { json: async () => ({}), ok: true, status: 200 };
      }) as unknown as typeof fetch,
    );

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /保存配置/ })).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /保存配置/ });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
