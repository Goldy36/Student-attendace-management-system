/**
 * AI-ATTEND STUDENT LOGIC v2.0
 * Fixed: Function binding and duplicate entry prevention
 */

function configureApiBase() {
    if (window.__apiFetchConfigured) {
        return window.__apiBaseUrl || '';
    }

    const manualBase = (window.API_BASE_URL || localStorage.getItem('API_BASE_URL') || '').trim();
    const { protocol, hostname, port } = window.location;
    const isLocalNetworkHost = ['localhost', '127.0.0.1', '::1'].includes(hostname)
        || /^192\.168\./.test(hostname)
        || /^10\./.test(hostname)
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    const shouldUseLocalBackend = protocol === 'file:' || !hostname || (isLocalNetworkHost && port !== '3000');
    const inferredBase = !manualBase && shouldUseLocalBackend ? 'http://localhost:3000' : '';

    const baseUrl = (manualBase || inferredBase).replace(/\/+$/, '');
    const localFallbackBase = 'http://localhost:3000';

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (resource, options) => {
        if (typeof resource === 'string' && resource.startsWith('/api/')) {
            const apiPath = resource;
            const primaryUrl = baseUrl ? `${baseUrl}${apiPath}` : apiPath;
            try {
                return await nativeFetch(primaryUrl, options);
            } catch (primaryError) {
                if (baseUrl && baseUrl !== localFallbackBase) {
                    try {
                        const fallbackResponse = await nativeFetch(`${localFallbackBase}${apiPath}`, options);
                        window.__apiBaseUrl = localFallbackBase;
                        return fallbackResponse;
                    } catch (_) {
                        // Ignore fallback errors and throw the original issue below.
                    }
                }
                throw primaryError;
            }
        }
        return nativeFetch(resource, options);
    };

    window.__apiBaseUrl = baseUrl;
    window.__apiFetchConfigured = true;
    return baseUrl;
}

const API_BASE_URL = configureApiBase();
const video = document.getElementById('webcam');
const verifyBtn = document.getElementById('verifyButton');
const sessionInput = document.getElementById('sessionInput');
const wifiLabel = document.getElementById('wifi-label');
const token = localStorage.getItem('token');

// 1. Initialize Camera immediately
if (video && navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            console.log("Webcam initialized successfully.");
        })
        .catch(err => {
            console.error("Webcam Error:", err);
            alert("Please enable camera permissions.");
        });
}

// 2. Simulated WiFi Check
let isConnectedToCollegeWifi = true; // Set to false to test proxy prevention
setTimeout(() => {
    if (!wifiLabel) return;
    if(isConnectedToCollegeWifi) {
        wifiLabel.innerHTML = '<i class="fas fa-wifi mr-1"></i> COLLEGE WIFI: SECURE';
        wifiLabel.className = "mt-2 inline-block px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold tracking-widest uppercase";
    } else {
        wifiLabel.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> UNKNOWN NETWORK';
        wifiLabel.className = "mt-2 inline-block px-3 py-1 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold tracking-widest uppercase";
    }
}, 1500);

// 3. MAIN ATTENDANCE FUNCTION
async function handleVerify() {
    if (!sessionInput) return;

    const enteredID = sessionInput.value.trim().toUpperCase();
    const activeSection = localStorage.getItem('activeSection');

    const response = await fetch('/api/student/mark-attendance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
            section: activeSection,
            sessionCode: enteredID,
            faceData: null
        })
    });

    const data = await response.json();

    if (response.ok) {
        alert(data.message);
        location.reload(); 
    } else {
        alert("Error: " + (data.error || data.message || "Unable to mark attendance"));
    }
}

if (verifyBtn) {
    verifyBtn.addEventListener('click', handleVerify);
}
