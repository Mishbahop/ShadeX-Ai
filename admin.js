// ================================
// ADMIN PANEL FOR GLOBAL KEY MANAGEMENT
// ================================

class GlobalKeyAdmin {
    constructor() {
        this.db = null;
        this.keys = [];
        this.filteredKeys = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.apiUrl = 'key-api.php';
        this.adminPassword = sessionStorage.getItem('admin_password') || '';
        this.serverSyncFailed = false;
        this.lastSyncErrorMessage = '';
        
        this.defaultPrices = {
            '1': 9.99,
            '7': 49.99,
            '30': 199.99,
            '90': 499.99,
            '365': 999.99
        };
        
        this.init();
    }
    
    async init() {
        await this.loadDatabase();
        
        // Check authentication
        if (!this.checkAuth()) {
            return;
        }
        
        this.setupEventListeners();
        this.renderKeysTable();
        this.updateStats();
        this.loadActivityLogs();
    }
    
    checkAuth() {
        const savedAuth = localStorage.getItem('admin_authenticated');
        const authExpiry = localStorage.getItem('admin_auth_expiry');
        
        // Check if already authenticated and not expired
        if (savedAuth === 'true' && authExpiry && new Date(authExpiry) > new Date()) {
            if (!this.adminPassword) {
                this.adminPassword = sessionStorage.getItem('admin_password') || '';
            }
            return true;
        }
        
        // Show login modal
        this.showLoginModal();
        return false;
    }
    
