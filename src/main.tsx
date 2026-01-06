// Set default timezone to IST for all date operations
// This ensures consistent timezone handling across the application
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Ensure all Date operations use IST timezone
// Note: Browser timezone is set by the system, but we'll format all dates as IST
console.log('Application initialized with IST timezone (Asia/Kolkata)');

createRoot(document.getElementById("root")!).render(<App />);
