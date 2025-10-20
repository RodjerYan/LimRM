import React from 'react';
import IndexPage from './pages';

// App.tsx теперь является простой точкой входа, 
// которая рендерит основную страницу приложения.
// Вся сложная логика состояния и UI перенесена в /pages/index.tsx.
const App: React.FC = () => {
    return <IndexPage />;
};

export default App;