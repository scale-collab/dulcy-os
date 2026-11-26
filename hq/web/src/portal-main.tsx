import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import PortalApp from './portal/PortalApp';

// The client portal's own entry (portal.html): only the portal screens are bundled here.
createRoot(document.getElementById('root')!).render(<StrictMode><PortalApp /></StrictMode>);
