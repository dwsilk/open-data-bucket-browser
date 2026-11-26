import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library only registers its own auto-cleanup when vitest runs with
// `globals: true`. This config does not, so unmount explicitly; without it a
// second render in the same file finds two of everything.
afterEach(cleanup);
