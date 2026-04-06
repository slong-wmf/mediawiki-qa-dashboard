import '@testing-library/jest-dom';

// Recharts uses ResizeObserver to respond to container size changes.
// jsdom does not implement ResizeObserver, so we provide a no-op stub.
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Silence React's act() warning noise in tests that intentionally do not
// await state updates (e.g. the "starts in loading state" assertions).
// Errors are still thrown; this only suppresses the console warning.
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('act(')) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
