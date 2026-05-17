// Frontend deployment config.
// Set API_BASE_URL to your deployed backend (example: https://ai-attendance-api.onrender.com).

window.APP_CONFIG = window.APP_CONFIG || {};
const host = window.location.hostname || '';
const isLocalHost = host === 'localhost'
  || host === '127.0.0.1'
  || host === '::1'
  || /^192\.168\./.test(host)
  || /^10\./.test(host)
  || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

window.APP_CONFIG.API_BASE_URL = isLocalHost
  ? "http://localhost:3000"
  : "https://ai-attendance-api.onrender.com";