    showLoginModal() {
        const modalHTML = `
            <div id="loginModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                <div class="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-8 max-w-md w-full border border-purple-500/30">
                    <div class="text-center mb-6">
                        <div class="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-lock text-2xl text-white"></i>
                        </div>
                        <h2 class="text-2xl font-bold text-white mb-2">Admin Login</h2>
                        <p class="text-gray-300">Enter admin password to continue</p>
                    </div>
                    
                    <div class="mb-6">
                        <div class="relative">
                            <i class="fas fa-key absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
                            <input type="password" 
                                   id="adminPasswordInput" 
                                   placeholder="Enter admin password"
                                   class="w-full pl-12 pr-4 py-4 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-center focus:border-blue-500 focus:outline-none"
                                   autocomplete="off">
                        </div>
                        <p class="text-xs text-gray-500 mt-2 text-center">
                            Default password: admin123
                        </p>
                    </div>
                    
                    <div class="space-y-3">
                        <button id="loginSubmit" 
                                class="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition font-medium">
                            <i class="fas fa-sign-in-alt mr-2"></i>Login
                        </button>
                        <button id="loginCancel" 
                                class="w-full py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                            Cancel
                        </button>
                    </div>
                    
                    <div id="loginStatus" class="mt-4 text-center text-sm hidden"></div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Focus input
        setTimeout(() => {
            document.getElementById('adminPasswordInput').focus();
        }, 100);
        
        // Setup event listeners
        document.getElementById('loginSubmit').addEventListener('click', () => {
            this.handleLogin();
        });
        
        document.getElementById('loginCancel').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
        
        document.getElementById('adminPasswordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleLogin();
            }
        });
    }
    
    handleLogin() {
        const passwordInput = document.getElementById('adminPasswordInput');
        const password = passwordInput.value;
        const statusEl = document.getElementById('loginStatus');
        
        if (!password) {
            this.showLoginStatus('Please enter password', 'error');
            return;
        }

        const storedPassword = this.getStoredAdminPassword();
        
        if (password === storedPassword) {
            this.adminPassword = password;
            sessionStorage.setItem('admin_password', password);
            // Set authentication for 24 hours
            localStorage.setItem('admin_authenticated', 'true');
            const expiry = new Date();
            expiry.setHours(expiry.getHours() + 24);
            localStorage.setItem('admin_auth_expiry', expiry.toISOString());
            
            this.showLoginStatus('Login successful! Loading...', 'success');
            
            setTimeout(() => {
                document.getElementById('loginModal').remove();
                // Re-initialize admin panel
                this.setupEventListeners();
                this.renderKeysTable();
                this.updateStats();
                this.loadActivityLogs();
            }, 1000);
        } else {
            this.showLoginStatus('Invalid password', 'error');
            passwordInput.classList.add('animate-shake');
            setTimeout(() => {
                passwordInput.classList.remove('animate-shake');
            }, 500);
        }
    }
    
    showLoginStatus(message, type = 'info') {
        const statusEl = document.getElementById('loginStatus');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `mt-4 text-center text-sm ${
            type === 'error' ? 'text-red-400' : 'text-green-400'
        }`;
        statusEl.classList.remove('hidden');
    }
    
    async loadDatabase() {
        try {
            // Prefer server copy so keys are shared across devices
            let remoteDb = null;
            try {
                const response = await fetch(`${this.apiUrl}?action=get_admin_db`, { cache: 'no-store' });
                if (response.ok) {
                    remoteDb = await response.json();
                }
            } catch (err) {
                console.warn('Could not fetch remote database, using local copy', err);
            }

            const savedData = localStorage.getItem('global_keys_database');
            
            if (remoteDb && remoteDb.keys) {
                this.db = this.normalizeDatabase(remoteDb);
            } else if (savedData) {
                this.db = this.normalizeDatabase(JSON.parse(savedData));
            } else {
                // Initialize new database
                this.db = this.normalizeDatabase({
                    version: '1.0',
                    settings: {
                        redirect_url: 'https://your-site.com/purchase',
                        auto_expire: true,
                        enable_logging: true,
                        admin_password: 'admin123',
                        default_prices: this.defaultPrices
                    },
                    keys: [
                        {
                            id: this.generateId(),
                            key: 'DEMO-ABCD-1234-EFGH',
                            created_at: new Date().toISOString(),
                            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                            duration_days: 30,
                            uses_remaining: 10000,
                            total_uses: 10000,
                            status: 'active',
                            price: 199.99,
                            customer_name: 'Demo User',
                            customer_email: 'demo@example.com',
                            notes: 'Demo key for testing',
                            usage_logs: []
                        },
                        {
                            id: this.generateId(),
                            key: 'TEST-WXYZ-5678-IJKL',
                            created_at: new Date().toISOString(),
                            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                            duration_days: 7,
                            uses_remaining: 5000,
                            total_uses: 5000,
                            status: 'active',
                            price: 49.99,
                            customer_name: 'Test User',
                            customer_email: 'test@example.com',
                            notes: 'Test key',
                            usage_logs: []
                        }
                    ],
                    activity_logs: [
                        {
                            timestamp: new Date().toISOString(),
                            message: 'System initialized with demo keys',
                            type: 'info'
                        }
                    ],
                    revenue: 249.98,
                    created_at: new Date().toISOString()
                });
                
                await this.saveDatabase({ silent: true });
            }
            
            this.keys = this.db.keys || [];
            this.filteredKeys = [...this.keys];
            this.persistLocalDatabase();

            if (!this.adminPassword) {
                this.adminPassword = this.getStoredAdminPassword();
                sessionStorage.setItem('admin_password', this.adminPassword);
            }
            
            // Update UI with settings
            const redirectUrlInput = document.getElementById('redirectUrl');
            const autoExpireCheck = document.getElementById('autoExpire');
            const enableLoggingCheck = document.getElementById('enableLogging');
            
            if (redirectUrlInput) redirectUrlInput.value = this.db.settings.redirect_url;
            if (autoExpireCheck) autoExpireCheck.checked = this.db.settings.auto_expire;
            if (enableLoggingCheck) enableLoggingCheck.checked = this.db.settings.enable_logging;
            
        } catch (error) {
            console.error('Error loading database:', error);
            this.showToast('Error loading database', 'error');
        }
    }
    
    async saveDatabase(options = {}) {
        const { silent = false } = options;

        try {
            this.persistLocalDatabase();
            const synced = await this.syncDatabaseToServer();
            
            // Create backup with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            localStorage.setItem(`global_keys_backup_${timestamp}`, JSON.stringify(this.db));
            
            // Keep only last 5 backups
            this.cleanupOldBackups();
            
            if (!synced && !silent) {
                this.showToast(
                    `Saved locally, but server sync failed: ${this.lastSyncErrorMessage || 'Unknown error'}. Keys will not work on other devices until sync succeeds.`,
                    'error'
                );
            }

            return synced;
        } catch (error) {
            console.error('Error saving database:', error);
            if (!silent) {
                this.showToast('Error saving database', 'error');
            }
            return false;
        }
    }
    
    cleanupOldBackups() {
        const backupKeys = Object.keys(localStorage)
            .filter(key => key.startsWith('global_keys_backup_'))
            .sort()
            .reverse()
            .slice(5); // Keep only last 5
        
        backupKeys.forEach(key => {
            localStorage.removeItem(key);
        });
    }

    normalizeDatabase(db) {
        const normalized = { ...db };
        normalized.settings = normalized.settings || {};
        normalized.keys = normalized.keys || [];
        normalized.activity_logs = normalized.activity_logs || [];
        if (typeof normalized.revenue !== 'number') {
            normalized.revenue = Number(normalized.revenue || 0);
        }
        if (!normalized.settings.admin_password && normalized.admin_password) {
            normalized.settings.admin_password = normalized.admin_password;
        }
        if (!normalized.admin_password && normalized.settings.admin_password) {
            normalized.admin_password = normalized.settings.admin_password;
        }
        return normalized;
    }

    persistLocalDatabase() {
        localStorage.setItem('global_keys_database', JSON.stringify(this.db, null, 2));
    }

    getStoredAdminPassword() {
        if (this.db?.settings?.admin_password) return this.db.settings.admin_password;
        if (this.db?.admin_password) return this.db.admin_password;
        return 'admin123';
    }

    async syncDatabaseToServer() {
        const password = this.adminPassword || this.getStoredAdminPassword();
        if (!password) {
            console.warn('Admin password not set; skipping remote sync');
            return false;
        }

        try {
            const response = await fetch(`${this.apiUrl}?action=save_admin_db`, {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    admin_password: password,
                    db: this.db
                })
            });

            const text = await response.text();
            let result = null;
            try {
                result = JSON.parse(text);
            } catch (parseErr) {
                // Keep raw text for debugging
                result = { message: text || 'Invalid JSON response from server' };
            }

            if (!response.ok) {
                const msg = result?.message || `HTTP ${response.status}`;
                throw new Error(msg);
            }

            if (!result.success) {
                throw new Error(result.message || 'Unknown error saving database');
            }

            this.serverSyncFailed = false;
            this.lastSyncErrorMessage = '';
            return true;
        } catch (err) {
            this.serverSyncFailed = true;
            this.lastSyncErrorMessage = err?.message || 'Unknown sync error';
            console.warn('Failed to sync database to server:', err);

            // If the admin password is wrong, force re-auth so the user can fix it
            if (this.lastSyncErrorMessage.toLowerCase().includes('admin password')) {
                sessionStorage.removeItem('admin_password');
                localStorage.removeItem('admin_authenticated');
                localStorage.removeItem('admin_auth_expiry');
                this.showToast('Admin password rejected by server. Please log in again.', 'error');
                setTimeout(() => {
                    if (!document.getElementById('loginModal')) {
                        this.showLoginModal();
                    }
                }, 300);
            }

            return false;
        }
    }
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    setupEventListeners() {
        // Generate Key Button
        const generateBtn = document.getElementById('generateKeyBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateKey());
        }
        
        // Copy Key Button
        const copyBtn = document.getElementById('copyKeyBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyGeneratedKey());
        }
        
        // Duration Selector Change
        const durationSelect = document.getElementById('keyDuration');
        if (durationSelect) {
            durationSelect.addEventListener('change', (e) => {
                this.handleDurationChange(e.target.value);
            });
        }
        
        // Save Settings Button
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }
        
        // Export Button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportDatabase());
        }
        
        // Search Input
        const searchInput = document.getElementById('searchKeys');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.filterKeys();
            });
        }
        
        // Pagination
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        if (prevPageBtn) prevPageBtn.addEventListener('click', () => this.prevPage());
        if (nextPageBtn) nextPageBtn.addEventListener('click', () => this.nextPage());
        
        // Quick Actions
        const revokeExpiredBtn = document.getElementById('revokeExpiredBtn');
        const backupBtn = document.getElementById('backupBtn');
        const clearLogsBtn = document.getElementById('clearLogsBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        
        if (revokeExpiredBtn) revokeExpiredBtn.addEventListener('click', () => this.revokeExpiredKeys());
        if (backupBtn) backupBtn.addEventListener('click', () => this.createBackup());
        if (clearLogsBtn) clearLogsBtn.addEventListener('click', () => this.clearOldLogs());
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshAll());
        
        // Filter Button
        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => this.showFilterMenu());
        }
        
        // Logout Button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
        
        // Modal Buttons
        const modalCancelBtn = document.getElementById('modalCancel');
        const modalConfirmBtn = document.getElementById('modalConfirm');
        if (modalCancelBtn) modalCancelBtn.addEventListener('click', () => this.hideModal());
        if (modalConfirmBtn) modalConfirmBtn.addEventListener('click', () => {
            if (this.modalCallback) {
                this.modalCallback();
                this.modalCallback = null;
            }
            this.hideModal();
        });
        
        // Close Details Modal
        const closeDetailsBtn = document.getElementById('closeDetails');
        if (closeDetailsBtn) {
            closeDetailsBtn.addEventListener('click', () => {
                document.getElementById('keyDetailsModal').classList.add('hidden');
            });
        }
        
        // Auto-calculate price based on duration
        const keyDurationSelect = document.getElementById('keyDuration');
        const keyPriceInput = document.getElementById('keyPrice');
        if (keyDurationSelect && keyPriceInput) {
            keyDurationSelect.addEventListener('change', (e) => {
                const duration = e.target.value;
                if (duration !== 'custom' && this.defaultPrices[duration]) {
                    keyPriceInput.value = this.defaultPrices[duration];
                }
            });
        }
    }
    
    handleDurationChange(value) {
        const customContainer = document.getElementById('customDurationContainer');
        if (!customContainer) return;
        
        if (value === 'custom') {
            customContainer.classList.remove('hidden');
            document.getElementById('keyPrice').value = '';
        } else {
            customContainer.classList.add('hidden');
            if (this.defaultPrices[value]) {
                document.getElementById('keyPrice').value = this.defaultPrices[value];
            }
        }
    }
    
    async generateKey() {
        // Get form values
        const durationSelect = document.getElementById('keyDuration');
        if (!durationSelect) return;
        
        let durationDays = parseInt(durationSelect.value);
        
        if (durationSelect.value === 'custom') {
            const customDaysInput = document.getElementById('customDays');
            const customDays = customDaysInput ? parseInt(customDaysInput.value) : 30;
            durationDays = customDays || 30;
        }
        
        const usesLimitInput = document.getElementById('usesLimit');
        const priceInput = document.getElementById('keyPrice');
        const customerNameInput = document.getElementById('customerName');
        const customerEmailInput = document.getElementById('customerEmail');
        const notesInput = document.getElementById('keyNotes');
        
        const usesLimit = usesLimitInput ? parseInt(usesLimitInput.value) : 10000;
        const price = priceInput ? parseFloat(priceInput.value) : this.calculatePrice(durationDays);
        const customerName = customerNameInput ? customerNameInput.value.trim() : '';
        const customerEmail = customerEmailInput ? customerEmailInput.value.trim() : '';
        const notes = notesInput ? notesInput.value.trim() : '';
        
        // Validate inputs
        if (durationDays <= 0) {
            this.showToast('Please enter a valid duration', 'error');
            return;
        }
        
        if (usesLimit <= 0) {
            this.showToast('Please enter a valid uses limit', 'error');
            return;
        }
        
        // Generate key
        const key = this.generateKeyCode();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
        
        const keyData = {
            id: this.generateId(),
            key: key,
            created_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            duration_days: durationDays,
            uses_remaining: usesLimit,
            total_uses: usesLimit,
            status: 'active',
            price: price,
            customer_name: customerName,
            customer_email: customerEmail,
            notes: notes,
            usage_logs: [],
            created_by: 'admin'
        };
        
        // Add to database
        this.db.keys.unshift(keyData);
        this.db.revenue += price;
        
        // Log activity
        this.logActivity(`Generated new key: ${key} for ${durationDays} days ($${price.toFixed(2)})`);
        
        // Save database
        const synced = await this.saveDatabase();
        
        // Update UI
        this.keys = this.db.keys;
        this.filterKeys();
        this.updateStats();
        
        // Clear form
        if (customerNameInput) customerNameInput.value = '';
        if (customerEmailInput) customerEmailInput.value = '';
        if (notesInput) notesInput.value = '';
        
        // Show generated key
        this.showGeneratedKey(keyData);
        
        this.showToast(
            synced
                ? 'Global key generated successfully!'
                : `Key saved locally. Fix server sync to use it on all devices. ${this.lastSyncErrorMessage || ''}`.trim(),
            synced ? 'success' : 'error'
        );
    }
    
    generateKeyCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let key = 'GLB-'; // Global prefix
        
        // Generate random part
        for (let i = 0; i < 12; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
            if (i % 4 === 3 && i < 11) key += '-';
        }
        
        return key;
    }
    
    calculatePrice(durationDays) {
        // Simple pricing: $3 per day
        return Math.round(durationDays * 3 * 100) / 100;
    }
    
    showGeneratedKey(keyData) {
        const card = document.getElementById('generatedKeyCard');
        const keyInput = document.getElementById('generatedKey');
        const expiryDate = document.getElementById('keyExpiryDate');
        const usesCount = document.getElementById('keyUsesCount');
        const customer = document.getElementById('keyCustomer');
        const priceDisplay = document.getElementById('keyPriceDisplay');
        
        if (!card || !keyInput) return;
        
        keyInput.value = keyData.key;
        if (expiryDate) expiryDate.textContent = new Date(keyData.expires_at).toLocaleDateString();
        if (usesCount) usesCount.textContent = `${keyData.uses_remaining}/${keyData.total_uses}`;
        if (customer) customer.textContent = keyData.customer_name || 'Not specified';
        if (priceDisplay) priceDisplay.textContent = `$${keyData.price.toFixed(2)}`;
        
        card.classList.remove('hidden');
        card.classList.add('fade-in');
        
        // Scroll to generated key
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    copyGeneratedKey() {
        const keyInput = document.getElementById('generatedKey');
        if (!keyInput) return;
        
        keyInput.select();
        keyInput.setSelectionRange(0, 99999); // For mobile devices
        
        try {
            navigator.clipboard.writeText(keyInput.value).then(() => {
                this.showToast('Key copied to clipboard!');
            }).catch(() => {
                // Fallback for older browsers
                document.execCommand('copy');
                this.showToast('Key copied to clipboard!');
            });
        } catch (err) {
            console.error('Copy failed:', err);
            this.showToast('Failed to copy key', 'error');
        }
    }
    
    filterKeys() {
        let filtered = this.keys;
        
        // Apply search filter
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(key => 
                key.key.toLowerCase().includes(term) ||
                (key.customer_name && key.customer_name.toLowerCase().includes(term)) ||
                (key.customer_email && key.customer_email.toLowerCase().includes(term))
            );
        }
        
        // Apply status filter
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(key => key.status === this.currentFilter);
        }
        
        this.filteredKeys = filtered;
        this.currentPage = 1;
        this.renderKeysTable();
    }
    
    renderKeysTable() {
        const tbody = document.getElementById('keysTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageKeys = this.filteredKeys.slice(startIndex, endIndex);
        
        // Update pagination info
        const showingCount = document.getElementById('showingCount');
        const totalCount = document.getElementById('totalCount');
        const currentPage = document.getElementById('currentPage');
        
        if (showingCount) showingCount.textContent = pageKeys.length;
        if (totalCount) totalCount.textContent = this.filteredKeys.length;
        if (currentPage) currentPage.textContent = this.currentPage;
        
        // Update pagination buttons
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        
        if (prevPageBtn) prevPageBtn.disabled = this.currentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = endIndex >= this.filteredKeys.length;
        
        if (pageKeys.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-gray-400">
                        <i class="fas fa-key text-3xl mb-2"></i>
                        <p>No keys found</p>
                        ${this.searchTerm ? `<p class="text-sm">Try a different search term</p>` : ''}
                    </td>
                </tr>
            `;
            return;
        }
        
