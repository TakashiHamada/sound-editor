// Entry point: installs the empty-state geometric placeholder, then mounts <App /> into #root.
import './placeholder/geometricPlaceholder.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
