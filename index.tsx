import React from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Remove .tsx extension to follow standard module resolution.
import App from './App';
import './index.css';
import { SpeedInsights } from "@vercel/speed-insights/react";

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
    <SpeedInsights />
  </React.StrictMode>
);