        pageKeys.forEach(keyData => {
            const expiresDate = new Date(keyData.expires_at);
            const now = new Date();
            const daysLeft = Math.ceil((expiresDate - now) / (1000 * 60 * 60 * 24));
            const isExpired = expiresDate < now;
            
            // Update status if expired and auto-expire is enabled
            if (isExpired && keyData.status === 'active' && this.db.settings.auto_expire) {
                keyData.status = 'expired';
                this.saveDatabase({ silent: true });
            }
            
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-800 hover:bg-gray-800/30 transition';
            
            // Status badge
            let statusClass = 'px-2 py-1 rounded text-xs ';
            let statusText = keyData.status;
            
            if (keyData.status === 'active') {
                statusClass += 'bg-green-500/20 text-green-300';
                if (daysLeft <= 3) {
                    statusText = `Expiring in ${daysLeft}d`;
                    statusClass = 'px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-300';
                }
            } else if (keyData.status === 'expired') {
                statusClass += 'bg-red-500/20 text-red-300';
            } else if (keyData.status === 'revoked') {
                statusClass += 'bg-yellow-500/20 text-yellow-300';
            }
            
            row.innerHTML = `
                <td class="p-3">
                    <div class="font-mono text-sm cursor-pointer hover:text-blue-400 key-detail-trigger" data-key-id="${keyData.id}">
                        ${keyData.key}
                    </div>
                    <div class="text-xs text-gray-400">${keyData.customer_name || 'Anonymous'}</div>
                </td>
                <td class="p-3">
                    <div>${expiresDate.toLocaleDateString()}</div>
                    <div class="text-xs ${daysLeft < 7 ? 'text-red-400' : 'text-gray-400'}">
                        ${daysLeft > 0 ? `${daysLeft} days left` : 'Expired'}
                    </div>
                </td>
                <td class="p-3">
                    <div>${keyData.uses_remaining}/${keyData.total_uses}</div>
                    <div class="text-xs text-gray-400">${Math.round((keyData.uses_remaining / keyData.total_uses) * 100)}% left</div>
                </td>
                <td class="p-3">
                    <span class="${statusClass}">${statusText}</span>
                </td>
                <td class="p-3">
                    <div class="flex space-x-2">
                        <button class="action-btn px-2 py-1 ${keyData.status === 'active' ? 'bg-red-600/20 text-red-300' : 'bg-gray-600/20 text-gray-300'} rounded text-xs hover:opacity-80"
                                data-action="${keyData.status === 'active' ? 'revoke' : 'delete'}"
                                data-key-id="${keyData.id}">
                            ${keyData.status === 'active' ? 'Revoke' : 'Delete'}
                        </button>
                        <button class="copy-key-btn px-2 py-1 bg-blue-600/20 text-blue-300 rounded text-xs hover:opacity-80"
                                data-key="${keyData.key}">
                            Copy
                        </button>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Add event listeners to new elements
        this.attachTableEventListeners();
    }
    
    attachTableEventListeners() {
        // Key detail triggers
        document.querySelectorAll('.key-detail-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const keyId = e.target.closest('.key-detail-trigger').dataset.keyId;
                this.showKeyDetails(keyId);
            });
        });
        
        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.closest('.action-btn').dataset.action;
                const keyId = e.target.closest('.action-btn').dataset.keyId;
                this.handleKeyAction(keyId, action);
            });
        });
        
        // Copy buttons
        document.querySelectorAll('.copy-key-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.target.closest('.copy-key-btn').dataset.key;
                this.copyKey(key);
            });
        });
    }
    
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderKeysTable();
        }
    }
    
    nextPage() {
        const totalPages = Math.ceil(this.filteredKeys.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderKeysTable();
        }
    }
    
    showKeyDetails(keyId) {
        const keyData = this.db.keys.find(k => k.id === keyId);
        if (!keyData) return;
        
        const modalContent = document.getElementById('keyDetailsContent');
        const modal = document.getElementById('keyDetailsModal');
        
        if (!modalContent || !modal) return;
        
        const expiresDate = new Date(keyData.expires_at);
        const createdDate = new Date(keyData.created_at);
        const now = new Date();
        const daysLeft = Math.ceil((expiresDate - now) / (1000 * 60 * 60 * 24));
        
        modalContent.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Key Code</p>
                    <p class="font-mono text-lg mt-1">${keyData.key}</p>
                </div>
                <div class="p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Status</p>
                    <p class="font-medium mt-1">
                        <span class="${keyData.status === 'active' ? 'text-green-400' : keyData.status === 'expired' ? 'text-red-400' : 'text-yellow-400'}">
                            ${keyData.status.charAt(0).toUpperCase() + keyData.status.slice(1)}
                        </span>
                    </p>
                </div>
                <div class="p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Created</p>
                    <p class="font-medium mt-1">${createdDate.toLocaleString()}</p>
                </div>
                <div class="p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Expires</p>
                    <p class="font-medium mt-1">${expiresDate.toLocaleString()}</p>
                    <p class="text-sm ${daysLeft <= 3 ? 'text-red-400' : 'text-gray-400'} mt-1">
                        ${daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired'}
                    </p>
                </div>
                <div class="p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Uses</p>
                    <p class="font-medium mt-1">${keyData.uses_remaining} / ${keyData.total_uses}</p>
                    <div class="h-2 bg-gray-700 rounded-full mt-2 overflow-hidden">
                        <div class="h-full bg-blue-500" style="width: ${(keyData.uses_remaining / keyData.total_uses) * 100}%"></div>
                    </div>
                </div>
                <div class="p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Price</p>
                    <p class="font-medium mt-1">$${keyData.price.toFixed(2)}</p>
                </div>
                <div class="md:col-span-2 p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Customer</p>
                    <p class="font-medium mt-1">${keyData.customer_name || 'Not specified'}</p>
                    <p class="text-gray-400 text-sm mt-1">${keyData.customer_email || 'No email provided'}</p>
                </div>
                <div class="md:col-span-2 p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Notes</p>
                    <p class="font-medium mt-1">${keyData.notes || 'No notes'}</p>
                </div>
                <div class="md:col-span-2 p-4 bg-gray-800/30 rounded-lg">
                    <p class="text-gray-400 text-xs">Usage Logs (Last 5)</p>
                    <div class="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        ${keyData.usage_logs && keyData.usage_logs.length > 0 
                            ? keyData.usage_logs.slice(-5).reverse().map(log => 
                                `<p class="text-sm text-gray-300">${new Date(log.used_at).toLocaleString()} - ${log.ip || 'Unknown IP'}</p>`
                            ).join('')
                            : '<p class="text-sm text-gray-400">No usage logs yet</p>'
                        }
                    </div>
                </div>
            </div>
            
            <div class="mt-6 flex space-x-3">
                <button class="copy-detail-key-btn flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        data-key="${keyData.key}">
                    <i class="fas fa-copy mr-2"></i>Copy Key
                </button>
                <button class="detail-action-btn flex-1 py-2 ${keyData.status === 'active' ? 'bg-red-600 hover:bg-red-700' : keyData.status === 'revoked' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'} text-white rounded-lg transition"
                        data-action="${keyData.status === 'active' ? 'revoke' : keyData.status === 'revoked' ? 'activate' : 'delete'}"
                        data-key-id="${keyData.id}">
                    <i class="fas ${keyData.status === 'active' ? 'fa-ban' : keyData.status === 'revoked' ? 'fa-check' : 'fa-trash'} mr-2"></i>
                    ${keyData.status === 'active' ? 'Revoke Key' : keyData.status === 'revoked' ? 'Activate Key' : 'Delete Key'}
                </button>
            </div>
        `;
        
        // Add event listeners for detail modal buttons
        modalContent.querySelector('.copy-detail-key-btn')?.addEventListener('click', (e) => {
            const key = e.target.closest('.copy-detail-key-btn').dataset.key;
            this.copyKey(key);
        });
        
        modalContent.querySelector('.detail-action-btn')?.addEventListener('click', (e) => {
            const action = e.target.closest('.detail-action-btn').dataset.action;
            const keyId = e.target.closest('.detail-action-btn').dataset.keyId;
            this.handleKeyAction(keyId, action);
            modal.classList.add('hidden');
        });
        
        modal.classList.remove('hidden');
    }
    
    handleKeyAction(keyId, action) {
        const keyData = this.db.keys.find(k => k.id === keyId);
        if (!keyData) return;
        
        switch (action) {
            case 'revoke':
                this.showConfirmModal(
                    'Revoke Key',
                    `Are you sure you want to revoke key: ${keyData.key}?`,
                    async () => {
                        keyData.status = 'revoked';
                        this.logActivity(`Revoked key: ${keyData.key}`);
                        const synced = await this.saveDatabase();
                        this.renderKeysTable();
                        this.updateStats();
                        this.showToast(
                            synced ? 'Key revoked successfully' : 'Key revoked locally. Server sync failed.',
                            synced ? 'success' : 'error'
                        );
                    }
                );
                break;
                
            case 'activate':
                (async () => {
                    keyData.status = 'active';
                    this.logActivity(`Activated key: ${keyData.key}`);
                    const synced = await this.saveDatabase();
                    this.renderKeysTable();
                    this.updateStats();
                    this.showToast(
                        synced ? 'Key activated successfully' : 'Key activated locally. Server sync failed.',
                        synced ? 'success' : 'error'
                    );
                })();
                break;
                
            case 'delete':
                this.showConfirmModal(
                    'Delete Key',
                    `Are you sure you want to delete key: ${keyData.key}? This cannot be undone.`,
                    async () => {
                        this.db.keys = this.db.keys.filter(k => k.id !== keyId);
                        this.logActivity(`Deleted key: ${keyData.key}`);
                        const synced = await this.saveDatabase();
                        this.keys = this.db.keys;
                        this.filterKeys();
                        this.updateStats();
                        this.showToast(
                            synced ? 'Key deleted successfully' : 'Key deleted locally. Server sync failed.',
                            synced ? 'success' : 'error'
                        );
                        document.getElementById('keyDetailsModal').classList.add('hidden');
                    }
                );
                break;
        }
    }
    
    copyKey(key) {
        navigator.clipboard.writeText(key).then(() => {
            this.showToast('Key copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.showToast('Failed to copy key', 'error');
        });
    }
    
    updateStats() {
        if (!this.db || !this.db.keys) return;
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Total keys
        const totalKeys = this.db.keys.length;
        const activeKeys = this.db.keys.filter(k => k.status === 'active').length;
        const expiredKeys = this.db.keys.filter(k => k.status === 'expired').length;
        
        // Revenue
        const totalRevenue = this.db.revenue || 0;
        const todayRevenue = this.db.keys
            .filter(k => {
                const createdDate = new Date(k.created_at);
                return createdDate >= today;
            })
            .reduce((sum, k) => sum + k.price, 0);
        
        // Usage stats
        const totalUses = this.db.keys.reduce((sum, k) => sum + (k.total_uses - k.uses_remaining), 0);
        const maxPossibleUses = this.db.keys.reduce((sum, k) => sum + k.total_uses, 0);
        const usagePercentage = maxPossibleUses > 0 ? Math.round((totalUses / maxPossibleUses) * 100) : 0;
        
        // Active users (estimate)
        const activeUsers = this.db.keys
            .filter(k => k.status === 'active')
            .reduce((sum, k) => sum + (k.total_uses - k.uses_remaining), 0);
        
        const dailyActive = this.db.keys
            .filter(k => k.usage_logs && k.usage_logs.some(log => {
                const logDate = new Date(log.used_at);
                return logDate >= today;
            }))
            .length;
        
        // Update UI
        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        
        updateElement('totalKeys', totalKeys.toLocaleString());
        updateElement('activeKeys', activeKeys.toLocaleString());
        updateElement('totalRevenue', '$' + totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 }));
        updateElement('todayRevenue', '$' + todayRevenue.toFixed(2));
        updateElement('activeUsers', activeUsers.toLocaleString());
        updateElement('dailyActive', dailyActive.toLocaleString());
        updateElement('keyUsage', usagePercentage + '%');
        updateElement('totalUsesCount', totalUses.toLocaleString());
        
        // Update progress bars
        const activePercent = totalKeys > 0 ? Math.round((activeKeys / totalKeys) * 100) : 0;
        const expiredPercent = totalKeys > 0 ? Math.round((expiredKeys / totalKeys) * 100) : 0;
        
        updateElement('statsActive', activePercent + '%');
        updateElement('statsExpired', expiredPercent + '%');
        updateElement('statsUsage', usagePercentage + '%');
        
        const activeBar = document.getElementById('activeBar');
        const expiredBar = document.getElementById('expiredBar');
        const usageBar = document.getElementById('usageBar');
        
        if (activeBar) activeBar.style.width = activePercent + '%';
        if (expiredBar) expiredBar.style.width = expiredPercent + '%';
        if (usageBar) usageBar.style.width = usagePercentage + '%';
    }
    
