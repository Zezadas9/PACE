import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { registerServiceWorker } from './app/registerServiceWorker';

import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/agenda.css';
import './styles/training.css';
import './styles/brand.css';
import './styles/polish.css';
import './styles/hues.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

registerServiceWorker();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
