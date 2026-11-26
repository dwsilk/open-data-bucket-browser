import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BaseStyles, ThemeProvider } from '@primer/react';
import '@primer/primitives/dist/css/primitives.css';
import '@primer/primitives/dist/css/functional/themes/light.css';
import '@primer/primitives/dist/css/functional/themes/dark.css';
import './styles/global.css';
import { App } from './app/App';
import { loadIndex } from './modules/registry/load';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');
const root = createRoot(container);

loadIndex()
  .then(index => {
    root.render(
      <StrictMode>
        <ThemeProvider colorMode="auto">
          <BaseStyles>
            <App index={index} />
          </BaseStyles>
        </ThemeProvider>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // Nothing renders without the index, so say why rather than showing a blank page.
    root.render(
      <pre style={{ padding: 24, whiteSpace: 'pre-wrap' }}>
        The application could not start.{'\n'}
        {error instanceof Error ? error.message : String(error)}
      </pre>,
    );
  });
