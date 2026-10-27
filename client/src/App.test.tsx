import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { MFE_ERROR_EVENT, MFE_ROOT_ID } from './mfes';

function visit(path: string) {
  act(() => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json({ message: 'Welcome to the shop.' }))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  visit('/');
});

describe('App', () => {
  it('loads the home feature on /', async () => {
    visit('/');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy();
    expect(await screen.findByText('Welcome to the shop.')).toBeTruthy();
    expect(document.getElementById(MFE_ROOT_ID)?.hidden).toBe(true);
  });

  it('loads help on /help', async () => {
    visit('/help');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Help' })).toBeTruthy();
  });

  it('shows the MFE slot, not a Shell feature, on an MFE route', () => {
    visit('/catalog/42');
    render(<App />);
    expect(document.getElementById(MFE_ROOT_ID)?.hidden).toBe(false);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('shows a fallback when the active MFE fails', () => {
    visit('/cart');
    render(<App />);
    act(() => {
      window.dispatchEvent(new CustomEvent(MFE_ERROR_EVENT, { detail: 'cart' }));
    });
    expect(screen.getByText('The cart section is unavailable')).toBeTruthy();
  });

  it('isolates a throwing Shell feature and reports the error', async () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    visit('/test-error?kind=render');
    render(<App />);
    expect(await screen.findByText('This page is unavailable')).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith(new Error('Shell client test error (render)'));
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });

  it('marks the current page in the navigation', async () => {
    visit('/help');
    render(<App />);
    await screen.findByRole('heading', { name: 'Help' });
    expect(screen.getByRole('link', { name: 'Help' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(window.location.pathname).toBe('/');
  });

  it('switches the theme from the header and keeps it', async () => {
    visit('/help');
    render(<App />);
    await screen.findByRole('heading', { name: 'Help' });
    const theme = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Theme' });
    expect(theme.value).toBe('system');
    fireEvent.change(theme, { target: { value: 'dark' } });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('shop-theme')).toBe('dark');
    fireEvent.change(theme, { target: { value: 'system' } });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