    async saveSettings() {
        const currentPasswordInput = document.getElementById('adminPassword');
        const newPasswordInput = document.getElementById('newPassword');
        const redirectUrlInput = document.getElementById('redirectUrl');
        const autoExpireCheck = document.getElementById('autoExpire');
        const enableLoggingCheck = document.getElementById('enableLogging');
        
        if (!redirectUrlInput || !autoExpireCheck || !enableLoggingCheck) return;
        
        const redirectUrl = redirectUrlInput.value;
        const autoExpire = autoExpireCheck.checked;
        const enableLogging = enableLoggingCheck.checked;
        
        // Validate password if changing
        if (currentPasswordInput && currentPasswordInput.value) {
            if (currentPasswordInput.value !== this.getStoredAdminPassword()) {
                this.showToast('Current password is incorrect', 'error');
                return;
            }
            
            // Update password if new one provided
            if (newPasswordInput && newPasswordInput.value) {
                this.db.settings.admin_password = newPasswordInput.value;
                this.db.admin_password = newPasswordInput.value;
                this.adminPassword = newPasswordInput.value;
                sessionStorage.setItem('admin_password', newPasswordInput.value);
                newPasswordInput.value = '';
            }
            
            currentPasswordInput.value = '';
        }
        
        // Update settings
        this.db.settings.redirect_url = redirectUrl;
        this.db.settings.auto_expire = autoExpire;
        this.db.settings.enable_logging = enableLogging;
        
        // Save database
        const synced = await this.saveDatabase();
        
        this.showToast(
            synced ? 'Settings saved successfully' : 'Settings saved locally. Server sync failed.',
            synced ? 'success' : 'error'
        );
    }
    
