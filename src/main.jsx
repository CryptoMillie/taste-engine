import { ClerkProvider } from '@clerk/react';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Register service worker for PWA support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPubKey} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </StrictMode>,
)