import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './style.css';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && location.pathname === '/__dev/shop') {
  void import('./LowPolyShopDemo.js').then(({ LowPolyShopDemo }) => {
    root.render(<React.StrictMode><LowPolyShopDemo /></React.StrictMode>);
  });
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