    exportDatabase() {
        const dataStr = JSON.stringify(this.db, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `global-keys-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.logActivity('Exported database backup');
        this.showToast('Database backup downloaded');
    }
    
    createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupKey = `global_keys_backup_${timestamp}`;
        
        localStorage.setItem(backupKey, JSON.stringify(this.db));
        
        // Keep only last 5 backups
        const backupKeys = Object.keys(localStorage)
            .filter(key => key.startsWith('global_keys_backup_'))
            .sort()
            .reverse()
            .slice(5);
        
        backupKeys.forEach(key => {
            if (!key.includes(timestamp)) {
                localStorage.removeItem(key);
            }
        });
        
        this.logActivity('Created manual backup');
        this.showToast('Backup created successfully');
    }
    
    async revokeExpiredKeys() {
        const now = new Date();
        let revokedCount = 0;
        
        this.db.keys.forEach(key => {
            const expiresAt = new Date(key.expires_at);
            if (expiresAt < now && key.status === 'active') {
                key.status = 'expired';
                revokedCount++;
            }
        });
        
        if (revokedCount > 0) {
            const synced = await this.saveDatabase();
            this.keys = this.db.keys;
            this.filterKeys();
            this.updateStats();
            
            this.logActivity(`Auto-revoked ${revokedCount} expired keys`);
            this.showToast(
                synced ? `Revoked ${revokedCount} expired keys` : 'Expired keys revoked locally. Server sync failed.',
                synced ? 'success' : 'error'
            );
        } else {
            this.showToast('No expired keys to revoke', 'info');
        }
    }
    
    async clearOldLogs() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        let clearedCount = 0;
        
        // Clear old activity logs
        this.db.activity_logs = this.db.activity_logs.filter(log => {
            const logDate = new Date(log.timestamp);
            const keep = logDate > thirtyDaysAgo;
            if (!keep) clearedCount++;
            return keep;
        });
        
        // Clear old usage logs from keys
        this.db.keys.forEach(key => {
            if (key.usage_logs) {
                const originalCount = key.usage_logs.length;
                key.usage_logs = key.usage_logs.filter(log => {
                    const logDate = new Date(log.used_at);
                    return logDate > thirtyDaysAgo;
                });
                clearedCount += (originalCount - key.usage_logs.length);
            }
        });
        
        const synced = await this.saveDatabase({ silent: true });
        this.loadActivityLogs();
        
        this.logActivity(`Cleared ${clearedCount} old logs`);
        this.showToast(
            synced ? `Cleared ${clearedCount} old logs` : 'Cleared logs locally. Server sync failed.',
            synced ? 'success' : 'error'
        );
    }
    
    async refreshAll() {
        await this.loadDatabase();
        this.filterKeys();
        this.updateStats();
        this.loadActivityLogs();
        this.showToast('Refreshed all data');
    }
    
    showFilterMenu() {
        // Simple filter menu
        const filters = [
            { id: 'all', label: 'All Keys', icon: 'fa-list' },
            { id: 'active', label: 'Active', icon: 'fa-check-circle' },
            { id: 'expired', label: 'Expired', icon: 'fa-clock' },
            { id: 'revoked', label: 'Revoked', icon: 'fa-ban' }
        ];
        
        let filterMenu = document.getElementById('filterMenu');
        if (filterMenu) filterMenu.remove();
        
        const filterBtn = document.getElementById('filterBtn');
        if (!filterBtn) return;
        
        filterMenu = document.createElement('div');
        filterMenu.id = 'filterMenu';
        filterMenu.className = 'absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg z-50 border border-gray-700';
        
        filterMenu.innerHTML = filters.map(filter => `
            <button class="w-full text-left px-4 py-3 hover:bg-gray-700 flex items-center ${this.currentFilter === filter.id ? 'bg-gray-700' : ''}"
                    data-filter="${filter.id}">
                <i class="fas ${filter.icon} mr-3 text-gray-400"></i>
                ${filter.label}
            </button>
        `).join('');
        
        filterBtn.parentNode.appendChild(filterMenu);
        
        // Add event listeners to filter buttons
        filterMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filterId = e.target.closest('button').dataset.filter;
                this.setFilter(filterId);
            });
        });
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!filterBtn.contains(e.target) && !filterMenu.contains(e.target)) {
                    filterMenu.remove();
                }
            });
        }, 100);
    }
    
    setFilter(filterId) {
        this.currentFilter = filterId;
        this.filterKeys();
        
        const filterMenu = document.getElementById('filterMenu');
        if (filterMenu) filterMenu.remove();
    }
    
    loadActivityLogs() {
        const activityList = document.getElementById('activityList');
        if (!activityList || !this.db.activity_logs) return;
        
        const logs = [...this.db.activity_logs].reverse().slice(0, 10); // Last 10 logs
        
        if (logs.length === 0) {
            activityList.innerHTML = `
                <div class="text-center py-4 text-gray-400">
                    <i class="fas fa-history text-2xl mb-2"></i>
                    <p>No activity yet</p>
                </div>
            `;
            return;
        }
        
        activityList.innerHTML = logs.map(log => `
            <div class="flex items-start space-x-3 p-3 hover:bg-gray-800/30 rounded-lg">
                <i class="fas fa-circle text-xs mt-1 ${log.type === 'success' ? 'text-green-400' : log.type === 'error' ? 'text-red-400' : 'text-blue-400'}"></i>
                <div class="flex-1">
                    <p class="text-sm">${log.message}</p>
                    <p class="text-xs text-gray-400">${this.formatTimeAgo(log.timestamp)}</p>
                </div>
            </div>
        `).join('');
    }
    
    logActivity(message, type = 'info') {
        if (!this.db.settings.enable_logging) return;
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            message: message,
            type: type
        };
        
        this.db.activity_logs.push(logEntry);
        
        // Keep only last 100 logs
        if (this.db.activity_logs.length > 100) {
            this.db.activity_logs = this.db.activity_logs.slice(-100);
        }
        
        // Update UI if on activity tab
        this.loadActivityLogs();
        
        // Save database
        this.saveDatabase({ silent: true });
    }
    
    formatTimeAgo(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        return past.toLocaleDateString();
    }
    
    showConfirmModal(title, message, callback) {
        const modal = document.getElementById('confirmModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        
        if (!modal || !modalTitle || !modalMessage) return;
        
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        this.modalCallback = callback;
        modal.classList.remove('hidden');
    }
    
    hideModal() {
        const modal = document.getElementById('confirmModal');
        if (modal) modal.classList.add('hidden');
        this.modalCallback = null;
    }
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        
        if (!toast || !toastMessage) return;
        
        toastMessage.textContent = message;
        
        // Set color based on type
        switch (type) {
            case 'success':
                toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center fade-in';
                break;
            case 'error':
                toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center fade-in';
                break;
            case 'info':
                toast.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center fade-in';
                break;
            case 'warning':
                toast.className = 'fixed bottom-4 right-4 bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center fade-in';
                break;
        }
        
        toast.classList.remove('hidden');
        
        // Auto hide after 3 seconds
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
    
    logout() {
        localStorage.removeItem('admin_authenticated');
        localStorage.removeItem('admin_auth_expiry');
        window.location.href = 'index.html';
    }
}

// Initialize admin panel
let admin = null;

document.addEventListener('DOMContentLoaded', () => {
    admin = new GlobalKeyAdmin();
    window.admin = admin; // Make available globally
});

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    .fade-in {
        animation: fadeIn 0.3s ease-out;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    
    .animate-shake {
        animation: shake 0.5s ease-in-out;
    }
`;
document.head.appendChild(style);
