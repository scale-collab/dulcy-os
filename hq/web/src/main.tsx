import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// HQ's own phone type scale (index.css :root.hq); the client portal does not set it.
document.documentElement.classList.add('hq');

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
