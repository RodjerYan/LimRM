// Fix: Declare the 'Office' global object to resolve TypeScript errors
// because the type definitions are not being found by the build environment.
declare const Office: any;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Office Add-in initialization
Office.onReady((info) => {
  // We only want to run the app in Excel
  if (info.host === Office.HostType.Excel) {
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
  }
});