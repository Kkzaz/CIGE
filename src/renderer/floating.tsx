import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatingInput from './components/FloatingInput';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <FloatingInput />
  </React.StrictMode>
);
