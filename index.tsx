// Fix: Declare the 'Office' global object to resolve TypeScript errors
// because the type definitions are not being found by the build environment.
declare const Office: any;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const renderApp = () => {
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
};

// Simplified initialization for debugging
try {
    Office.onReady(() => {
        console.log("Office.onReady() has fired.");
        renderApp();
    });
} catch (error) {
    console.warn("Office context not available. Rendering app directly for debugging purposes.");
    // Fallback for rendering in a normal browser tab or if Office.js fails
    if (document.readyState === 'complete') {
        renderApp();
    } else {
        document.addEventListener('DOMContentLoaded', renderApp);
    }
}
