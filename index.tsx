import React from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Add .tsx extension to ensure module is resolved correctly.
import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
