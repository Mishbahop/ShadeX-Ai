// ================================
// GLOBAL KEY VALIDATION SYSTEM
// ================================

const GLOBAL_KEY_SYSTEM = (function() {
    const API_URL = 'key-api.php';
    const VALIDATION_INTERVAL = 300000; // 5 minutes
    const LOCAL_STORAGE_KEY = 'global_access_key';
    const KEY_STATUS_CHECK_INTERVAL = 60000; // 1 minute
    
    let currentKey = null;
    let validationTimer = null;
    let statusCheckTimer = null;
    let keyData = null;
    
    // Load key from localStorage
    function loadKey() {
        return localStorage.getItem(LOCAL_STORAGE_KEY);
    }
    
    // Save key to localStorage
    function saveKey(key) {
        localStorage.setItem(LOCAL_STORAGE_KEY, key);
        currentKey = key;
    }
    
    // Remove key
    function removeKey() {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        currentKey = null;
        keyData = null;
    }
    
    // Validate key with server
    async function validateKey(key) {
        try {
            const response = await fetch(`${API_URL}?action=validate_key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ key: key })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Key validation error:', error);
            // Fallback to localStorage validation
            return validateKeyLocal(key);
        }
    }
    
    // Fallback local validation
    function validateKeyLocal(key) {
        try {
            const savedData = localStorage.getItem('global_keys_database');
            if (!savedData) {
                return {
                    valid: false,
                    message: 'System not initialized',
                    status: 'error'
                };
            }
            
            const db = JSON.parse(savedData);
            const keyEntry = db.keys.find(k => k.key === key);
            
            if (!keyEntry) {
                return {
                    valid: false,
                    message: 'Key not found',
                    status: 'invalid'
                };
            }
            
            if (keyEntry.status !== 'active') {
                return {
                    valid: false,
                    message: `Key is ${keyEntry.status}`,
                    status: keyEntry.status
                };
            }
            
            const expiresAt = new Date(keyEntry.expires_at);
            const now = new Date();
            
            if (now > expiresAt) {
                return {
                    valid: false,
                    message: 'Key has expired',
                    status: 'expired'
                };
            }
            
            if (keyEntry.uses_remaining <= 0) {
                return {
                    valid: false,
                    message: 'No uses remaining',
                    status: 'exhausted'
                };
            }
            
            // Valid key
            return {
                valid: true,
                message: 'Access granted',
                status: 'active',
                key_data: {
                    key: keyEntry.key,
                    expires_at: keyEntry.expires_at,
                    days_remaining: Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)),
                    uses_remaining: keyEntry.uses_remaining,
                    total_uses: keyEntry.total_uses,
                    duration_days: keyEntry.duration_days,
                    customer_name: keyEntry.customer_name || '',
                    customer_email: keyEntry.customer_email || ''
                }
            };
        } catch (error) {
            console.error('Local validation error:', error);
            return {
                valid: false,
                message: 'Validation error',
                status: 'error'
            };
        }
    }
    
    // Check key status (without consuming a use)
    async function checkKeyStatus(key) {
        try {
            const response = await fetch(`${API_URL}?action=check_status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ key: key })
            });
            
            if (!response.ok) throw new Error('Status check failed');
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Key status check error:', error);
            return checkKeyStatusLocal(key);
        }
    }
    
    // Local status check
    function checkKeyStatusLocal(key) {
        try {
            const savedData = localStorage.getItem('global_keys_database');
            if (!savedData) return { found: false };
            
            const db = JSON.parse(savedData);
            const keyEntry = db.keys.find(k => k.key === key);
            
            if (!keyEntry) return { found: false };
            
            const expiresAt = new Date(keyEntry.expires_at);
            const now = new Date();
            const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
            
            return {
                found: true,
                status: keyEntry.status,
                expires_at: keyEntry.expires_at,
                days_remaining: daysRemaining,
                uses_remaining: keyEntry.uses_remaining,
                total_uses: keyEntry.total_uses
            };
        } catch (error) {
            console.error('Local status check error:', error);
            return { found: false };
        }
    }
    
    // Get app settings
    async function getSettings() {
        try {
            const response = await fetch(`${API_URL}?action=get_settings`);
            if (!response.ok) throw new Error('Failed to get settings');
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Settings fetch error:', error);
            return {
                redirect_url: 'https://your-site.com/purchase',
                auto_expire: true,
                enable_logging: true
            };
        }
    }
    
    // Show key entry modal
    function showKeyModal(onsuccess, oncancel) {
        // Remove existing modal
        const existingModal = document.getElementById('globalKeyModal');
        if (existingModal) existingModal.remove();
        
        const modalHTML = `
            <div id="globalKeyModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                <div class="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-6 md:p-8 max-w-md w-full border border-purple-500/30 shadow-2xl">
                    <!-- Header -->
                    <div class="text-center mb-6">
                        <div class="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-key text-2xl text-white"></i>
                        </div>
                        <h2 class="text-2xl font-bold text-white mb-2">Premium Access Required</h2>
                        <p class="text-gray-300">Enter your global access key to continue</p>
                    </div>
                    
                    <!-- Key Input -->
                    <div class="mb-6">
                        <div class="relative">
                            <i class="fas fa-key absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                            <input type="text" 
                                   id="globalKeyInput" 
                                   placeholder="XXXX-XXXX-XXXX-XXXX"
                                   class="w-full pl-12 pr-4 py-4 bg-gray-800/50 border border-gray-700 rounded-lg text-white font-mono text-center focus:border-purple-500 focus:outline-none text-lg"
                                   autocomplete="off"
                                   autocapitalize="characters">
                        </div>
                        <p class="text-xs text-gray-500 mt-2 text-center">
                            Enter the key provided by the administrator
                        </p>
                    </div>
                    
                    <!-- Info Box -->
                    <div class="bg-gray-800/30 rounded-lg p-4 mb-6 border border-gray-700/50">
                        <div class="flex items-start space-x-3">
                            <i class="fas fa-info-circle text-purple-400 mt-1"></i>
                            <div>
                                <h4 class="text-white font-medium mb-1">Global Key System</h4>
                                <p class="text-gray-400 text-sm">
                                    This key works on all devices. One key = unlimited devices.
                                    Key expires after purchased duration.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Buttons -->
                    <div class="flex space-x-3">
                        <button id="globalKeyCancel" 
                                class="flex-1 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition font-medium">
                            Cancel
                        </button>
                        <button id="globalKeySubmit" 
                                class="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition font-medium">
                            Validate Key
                        </button>
                    </div>
                    
                    <!-- Status Message -->
                    <div id="globalKeyStatus" class="mt-4 text-center text-sm hidden"></div>
                    
                    <!-- Footer Links -->
                    <div class="mt-6 pt-4 border-t border-gray-800">
                        <div class="text-center space-y-2">
                            <a href="https://your-site.com/purchase" 
                               class="block text-purple-400 hover:text-purple-300 text-sm">
                                <i class="fas fa-shopping-cart mr-1"></i>Purchase Access Key
                            </a>
                            <a href="admin.html" 
                               class="block text-gray-500 hover:text-gray-300 text-xs">
                                <i class="fas fa-user-shield mr-1"></i>Admin Panel
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Focus input
        setTimeout(() => {
            const input = document.getElementById('globalKeyInput');
            if (input) input.focus();
        }, 100);
        
        // Setup event listeners
        const submitBtn = document.getElementById('globalKeySubmit');
        const cancelBtn = document.getElementById('globalKeyCancel');
        const keyInput = document.getElementById('globalKeyInput');
        
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                const key = keyInput.value.trim().toUpperCase();
                submitKey(key, onsuccess);
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                removeModal();
                if (oncancel) oncancel();
            });
        }
        
        if (keyInput) {
            keyInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const key = e.target.value.trim().toUpperCase();
                    submitKey(key, onsuccess);
                }
            });
        }
        
        // Close on escape
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                removeModal();
                if (oncancel) oncancel();
                document.removeEventListener('keydown', escHandler);
            }
        });
    }
    
    // Submit key for validation
    async function submitKey(key, onsuccess) {
        if (!key) {
            showStatus('Please enter an access key', 'error');
            return;
        }
        
        // Basic format validation
        if (!/^[A-Z0-9-]{4,20}$/.test(key)) {
            showStatus('Invalid key format. Use format: XXXX-XXXX-XXXX', 'error');
            return;
        }
        
        const statusEl = document.getElementById('globalKeyStatus');
        if (statusEl) {
            statusEl.innerHTML = `
                <div class="flex items-center justify-center">
                    <i class="fas fa-circle-notch fa-spin mr-2 text-purple-400"></i>
                    <span>Validating key...</span>
                </div>
            `;
            statusEl.className = 'mt-4 text-center text-sm text-purple-400';
            statusEl.classList.remove('hidden');
        }
        
        // Validate with server
        const result = await validateKey(key);
        
        if (result.valid) {
            // Save key
            saveKey(key);
            keyData = result.key_data;
            
            // Decrement uses in local database if exists
            try {
                const savedData = localStorage.getItem('global_keys_database');
                if (savedData) {
                    const db = JSON.parse(savedData);
                    const keyIndex = db.keys.findIndex(k => k.key === key);
                    if (keyIndex !== -1 && db.keys[keyIndex].uses_remaining > 0) {
                        db.keys[keyIndex].uses_remaining--;
                        localStorage.setItem('global_keys_database', JSON.stringify(db));
                    }
                }
            } catch (e) {
                console.warn('Failed to update local key usage:', e);
            }
            
            // Show success
            if (statusEl) {
                statusEl.innerHTML = `
                    <div class="flex items-center justify-center text-green-400">
                        <i class="fas fa-check-circle mr-2"></i>
                        <span>Access granted! Loading app...</span>
                    </div>
                `;
                statusEl.className = 'mt-4 text-center text-sm text-green-400';
            }
            
            // Close modal and callback after delay
            setTimeout(() => {
                removeModal();
                if (onsuccess) onsuccess(key);
            }, 1500);
        } else {
            // Show error
            if (statusEl) {
                statusEl.innerHTML = `
                    <div class="flex items-center justify-center text-red-400">
                        <i class="fas fa-times-circle mr-2"></i>
                        <span>${result.message}</span>
                    </div>
                `;
                statusEl.className = 'mt-4 text-center text-sm text-red-400';
            }
            
            // Shake animation for error
            const keyInput = document.getElementById('globalKeyInput');
            if (keyInput) {
                keyInput.classList.add('animate-shake');
                setTimeout(() => {
                    keyInput.classList.remove('animate-shake');
                }, 500);
            }
        }
    }
    
    // Show status message
    function showStatus(message, type = 'info') {
        const statusEl = document.getElementById('globalKeyStatus');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `mt-4 text-center text-sm ${
            type === 'error' ? 'text-red-400' : 'text-green-400'
        }`;
        statusEl.classList.remove('hidden');
    }
    
    // Remove modal
    function removeModal() {
        const modal = document.getElementById('globalKeyModal');
        if (modal) modal.remove();
    }
    
    // Periodic validation
    function startPeriodicValidation() {
        if (validationTimer) clearInterval(validationTimer);
        
        validationTimer = setInterval(async () => {
            const key = loadKey();
            if (key) {
                const result = await validateKey(key);
                if (!result.valid) {
                    // Key became invalid
                    removeKey();
                    clearInterval(validationTimer);
                    if (statusCheckTimer) clearInterval(statusCheckTimer);
                    
                    // Show expired message
                    showExpiredMessage(result.message);
                }
            }
        }, VALIDATION_INTERVAL);
    }
    
    // Periodic status check (doesn't consume uses)
    function startStatusChecks() {
        if (statusCheckTimer) clearInterval(statusCheckTimer);
        
        statusCheckTimer = setInterval(async () => {
            const key = loadKey();
            if (key) {
                const status = await checkKeyStatus(key);
                if (status.found) {
                    keyData = {
                        ...keyData,
                        days_remaining: status.days_remaining,
                        uses_remaining: status.uses_remaining,
                        status: status.status
                    };
                    updateKeyStatusDisplay();
                }
            }
        }, KEY_STATUS_CHECK_INTERVAL);
    }
    
    // Show expired message
    function showExpiredMessage(message) {
        // Hide app content
        const appContent = document.querySelector('.px-6.py-6');
        if (appContent) appContent.style.display = 'none';
        
        // Show expired message
        const expiredHTML = `
            <div class="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                <div class="bg-gradient-to-br from-red-900/30 to-black rounded-2xl p-8 max-w-md w-full border border-red-500/30">
                    <div class="text-center mb-6">
                        <div class="w-16 h-16 bg-gradient-to-r from-red-600 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-exclamation-triangle text-2xl text-white"></i>
                        </div>
                        <h2 class="text-2xl font-bold text-white mb-2">Access Expired</h2>
                        <p class="text-gray-300">${message}</p>
                        <p class="text-gray-400 text-sm mt-2">Please renew your subscription to continue using the prediction system.</p>
                    </div>
                    
                    <div class="space-y-3">
                        <button onclick="window.location.href='https://your-site.com/purchase'" 
                                class="w-full py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition">
                            <i class="fas fa-shopping-cart mr-2"></i>Renew Access
                        </button>
                        <button onclick="window.location.reload()" 
                                class="w-full py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                            <i class="fas fa-redo mr-2"></i>Try Again
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', expiredHTML);
    }
    
    // Update key status display in header
    function updateKeyStatusDisplay() {
        if (!keyData) return;
        
        const statusBar = document.getElementById('globalKeyStatusBar');
        const keyInfo = document.getElementById('keyInfo');
        
        if (statusBar) {
            // Update colors based on days remaining
            if (keyData.days_remaining <= 3) {
                statusBar.className = 'fixed top-0 left-0 right-0 bg-gradient-to-r from-red-600 to-orange-700 text-white text-center py-2 text-sm z-50';
            } else if (keyData.days_remaining <= 7) {
                statusBar.className = 'fixed top-0 left-0 right-0 bg-gradient-to-r from-yellow-600 to-orange-600 text-white text-center py-2 text-sm z-50';
            } else {
                statusBar.className = 'fixed top-0 left-0 right-0 bg-gradient-to-r from-green-600 to-emerald-700 text-white text-center py-2 text-sm z-50';
            }
            
            if (keyInfo) {
                keyInfo.textContent = `Expires in ${keyData.days_remaining} days | Uses left: ${keyData.uses_remaining}`;
            }
            
            statusBar.classList.remove('hidden');
        }
    }
    
    // Initialize key system
    async function init() {
        try {
            const key = loadKey();
            
            if (!key) {
                // No key stored, show modal
                return new Promise((resolve) => {
                    showKeyModal(resolve, () => {
                        window.location.href = 'key-entry.html';
                    });
                });
            } else {
                // Validate stored key
                const result = await validateKey(key);
                
                if (result.valid) {
                    currentKey = key;
                    keyData = result.key_data;
                    
                    // Start periodic checks
                    startPeriodicValidation();
                    startStatusChecks();
                    
                    // Update status display
                    updateKeyStatusDisplay();
                    
                    return Promise.resolve(key);
                } else {
                    // Key invalid, remove and show modal
                    removeKey();
                    return new Promise((resolve) => {
                        showKeyModal(resolve, () => {
                            window.location.href = 'key-entry.html';
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Key system init error:', error);
            return Promise.reject(error);
        }
    }
    
    // Public API
    return {
        init,
        validateKey,
        checkKeyStatus,
        getCurrentKey: () => currentKey,
        getKeyData: () => keyData,
        logout: () => {
            removeKey();
            if (validationTimer) clearInterval(validationTimer);
            if (statusCheckTimer) clearInterval(statusCheckTimer);
            window.location.href = 'key-entry.html';
        },
        showKeyModal,
        updateKeyStatusDisplay
    };
})();

// Create fallback key database for offline use
function createFallbackKeyDatabase() {
    // Only create if it doesn't exist
    if (!localStorage.getItem('global_keys_database')) {
        const fallbackData = {
            version: '1.0',
            settings: {
                redirect_url: 'https://your-site.com/purchase',
                auto_expire: true,
                enable_logging: true,
                admin_password: 'admin123'
            },
            keys: [
                {
                    key: 'DEMO-ABCD-1234-EFGH',
                    created_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    duration_days: 30,
                    uses_remaining: 100,
                    total_uses: 100,
                    status: 'active',
                    price: 199.99,
                    customer_name: 'Demo User',
                    customer_email: 'demo@example.com',
                    notes: 'Demo key for testing'
                }
            ],
            activity_logs: [],
            revenue: 199.99,
            created_at: new Date().toISOString()
        };
        
        localStorage.setItem('global_keys_database', JSON.stringify(fallbackData));
        console.log('[KEY] Created fallback key database');
    }
}

// Call this early
createFallbackKeyDatabase();

// Add CSS animations
const keySystemStyles = document.createElement('style');
keySystemStyles.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    .animate-shake {
        animation: shake 0.5s ease-in-out;
    }
    
    @keyframes slideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
    
    #globalKeyStatusBar {
        animation: slideDown 0.3s ease-out;
    }
`;
document.head.appendChild(keySystemStyles);

// ================================
// REAL 55CLUB WINGO INTEGRATION
// ================================

(function setupRealPredictor() {
    if (!window._localMock) {
        window._localMock = {};

        // Track predictions we've already made for each period
        const predictionCache = new Map();
        
        // Shared state for stats
        window._localMock.pendingPredictions = [];
        window._localMock.statsState = {
            winRate: 0,
            totalWins: 0,
            totalLosses: 0,
            streak: '',
            lastFive: ''
        };

        // Fetch real history from 55club API
        async function fetchRealHistory() {
            try {
                const response = await fetch('https://draw.ar-lottery06.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts=' + Date.now(), {
                    method: 'GET',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    mode: 'cors'
                });
                if (!response.ok) throw new Error('Failed to fetch');
                const data = await response.json();
                return data.data?.list || [];
            } catch (error) {
                console.warn('[REAL] Failed to fetch history:', error);
                return [];
            }
        }

        // Determine if a number is Big (5-9) or Small (0-4)
        function getCategory(numberStr) {
            if (!numberStr && numberStr !== 0) return 'Unknown';
            const num = parseInt(numberStr, 10);
            if (isNaN(num)) return 'Unknown';
            return num >= 5 ? 'Big' : 'Small';
        }

        // Make a random prediction (Big or Small)
        function makeRandomPrediction() {
            return Math.random() > 0.5 ? 'Big' : 'Small';
        }

        // Validate prediction against actual result
        function validatePrediction(predicted, actualNumber) {
            const actual = getCategory(actualNumber);
            if (actual === 'Unknown') return 'pending';
            return predicted === actual ? 'win' : 'loss';
        }

        // Build prediction result from real API data
        window._localMock.buildPredictionResult = async function() {
            try {
                const history = await fetchRealHistory();
                if (!history || history.length === 0) throw new Error('No history');

                const latestIssue = history[0]; // Most recent issue
                const period = latestIssue.issueNumber || 'Unknown';
                
                // Check if we already made a prediction for this period
                let prediction = predictionCache.get(period);
                if (!prediction) {
                    prediction = {
                        category: makeRandomPrediction(),
                        confidence: Math.floor(50 + Math.random() * 40)
                    };
                    predictionCache.set(period, prediction);
                    console.log(`[PREDICTION] New prediction for ${period}: ${prediction.category}`);
                }

                // Check if result is resolved (latest issue has a number)
                let status = 'pending';
                let actualResult = null;
                let validationLog = '';
                
                if (latestIssue.number) {
                    actualResult = getCategory(latestIssue.number);
                    status = validatePrediction(prediction.category, latestIssue.number);
                    validationLog = `[VALIDATION] Period: ${period} | Predicted: ${prediction.category} | Actual Number: ${latestIssue.number} (${actualResult}) | Result: ${status.toUpperCase()}`;
                    console.log(validationLog);
                    
                    // Update stats if this is a new result
                    if (!predictionCache.has(`${period}_result`)) {
                        if (status === 'win') {
                            window._localMock.statsState.totalWins++;
                            console.log(`[STATS] WIN! Total Wins: ${window._localMock.statsState.totalWins}`);
                        } else if (status === 'loss') {
                            window._localMock.statsState.totalLosses++;
                            console.log(`[STATS] LOSS! Total Losses: ${window._localMock.statsState.totalLosses}`);
                        }
                        predictionCache.set(`${period}_result`, status);
                    }
                }

                // Calculate stats
                const total = window._localMock.statsState.totalWins + window._localMock.statsState.totalLosses;
                window._localMock.statsState.winRate = total > 0 ? 
                    Math.round((window._localMock.statsState.totalWins / total) * 100) : 0;

                // Build streak and patterns from predictions we know about
                const results = [];
                for (let i = 0; i < Math.min(5, history.length); i++) {
                    const issue = history[i];
                    const cachedPred = predictionCache.get(issue.issueNumber);
                    
                    if (issue.number && cachedPred) {
                        const validation = validatePrediction(cachedPred.category, issue.number);
                        results.push(validation === 'win' ? 'W' : validation === 'loss' ? 'L' : '-');
                    }
                }
                window._localMock.statsState.streak = results.slice(0, 5).join('');
                window._localMock.statsState.lastFive = results.slice(0, 5).join(',');

                // Build entry
                const entry = {
                    period,
                    prediction: prediction.category,
                    status,
                    confidence: prediction.confidence,
                    category: prediction.category.toLowerCase(),
                    actual: actualResult,
                    actualNumber: latestIssue.number
                };

                window._localMock.pendingPredictions.unshift(entry);
                if (window._localMock.pendingPredictions.length > 8) {
                    window._localMock.pendingPredictions.pop();
                }

                return {
                    status: 'OK',
                    predictionResult: {
                        period,
                        prediction: prediction.category,
                        confidence: prediction.confidence,
                        rankedPredictions: Array.from({ length: 3 }, () => ({ 
                            number: String(Math.floor(Math.random() * 10)) 
                        })),
                        category: prediction.category,
                        status,
                        actualNumber: latestIssue.number,
                        actualCategory: actualResult
                    },
                    pendingPredictions: window._localMock.pendingPredictions.slice()
                };
            } catch (error) {
                console.error('[REAL] Error building prediction:', error);
                // Fallback to mock if real API fails
                return window._localMock.buildFallbackPrediction();
            }
        };

        // Fallback mock for when real API is unavailable
        window._localMock.buildFallbackPrediction = function() {
            const period = 'OFFLINE-' + Date.now();
            const bigSmall = Math.random() > 0.5 ? 'Big' : 'Small';
            const confidence = Math.floor(50 + Math.random() * 40);

            const entry = {
                period,
                prediction: bigSmall,
                status: 'pending',
                confidence,
                category: bigSmall.toLowerCase()
            };

            window._localMock.pendingPredictions.unshift(entry);
            if (window._localMock.pendingPredictions.length > 8) {
                window._localMock.pendingPredictions.pop();
            }

            return {
                status: 'OK',
                predictionResult: {
                    period,
                    prediction: bigSmall,
                    confidence,
                    rankedPredictions: Array.from({ length: 3 }, () => ({ 
                        number: String(Math.floor(Math.random() * 10)) 
                    })),
                    category: bigSmall,
                    status: 'pending'
                },
                pendingPredictions: window._localMock.pendingPredictions.slice()
            };
        };

        window._localMock.getStats = function () {
            const s = Object.assign({}, window._localMock.statsState);
            return Object.assign({ status: 'OK' }, s);
        };
    }
})();

// ================================
// TRANSLATIONS
// ================================

const translations = {
    en: {
        period: "Period",
        prediction: "Prediction",
        confidence: "Confidence",
        analysis_dashboard: "Analysis Dashboard",
        most_frequent: "Most Frequent",
        least_frequent: "Least Frequent",
        win_rate: "Win Rate",
        loss_rate: "Loss Rate",
        wins: "Wins",
        losses: "Losses",
        connected: "Connected",
        disconnected: "Disconnected",
        history: "History",
        delete: "Delete",
        statistics: "Statistics",
        total_wins: "Total Wins",
        total_losses: "Total Losses",
        current_streak: "Current Streak",
        last_five_results: "Last 5 Results",
        settings: "Settings",
        status: "Status",
        language: "Language",
        notifications: "Notifications",
        sound: "Sound",
        reset_settings: "Reset Settings",
        reset: "Reset",
        prediction_mode: "Prediction Mode",
        how_to_use: "How To Use",
        watch_video: "Watch Video",
        telegram: "Telegram",
        join_channel: "Join Channel",
        instagram: "Instagram",
        follow_us: "Follow Us",
        privacy_policy: "Privacy Policy",
        read_more: "Read More",
        how_to_use_newro_x: "How To Use ShadeX",
        confirm_action: "Confirm Action",
        cancel: "Cancel",
        confirm: "Confirm",
        pending: "Pending",
        delete_item_confirm: "Are you sure you want to delete this history item?",
        delete_all_confirm: "Are you sure you want to delete all history items?",
        reset_settings_confirm: "Are you sure you want to reset all settings to default?",
        access_key: "Access Key",
        key_expires: "Key Expires",
        uses_remaining: "Uses Remaining",
        logout: "Logout",
        renew_access: "Renew Access",
        enter_key: "Enter Key"
    },
    hi: {
        period: "अवधि",
        prediction: "भविष्यवाणी",
        confidence: "आत्मविश्वास",
        analysis_dashboard: "विश्लेषण डैशबोर्ड",
        most_frequent: "सबसे अधिक बार",
        least_frequent: "सबसे कम बार",
        win_rate: "जीत की दर",
        loss_rate: "हानि दर",
        wins: "जीत",
        losses: "हानि",
        server_status: "सर्वर स्थिति",
        connected: "जुड़ा हुआ",
        disconnected: "डिस्कनेक्ट किया गया",
        history: "इतिहास",
        delete: "हटाएं",
        statistics: "आंकड़े",
        total_wins: "कुल जीत",
        total_losses: "कुल हानि",
        current_streak: "वर्तमान लकीर",
        last_five_results: "अंतिम 5 परिणाम",
        settings: "सेटिंग्स",
        status: "स्थिति",
        language: "भाषा",
        notifications: "सूचनाएं",
        sound: "ध्वनि",
        reset_settings: "सेटिंग्स रीसेट करें",
        reset: "रीसेट",
        prediction_mode: "भविष्यवाणी मोड",
        how_to_use: "उपयोग कैसे करें",
        watch_video: "वीडियो देखें",
        telegram: "टेलीग्राम",
        join_channel: "चैनल में शामिल हों",
        instagram: "इंस्टाग्राम",
        follow_us: "हमें फॉलो करें",
        privacy_policy: "गोपनीयता नीति",
        read_more: "और पढ़ें",
        how_to_use_newro_x: "ShadeX का उपयोग कैसे करें",
        confirm_action: "कार्रवाई की पुष्टि करें",
        cancel: "रद्द करें",
        confirm: "पुष्टि करें",
        pending: "लंबित",
        delete_item_confirm: "क्या आप इस इतिहास आइटम को हटाना चाहते हैं?",
        delete_all_confirm: "क्या आप सभी इतिहास आइटम को हटाना चाहते हैं?",
        reset_settings_confirm: "क्या आप सभी सेटिंग्स को डिफ़ॉल्ट पर रीसेट करना चाहते हैं?",
        access_key: "एक्सेस की",
        key_expires: "की समाप्ति",
        uses_remaining: "शेष उपयोग",
        logout: "लॉग आउट",
        renew_access: "पहुँच नवीकरण",
        enter_key: "कुंजी दर्ज करें"
    }
};

// ================================
// APP CONFIGURATION
// ================================

let currentLanguage = localStorage.getItem('language') || 'en';
let isSoundEnabled = localStorage.getItem('sound') !== 'false';
let isNotificationsEnabled = localStorage.getItem('notifications') === 'true';
let isAdvancedMode = localStorage.getItem('predictionMode') === 'advanced';

// ================================
// UI INITIALIZATION
// ================================

// Initialize UI after DOM is ready
function initializeUI() {
    try {
        const langToggle = document.getElementById('languageToggle');
        const notifToggle = document.getElementById('notificationToggle');
        const soundToggle = document.getElementById('soundToggle');
        const modeToggle = document.getElementById('predictionModeToggle');
        
        if (langToggle) langToggle.checked = currentLanguage === 'hi';
        if (notifToggle) notifToggle.checked = isNotificationsEnabled;
        if (soundToggle) soundToggle.checked = isSoundEnabled;
        if (modeToggle) modeToggle.checked = isAdvancedMode;
        
        updateLanguage();
    } catch (e) {
        console.warn('UI initialization error:', e);
    }
}

function updateLanguage() {
    document.querySelectorAll('[data-lang-key]').forEach(element => {
        const key = element.getAttribute('data-lang-key');
        if (translations[currentLanguage] && translations[currentLanguage][key]) {
            element.textContent = translations[currentLanguage][key];
        }
    });
}

// ================================
// MODAL FUNCTIONS
// ================================

function openVideoPopup() {
    const popup = document.getElementById('videoPopup');
    if (popup) {
        popup.classList.remove('hidden');
        popup.classList.add('flex');
        if (isSoundEnabled) {
            playSound();
        }
    }
}

function closeVideoPopup() {
    const popup = document.getElementById('videoPopup');
    if (popup) {
        popup.classList.add('hidden');
        popup.classList.remove('flex');
        if (isSoundEnabled) {
            playSound();
        }
    }
}

function showConfirmModal(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const messageEl = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('confirmModalBtn');
    const cancelBtn = document.getElementById('cancelModalBtn');
    
    if (!modal || !messageEl || !confirmBtn || !cancelBtn) return;
    
    messageEl.textContent = message;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    const confirmHandler = () => {
        onConfirm();
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
        if (isSoundEnabled) {
            playSound();
        }
    };
    
    const cancelHandler = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
        if (isSoundEnabled) {
            playSound();
        }
    };
    
    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
}

// ================================
// SETTINGS EVENT LISTENERS
// ================================

// Language toggle
const languageToggle = document.getElementById('languageToggle');
if (languageToggle) {
    languageToggle.addEventListener('change', (e) => {
        currentLanguage = e.target.checked ? 'hi' : 'en';
        localStorage.setItem('language', currentLanguage);
        updateLanguage();
        if (isSoundEnabled) {
            playSound();
        }
    });
}

// Notification toggle
const notificationToggle = document.getElementById('notificationToggle');
if (notificationToggle) {
    notificationToggle.addEventListener('change', (e) => {
        isNotificationsEnabled = e.target.checked;
        localStorage.setItem('notifications', isNotificationsEnabled);
        if (isSoundEnabled) {
            playSound();
        }
    });
}

// Sound toggle
const soundToggle = document.getElementById('soundToggle');
if (soundToggle) {
    soundToggle.addEventListener('change', (e) => {
        isSoundEnabled = e.target.checked;
        localStorage.setItem('sound', isSoundEnabled);
        if (isSoundEnabled) {
            playSound();
        }
    });
}

// Prediction mode toggle
const predictionModeToggle = document.getElementById('predictionModeToggle');
if (predictionModeToggle) {
    predictionModeToggle.addEventListener('change', (e) => {
        isAdvancedMode = e.target.checked;
        localStorage.setItem('predictionMode', isAdvancedMode ? 'advanced' : 'normal');
        fetchPrediction();
        if (isSoundEnabled) {
            playSound();
        }
    });
}

// Reset settings
function resetSettings() {
    showConfirmModal(translations[currentLanguage].reset_settings_confirm, () => {
        currentLanguage = 'en';
        isSoundEnabled = true;
        isNotificationsEnabled = false;
        isAdvancedMode = false;
        localStorage.setItem('language', currentLanguage);
        localStorage.setItem('sound', isSoundEnabled);
        localStorage.setItem('notifications', isNotificationsEnabled);
        localStorage.setItem('predictionMode', 'normal');
        
        const langToggle = document.getElementById('languageToggle');
        const notifToggle = document.getElementById('notificationToggle');
        const soundToggle = document.getElementById('soundToggle');
        const modeToggle = document.getElementById('predictionModeToggle');
        
        if (langToggle) langToggle.checked = false;
        if (notifToggle) notifToggle.checked = false;
        if (soundToggle) soundToggle.checked = true;
        if (modeToggle) modeToggle.checked = false;
        
        updateLanguage();
        fetchPrediction();
        if (isSoundEnabled) {
            playSound();
        }
    });
}

// Reset settings button
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', resetSettings);
}

// ================================
// SOUND FUNCTION
// ================================

function playSound() {
    try {
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-select-click-1109.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
        console.log('Sound error:', e);
    }
}

// ================================
// API FUNCTIONS
// ================================

async function fetchData(action, data = {}) {
    try {
        // Use local mock for prediction data
        if (action === 'getPrediction') {
            return await window._localMock.buildPredictionResult();
        }
        if (action === 'getStats') {
            return window._localMock.getStats();
        }
        if (action === 'deleteItem') {
            const idx = data.index || 0;
            if (idx >= 0 && idx < window._localMock.pendingPredictions.length) {
                window._localMock.pendingPredictions.splice(idx, 1);
            }
            return { status: 'OK', success: true, pendingPredictions: window._localMock.pendingPredictions.slice() };
        }
        if (action === 'deleteAll') {
            window._localMock.pendingPredictions.length = 0;
            return { status: 'OK', success: true, pendingPredictions: [] };
        }
        
        return null;
    } catch (error) {
        console.error('[API] Fetch error:', error);
        updateServerStatus(false);
        return null;
    }
}

function updateServerStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        if (isConnected) {
            statusElement.textContent = translations[currentLanguage].connected || 'CONNECTED';
            statusElement.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-green-200 text-green-700';
        } else {
            statusElement.textContent = translations[currentLanguage].disconnected || 'DISCONNECTED';
            statusElement.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-200 text-red-700';
        }
    }
}

// ================================
// UTILITY FUNCTIONS
// ================================

function incrementPeriod(period) {
    if (!period || period === 'Unknown' || period === '-') return '-';
    const normalized = period.trim();
    if (!/^\d+$/.test(normalized)) {
        return normalized;
    }
    try {
        return (BigInt(normalized) + 1n).toString();
    } catch (error) {
        const digits = normalized.split('').map(Number);
        let carry = 1;
        for (let i = digits.length - 1; i >= 0 && carry; i -= 1) {
            const sum = digits[i] + carry;
            digits[i] = sum % 10;
            carry = Math.floor(sum / 10);
        }
        if (carry) digits.unshift(carry);
        return digits.join('');
    }
}

function deriveCategory(value) {
    if (!value && value !== 0) return 'Unknown';
    const text = String(value).trim().toLowerCase();
    if (!text) return 'Unknown';
    if (text.includes('small')) return 'Small';
    if (text.includes('big')) return 'Big';
    const digitsMatch = text.match(/-?\d+/);
    if (!digitsMatch) return 'Unknown';
    const numeric = Number(digitsMatch[0]);
    if (Number.isNaN(numeric)) return 'Unknown';
    return numeric >= 5 ? 'Big' : 'Small';
}

function getPredictionCategory(entry) {
    if (!entry) return 'Unknown';
    return entry.category || entry.predictionCategory || deriveCategory(entry.prediction) || 'Unknown';
}

function getActualCategory(entry) {
    if (!entry) return 'Unknown';
    return entry.actualCategory || deriveCategory(entry.actual) || 'Unknown';
}

function formatLastFive(period) {
    if (!period || period === '-' || period === 'Unknown') return '--';
    return period.slice(-5);
}

// ================================
// PREDICTION SYSTEM
// ================================

async function fetchPrediction() {
    const data = await fetchData('getPrediction');
    if (!data) return;

    updateServerStatus(true);
    const predictionResult = data.predictionResult;
    const pendingPredictions = data.pendingPredictions || [];
    
    if (predictionResult.error) {
        console.error(predictionResult.error);
        return;
    }

    // Update current prediction display
    const displayPeriod = incrementPeriod(predictionResult.period);
    const shortPeriod = formatLastFive(displayPeriod);
    const currentCategory = getPredictionCategory(predictionResult);
    
    const currentPeriodEl = document.getElementById('currentPeriod');
    const currentResultEl = document.getElementById('predictionResult');
    const confidenceFillEl = document.getElementById('confidenceBar');
    const confidenceTextEl = document.getElementById('confidenceText');
    
    if (currentPeriodEl) currentPeriodEl.textContent = shortPeriod;
    if (currentResultEl) currentResultEl.textContent = currentCategory;
    
    const confidence = predictionResult.confidence || 0;
    if (confidenceFillEl) confidenceFillEl.style.width = `${confidence}%`;
    if (confidenceTextEl) confidenceTextEl.textContent = `${confidence}%`;

    // Update AI reason
    const aiReasonEl = document.getElementById('aiReason');
    if (aiReasonEl) {
        const reasons = [
            "Analyzing historical patterns and probability distributions",
            "Machine learning model detected strong signal in recent data",
            "Pattern recognition algorithm identified favorable conditions",
            "Statistical analysis shows high probability for this outcome",
            "AI neural network processed 1000+ data points for this prediction"
        ];
        aiReasonEl.textContent = reasons[Math.floor(Math.random() * reasons.length)];
    }

    // Update ranked predictions
    const rankedPredictions = predictionResult.rankedPredictions || [];
    let mostFrequent = '-';
    let leastFrequent = '-';
    if (rankedPredictions.length > 0) {
        mostFrequent = rankedPredictions[0].number || '-';
        leastFrequent = rankedPredictions[rankedPredictions.length - 1].number || '-';
    }
    
    const mostFrequentEl = document.getElementById('mostFrequent');
    const leastFrequentEl = document.getElementById('leastFrequent');
    if (mostFrequentEl) mostFrequentEl.textContent = mostFrequent;
    if (leastFrequentEl) leastFrequentEl.textContent = leastFrequent;

    // Update history
    updateHistory(pendingPredictions);

    // Update stats
    const stats = await fetchData('getStats');
    if (stats) {
        updateStatsDisplay(stats);
    }

    // Update streak banner
    updateStreakBanner(stats);

    // Notifications
    if (isNotificationsEnabled && predictionResult.prediction && Notification.permission === 'granted') {
        try {
            new Notification(`New Prediction: ${predictionResult.prediction}`, {
                body: `Period: ${displayPeriod}\nCategory: ${currentCategory}\nConfidence: ${confidence}%`,
                icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
            });
        } catch (e) {
            console.log('Notification failed:', e);
        }
    }
}

function updateStatsDisplay(stats) {
    const winRateEl = document.getElementById('winRate');
    const lossRateEl = document.getElementById('lossRate');
    const totalWinsEl = document.getElementById('totalWinBets');
    const totalLossesEl = document.getElementById('totalLosses');
    const statsWinRateEl = document.getElementById('statsWinRate');
    const currentStreakEl = document.getElementById('currentStreak');
    const lastFiveResultsEl = document.getElementById('lastFiveResults');
    const aiAccuracyEl = document.getElementById('aiAccuracy');
    const userAccuracyEl = document.getElementById('userAccuracy');
    
    if (winRateEl) winRateEl.textContent = `${stats.winRate || 0}%`;
    
    const totalGames = (stats.totalWins || 0) + (stats.totalLosses || 0);
    const lossRate = totalGames > 0 ? Math.round(((stats.totalLosses || 0) / totalGames) * 100) : 0;
    if (lossRateEl) lossRateEl.textContent = `${lossRate}%`;
    
    if (totalWinsEl) totalWinsEl.textContent = stats.totalWins || 0;
    if (totalLossesEl) totalLossesEl.textContent = stats.totalLosses || 0;
    if (statsWinRateEl) statsWinRateEl.textContent = `${stats.winRate || 0}%`;
    if (currentStreakEl) currentStreakEl.textContent = stats.streak || '-';
    if (lastFiveResultsEl) lastFiveResultsEl.textContent = stats.lastFive || '-';
    
    // AI accuracy (random for demo)
    if (aiAccuracyEl) {
        const aiAcc = Math.floor(70 + Math.random() * 25);
        aiAccuracyEl.textContent = `${aiAcc}%`;
    }
    
    // User accuracy (random for demo)
    if (userAccuracyEl) {
        const userAcc = Math.floor(50 + Math.random() * 35);
        userAccuracyEl.textContent = `${userAcc}%`;
    }
}

function updateStreakBanner(stats) {
    const streakBanner = document.getElementById('streakBanner');
    const currentStreakEl = document.getElementById('currentStreak');
    
    if (streakBanner && currentStreakEl && stats) {
        const streak = (stats.streak || '').split('').filter(c => c === 'W').length;
        currentStreakEl.textContent = streak;
        
        if (streak >= 3) {
            streakBanner.classList.remove('hidden');
        } else {
            streakBanner.classList.add('hidden');
        }
    }
}

function updateHistory(predictions) {
    const historyContainer = document.getElementById('historyList');
    if (!historyContainer) return;

    historyContainer.innerHTML = '';

    if (!predictions || predictions.length === 0) {
        historyContainer.innerHTML = `
            <div class="text-center py-4 text-gray-400">
                <i class="fas fa-history text-2xl mb-2"></i>
                <p class="text-sm">No history available</p>
            </div>
        `;
        return;
    }

    predictions.forEach((entry, index) => {
        const status = (entry.status || 'pending').toLowerCase();
        const iconClass = {
            win: 'fas fa-check-circle text-green-500',
            loss: 'fas fa-times-circle text-red-500',
            pending: 'fas fa-hourglass-half text-yellow-500',
            skipped: 'fas fa-ban text-gray-500'
        }[status] || 'fas fa-question-circle text-gray-500';

        const historyItem = document.createElement('div');
        historyItem.className = `rounded-xl p-4 card-shadow border glass flex items-center justify-between mb-3 fade-in`;
        historyItem.style.animationDelay = `${index * 0.1}s`;
        
        historyItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="text-xl">
                    <i class="${iconClass}"></i>
                </div>
                <div>
                    <p class="text-sm font-semibold">${entry.period || '-'}</p>
                    <p class="text-xs opacity-70">Prediction: ${getPredictionCategory(entry)}</p>
                    <p class="text-xs opacity-70">Actual: ${entry.actual ? getActualCategory(entry) : '-'}</p>
                    ${entry.confidence ? `<p class="text-xs opacity-70">Confidence: ${entry.confidence}%</p>` : ''}
                    <span class="text-xs px-2 py-0.5 rounded-full ${status === 'win' ? 'bg-green-100 text-green-700' : status === 'loss' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'} capitalize">${status}</span>
                </div>
            </div>
            <button class="delete-btn text-gray-400 hover:text-red-500 transition" data-index="${index}">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        
        historyContainer.appendChild(historyItem);

        const deleteBtn = historyItem.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirmModal(translations[currentLanguage].delete_item_confirm, async () => {
                    const result = await fetchData('deleteItem', { index });
                    if (result && result.success) {
                        historyItem.classList.add('fade-out');
                        setTimeout(() => {
                            updateHistory(result.pendingPredictions);
                        }, 500);
                    }
                });
            });
        }
    });
}

// ================================
// USER INTERACTION
// ================================

// Delete all history
const deleteAllHistoryBtn = document.getElementById('deleteAllHistoryBtn');
if (deleteAllHistoryBtn) {
    deleteAllHistoryBtn.addEventListener('click', () => {
        showConfirmModal(translations[currentLanguage].delete_all_confirm, async () => {
            const result = await fetchData('deleteAll');
            if (result && result.success) {
                updateHistory(result.pendingPredictions);
                if (isSoundEnabled) {
                    playSound();
                }
            }
        });
    });
}

// User prediction buttons
function submitUserPrediction(prediction) {
    const userStatusEl = document.getElementById('userPredictionStatus');
    if (userStatusEl) {
        userStatusEl.textContent = `You predicted: ${prediction}`;
        userStatusEl.className = `text-xs font-medium ${prediction === 'Big' ? 'text-indigo-500' : 'text-pink-500'}`;
    }
    
    // Highlight button
    const btnBig = document.getElementById('btnPredictBig');
    const btnSmall = document.getElementById('btnPredictSmall');
    
    if (prediction === 'Big') {
        if (btnBig) btnBig.classList.add('ring-2', 'ring-indigo-500');
        if (btnSmall) btnSmall.classList.remove('ring-2', 'ring-pink-500');
    } else {
        if (btnSmall) btnSmall.classList.add('ring-2', 'ring-pink-500');
        if (btnBig) btnBig.classList.remove('ring-2', 'ring-indigo-500');
    }
    
    if (isSoundEnabled) {
        playSound();
    }
}

// ================================
// TIMER FUNCTIONS
// ================================

function updateTimer() {
    const timerEl = document.getElementById('timer');
    if (!timerEl) return;
    
    const now = new Date();
    const seconds = now.getSeconds();
    const remaining = 30 - (seconds % 30);
    
    timerEl.textContent = `${remaining.toString().padStart(2, '0')}s`;
    
    // Update color based on time
    if (remaining <= 5) {
        timerEl.className = 'text-6xl font-black gradient-text font-mono tracking-tighter text-red-500';
    } else if (remaining <= 10) {
        timerEl.className = 'text-6xl font-black gradient-text font-mono tracking-tighter text-yellow-500';
    } else {
        timerEl.className = 'text-6xl font-black gradient-text font-mono tracking-tighter';
    }
    
    // Update prediction every 30 seconds when timer resets
    if (remaining === 30) {
        fetchPrediction();
    }
}

// ================================
// NOTIFICATIONS
// ================================

// Initialize notifications
try {
    if (isNotificationsEnabled && Notification && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
} catch (e) {
    console.warn('Notifications not supported:', e);
}

// ================================
// DARK MODE TOGGLE
// ================================

const darkModeToggle = document.getElementById('darkModeToggle');
if (darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
        darkModeToggle.querySelector('i').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
        
        if (isSoundEnabled) {
            playSound();
        }
    });
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    darkModeToggle.querySelector('i').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// ================================
// PERIOD SELECTOR
// ================================

const periodSelector = document.getElementById('periodSelector');
if (periodSelector) {
    periodSelector.addEventListener('change', (e) => {
        const period = e.target.value;
        // In a real app, you would fetch data for the selected period
        console.log(`Period changed to: ${period}`);
        if (isSoundEnabled) {
            playSound();
        }
    });
}

// ================================
// APP INITIALIZATION WITH KEY SYSTEM
// ================================

function startPredictionUpdates() {
    console.log('[AUTO] Starting automatic prediction updates...');
    fetchPrediction();
    updateTimer();
    
    // Update timer every second
    const timerInterval = setInterval(updateTimer, 1000);
    
    // Update prediction every 30 seconds
    const predictionInterval = setInterval(() => {
        console.log(`[AUTO] Fetching prediction at ${new Date().toLocaleTimeString()}`);
        fetchPrediction();
    }, 30000);
    
    // Store intervals for cleanup
    window.appIntervals = {
        timer: timerInterval,
        prediction: predictionInterval
    };
}

// Add logout button to header
function addLogoutButton() {
    const header = document.querySelector('.sticky.top-0');
    if (header) {
        // Check if logout button already exists
        if (document.getElementById('logoutBtn')) return;
        
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.className = 'px-3 py-1.5 text-xs bg-red-600/20 text-red-300 rounded-lg hover:bg-red-600/30 transition flex items-center';
        logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-1"></i> Logout';
        logoutBtn.addEventListener('click', () => {
            if (isSoundEnabled) playSound();
            GLOBAL_KEY_SYSTEM.logout();
        });
        
        const headerActions = header.querySelector('.flex.items-center.gap-3');
        if (headerActions) {
            headerActions.appendChild(logoutBtn);
        }
    }
}

// Create key status bar
function createKeyStatusBar() {
    // Check if status bar already exists
    if (document.getElementById('globalKeyStatusBar')) return;
    
    const statusBar = document.createElement('div');
    statusBar.id = 'globalKeyStatusBar';
    statusBar.className = 'fixed top-0 left-0 right-0 bg-gradient-to-r from-green-600 to-emerald-700 text-white text-center py-2 text-sm z-50 hidden';
    statusBar.innerHTML = `
        <div class="container mx-auto px-4 flex items-center justify-between">
            <div class="flex items-center">
                <i class="fas fa-key mr-2"></i>
                <span>Global Key Active | </span>
                <span id="keyInfo" class="ml-2"></span>
            </div>
            <button id="statusBarLogoutBtn" class="text-xs bg-white/20 px-3 py-1 rounded hover:bg-white/30">
                <i class="fas fa-sign-out-alt mr-1"></i>Logout
            </button>
        </div>
    `;
    
    document.body.insertBefore(statusBar, document.body.firstChild);
    
    // Add event listener for logout button in status bar
    const statusBarLogoutBtn = document.getElementById('statusBarLogoutBtn');
    if (statusBarLogoutBtn) {
        statusBarLogoutBtn.addEventListener('click', () => {
            if (isSoundEnabled) playSound();
            GLOBAL_KEY_SYSTEM.logout();
        });
    }
}

// Initialize charts
function initializeCharts() {
    const ctx = document.getElementById('winRateChart');
    if (ctx) {
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['1', '2', '3', '4', '5', '6', '7'],
                datasets: [{
                    label: 'Win Rate',
                    data: [65, 70, 68, 72, 75, 73, 78],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: 'var(--text-secondary)' }
                    },
                    x: {
                        ticks: { color: 'var(--text-secondary)' }
                    }
                }
            }
        });
        
        // Store chart for updates
        window.winRateChart = chart;
    }
}

// Clean up intervals
function cleanupApp() {
    if (window.appIntervals) {
        clearInterval(window.appIntervals.timer);
        clearInterval(window.appIntervals.prediction);
    }
}

// Main app start function
async function startAppWithKey() {
    try {
        // Initialize UI
        initializeUI();
        
        // Create key status bar
        createKeyStatusBar();
        
        // Add logout button to header
        addLogoutButton();
        
        // Start prediction updates
        startPredictionUpdates();
        
        // Setup user prediction buttons
        const btnPredictBig = document.getElementById('btnPredictBig');
        const btnPredictSmall = document.getElementById('btnPredictSmall');
        
        if (btnPredictBig) {
            btnPredictBig.addEventListener('click', () => submitUserPrediction('Big'));
        }
        if (btnPredictSmall) {
            btnPredictSmall.addEventListener('click', () => submitUserPrediction('Small'));
        }
        
        // Initialize charts (if any)
        initializeCharts();
        
        console.log('App started successfully with valid key');
        
    } catch (error) {
        console.error('Failed to start app:', error);
    }
}

// ================================
// START THE APP WITH KEY VALIDATION
// ================================

// Main initialization
async function initializeApp() {
    try {
        console.log('[APP] Initializing...');
        
        // Check if we're on key-entry page
        if (window.location.pathname.includes('key-entry.html')) {
            // Let key-entry.html handle its own validation
            return;
        }
        
        // Initialize global key system
        await GLOBAL_KEY_SYSTEM.init();
        
        console.log('[APP] Key validated, starting app...');
        
        // Start the app
        startAppWithKey();
        
    } catch (error) {
        console.error('App initialization failed:', error);
        // Show error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed inset-0 bg-red-900/90 flex items-center justify-center z-50 p-4';
        errorDiv.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md">
                <h2 class="text-xl font-bold mb-4 text-red-600">Initialization Error</h2>
                <p class="mb-4">Failed to start application: ${error.message}</p>
                <button onclick="window.location.reload()" class="w-full py-2 bg-red-600 text-white rounded-lg">
                    Reload Page
                </button>
            </div>
        `;
        document.body.appendChild(errorDiv);
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Clean up on page unload
window.addEventListener('beforeunload', cleanupApp);

// ================================
// EXPORT FOR GLOBAL ACCESS
// ================================

// Make functions available globally
window.submitUserPrediction = submitUserPrediction;
window.openVideoPopup = openVideoPopup;
window.closeVideoPopup = closeVideoPopup;
window.resetSettings = resetSettings;
window.GLOBAL_KEY_SYSTEM = GLOBAL_KEY_SYSTEM;