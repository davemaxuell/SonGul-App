import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Note: no StrictMode — the canvas surface attaches imperative pointer
// handlers and double-mounting would double-register them in dev.
createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
