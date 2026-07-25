import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { FollowProvider } from './context/follow.jsx'
import { ServicesProvider } from './context/services.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  </React.StrictMode>
)
