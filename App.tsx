import React from 'react';
// FIX: Corrected the import path to the main page component.
import IndexPage from './pages/index';

// App.tsx теперь является простой точкой входа, 
// которая рендерит основную страницу приложения.
// Вся сложная логика состояния и UI перенесена в /pages/index.tsx.
const App: React.FC = () => {
    return <IndexPage />;
};

export default App;
