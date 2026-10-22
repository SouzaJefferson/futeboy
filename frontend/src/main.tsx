import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/ui';
import { router } from './routes';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><ToastProvider><RouterProvider router={router} /></ToastProvider></AuthProvider></React.StrictMode>);
