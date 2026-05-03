// Navigation functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize navigation
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();

            // Remove active styles from all nav items
            navItems.forEach(nav => {
                nav.classList.remove('border-l-2', 'border-teal-400', 'text-white', 'bg-teal-400/5');
                nav.classList.add('text-neutral-500');
            });

            // Hide all sections
            contentSections.forEach(section => section.classList.remove('active'));

            // Add active styles to clicked nav item
            this.classList.remove('text-neutral-500');
            this.classList.add('border-l-2', 'border-teal-400', 'text-white', 'bg-teal-400/5');

            // Show corresponding section
            const sectionId = this.getAttribute('data-section');
            const targetSection = document.getElementById(sectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });

    // Initialize Charts
    initializeCharts();

    initializeCurrencyCollapsibles();
    initializeCurrencyUserLookup();
    initializeCurrencyAuditControls();

    initMusicAdminPage();
    initVideoUploadPage();

    // Simulate real-time updates
    setInterval(updateStats, 5000);
});

function initializeCurrencyCollapsibles() {
    const panels = document.querySelectorAll('[data-collapsible-panel]');

    panels.forEach(panel => {
        const trigger = panel.querySelector('.currency-collapsible-trigger');
        if (!trigger) return;

        const setExpanded = expanded => {
            panel.classList.toggle('is-collapsed', !expanded);
            trigger.setAttribute('aria-expanded', String(expanded));
        };

        const togglePanel = () => setExpanded(panel.classList.contains('is-collapsed'));

        trigger.addEventListener('click', event => {
            event.stopPropagation();
            togglePanel();
        });

        trigger.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                togglePanel();
            }
        });
    });
}

const currencyUserDirectory = [
    {
        username: '@maria_s',
        name: 'Maria Sandoval',
        id: 'usr_14A92',
        wallet: '0x9c1...f2e4',
        avatar: 'https://i.pravatar.cc/96?img=47',
        balance: '12.1K Cash / 940 Gems'
    },
    {
        username: '@alex_gamer22',
        name: 'Alex Mercer',
        id: 'usr_9021A',
        wallet: '0xa22...7bd1',
        avatar: 'https://i.pravatar.cc/96?img=12',
        balance: '8.4K Cash / 310 Gems'
    },
    {
        username: '@zero_cool',
        name: 'Dade Murphy',
        id: 'usr_77B10',
        wallet: '0xf01...ad92',
        avatar: 'https://i.pravatar.cc/96?img=33',
        balance: '2.8K Cash / 116 Gems'
    },
    {
        username: '@guest_991',
        name: 'Guest Driver',
        id: 'usr_991G',
        wallet: '0x4be...118a',
        avatar: 'https://i.pravatar.cc/96?img=8',
        balance: '620 Cash / 18 Gems'
    },
    {
        username: '@whale_user',
        name: 'Nora Vale',
        id: 'usr_WHALE9',
        wallet: '0xc88...a491',
        avatar: 'https://i.pravatar.cc/96?img=5',
        balance: '1.2M Cash / 44K Gems'
    },
    {
        username: '@user_892',
        name: 'QA Seed User',
        id: 'usr_892Q',
        wallet: '0xbb7...293f',
        avatar: 'https://i.pravatar.cc/96?img=21',
        balance: '5.5K Cash / 500 Gems'
    }
];

function initializeCurrencyUserLookup() {
    const searchInput = document.getElementById('currency-user-search');
    const suggestions = document.getElementById('currency-user-suggestions');
    const selectedUser = document.getElementById('currency-selected-user');
    const controls = document.getElementById('currency-user-controls');
    const changeUserButton = document.getElementById('currency-change-user');
    const quickUsers = document.getElementById('currency-quick-users');
    const quickUserList = document.getElementById('currency-quick-user-list');
    const resourceButtons = document.querySelectorAll('.currency-resource-picker button');

    if (!searchInput || !suggestions || !selectedUser || !controls) return;

    const createUserButton = user => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'currency-user-suggestion';
        button.innerHTML = `
            <div class="currency-user-suggestion-main">
                <img src="${user.avatar}" alt="${user.name}">
                <div>
                    <strong>${user.username} · ${user.name}</strong>
                    <span>${user.id} · ${user.wallet}</span>
                </div>
            </div>
            <em>${user.balance}</em>
        `;
        button.addEventListener('click', () => selectUser(user));
        return button;
    };

    const renderSuggestions = matches => {
        suggestions.innerHTML = '';

        if (!matches.length) {
            const empty = document.createElement('div');
            empty.className = 'currency-user-suggestion';
            empty.innerHTML = '<div class="currency-user-suggestion-main"><span>No matching users</span></div>';
            suggestions.appendChild(empty);
            suggestions.hidden = false;
            return;
        }

        matches.slice(0, 4).forEach(user => suggestions.appendChild(createUserButton(user)));

        suggestions.hidden = false;
    };

    const selectUser = user => {
        const avatar = selectedUser.querySelector('img');
        const name = selectedUser.querySelector('strong');
        const meta = selectedUser.querySelector('span');

        avatar.src = user.avatar;
        avatar.alt = user.name;
        name.textContent = `${user.username} · ${user.name}`;
        meta.textContent = `${user.id} · ${user.balance}`;

        searchInput.value = user.username;
        suggestions.hidden = true;
        selectedUser.hidden = false;
        controls.hidden = false;
        if (quickUsers) quickUsers.hidden = true;
    };

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        selectedUser.hidden = true;
        controls.hidden = true;

        if (!query) {
            suggestions.hidden = true;
            suggestions.innerHTML = '';
            if (quickUsers) quickUsers.hidden = false;
            return;
        }

        if (quickUsers) quickUsers.hidden = true;

        const matches = currencyUserDirectory.filter(user => {
            return [user.username, user.name, user.id, user.wallet]
                .some(value => value.toLowerCase().includes(query));
        });

        renderSuggestions(matches);
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim() && controls.hidden) {
            searchInput.dispatchEvent(new Event('input'));
        }
    });

    if (changeUserButton) {
        changeUserButton.addEventListener('click', () => {
            selectedUser.hidden = true;
            controls.hidden = true;
            searchInput.value = '';
            suggestions.hidden = true;
            suggestions.innerHTML = '';
            if (quickUsers) quickUsers.hidden = false;
            searchInput.focus();
        });
    }

    if (quickUserList) {
        currencyUserDirectory.slice(0, 3).forEach(user => quickUserList.appendChild(createUserButton(user)));
    }

    resourceButtons.forEach(button => {
        button.addEventListener('click', () => {
            resourceButtons.forEach(item => item.classList.remove('active'));
            button.classList.add('active');
        });
    });
}

function initializeCurrencyAuditControls() {
    const tableBody = document.querySelector('.currency-audit-table tbody');
    const searchInput = document.getElementById('currency-audit-search');
    const resourceFilter = document.getElementById('currency-audit-resource-filter');
    const statusFilter = document.getElementById('currency-audit-status-filter');
    const sortButtons = document.querySelectorAll('[data-audit-sort]');

    if (!tableBody || !searchInput || !resourceFilter || !statusFilter || !sortButtons.length) return;

    const originalRows = Array.from(tableBody.querySelectorAll('tr'));
    let currentSort = 'date';

    const timeValue = row => {
        const [hours, minutes] = row.dataset.time.split(':').map(Number);
        return (hours * 60) + minutes;
    };

    const applyAuditControls = () => {
        const query = searchInput.value.trim().toLowerCase();
        const resource = resourceFilter.value;
        const status = statusFilter.value;

        const filteredRows = originalRows.filter(row => {
            const searchable = `${row.dataset.time} ${row.dataset.user} ${row.dataset.action} ${row.dataset.resource} ${row.dataset.status}`.toLowerCase();
            const matchesSearch = !query || searchable.includes(query);
            const matchesResource = resource === 'all' || row.dataset.resource === resource;
            const matchesStatus = status === 'all' || row.dataset.status === status;
            return matchesSearch && matchesResource && matchesStatus;
        });

        filteredRows.sort((a, b) => {
            if (currentSort === 'amount') {
                return Math.abs(Number(b.dataset.amount)) - Math.abs(Number(a.dataset.amount));
            }

            return timeValue(b) - timeValue(a);
        });

        tableBody.innerHTML = '';
        filteredRows.forEach(row => tableBody.appendChild(row));
    };

    searchInput.addEventListener('input', applyAuditControls);
    resourceFilter.addEventListener('change', applyAuditControls);
    statusFilter.addEventListener('change', applyAuditControls);

    sortButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentSort = button.dataset.auditSort;
            sortButtons.forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            applyAuditControls();
        });
    });

    applyAuditControls();
}

// shadcn-style Toast System
let toastTimeout = null;

function showToast(title, description, variant = 'default') {
    const toast = document.getElementById('toast');
    const toastTitle = document.getElementById('toast-title');
    const toastDesc = document.getElementById('toast-description');

    // Clear previous timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    // Set content
    toastTitle.textContent = title;
    toastDesc.textContent = description;

    // Apply variant styling
    toast.className = 'toast show';
    if (variant === 'success') {
        toast.classList.add('toast-success');
    } else if (variant === 'destructive') {
        toast.classList.add('toast-destructive');
    }

    // Auto hide after 3 seconds
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Legacy notification support
function showNotification(message) {
    showToast('Notification', message, 'default');
}

// Chart Modal Functions
let modalChartInstance = null;

function openChartModal(chartType) {
    try {
        const modal = document.getElementById('chartModal');
        const modalTitle = document.getElementById('modalChartTitle');
        const modalCanvas = document.getElementById('modalChart');

        if (!modalCanvas) {
            console.error('Modal canvas not found');
            return;
        }

        // Show modal first
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Destroy previous chart if exists
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }

        // Get fresh context
        const ctx = modalCanvas.getContext('2d');

        // Small delay to ensure modal is visible and sized
        setTimeout(() => {
            try {
                renderModalChart(chartType, modalTitle, ctx);
            } catch (e) {
                console.error('Error rendering chart:', e);
            }
        }, 100);
    } catch (e) {
        console.error('Error in openChartModal:', e);
    }
}

function renderModalChart(chartType, modalTitle, ctx) {
    const chartConfig = {
        type: chartType === 'revenue' ? 'line' : 'bar',
        data: chartType === 'revenue' ? {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Revenue',
                data: [12000, 19000, 15000, 25000, 22000, 30000],
                borderColor: '#00f5d4',
                backgroundColor: 'rgba(0, 245, 212, 0.12)',
                tension: 0.4,
                fill: true
            }]
        } : {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Active Users',
                data: [650, 890, 1200, 980, 1100, 750, 600],
                backgroundColor: 'rgba(0, 245, 212, 0.5)',
                borderColor: '#00f5d4',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#e5e2e1' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: '#1f1f1f' }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return chartType === 'revenue' ? '$' + value.toLocaleString() : value;
                        }
                    },
                    grid: { color: '#1f1f1f' }
                }
            }
        }
    };

    modalTitle.textContent = chartType === 'revenue' ? 'Revenue Trend' : 'User Activity';
    modalChartInstance = new Chart(ctx, chartConfig);
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    if (modalChartInstance) {
        modalChartInstance.destroy();
        modalChartInstance = null;
    }
}

// Profile Modal Functions
function openProfileModal() {
    const modal = document.getElementById('profileModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// Settings Modal Functions
function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// Dark Mode Toggle
function toggleDarkMode() {
    const body = document.body;
    const isDark = body.classList.contains('dark');
    const iconSpan = document.querySelector('button[onclick="toggleDarkMode()"] span');

    if (isDark) {
        body.classList.remove('dark');
        body.classList.add('light');
        if (iconSpan) iconSpan.textContent = 'light_mode';
        showToast('Theme', 'Switched to light mode', 'default');
    } else {
        body.classList.remove('light');
        body.classList.add('dark');
        if (iconSpan) iconSpan.textContent = 'dark_mode';
        showToast('Theme', 'Switched to dark mode', 'default');
    }
}

// Audit Log Expand Mode (true = single expand, false = multiple expand)
let auditSingleExpandMode = true;

// Toggle Audit Log Expand Mode
function toggleAuditExpandMode() {
    auditSingleExpandMode = !auditSingleExpandMode;

    const btn = document.getElementById('auditToggleBtn');
    const text = document.getElementById('auditToggleText');
    const icon = btn.querySelector('.material-symbols-outlined');

    if (auditSingleExpandMode) {
        btn.style.backgroundColor = 'var(--primary)';
        btn.style.color = 'var(--primary-foreground)';
        icon.textContent = 'check_circle';
        text.textContent = 'Single (Auto-close)';
        showToast('Setting', 'Single expand mode: Opening one closes others', 'default');
    } else {
        btn.style.backgroundColor = 'var(--secondary)';
        btn.style.color = 'var(--secondary-foreground)';
        icon.textContent = 'library_add_check';
        text.textContent = 'Multiple (Keep open)';
        showToast('Setting', 'Multiple expand mode: Multiple can stay open', 'default');
    }
}

// Close All Audit Logs
function closeAllAuditLogs() {
    document.querySelectorAll('.audit-entry').forEach(entry => {
        const detail = entry.querySelector('.audit-detail');
        const chevron = entry.querySelector('button > .material-symbols-outlined:last-child');

        if (detail && !detail.classList.contains('hidden')) {
            detail.classList.add('hidden');
        }
        if (chevron) {
            chevron.style.transform = 'rotate(0deg)';
        }
    });
    showToast('Action', 'All audit logs closed', 'default');
}

// Audit Log Filter System with Autocomplete
const AUDIT_FILTERS = [
    // Event types
    { label: 'Registration', keywords: ['registered', 'account registration'] },
    { label: 'Verified', keywords: ['verified', 'email verified'] },
    { label: 'Suspended', keywords: ['suspended', 'account suspended'] },
    { label: 'Deleted', keywords: ['deleted', 'gdpr', 'deletion'] },
    { label: 'Purchases', keywords: ['purchased', 'purchase', 'large purchase'] },
    { label: 'Refunds', keywords: ['refund', 'refunded'] },
    { label: 'Payouts', keywords: ['payout', 'creator payout'] },
    { label: 'Gifts', keywords: ['gift', 'sent gems', 'currency gift'] },
    { label: 'New Device', keywords: ['new device', 'logged in from'] },
    { label: 'Failed Login', keywords: ['failed login', 'brute force'] },
    { label: 'API Key', keywords: ['api key', 'generated'] },
    { label: 'Reports', keywords: ['report', 'filed', 'reported'] },
    { label: 'Content Deleted', keywords: ['content deleted', 'message deleted'] },
    { label: 'Muted', keywords: ['muted', 'voice muted'] },
    { label: 'Promoted', keywords: ['promoted', 'moderator', 'role'] },
    { label: 'Admin Grant', keywords: ['admin granted', 'granted'] },
    { label: 'Friends', keywords: ['friend', 'accepted friend'] },
    { label: 'Blocked', keywords: ['blocked', 'block'] },
    { label: 'Clan', keywords: ['clan', 'joined clan'] },
    { label: 'Achievement', keywords: ['achievement', 'earned', 'unlocked'] },
    { label: 'Event', keywords: ['event', 'won', 'esports'] },
    { label: 'Game Session', keywords: ['game session', 'race', 'completed'] },
    { label: 'Crash', keywords: ['crash', 'client crash'] },
    { label: 'Maintenance', keywords: ['maintenance', 'patch'] },
    { label: 'Data Export', keywords: ['data export', 'gdpr export'] },
    { label: 'Legal Hold', keywords: ['legal hold', 'litigation'] },
    // Severity badges
    { label: 'Critical', keywords: ['critical'] },
    { label: 'Warning', keywords: ['warning'] },
    { label: 'Financial', keywords: ['financial'] },
    { label: 'Security', keywords: ['security'] },
    { label: 'Info', keywords: ['info'] },
    { label: 'Legal', keywords: ['legal'] }
];

let activeFilters = [];
let usernameSearchMode = false;

function showFilterSuggestions(query) {
    const suggestionsDiv = document.getElementById('audit-suggestions');
    const clearBtn = document.getElementById('audit-clear-filter');

    if (!suggestionsDiv) return;

    // Show/hide clear button
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', !query && activeFilters.length === 0);
    }

    if (!query.trim()) {
        suggestionsDiv.classList.add('hidden');
        return;
    }

    const normalizedQuery = query.toLowerCase().trim();

    // Find matching filters
    const matches = AUDIT_FILTERS.filter(filter =>
        filter.label.toLowerCase().includes(normalizedQuery) ||
        filter.keywords.some(kw => kw.includes(normalizedQuery))
    );

    // Also include already-active filters that match
    const activeMatches = activeFilters.filter(filter =>
        filter.toLowerCase().includes(normalizedQuery) &&
        !matches.some(m => m.label === filter)
    );

    if (matches.length === 0 && activeMatches.length === 0) {
        suggestionsDiv.classList.add('hidden');
        return;
    }

    // Build suggestions HTML
    let html = '';

    if (matches.length > 0) {
        html += `<div class="p-2 text-xs font-medium uppercase tracking-wider" style="color: var(--muted-foreground); background-color: var(--muted);">Available Filters</div>`;
        matches.forEach(filter => {
            const isActive = activeFilters.includes(filter.label);
            html += `
                <button onclick="applyFilter('${filter.label.replace(/'/g, "\\'")}')"
                        class="w-full text-left px-3 py-2.5 text-sm transition-colors hover:opacity-80 flex items-center justify-between"
                        style="color: var(--foreground); background-color: ${isActive ? 'var(--muted)' : 'var(--card)'};"
                        ${isActive ? 'disabled' : ''}>
                    <span>${filter.label}</span>
                    ${isActive ? '<span class="material-symbols-outlined text-[16px]" style="color: var(--primary);">check</span>' : ''}
                </button>
            `;
        });
    }

    suggestionsDiv.innerHTML = html;
    suggestionsDiv.classList.remove('hidden');
}

function applyFilter(filterLabel) {
    if (!activeFilters.includes(filterLabel)) {
        activeFilters.push(filterLabel);
        updateActiveFiltersDisplay();
        filterAuditEntries();
    }

    // Clear input and hide suggestions
    const input = document.getElementById('audit-filter-input');
    if (input) input.value = '';

    const suggestionsDiv = document.getElementById('audit-suggestions');
    if (suggestionsDiv) suggestionsDiv.classList.add('hidden');
}

function removeFilter(filterLabel) {
    activeFilters = activeFilters.filter(f => f !== filterLabel);
    updateActiveFiltersDisplay();
    filterAuditEntries();

    // If no filters left and no username search, show all
    if (activeFilters.length === 0 && !usernameSearchMode) {
        document.querySelectorAll('.audit-entry').forEach(entry => {
            entry.style.display = '';
        });
        updateResultsCount();
    }
}

function updateActiveFiltersDisplay() {
    const container = document.getElementById('audit-active-filters');
    if (!container) return;

    if (activeFilters.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = activeFilters.map(filter => `
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
              style="background-color: var(--primary); color: var(--primary-foreground);">
            ${filter}
            <button onclick="removeFilter('${filter.replace(/'/g, "\\'")}')" class="hover:opacity-70">
                <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
        </span>
    `).join('');
}

function filterAuditEntries() {
    const entries = document.querySelectorAll('.audit-entry');
    let visibleCount = 0;
    const totalEntries = entries.length;

    entries.forEach(entry => {
        const entryText = (entry.textContent || '').toLowerCase();

        // Check if entry matches all active filters
        const matchesFilters = activeFilters.every(filterLabel => {
            const filterDef = AUDIT_FILTERS.find(f => f.label === filterLabel);
            if (!filterDef) return true;

            return filterDef.keywords.some(keyword => entryText.includes(keyword.toLowerCase())) ||
                   entryText.includes(filterLabel.toLowerCase());
        });

        // Check username search if in that mode
        let matchesUsername = true;
        if (usernameSearchMode) {
            const usernameInput = document.getElementById('audit-username-input');
            const usernameQuery = usernameInput?.value?.toLowerCase().trim() || '';
            if (usernameQuery) {
                matchesUsername = entryText.includes('@' + usernameQuery) ||
                                  entryText.includes(usernameQuery);
            }
        }

        const isMatch = matchesFilters && matchesUsername;
        entry.style.display = isMatch ? '' : 'none';

        if (isMatch) visibleCount++;
    });

    // Update results count
    const resultsDiv = document.getElementById('audit-filter-results');
    const matchCount = document.getElementById('audit-filter-match-count');
    const totalCount = document.getElementById('audit-filter-total-count');

    if (resultsDiv && matchCount && totalCount) {
        if (activeFilters.length > 0 || (usernameSearchMode && document.getElementById('audit-username-input')?.value?.trim())) {
            resultsDiv.classList.remove('hidden');
            matchCount.textContent = visibleCount;
            totalCount.textContent = totalEntries;
        } else {
            resultsDiv.classList.add('hidden');
        }
    }

    // Auto-expand if few results
    if (visibleCount > 0 && visibleCount < 5) {
        entries.forEach(entry => {
            if (entry.style.display !== 'none') {
                const detail = entry.querySelector('.audit-detail');
                const chevron = entry.querySelector('button > .material-symbols-outlined:last-child');
                if (detail && detail.classList.contains('hidden')) {
                    detail.classList.remove('hidden');
                    if (chevron) chevron.style.transform = 'rotate(90deg)';
                }
            }
        });
    }
}

function updateResultsCount() {
    const entries = document.querySelectorAll('.audit-entry');
    const resultsDiv = document.getElementById('audit-filter-results');
    const matchCount = document.getElementById('audit-filter-match-count');
    const totalCount = document.getElementById('audit-filter-total-count');

    if (resultsDiv && matchCount && totalCount) {
        resultsDiv.classList.remove('hidden');
        matchCount.textContent = entries.length;
        totalCount.textContent = entries.length;
    }
}

function handleFilterKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();

        // Hide suggestions
        const suggestionsDiv = document.getElementById('audit-suggestions');
        if (suggestionsDiv) suggestionsDiv.classList.add('hidden');

        // Switch to username search mode
        usernameSearchMode = true;
        const usernameDiv = document.getElementById('audit-username-search');
        if (usernameDiv) {
            usernameDiv.classList.remove('hidden');
            const usernameInput = document.getElementById('audit-username-input');
            if (usernameInput) {
                usernameInput.focus();
            }
        }

        // Clear the filter input
        const filterInput = document.getElementById('audit-filter-input');
        if (filterInput) filterInput.value = '';

        showToast('Search Mode', 'Now searching by username. Type a username to filter.', 'default');
    }
}

function searchAuditByUsername(query) {
    filterAuditEntries();
}

function clearAuditFilter() {
    activeFilters = [];
    usernameSearchMode = false;

    const filterInput = document.getElementById('audit-filter-input');
    const usernameInput = document.getElementById('audit-username-input');
    const usernameDiv = document.getElementById('audit-username-search');
    const clearBtn = document.getElementById('audit-clear-filter');
    const resultsDiv = document.getElementById('audit-filter-results');

    if (filterInput) filterInput.value = '';
    if (usernameInput) usernameInput.value = '';
    if (usernameDiv) usernameDiv.classList.add('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (resultsDiv) resultsDiv.classList.add('hidden');

    updateActiveFiltersDisplay();

    // Show all entries
    document.querySelectorAll('.audit-entry').forEach(entry => {
        entry.style.display = '';
    });
}

// Close suggestions when clicking outside
document.addEventListener('click', function(event) {
    const container = document.getElementById('audit-filter-container');
    const suggestionsDiv = document.getElementById('audit-suggestions');

    if (container && suggestionsDiv && !container.contains(event.target)) {
        suggestionsDiv.classList.add('hidden');
    }
});

// Toggle Audit Log Detail
function toggleAuditDetail(button) {
    const entry = button.closest('.audit-entry');
    const detail = entry.querySelector('.audit-detail');
    const chevron = button.querySelector('.material-symbols-outlined');

    const isExpanding = detail.classList.contains('hidden');

    // If single expand mode is on and we're expanding, close all others first
    if (auditSingleExpandMode && isExpanding) {
        document.querySelectorAll('.audit-entry').forEach(otherEntry => {
            if (otherEntry !== entry) {
                const otherDetail = otherEntry.querySelector('.audit-detail');
                const otherChevron = otherEntry.querySelector('button > .material-symbols-outlined:last-child');

                if (otherDetail && !otherDetail.classList.contains('hidden')) {
                    otherDetail.classList.add('hidden');
                }
                if (otherChevron) {
                    otherChevron.style.transform = 'rotate(0deg)';
                }
            }
        });
    }

    // Toggle current entry
    if (isExpanding) {
        detail.classList.remove('hidden');
        chevron.style.transform = 'rotate(90deg)';
    } else {
        detail.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

// Report Modal Functions
function openReportModal(reportId) {
    const report = REPORTS_DATA.find(r => r.id === reportId);
    if (report) {
        currentReportId = report.id;
        populateReportDetailModal(report);
    }

    const modal = document.getElementById('reportDetailModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeReportModal() {
    const modal = document.getElementById('reportDetailModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function getEvidenceRisk(report) {
    if (!report) return { label: 'Medium', note: 'Needs review', className: '' };
    if (['harassment', 'scam', 'fraud', 'cheating'].includes(report.type) || report.evidence.length > 1) {
        return { label: 'High', note: 'Action likely required', className: 'danger' };
    }
    if (report.status === 'dismissed') {
        return { label: 'Low', note: 'No violation found', className: '' };
    }
    return { label: 'Medium', note: 'Needs moderator judgment', className: '' };
}

function getEvidenceMessages(report) {
    const target = report ? report.reportedUser : 'user_7834';
    const examples = {
        harassment: [
            'hey loser, nobody wants you here',
            'why dont you just quit already',
            "you're trash at this game go back to roblox kid"
        ],
        cheating: [
            'impossible lap time posted again',
            'speed boost triggered outside race rules',
            'movement delta exceeded fair-play threshold'
        ],
        scam: [
            'send first and i will double it',
            'click this link to verify the trade',
            'fake item trade detected in direct messages'
        ],
        spam: [
            'external website link posted repeatedly',
            'same message sent across public chat',
            'bot-like cadence detected'
        ],
        inappropriate: [
            'username contains blocked term',
            'profile display name violates naming policy',
            'reporter flagged offensive account identity'
        ],
        other: [
            'attached report needs human context review',
            'system could not auto-classify the issue',
            'moderator decision required'
        ]
    };
    const messages = examples[report?.type] || examples.other;
    return messages.map((text, index) => ({
        user: target,
        time: index < 2 ? '2:14 AM' : '2:15 AM',
        flagged: index === messages.length - 1,
        text
    }));
}

function populateEvidenceModal(report) {
    if (!report) return;

    currentReportId = report.id;
    const typeStyle = REPORT_TYPE_STYLES[report.type] || REPORT_TYPE_STYLES.other;
    const risk = getEvidenceRisk(report);
    const messages = getEvidenceMessages(report);
    const evidenceCount = report.evidence.length;

    setText('evidence-modal-subtitle', `Report ${report.id} · ${typeStyle.label} · ${evidenceCount} attached item${evidenceCount === 1 ? '' : 's'}`);
    setText('evidence-reported-user', `@${report.reportedUser}`);
    setText('evidence-reported-note', report.status === 'resolved' ? 'Already actioned' : 'Open moderation subject');
    setText('evidence-reporter-user', `@${report.reporter}`);
    setText('evidence-channel', report.type === 'cheating' ? 'Gameplay telemetry' : '#general');
    setText('evidence-channel-note', report.type === 'cheating' ? 'Race session' : 'Chat session');
    setText('evidence-risk-label', risk.label);
    setText('evidence-risk-note', risk.note);
    setText('evidence-captured-window', `Captured ${formatReportModalDateTime(report.created) || 'with report'}`);

    const riskEl = document.getElementById('evidence-risk-label');
    if (riskEl) {
        riskEl.className = risk.className;
    }

    const chatList = document.querySelector('.evidence-chat-list');
    if (chatList) {
        chatList.innerHTML = messages.map((message) => `
            <div class="evidence-chat-message${message.flagged ? ' flagged' : ''}">
                <img src="https://picsum.photos/seed/${encodeURIComponent(message.user)}/40/40.jpg" alt="${escapeHtml(message.user)} avatar">
                <div>
                    <div class="evidence-message-meta"><strong>${escapeHtml(message.user)}</strong><span>${escapeHtml(message.time)}${message.flagged ? ' · Flagged' : ''}</span></div>
                    <p>${escapeHtml(message.text)}</p>
                </div>
            </div>
        `).join('');
    }

    const transcript = document.querySelector('.evidence-transcript');
    if (transcript) {
        transcript.innerHTML = messages.map((message, index) => `
            <p class="${message.flagged ? 'danger' : ''}"><span>[02:${14 + Math.min(index, 1)}:${32 + index * 13}]</span> <b>${escapeHtml(message.user)}:</b> ${escapeHtml(message.text)}</p>
        `).join('') + '<p class="muted">--- reported message boundary ---</p>';
    }

    const decisionTitle = document.querySelector('.evidence-decision-card h4');
    if (decisionTitle) {
        decisionTitle.textContent = risk.label === 'High' ? 'Recommended: take action' : 'Recommended: moderator review';
    }
    const decisionCopy = document.querySelector('.evidence-decision-card p');
    if (decisionCopy) {
        decisionCopy.textContent = `${typeStyle.label} report against @${report.reportedUser}. Review the attached evidence before resolving or dismissing.`;
    }
}

// Evidence Modal Functions
function openEvidenceModal(reportId = currentReportId) {
    const report = REPORTS_DATA.find(r => r.id === reportId) || REPORTS_DATA[0];
    populateEvidenceModal(report);

    const modal = document.getElementById('evidenceModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
}

function closeEvidenceModal() {
    const modal = document.getElementById('evidenceModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
}

// Transaction Modal Functions
function openTransactionModal(transactionId) {
    const modal = document.getElementById('transactionModal');
    const idEl = document.getElementById('transactionId');
    const amountEl = document.getElementById('transactionAmount');
    const userEl = document.getElementById('transactionUser');
    const avatarEl = document.getElementById('transactionAvatar');
    const itemEl = document.getElementById('transactionItem');

    // Set transaction data based on ID
    const transactionData = {
        'txn_7k3m9p2x5': { amount: '$4.99', user: 'maria_s', avatar: 'maria', item: '500 Gems' },
        'txn_large_9x4k': { amount: '$249.99', user: 'whale_user', avatar: 'whale', item: '10,000 Robux' }
    };

    const data = transactionData[transactionId] || transactionData['txn_7k3m9p2x5'];

    if (idEl) idEl.textContent = transactionId;
    if (amountEl) amountEl.textContent = data.amount;
    if (userEl) userEl.textContent = data.user;
    if (avatarEl) avatarEl.src = `https://picsum.photos/seed/${data.avatar}/32/32.jpg`;
    if (itemEl) itemEl.textContent = data.item;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeTransactionModal() {
    const modal = document.getElementById('transactionModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// Session Modal Functions
function openSessionModal(sessionId) {
    const modal = document.getElementById('sessionModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeSessionModal() {
    const modal = document.getElementById('sessionModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// User Profile Modal
function openUserProfileModal(username, avatarSeed, userId) {
    const modal = document.getElementById('userProfileModal');
    const usernameEl = document.getElementById('profileUsername');
    const avatarEl = document.getElementById('profileAvatar');
    const userIdEl = document.getElementById('profileUserId');
    const joinedEl = document.getElementById('profileJoined');
    const emailEl = document.getElementById('profileEmail');
    const phoneEl = document.getElementById('profilePhone');
    const locationEl = document.getElementById('profileLocation');
    const ipEl = document.getElementById('profileIp');

    // Set user data
    usernameEl.textContent = username;
    avatarEl.src = `https://picsum.photos/seed/${avatarSeed}/128/128.jpg`;
    userIdEl.textContent = userId || `usr_${Math.random().toString(36).substr(2, 10)}`;
    joinedEl.textContent = 'January 15, 2024';
    emailEl.textContent = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@email.com`;
    phoneEl.textContent = '+1 (555) 123-4567';
    locationEl.textContent = 'United States';
    ipEl.textContent = '192.168.45.12';

    // Reset to overview tab
    switchProfileTab('overview');

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeUserProfileModal() {
    const modal = document.getElementById('userProfileModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function switchProfileTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
        const indicator = btn.querySelector('.profile-tab-indicator');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
            btn.style.color = 'var(--foreground)';
            if (indicator) indicator.classList.remove('hidden');
        } else {
            btn.classList.remove('active');
            btn.style.color = 'var(--muted-foreground)';
            if (indicator) indicator.classList.add('hidden');
        }
    });

    // Update tab panes
    document.querySelectorAll('.profile-tab-pane').forEach(pane => {
        pane.classList.add('hidden');
        pane.classList.remove('active');
    });

    const activePane = document.getElementById('profile-tab-' + tabName);
    if (activePane) {
        activePane.classList.remove('hidden');
        activePane.classList.add('active');
    }
}

function adminAction(action) {
    const username = document.getElementById('profileUsername').textContent;
    const messages = {
        role: `Opening role manager for ${username}`,
        currency: `Opening currency manager for ${username}`,
        warn: `Sending warning to ${username}`,
        ban: `Banning ${username}`,
        delete: `Deleting ${username}'s account`
    };
    showToast('Admin Action', messages[action] || 'Action initiated', action === 'ban' || action === 'delete' ? 'destructive' : 'default');
}

function viewFullProfile() {
    const username = document.getElementById('profileUsername').textContent;
    showToast('Navigation', `Opening full profile page for ${username}...`, 'default');
}

// Tab Switching Function
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const indicator = btn.querySelector('.tab-indicator');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
            btn.style.color = 'var(--foreground)';
            if (indicator) indicator.classList.remove('hidden');
        } else {
            btn.classList.remove('active');
            btn.style.color = 'var(--muted-foreground)';
            if (indicator) indicator.classList.add('hidden');
        }
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.add('hidden');
        pane.classList.remove('active');
    });

    const activePane = document.getElementById('tab-' + tabName);
    if (activePane) {
        activePane.classList.remove('hidden');
        activePane.classList.add('active');
    }
}

// Inline Widget Toggle Function
const widgetCharts = {};

function toggleWidget(metricType) {
    const metricConfig = {
        totalUsers: { title: 'Total Users - 7 Day Trend', color: '#00f5d4', data: [138.2, 139.1, 140.5, 141.2, 141.8, 142.3, 142.8], label: 'Users (K)' },
        concurrentUsers: { title: 'Concurrent Users - 7 Day Trend', color: '#00f5d4', data: [78.5, 79.2, 80.8, 82.1, 82.9, 83.5, 84.2], label: 'Online (K)' },
        revenue24h: { title: 'Revenue - 7 Day Trend', color: '#f87171', data: [38.2, 39.5, 40.1, 41.8, 42.2, 43.1, 42.9], label: 'Revenue ($K)' },
        fuel: { title: 'Fuel Reserves - 7 Day Trend', color: '#00f5d4', data: [8.1, 8.15, 8.22, 8.28, 8.33, 8.38, 8.4], label: 'Fuel (M)' },
        cash: { title: 'Liquid Cash - 7 Day Trend', color: '#00f5d4', data: [11.2, 11.5, 11.7, 11.85, 11.95, 12.05, 12.1], label: 'Cash (M)' },
        gems: { title: 'Premium Gems - 7 Day Trend', color: '#f87171', data: [985, 978, 970, 965, 958, 952, 945], label: 'Gems (K)' },
        robux: { title: 'Robux - 7 Day Trend', color: '#00f5d4', data: [2.1, 2.15, 2.2, 2.25, 2.28, 2.32, 2.3], label: 'Robux (M)' },
        reports: { title: 'Reports - 7 Day Trend', color: '#f87171', data: [98, 105, 112, 118, 122, 119, 127], label: 'Reports' }
    };

    const widget = document.getElementById('widget-' + metricType);
    const isExpanded = widget.classList.contains('expanded');

    // Collapse all other widgets
    document.querySelectorAll('.widget-card').forEach(w => {
        w.classList.remove('expanded');
        w.classList.add('col-span-1');
        w.classList.remove('md:col-span-2', 'lg:col-span-2');
    });

    // Destroy all widget charts
    Object.keys(widgetCharts).forEach(key => {
        if (widgetCharts[key]) {
            widgetCharts[key].destroy();
            widgetCharts[key] = null;
        }
    });

    // If this widget wasn't expanded, expand it
    if (!isExpanded) {
        widget.classList.add('expanded');
        widget.classList.remove('col-span-1');
        widget.classList.add('md:col-span-2', 'lg:col-span-2');

        const config = metricConfig[metricType];
        if (config) {
            setTimeout(() => {
                const canvas = document.getElementById('chart-' + metricType);
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    widgetCharts[metricType] = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                            datasets: [{
                                label: config.label,
                                data: config.data,
                                borderColor: config.color,
                                backgroundColor: config.color + '20',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: false,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: true,
                                    labels: { color: '#e5e2e1', font: { size: 11 } }
                                }
                            },
                            scales: {
                                x: {
                                    ticks: { color: '#9ca3af', font: { size: 10 } },
                                    grid: { color: '#1f1f1f' }
                                },
                                y: {
                                    beginAtZero: false,
                                    ticks: { color: '#9ca3af', font: { size: 10 } },
                                    grid: { color: '#1f1f1f' }
                                }
                            }
                        }
                    });
                }
            }, 100);
        }
    }
}

// Close modal on background click
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('chartModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeChartModal();
            }
        });
    }

    const profileModal = document.getElementById('profileModal');
    if (profileModal) {
        profileModal.addEventListener('click', function(e) {
            if (e.target === profileModal) {
                closeProfileModal();
            }
        });
    }

    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.addEventListener('click', function(e) {
            if (e.target === settingsModal) {
                closeSettingsModal();
            }
        });
    }

    const userProfileModal = document.getElementById('userProfileModal');
    if (userProfileModal) {
        userProfileModal.addEventListener('click', function(e) {
            if (e.target === userProfileModal) {
                closeUserProfileModal();
            }
        });
    }

    const reportModal = document.getElementById('reportDetailModal');
    if (reportModal) {
        reportModal.addEventListener('click', function(e) {
            if (e.target === reportModal) {
                closeReportModal();
            }
        });
    }

    const evidenceModal = document.getElementById('evidenceModal');
    if (evidenceModal) {
        evidenceModal.addEventListener('click', function(e) {
            if (e.target === evidenceModal) {
                closeEvidenceModal();
            }
        });
    }

    const transactionModal = document.getElementById('transactionModal');
    if (transactionModal) {
        transactionModal.addEventListener('click', function(e) {
            if (e.target === transactionModal) {
                closeTransactionModal();
            }
        });
    }

    const sessionModal = document.getElementById('sessionModal');
    if (sessionModal) {
        sessionModal.addEventListener('click', function(e) {
            if (e.target === sessionModal) {
                closeSessionModal();
            }
        });
    }
});

// Chart initialization
function initializeCharts() {
    // Revenue Chart
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Revenue',
                    data: [12000, 19000, 15000, 25000, 22000, 30000],
                    borderColor: '#00f5d4',
                    backgroundColor: 'rgba(0, 245, 212, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: '#1f1f1f' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#9ca3af',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: '#1f1f1f' }
                    }
                }
            }
        });
    }

    // Activity Chart
    const activityCtx = document.getElementById('activityChart');
    if (activityCtx) {
        new Chart(activityCtx, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Active Users',
                    data: [650, 890, 1200, 980, 1100, 750, 600],
                    backgroundColor: 'rgba(0, 245, 212, 0.8)',
                    borderColor: '#00f5d4',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: '#1f1f1f' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#9ca3af' },
                        grid: { color: '#1f1f1f' }
                    }
                }
            }
        });
    }

    // Demographics Chart
    const demographicsCtx = document.getElementById('demographicsChart');
    if (demographicsCtx) {
        new Chart(demographicsCtx, {
            type: 'doughnut',
            data: {
                labels: ['18-24', '25-34', '35-44', '45-54', '55+'],
                datasets: [{
                    data: [25, 35, 20, 15, 5],
                    backgroundColor: [
                        'rgba(102, 126, 234, 0.8)',
                        'rgba(118, 75, 162, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // Categories Chart
    const categoriesCtx = document.getElementById('categoriesChart');
    if (categoriesCtx) {
        new Chart(categoriesCtx, {
            type: 'pie',
            data: {
                labels: ['Music', 'Sports', 'Technology', 'Arts', 'Food & Drink'],
                datasets: [{
                    data: [30, 25, 20, 15, 10],
                    backgroundColor: [
                        'rgba(102, 126, 234, 0.8)',
                        'rgba(118, 75, 162, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

// Update stats with simulated real-time data
function updateStats() {
    const statCards = document.querySelectorAll('.stat-card h3');

    // Simulate small random changes in stats
    statCards.forEach((card, index) => {
        const currentValue = card.textContent;
        if (index === 0) { // Users
            const newValue = Math.floor(2847 + Math.random() * 10 - 5);
            card.textContent = newValue.toLocaleString();
        } else if (index === 1) { // Events
            const newValue = Math.floor(156 + Math.random() * 4 - 2);
            card.textContent = newValue;
        } else if (index === 2) { // Tickets
            const newValue = Math.floor(4293 + Math.random() * 20 - 10);
            card.textContent = newValue.toLocaleString();
        } else if (index === 3) { // Revenue
            const newValue = Math.floor(28492 + Math.random() * 200 - 100);
            card.textContent = '$' + newValue.toLocaleString();
        }
    });

    // Add new activity occasionally
    if (Math.random() > 0.7) {
        addNewActivity();
    }
}

// Add new activity to the activity feed
function addNewActivity() {
    const activities = [
        { icon: 'fa-user-plus', text: 'New user registered: ', user: getRandomUser() },
        { icon: 'fa-ticket-alt', text: 'Event ticket purchased: ', event: getRandomEvent() },
        { icon: 'fa-calendar-plus', text: 'New event created: ', event: getRandomEvent() },
        { icon: 'fa-comment', text: 'New review posted for ', event: getRandomEvent() }
    ];

    const activity = activities[Math.floor(Math.random() * activities.length)];
    const activityList = document.querySelector('.activity-list');

    if (activityList) {
        const newActivity = document.createElement('div');
        newActivity.className = 'activity-item';
        newActivity.style.opacity = '0';

        const activityText = activity.user || activity.event || 'system';
        newActivity.innerHTML = `
            <div class="activity-icon">
                <i class="fas ${activity.icon}"></i>
            </div>
            <div class="activity-details">
                <p><strong>${activity.text}</strong>${activityText}</p>
                <span class="activity-time">Just now</span>
            </div>
        `;

        activityList.insertBefore(newActivity, activityList.firstChild);

        // Animate in
        setTimeout(() => {
            newActivity.style.transition = 'opacity 0.5s ease';
            newActivity.style.opacity = '1';
        }, 100);

        // Remove last activity if there are too many
        const activities = activityList.querySelectorAll('.activity-item');
        if (activities.length > 5) {
            activityList.removeChild(activities[activities.length - 1]);
        }
    }
}

// Get random user name
function getRandomUser() {
    const users = ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Eve Wilson', 'Frank Miller'];
    return users[Math.floor(Math.random() * users.length)];
}

// Get random event name
function getRandomEvent() {
    const events = ['Summer Festival', 'Tech Conference', 'Art Exhibition', 'Sports Tournament', 'Food Festival', 'Music Concert'];
    return events[Math.floor(Math.random() * events.length)];
}

// Initialize search functionality
function initializeSearch() {
    const searchInput = document.querySelector('.search-bar input');

    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();

            // Simple search demonstration - in a real app, this would search actual data
            if (searchTerm.length > 2) {
                console.log('Searching for:', searchTerm);
                // In a real implementation, you would filter data and update the UI
            }
        });
    }
}

// Initialize notifications
function initializeNotifications() {
    const notificationIcon = document.querySelector('.notification-icon');

    if (notificationIcon) {
        notificationIcon.addEventListener('click', function() {
            // Clear notification badge
            const badge = this.querySelector('.badge');
            if (badge) {
                badge.style.display = 'none';
            }

            // Show notification panel (in a real app)
            alert('You have 3 new notifications:\n\n1. New user registration\n2. Event ticket purchased\n3. System update completed');
        });
    }
}

// Form handling
document.addEventListener('DOMContentLoaded', function() {
    // Settings form
    const settingsForm = document.querySelector('.settings-form');
    if (settingsForm) {
        const saveButton = settingsForm.querySelector('.btn-primary');
        if (saveButton) {
            saveButton.addEventListener('click', function(e) {
                e.preventDefault();

                // Show success message
                const originalText = this.textContent;
                this.textContent = 'Settings Saved!';
                this.style.backgroundColor = '#10b981';

                setTimeout(() => {
                    this.textContent = originalText;
                    this.style.backgroundColor = '';
                }, 2000);
            });
        }
    }

    // Add user button
    const addUserButtons = document.querySelectorAll('.btn-primary');
    addUserButtons.forEach(button => {
        if (button.textContent.includes('Add User')) {
            button.addEventListener('click', function() {
                alert('Add User functionality would open a modal form here');
            });
        }
        if (button.textContent.includes('Create Event')) {
            button.addEventListener('click', function() {
                alert('Create Event functionality would open a modal form here');
            });
        }
    });

    // Edit/Delete buttons in tables
    const editButtons = document.querySelectorAll('.btn-secondary');
    const deleteButtons = document.querySelectorAll('.btn-danger');

    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const row = this.closest('tr');
            const userName = row.querySelector('.user-info span').textContent;
            alert(`Edit functionality for ${userName} would open here`);
        });
    });

    deleteButtons.forEach(button => {
        button.addEventListener('click', function() {
            const row = this.closest('tr');
            const userName = row.querySelector('.user-info span').textContent;

            if (confirm(`Are you sure you want to delete ${userName}?`)) {
                // Animate removal
                row.style.transition = 'opacity 0.3s ease';
                row.style.opacity = '0';

                setTimeout(() => {
                    row.remove();
                }, 300);
            }
        });
    });

    // Event card actions
    const eventViewButtons = document.querySelectorAll('.event-card .btn-primary');
    eventViewButtons.forEach(button => {
        if (button.textContent === 'View') {
            button.addEventListener('click', function() {
                const card = this.closest('.event-card');
                const eventName = card.querySelector('h3').textContent;
                alert(`View details for ${eventName} would open here`);
            });
        }
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('.search-bar input');
        if (searchInput) {
            searchInput.focus();
        }
    }

    // Escape to close modals (in a real app)
    if (e.key === 'Escape') {
        // Close any open modals
        console.log('Escape pressed - would close modals');
    }
});

// Responsive sidebar toggle for mobile
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    if (window.innerWidth <= 768 && sidebar && mainContent) {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    }
}

// Window resize handler
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        if (sidebar) sidebar.classList.remove('collapsed');
        if (mainContent) mainContent.classList.remove('expanded');
    }
});

// Add hover effects to cards
document.addEventListener('DOMContentLoaded', function() {
    const cards = document.querySelectorAll('.stat-card, .event-card, .analytics-card');

    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });

        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });

    // Initialize user lists if on users section
    if (document.getElementById('user-list-container')) {
        sortUserList();
    }
    if (document.getElementById('user-list-container-tab')) {
        sortUserListTab();
    }
});

// ==================== USER LIST MANAGEMENT ====================

// Mock user data for the user directory
const USER_DATA = [
    { id: 'usr_8f4d2a9e', username: 'alex_gamer22', displayName: 'Alex Johnson', avatarSeed: 'alex22', joined: '2026-04-20', cash: 1250, robux: 5000, gems: 750, fuel: 45, status: 'active' },
    { id: 'usr_1a2b3c4d', username: 'sarah_jones', displayName: 'Sarah Jones', avatarSeed: 'sarah', joined: '2026-04-18', cash: 3400, robux: 12000, gems: 2100, fuel: 120, status: 'active' },
    { id: 'usr_2b3c4d5e', username: 'maria_s', displayName: 'Maria Silva', avatarSeed: 'maria', joined: '2026-04-15', cash: 800, robux: 3000, gems: 450, fuel: 25, status: 'active' },
    { id: 'usr_6f7g8h9i', username: 'whale_user', displayName: 'Big Whale', avatarSeed: 'whale', joined: '2026-04-10', cash: 50000, robux: 150000, gems: 25000, fuel: 500, status: 'vip' },
    { id: 'usr_9h0i1j2k', username: 'newbie_2026', displayName: 'New Player', avatarSeed: 'newbie', joined: '2026-04-26', cash: 50, robux: 0, gems: 25, fuel: 5, status: 'active' },
    { id: 'usr_3c4d5e6f', username: 'crypto_king', displayName: 'Crypto King', avatarSeed: 'crypto', joined: '2026-04-05', cash: 25000, robux: 80000, gems: 12000, fuel: 300, status: 'active' },
    { id: 'usr_4d5e6f7g', username: 'casual_player', displayName: 'Casual Gamer', avatarSeed: 'casual', joined: '2026-04-22', cash: 150, robux: 500, gems: 100, fuel: 15, status: 'active' },
    { id: 'usr_5e6f7g8h', username: 'speed_demon', displayName: 'Speed Demon', avatarSeed: 'speed', joined: '2026-04-12', cash: 2100, robux: 7500, gems: 1200, fuel: 80, status: 'active' },
    { id: 'usr_7g8h9i0j', username: 'esports_champ', displayName: 'ESports Champion', avatarSeed: 'champ', joined: '2026-04-08', cash: 8500, robux: 25000, gems: 4000, fuel: 150, status: 'active' },
    { id: 'usr_8h9i0j1k', username: 'competitive_gamer', displayName: 'Competitive Gamer', avatarSeed: 'comp', joined: '2026-04-14', cash: 900, robux: 3200, gems: 500, fuel: 30, status: 'active' },
    { id: 'usr_9i0j1k2l', username: 'privacy_conscious', displayName: 'Privacy First', avatarSeed: 'privacy', joined: '2026-04-16', cash: 600, robux: 2000, gems: 300, fuel: 20, status: 'active' },
    { id: 'usr_0j1k2l3m', username: 'social_butterfly', displayName: 'Social Butterfly', avatarSeed: 'socialite', joined: '2026-04-11', cash: 1750, robux: 6000, gems: 900, fuel: 60, status: 'active' },
    { id: 'usr_1k2l3m4n', username: 'dev_team_leader', displayName: 'Dev Team Lead', avatarSeed: 'dev', joined: '2026-03-15', cash: 5000, robux: 18000, gems: 3500, fuel: 200, status: 'moderator' },
    { id: 'usr_2l3m4n5o', username: 'security_conscious', displayName: 'Security First', avatarSeed: 'security', joined: '2026-03-20', cash: 2200, robux: 8000, gems: 1500, fuel: 90, status: 'active' },
    { id: 'usr_3m4n5o6p', username: 'loud_mic_user', displayName: 'Loud Mic', avatarSeed: 'loud', joined: '2026-04-19', cash: 300, robux: 1200, gems: 200, fuel: 10, status: 'muted' }
];

let currentUserData = [...USER_DATA];
let displayedUserCount = 10;

function renderUserList(containerId, countId, users = currentUserData.slice(0, displayedUserCount)) {
    const container = document.getElementById(containerId);
    const countEl = document.getElementById(countId);

    if (!container) return;

    // Update count
    if (countEl) {
        countEl.textContent = users.length;
    }

    // Clear container
    container.innerHTML = '';

    // Render users
    users.forEach(user => {
        const userCard = createUserCard(user);
        container.appendChild(userCard);
    });
}

function createUserCard(user) {
    const card = document.createElement('div');
    card.className = 'users-row';
    card.onclick = () => openUserProfileModal(user.username, user.avatarSeed, user.id);

    const statusColors = {
        active: '#00f5d4',
        vip: '#f59e0b',
        moderator: '#a78bfa',
        muted: '#ff8a80'
    };
    const statusColor = statusColors[user.status] || statusColors.active;

    card.innerHTML = `
        <div class="users-row-main">
            <img src="https://picsum.photos/seed/${user.avatarSeed}/64/64.jpg" alt="${user.displayName}">
            <div class="users-row-copy">
                <div>
                    <strong>@${user.username}</strong>
                    <span style="--status-color: ${statusColor};">${user.status.toUpperCase()}</span>
                </div>
                <p>${user.displayName} · ${user.id}</p>
                <small>Joined ${formatDate(user.joined)}</small>
            </div>
        </div>
        <div class="users-row-assets">
            <div><span>Cash</span><b>${formatCurrency(user.cash)}</b></div>
            <div><span>Gems</span><b>${formatCurrency(user.gems)}</b></div>
            <div><span>Rubux</span><b>${formatCurrency(user.robux)}</b></div>
            <div><span>Fuel</span><b>${formatCurrency(user.fuel)}</b></div>
        </div>
        <span class="users-row-chevron material-symbols-outlined" aria-hidden="true">chevron_right</span>
    `;

    return card;
}

function formatCurrency(value) {
    if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function filterUserList() {
    const searchInput = document.getElementById('user-search-input');
    const query = searchInput.value.toLowerCase();
    displayedUserCount = 10;

    currentUserData = USER_DATA.filter(user =>
        user.username.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query)
    );

    // Apply current sort
    const sortSelect = document.getElementById('user-sort-select');
    applySort(sortSelect.value);

    renderUserList('user-list-container', 'user-count', currentUserData.slice(0, displayedUserCount));
    updateUsersLoadMoreButton();
}

function filterUserListTab() {
    const searchInput = document.getElementById('user-search-input-tab');
    const query = searchInput.value.toLowerCase();

    currentUserData = USER_DATA.filter(user =>
        user.username.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query)
    );

    const sortSelect = document.getElementById('user-sort-select-tab');
    applySort(sortSelect.value);

    renderUserList('user-list-container-tab', 'user-count-tab', currentUserData.slice(0, displayedUserCount));
}

function sortUserList() {
    const sortSelect = document.getElementById('user-sort-select');
    applySort(sortSelect.value);
    renderUserList('user-list-container', 'user-count', currentUserData.slice(0, displayedUserCount));
    updateUsersLoadMoreButton();
}

function sortUserListTab() {
    const sortSelect = document.getElementById('user-sort-select-tab');
    applySort(sortSelect.value);
    renderUserList('user-list-container-tab', 'user-count-tab', currentUserData.slice(0, displayedUserCount));
}

function applySort(sortType) {
    switch (sortType) {
        case 'newest':
            currentUserData.sort((a, b) => new Date(b.joined) - new Date(a.joined));
            break;
        case 'oldest':
            currentUserData.sort((a, b) => new Date(a.joined) - new Date(b.joined));
            break;
        case 'most-cash':
            currentUserData.sort((a, b) => b.cash - a.cash);
            break;
        case 'least-cash':
            currentUserData.sort((a, b) => a.cash - b.cash);
            break;
    }
}

function loadMoreUsers() {
    displayedUserCount += 5;
    const searchInput = document.getElementById('user-search-input');
    const query = searchInput ? searchInput.value.toLowerCase() : '';

    currentUserData = query
        ? USER_DATA.filter(user => user.username.toLowerCase().includes(query) || user.displayName.toLowerCase().includes(query))
        : [...USER_DATA];

    const sortSelect = document.getElementById('user-sort-select');
    if (sortSelect) {
        applySort(sortSelect.value);
    }

    renderUserList('user-list-container', 'user-count', currentUserData.slice(0, displayedUserCount));
    updateUsersLoadMoreButton();
}

function updateUsersLoadMoreButton() {
    const button = document.getElementById('users-load-more-button');
    if (!button) return;

    const remaining = Math.max(currentUserData.length - displayedUserCount, 0);
    button.style.display = remaining > 0 ? 'inline-flex' : 'none';
    if (remaining > 0) {
        button.innerHTML = `
            <span class="material-symbols-outlined">add</span>
            Show ${Math.min(5, remaining)} more
        `;
    }
}

// ==================== ROLE MANAGEMENT ====================

const ROLE_DEFINITIONS = {
    user: { label: 'User', color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.2)' },
    gemplus: { label: 'Gem+', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.2)' },
    picture: { label: 'Picture', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.2)' },
    music: { label: 'Music', color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.2)' },
    movies: { label: 'Movies', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.2)' },
    creator: { label: 'Creator', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.2)' },
    withdrawal: { label: 'Withdrawal', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.2)' },
    verified: { label: 'Verified', color: '#00f5d4', bgColor: 'rgba(0, 245, 212, 0.2)' },
    beta: { label: 'Beta Tester', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.2)' }
};

// Extended user data with roles for role management
const ROLE_USER_DATA = USER_DATA.map(user => ({
    ...user,
    roles: user.status === 'vip' ? ['user', 'vip'] :
           user.status === 'moderator' ? ['user', 'moderator'] :
           user.status === 'muted' ? ['user'] :
           ['user']
}));

let currentRoleFilter = 'all';
let selectedUsers = new Set();
let displayedRoleUserCount = 10;
let currentRoleUserData = [...ROLE_USER_DATA];

function initRoleManagement() {
    // Check if we're on a page with the role user list
    if (document.getElementById('role-user-list')) {
        renderRoleUserList();
    }
}

function renderRoleUserList(users = currentRoleUserData.slice(0, displayedRoleUserCount)) {
    const container = document.getElementById('role-user-list');
    const countEl = document.getElementById('role-user-count');

    if (!container) return;

    if (countEl) {
        countEl.textContent = users.length;
    }

    container.innerHTML = '';

    users.forEach(user => {
        const userRow = createRoleUserRow(user);
        container.appendChild(userRow);
    });

    updateBulkToolbar();
}

function createRoleUserRow(user) {
    const row = document.createElement('div');
    row.className = 'widget-card rounded-lg p-3 transition-colors hover:opacity-80';
    row.style.backgroundColor = 'var(--muted)';
    row.dataset.userId = user.id;

    const isSelected = selectedUsers.has(user.id);
    const roleDef = ROLE_DEFINITIONS[user.roles[user.roles.length - 1]] || ROLE_DEFINITIONS.user;

    row.innerHTML = `
        <div class="flex items-center gap-3">
            <input
                type="checkbox"
                class="w-4 h-4 rounded cursor-pointer"
                style="accent-color: var(--primary);"
                ${isSelected ? 'checked' : ''}
                onchange="toggleUserSelection('${user.id}')"
            >
            <img src="https://picsum.photos/seed/${user.avatarSeed}/48/48.jpg" class="w-10 h-10 rounded-full">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <h3 class="font-semibold text-sm truncate" style="color: var(--foreground);">@${user.username}</h3>
                    <span class="px-2 py-0.5 rounded text-xs" style="background-color: ${roleDef.bgColor}; color: ${roleDef.color};">${roleDef.label}</span>
                </div>
                <p class="text-xs truncate" style="color: var(--muted-foreground);">${user.displayName}</p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="openUserProfileModal('${user.username}', '${user.avatarSeed}', '${user.id}')" class="p-2 rounded transition-colors" style="background-color: var(--card); color: var(--foreground);" title="View Profile">
                    <span class="material-symbols-outlined text-[16px]">person</span>
                </button>
                <div class="relative group">
                    <button class="p-2 rounded transition-colors" style="background-color: var(--card); color: var(--foreground);" title="Assign Role">
                        <span class="material-symbols-outlined text-[16px]">add_moderator</span>
                    </button>
                    <div class="hidden group-hover:flex absolute right-0 top-full mt-1 z-50 flex-col gap-1 p-2 rounded-lg shadow-lg" style="background-color: var(--card); border: 1px solid var(--border);">
                        ${Object.entries(ROLE_DEFINITIONS).map(([key, def]) => `
                            <button onclick="assignRoleToUser('${user.id}', '${key}')" class="px-3 py-1.5 rounded text-xs text-left transition-colors hover:opacity-80" style="background-color: ${def.bgColor}; color: ${def.color};">
                                ${def.label}
                            </button>
                        `).join('')}
                        <button onclick="removeRoleFromUser('${user.id}')" class="px-3 py-1.5 rounded text-xs text-left transition-colors hover:opacity-80" style="background-color: rgba(239, 68, 68, 0.2); color: #ef4444;">
                            Remove All Roles
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    return row;
}

function selectRoleFilter(role) {
    currentRoleFilter = role;

    // Update button styles
    document.querySelectorAll('.role-filter-btn').forEach(btn => {
        const isActive = btn.dataset.role === role;
        btn.style.backgroundColor = isActive ? 'var(--primary)' : 'var(--muted)';
        btn.style.color = isActive ? 'var(--primary-foreground)' : 'var(--foreground)';
    });

    // Filter users
    if (role === 'all') {
        currentRoleUserData = [...ROLE_USER_DATA];
    } else {
        currentRoleUserData = ROLE_USER_DATA.filter(user => user.roles.includes(role));
    }

    // Apply current search
    const searchInput = document.getElementById('role-user-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        currentRoleUserData = currentRoleUserData.filter(user =>
            user.username.toLowerCase().includes(query) ||
            user.displayName.toLowerCase().includes(query)
        );
    }

    // Apply current sort
    const sortSelect = document.getElementById('role-user-sort');
    if (sortSelect) {
        applyRoleSort(sortSelect.value);
    }

    displayedRoleUserCount = 10;
    renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
}

function filterRoleUserList() {
    const searchInput = document.getElementById('role-user-search');
    const query = searchInput.value.toLowerCase();

    // Start from role filter base
    let baseData = currentRoleFilter === 'all'
        ? [...ROLE_USER_DATA]
        : ROLE_USER_DATA.filter(user => user.roles.includes(currentRoleFilter));

    currentRoleUserData = baseData.filter(user =>
        user.username.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query)
    );

    const sortSelect = document.getElementById('role-user-sort');
    if (sortSelect) {
        applyRoleSort(sortSelect.value);
    }

    displayedRoleUserCount = 10;
    renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
}

function sortRoleUserList() {
    const sortSelect = document.getElementById('role-user-sort');
    applyRoleSort(sortSelect.value);
    renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
}

function applyRoleSort(sortType) {
    switch (sortType) {
        case 'newest':
            currentRoleUserData.sort((a, b) => new Date(b.joined) - new Date(a.joined));
            break;
        case 'oldest':
            currentRoleUserData.sort((a, b) => new Date(a.joined) - new Date(b.joined));
            break;
        case 'username':
            currentRoleUserData.sort((a, b) => a.username.localeCompare(b.username));
            break;
    }
}

function toggleUserSelection(userId) {
    if (selectedUsers.has(userId)) {
        selectedUsers.delete(userId);
    } else {
        selectedUsers.add(userId);
    }
    updateBulkToolbar();
}

function selectAllUsers() {
    currentRoleUserData.slice(0, displayedRoleUserCount).forEach(user => {
        selectedUsers.add(user.id);
    });
    renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
    updateBulkToolbar();
}

function clearSelection() {
    selectedUsers.clear();
    renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
    updateBulkToolbar();
}

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulk-actions-toolbar');
    const countEl = document.getElementById('selected-count');

    if (!toolbar || !countEl) return;

    const count = selectedUsers.size;
    countEl.textContent = count;

    if (count > 0) {
        toolbar.classList.remove('hidden');
    } else {
        toolbar.classList.add('hidden');
    }
}

function assignRoleToUser(userId, role) {
    const user = ROLE_USER_DATA.find(u => u.id === userId);
    if (user) {
        if (!user.roles.includes(role)) {
            user.roles.push(role);
        }
        showToast('Role Updated', `Assigned ${ROLE_DEFINITIONS[role].label} to @${user.username}`, 'default');
        renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
    }
}

function removeRoleFromUser(userId) {
    const user = ROLE_USER_DATA.find(u => u.id === userId);
    if (user) {
        user.roles = ['user']; // Reset to default
        showToast('Role Updated', `Removed all roles from @${user.username}`, 'default');
        renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
    }
}

function bulkAssignRole(role) {
    if (selectedUsers.size === 0) return;

    let count = 0;
    selectedUsers.forEach(userId => {
        const user = ROLE_USER_DATA.find(u => u.id === userId);
        if (user && !user.roles.includes(role)) {
            user.roles.push(role);
            count++;
        }
    });

    showToast('Bulk Role Assignment', `Assigned ${ROLE_DEFINITIONS[role].label} to ${count} users`, 'default');
    renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
}

function bulkRemoveRole() {
    if (selectedUsers.size === 0) return;

    let count = 0;
    selectedUsers.forEach(userId => {
        const user = ROLE_USER_DATA.find(u => u.id === userId);
        if (user) {
            user.roles = ['user'];
            count++;
        }
    });

    showToast('Bulk Role Removal', `Removed all roles from ${count} users`, 'default');
    renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
}

function loadMoreRoleUsers() {
    displayedRoleUserCount += 5;
    renderRoleUserList(currentRoleUserData.slice(0, displayedRoleUserCount));
}

// Initialize role management on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    initRoleManagement();
    initReports();
});

// ==================== REPORTS MANAGEMENT ====================

const REPORTS_DATA = [
    { id: 'rep_001', reporter: 'alex_gamer22', reportedUser: 'toxic_player99', type: 'harassment', status: 'pending', created: '2026-04-27T02:30:00', description: 'User was sending abusive messages in voice chat during gameplay.', evidence: ['screenshot_1.jpg', 'recording_1.mp3'] },
    { id: 'rep_002', reporter: 'sarah_jones', reportedUser: 'speed_cheater', type: 'cheating', status: 'reviewing', created: '2026-04-27T01:15:00', description: 'Player using speed hacks in racing events. Impossible lap times.', evidence: ['replay_1.vulu'] },
    { id: 'rep_003', reporter: 'maria_s', reportedUser: 'scam_account_42', type: 'scam', status: 'pending', created: '2026-04-26T23:45:00', description: 'Attempting to trade fake items for real currency. Sent phishing links.', evidence: ['screenshot_2.jpg', 'chat_log.txt'] },
    { id: 'rep_004', reporter: 'whale_user', reportedUser: 'spam_bot_007', type: 'spam', status: 'resolved', created: '2026-04-26T20:00:00', description: 'Bot account spamming chat with external website links.', evidence: ['screenshot_3.jpg'], resolution: 'Account banned' },
    { id: 'rep_005', reporter: 'newbie_2026', reportedUser: 'inappropriate_name', type: 'inappropriate', status: 'dismissed', created: '2026-04-26T18:30:00', description: 'Username contains offensive language.', evidence: [], resolution: 'No violation found' },
    { id: 'rep_006', reporter: 'crypto_king', reportedUser: 'rage_quitter', type: 'other', status: 'pending', created: '2026-04-26T16:20:00', description: 'Consistently leaves competitive matches early, ruining experience for others.', evidence: ['match_history.json'] },
    { id: 'rep_007', reporter: 'casual_player', reportedUser: 'exploit_abuser', type: 'cheating', status: 'reviewing', created: '2026-04-26T14:10:00', description: 'Using map glitch to access restricted areas and gain unfair advantage.', evidence: ['video_evidence.mp4'] },
    { id: 'rep_008', reporter: 'speed_demon', reportedUser: 'harassment_king', type: 'harassment', status: 'resolved', created: '2026-04-26T12:00:00', description: 'Targeted harassment over multiple days. Sent threatening messages.', evidence: ['screenshots_4.jpg', 'screenshots_5.jpg'], resolution: '3-day suspension issued' },
    { id: 'rep_009', reporter: 'esports_champ', reportedUser: 'smurf_account', type: 'other', status: 'pending', created: '2026-04-26T10:30:00', description: 'High-ranked player using alternate account to dominate new player lobbies.', evidence: ['stats_comparison.png'] },
    { id: 'rep_010', reporter: 'privacy_conscious', reportedUser: 'doxxer_alert', type: 'harassment', status: 'reviewing', created: '2026-04-26T08:15:00', description: 'Attempting to share personal information of other users in public chat.', evidence: ['screenshot_6.jpg', 'mod_report.pdf'] }
];

const REPORT_TYPE_STYLES = {
    harassment: { label: 'Harassment', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
    cheating: { label: 'Cheating', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)' },
    scam: { label: 'Scam/Fraud', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.15)' },
    inappropriate: { label: 'Inappropriate', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.15)' },
    spam: { label: 'Spam', color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.15)' },
    other: { label: 'Other', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.15)' }
};

const REPORT_STATUS_STYLES = {
    pending: { label: 'Pending', color: '#ef4444', icon: 'pending' },
    reviewing: { label: 'Under Review', color: '#f59e0b', icon: 'visibility' },
    resolved: { label: 'Resolved', color: '#10b981', icon: 'check_circle' },
    dismissed: { label: 'Dismissed', color: '#6b7280', icon: 'block' }
};

const REPORT_RECENCY_FILTERS = {
    all: { label: 'All time' },
    '6h': { label: 'Last 6 hours', maxAgeMs: 6 * 60 * 60 * 1000 },
    '24h': { label: 'Last 24 hours', maxAgeMs: 24 * 60 * 60 * 1000 },
    '3d': { label: 'Last 3 days', maxAgeMs: 3 * 24 * 60 * 60 * 1000 }
};

let currentReports = [...REPORTS_DATA];
let displayedReportCount = 10;
let activeStatusFilter = 'all';
let activeTypeFilter = 'all';
let activeRecencyFilter = 'all';
let currentReportId = null;

function initReports() {
    if (document.getElementById('reports-list')) {
        syncReportFilterControls();
        updateReportDashboard();
        filterReports();
    }
}

function renderReportsList(reports = currentReports.slice(0, displayedReportCount)) {
    const container = document.getElementById('reports-list');
    const countEl = document.getElementById('report-count');

    if (!container) return;

    if (countEl) {
        countEl.textContent = reports.length;
    }

    container.innerHTML = '';

    if (reports.length === 0) {
        container.innerHTML = `
            <div class="reports-empty-state">
                <span class="material-symbols-outlined">search_off</span>
                <p>No reports found matching your criteria.</p>
            </div>
        `;
        updateLoadMoreButton();
        return;
    }

    reports.forEach(report => {
        const reportCard = createReportCard(report);
        container.appendChild(reportCard);
    });

    updateLoadMoreButton();
}

function createReportCard(report) {
    const card = document.createElement('div');
    card.className = `reports-row ${report.status}`;
    card.onclick = () => openReportDetailModal(report.id);

    const typeStyle = REPORT_TYPE_STYLES[report.type] || REPORT_TYPE_STYLES.other;
    const statusStyle = REPORT_STATUS_STYLES[report.status] || REPORT_STATUS_STYLES.pending;

    const timeAgo = getTimeAgo(new Date(report.created));

    card.innerHTML = `
        <div class="reports-row-icon" style="--report-color: ${statusStyle.color};">
            <span class="material-symbols-outlined">${statusStyle.icon}</span>
        </div>
        <div class="reports-row-main">
            <div class="reports-row-meta">
                <span class="reports-chip" style="--chip-color: ${typeStyle.color}; --chip-bg: ${typeStyle.bgColor};">${typeStyle.label}</span>
                <span class="reports-chip" style="--chip-color: ${statusStyle.color}; --chip-bg: rgba(0, 245, 212, 0.09);">${statusStyle.label}</span>
                <small>${timeAgo}</small>
            </div>
            <div class="reports-row-parties">
                <span>@${report.reporter}</span>
                <span class="material-symbols-outlined">arrow_forward</span>
                <strong>@${report.reportedUser}</strong>
            </div>
            <p>${report.description}</p>
            <div class="reports-row-foot">
                <span><span class="material-symbols-outlined">attachment</span>${report.evidence.length} evidence item${report.evidence.length === 1 ? '' : 's'}</span>
                ${report.resolution ? `<span><span class="material-symbols-outlined">verified</span>${report.resolution}</span>` : ''}
            </div>
        </div>
        <div class="reports-row-actions">
            ${report.status === 'pending' ? `
                <button onclick="event.stopPropagation(); updateReportStatus('${report.id}', 'reviewing')" class="review" title="Mark as Reviewing">
                    <span class="material-symbols-outlined">visibility</span>
                    Review
                </button>
            ` : ''}
            ${report.status === 'pending' || report.status === 'reviewing' ? `
                <button onclick="event.stopPropagation(); updateReportStatus('${report.id}', 'resolved')" class="resolve" title="Resolve">
                    <span class="material-symbols-outlined">check</span>
                    Resolve
                </button>
                <button onclick="event.stopPropagation(); updateReportStatus('${report.id}', 'dismissed')" class="dismiss" title="Dismiss">
                    <span class="material-symbols-outlined">close</span>
                    Dismiss
                </button>
            ` : `
                <span class="reports-row-closed">Closed</span>
            `}
        </div>
    `;

    return card;
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function filterReports() {
    const searchInput = document.getElementById('report-search');
    const query = searchInput ? searchInput.value.toLowerCase() : '';

    currentReports = REPORTS_DATA.filter(report => {
        const matchesSearch = !query ||
            report.reporter.toLowerCase().includes(query) ||
            report.reportedUser.toLowerCase().includes(query) ||
            report.description.toLowerCase().includes(query) ||
            report.id.toLowerCase().includes(query);

        const matchesStatus = activeStatusFilter === 'all' || report.status === activeStatusFilter;
        const matchesType = activeTypeFilter === 'all' || report.type === activeTypeFilter;
        const matchesRecency = activeRecencyFilter === 'all' || isReportWithinRecency(report.created, activeRecencyFilter);

        return matchesSearch && matchesStatus && matchesType && matchesRecency;
    });

    displayedReportCount = 10;
    renderReportsList(currentReports.slice(0, displayedReportCount));
    updateReportDashboard();
    updateActiveFilterDisplay();
    updateReportResultsSummary();
    updateLoadMoreButton();
}

function setReportFilter(filterType, value) {
    if (filterType === 'status') {
        activeStatusFilter = value;
    } else if (filterType === 'type') {
        activeTypeFilter = value;
    } else if (filterType === 'recency') {
        activeRecencyFilter = value;
    }

    filterReports();
}

function toggleReportFilter(filterType) {
    if (filterType === 'status') {
        const statuses = ['all', 'pending', 'reviewing', 'resolved', 'dismissed'];
        const currentIndex = statuses.indexOf(activeStatusFilter);
        activeStatusFilter = statuses[(currentIndex + 1) % statuses.length];
    } else if (filterType === 'type') {
        const types = ['all', 'harassment', 'cheating', 'scam', 'inappropriate', 'spam', 'other'];
        const currentIndex = types.indexOf(activeTypeFilter);
        activeTypeFilter = types[(currentIndex + 1) % types.length];
    }
    syncReportFilterControls();
    filterReports();
}

function updateActiveFilterDisplay() {
    const activeFiltersDiv = document.getElementById('active-filters');
    const filterBadges = document.getElementById('filter-badges');

    if (!activeFiltersDiv || !filterBadges) return;

    const badges = [];

    if (activeStatusFilter !== 'all') {
        const statusStyle = REPORT_STATUS_STYLES[activeStatusFilter];
        badges.push(`
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium" style="background-color: rgba(0, 245, 212, 0.15); color: var(--primary);">
                Status: ${statusStyle.label}
                <button onclick="removeReportFilter('status')" class="hover:opacity-70">
                    <span class="material-symbols-outlined text-[14px]">close</span>
                </button>
            </span>
        `);
    }

    if (activeTypeFilter !== 'all') {
        const typeStyle = REPORT_TYPE_STYLES[activeTypeFilter];
        badges.push(`
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium" style="background-color: ${typeStyle.bgColor}; color: ${typeStyle.color};">
                Tag: ${typeStyle.label}
                <button onclick="removeReportFilter('type')" class="hover:opacity-70">
                    <span class="material-symbols-outlined text-[14px]">close</span>
                </button>
            </span>
        `);
    }

    if (activeRecencyFilter !== 'all') {
        const recencyStyle = REPORT_RECENCY_FILTERS[activeRecencyFilter];
        badges.push(`
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium" style="background-color: rgba(59, 130, 246, 0.15); color: #60a5fa;">
                Recent: ${recencyStyle.label}
                <button onclick="removeReportFilter('recency')" class="hover:opacity-70">
                    <span class="material-symbols-outlined text-[14px]">close</span>
                </button>
            </span>
        `);
    }

    if (badges.length > 0) {
        filterBadges.innerHTML = badges.join('');
        activeFiltersDiv.classList.remove('hidden');
    } else {
        activeFiltersDiv.classList.add('hidden');
        filterBadges.innerHTML = '';
    }
}

function clearFilters() {
    activeStatusFilter = 'all';
    activeTypeFilter = 'all';
    activeRecencyFilter = 'all';
    const searchInput = document.getElementById('report-search');
    if (searchInput) {
        searchInput.value = '';
    }
    syncReportFilterControls();
    filterReports();
}

function removeReportFilter(filterType) {
    if (filterType === 'status') {
        activeStatusFilter = 'all';
    } else if (filterType === 'type') {
        activeTypeFilter = 'all';
    } else if (filterType === 'recency') {
        activeRecencyFilter = 'all';
    }

    syncReportFilterControls();
    filterReports();
}

function syncReportFilterControls() {
    const statusSelect = document.getElementById('report-status-filter');
    const typeSelect = document.getElementById('report-type-filter');
    const recencySelect = document.getElementById('report-recency-filter');

    if (statusSelect) statusSelect.value = activeStatusFilter;
    if (typeSelect) typeSelect.value = activeTypeFilter;
    if (recencySelect) recencySelect.value = activeRecencyFilter;
}

function isReportWithinRecency(createdAt, recencyKey) {
    const recencyFilter = REPORT_RECENCY_FILTERS[recencyKey];
    if (!recencyFilter || !recencyFilter.maxAgeMs) return true;

    const reportAgeMs = Date.now() - new Date(createdAt).getTime();
    return reportAgeMs <= recencyFilter.maxAgeMs;
}

function updateReportResultsSummary() {
    const matchCountEl = document.getElementById('report-match-count');
    const totalCountEl = document.getElementById('report-total-count');

    if (matchCountEl) {
        matchCountEl.textContent = currentReports.length;
    }

    if (totalCountEl) {
        totalCountEl.textContent = REPORTS_DATA.length;
    }
}

function updateLoadMoreButton() {
    const loadMoreButton = document.getElementById('report-load-more');
    if (!loadMoreButton) return;

    loadMoreButton.style.display = currentReports.length > displayedReportCount ? 'inline-flex' : 'none';
}

function updateReportDashboard() {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const pending = REPORTS_DATA.filter(report => report.status === 'pending').length;
    const reviewing = REPORTS_DATA.filter(report => report.status === 'reviewing').length;
    const resolved = REPORTS_DATA.filter(report => report.status === 'resolved').length;
    const evidence = REPORTS_DATA.reduce((sum, report) => sum + report.evidence.length, 0);

    set('report-pending-metric', pending);
    set('report-reviewing-metric', reviewing);
    set('report-resolved-metric', resolved);
    set('report-evidence-metric', evidence);
}

function updateReportStatus(reportId, newStatus) {
    const report = REPORTS_DATA.find(r => r.id === reportId);
    if (report) {
        report.status = newStatus;
        if (newStatus === 'resolved' && !report.resolution) {
            report.resolution = 'Action taken by moderator';
        }
        showToast('Report Updated', `Report ${reportId} marked as ${REPORT_STATUS_STYLES[newStatus].label}`, 'default');
        updateReportDashboard();
        filterReports();
    }
}

const REPORT_STATUS_BANNER_THEME = {
    pending: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)' },
    reviewing: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)' },
    resolved: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)' },
    dismissed: { bg: 'rgba(107, 114, 128, 0.12)', border: 'rgba(107, 114, 128, 0.35)' }
};

function modalStatusHeadline(status) {
    const map = {
        pending: 'Pending review',
        reviewing: 'Under review',
        resolved: 'Resolved',
        dismissed: 'Dismissed'
    };
    return map[status] || map.pending;
}

function mockReportUserId(username) {
    const slug = String(username).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16);
    return slug ? `usr_${slug}` : 'usr_unknown';
}

function formatReportModalDateTime(iso) {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return '';
    }
}

function populateReportDetailModal(report) {
    currentReportId = report.id;

    const statusStyle = REPORT_STATUS_STYLES[report.status] || REPORT_STATUS_STYLES.pending;
    const typeStyle = REPORT_TYPE_STYLES[report.type] || REPORT_TYPE_STYLES.other;
    const bannerTheme = REPORT_STATUS_BANNER_THEME[report.status] || REPORT_STATUS_BANNER_THEME.pending;

    const idEl = document.getElementById('reportId');
    if (idEl) idEl.textContent = report.id;

    const banner = document.getElementById('reportStatusBanner');
    if (banner) {
        banner.style.backgroundColor = bannerTheme.bg;
        banner.style.border = `1px solid ${bannerTheme.border}`;
    }

    const statusIcon = document.getElementById('reportModalStatusIcon');
    if (statusIcon) {
        statusIcon.textContent = statusStyle.icon;
        statusIcon.style.color = statusStyle.color;
    }

    const statusTitle = document.getElementById('reportModalStatusTitle');
    if (statusTitle) {
        statusTitle.textContent = modalStatusHeadline(report.status);
        statusTitle.style.color = statusStyle.color;
    }

    const statusSubtitle = document.getElementById('reportModalStatusSubtitle');
    if (statusSubtitle) {
        const filed = getTimeAgo(new Date(report.created));
        statusSubtitle.textContent = `Report filed ${filed}`;
    }

    const avatar = document.getElementById('reportedAvatar');
    if (avatar) {
        avatar.src = `https://picsum.photos/seed/${encodeURIComponent(report.reportedUser)}/48/48.jpg`;
        avatar.alt = report.reportedUser;
    }

    const reportedUsername = document.getElementById('reportedUsername');
    if (reportedUsername) reportedUsername.textContent = `@${report.reportedUser}`;

    const reportedUserId = document.getElementById('reportedUserId');
    if (reportedUserId) reportedUserId.textContent = mockReportUserId(report.reportedUser);

    const viewBtn = document.getElementById('reportModalViewProfileBtn');
    if (viewBtn) {
        viewBtn.onclick = () => {
            openUserProfileModal(report.reportedUser, report.reportedUser, mockReportUserId(report.reportedUser));
            closeReportModal();
        };
    }

    const reporterName = document.getElementById('reportModalReporterName');
    if (reporterName) reporterName.textContent = `@${report.reporter}`;

    const reporterSubtitle = document.getElementById('reportModalReporterSubtitle');
    if (reporterSubtitle) reporterSubtitle.textContent = 'Reporter';

    const reasonLabel = document.getElementById('reportReason');
    if (reasonLabel) {
        reasonLabel.textContent = typeStyle.label;
        reasonLabel.style.color = typeStyle.color;
    }

    const desc = document.getElementById('reportModalDescription');
    if (desc) desc.textContent = report.description;

    const reportedAt = document.getElementById('reportModalReportedAt');
    if (reportedAt) reportedAt.textContent = formatReportModalDateTime(report.created);

    const lastUpdated = document.getElementById('reportModalLastUpdated');
    if (lastUpdated) lastUpdated.textContent = formatReportModalDateTime(report.created);

    const resWrap = document.getElementById('reportModalResolutionWrap');
    const resText = document.getElementById('reportModalResolutionText');
    if (report.resolution && resWrap && resText) {
        resText.textContent = report.resolution;
        resWrap.classList.remove('hidden');
    } else if (resWrap) {
        resWrap.classList.add('hidden');
    }
}

function openReportDetailModal(reportId) {
    const report = REPORTS_DATA.find(r => r.id === reportId);
    if (!report) return;

    currentReportId = report.id;
    populateReportDetailModal(report);

    const modal = document.getElementById('reportDetailModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        showToast('Report Detail', `Opening report ${reportId}: ${report.description.substring(0, 50)}...`, 'default');
    }
}

function loadMoreReports() {
    displayedReportCount += 5;
    renderReportsList(currentReports.slice(0, displayedReportCount));
    updateLoadMoreButton();
}

// ==================== MUSIC ADMIN (Spotify suggestions + auto YouTube lookup → R2) ====================

function getMusicApiBase() {
    if (typeof window !== 'undefined' && window.VULU_MUSIC_API_BASE) {
        return String(window.VULU_MUSIC_API_BASE).replace(/\/+$/, '');
    }
    if (
        typeof window !== 'undefined' &&
        ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    ) {
        return getLocalMusicApiBase();
    }
    const meta = document.querySelector('meta[name="vulu-music-api-base"]');
    if (meta && meta.content) return meta.content.replace(/\/+$/, '');
    return 'http://127.0.0.1:3001';
}

function getLocalMusicApiBase() {
    return 'http://127.0.0.1:3001';
}

let musicSpotifyDebounceTimer = null;
let musicArtistSyncDebounceTimer = null;
let musicArtistSyncSelectedId = '';
/** @type {null | Record<string, unknown>} */
let musicArtistSyncPlan = null;
let musicArtistSyncRunning = false;
let musicArtistTrackView = 'missing';
let musicArtistTrackFilter = '';
let musicArtistTrackSort = { key: '', direction: 'desc' };
let musicArtistSelectedTrackIds = new Set();
let musicArtistFilters = {
    album: '',
    excludeLive: false,
    excludeRemix: false,
    excludeInstrumental: false,
    excludeClean: false,
    excludeExplicit: false,
};
let musicArtistQueue = {
    running: false,
    paused: false,
    cancelRequested: false,
    items: [],
    current: 0,
    saved: 0,
    failed: 0,
    cancelled: 0,
};
let musicArtistTrackStatus = new Map();
let musicR2EditingKey = null;
let musicLastSelectedTrack = null;
let musicR2Objects = [];
let musicR2Sort = { key: 'newest', direction: 'desc' };
let musicR2Filter = '';
/** @type {Set<string>} */
let musicR2SelectedKeys = new Set();
let musicStatsCharts = {};
let musicStatsLoaded = false;
let musicStatsRange = 'week';
let musicStatsData = null;
const musicSearchPopularityByTrackId = new Map();
const musicSearchArtistIdByName = new Map();
const musicSearchArtistPopularityById = new Map();

function formatMusicApiEndpointLabel(base) {
    try {
        const u = new URL(base);
        const host = u.hostname;
        return host.length > 36 ? `${host.slice(0, 34)}…` : host;
    } catch {
        const s = String(base || '');
        return s.length > 40 ? `${s.slice(0, 38)}…` : s;
    }
}

function initMusicTabs() {
    const buttons = document.querySelectorAll('[data-music-tab]');
    if (!buttons.length) return;
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => switchMusicTab(btn.getAttribute('data-music-tab') || 'search'));
    });
    switchMusicTab('search');
}

function switchMusicTab(tab) {
    document.querySelectorAll('[data-music-tab]').forEach((btn) => {
        const active = btn.getAttribute('data-music-tab') === tab;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.style.backgroundColor = '';
        btn.style.color = '';
    });
    document.querySelectorAll('[data-music-tab-panel]').forEach((panel) => {
        panel.classList.toggle('hidden', panel.getAttribute('data-music-tab-panel') !== tab);
    });
    if (tab === 'analytics' && !musicStatsLoaded) {
        refreshMusicStats();
    }
}

function updateMusicStatsRangeButtons() {
    document.querySelectorAll('[data-music-stats-range]').forEach((btn) => {
        const active = btn.getAttribute('data-music-stats-range') === musicStatsRange;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.style.backgroundColor = active ? 'var(--primary)' : 'transparent';
        btn.style.color = active ? 'var(--primary-foreground)' : 'var(--muted-foreground)';
    });
}

function initMusicStatsUi() {
    const buttons = document.querySelectorAll('[data-music-stats-range]');
    if (buttons.length) {
        buttons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const nextRange = btn.getAttribute('data-music-stats-range') || 'week';
                if (nextRange === musicStatsRange) return;
                musicStatsRange = nextRange;
                updateMusicStatsRangeButtons();
                if (musicStatsData) renderMusicStats(musicStatsData);
            });
        });
        updateMusicStatsRangeButtons();
    }

    const searchesCard = document.getElementById('music-searches-card');
    if (searchesCard) searchesCard.addEventListener('click', () => openMusicSearchesModal());

    const closeBtn = document.getElementById('music-searches-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeMusicSearchesModal);

    const modal = document.getElementById('music-searches-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeMusicSearchesModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMusicSearchesModal();
    });
}

function initMusicAdminPage() {
    const base = getMusicApiBase();
    const endpointLabel = document.getElementById('music-api-endpoint-label');
    if (endpointLabel) endpointLabel.textContent = formatMusicApiEndpointLabel(base);

    initMusicTabs();
    initMusicCustomPlayer();
    initMusicStatsUi();

    const qInput = document.getElementById('music-spotify-query');
    const resultsEl = document.getElementById('music-spotify-results');

    if (qInput && resultsEl) {
        const idleHint = `
            <div class="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center" style="border-color: var(--border); color: var(--muted-foreground);">
                <span class="material-symbols-outlined mb-3 text-[40px]" style="opacity: 0.35;">queue_music</span>
                <p class="text-sm font-medium" style="color: var(--foreground);">Search Spotify</p>
                <p class="mt-1 max-w-[15rem] text-xs leading-relaxed opacity-90">Enter at least two letters. Results refresh as you type.</p>
            </div>`;

        const runSearch = () => {
            const q = qInput.value.trim();
            if (q.length < 2) {
                resultsEl.innerHTML = idleHint;
                return;
            }

            resultsEl.innerHTML = `<div class="flex items-center gap-3 rounded-xl border px-4 py-8 text-sm" style="border-color: var(--border); color: var(--muted-foreground);"><span class="material-symbols-outlined animate-pulse text-[22px]" style="opacity: 0.55;">progress_activity</span><span>Searching…</span></div>`;
            fetchSpotifyTracks(q)
                .then(tracks => renderMusicSpotifyResults(tracks, resultsEl))
                .catch(err => {
                    resultsEl.innerHTML = `<p style="color: var(--destructive);">${escapeHtml(normalizeMusicFetchError(err, base))}</p>`;
                });
        };

        qInput.addEventListener('input', () => {
            clearTimeout(musicSpotifyDebounceTimer);
            musicSpotifyDebounceTimer = setTimeout(runSearch, 300);
        });

        qInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(musicSpotifyDebounceTimer);
                runSearch();
            }
        });

        resultsEl.innerHTML = idleHint;
    }

    initMusicR2LibraryUi(base);
    initMusicArtistSyncUi(base);
    const statsRefresh = document.getElementById('music-stats-refresh');
    if (statsRefresh) statsRefresh.addEventListener('click', () => refreshMusicStats());
    pingMusicApi(base);
}

async function pingMusicApi(base) {
    const endpointLabel = document.getElementById('music-api-endpoint-label');
    const chipSpotify = document.getElementById('music-chip-spotify');
    const chipR2 = document.getElementById('music-chip-r2');
    const chipPrefix = document.getElementById('music-chip-prefix');
    if (endpointLabel) {
        endpointLabel.textContent = formatMusicApiEndpointLabel(base);
        endpointLabel.title = base;
    }

    const setChip = (el, ok, okText, badText) => {
        if (!el) return;
        el.textContent = ok ? okText : badText;
        el.style.backgroundColor = ok ? 'rgba(255,255,255,0.04)' : 'rgba(239,68,68,0.08)';
        el.style.color = ok ? 'var(--muted-foreground)' : 'var(--destructive)';
        el.style.borderColor = ok ? 'var(--border)' : 'rgba(239,68,68,0.35)';
    };

    try {
        const res = await fetch(`${base}/health`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Health check failed (${res.status})`);

        setChip(chipSpotify, !!data.spotify, 'Spotify connected', 'Spotify env missing');
        setChip(chipR2, !!data.r2, 'R2 configured', 'R2 env missing');
        if (chipPrefix) {
            const p = data.prefix || '(entire bucket)';
            chipPrefix.textContent = p.length > 24 ? `Bucket · ${p.slice(0, 22)}…` : `Bucket · ${p}`;
            chipPrefix.title = `Prefix: ${p}`;
            chipPrefix.style.backgroundColor = 'rgba(255,255,255,0.04)';
            chipPrefix.style.color = 'var(--muted-foreground)';
            chipPrefix.style.borderColor = 'var(--border)';
        }
    } catch {
        setChip(chipSpotify, false, 'Spotify connected', 'Unreachable');
        setChip(chipR2, false, 'R2 configured', 'Unreachable');
        if (chipPrefix) {
            chipPrefix.textContent = 'Bucket · —';
            chipPrefix.title = '';
            chipPrefix.style.backgroundColor = 'rgba(239,68,68,0.08)';
            chipPrefix.style.color = 'var(--destructive)';
            chipPrefix.style.borderColor = 'rgba(239,68,68,0.35)';
        }
    }
}

function updateMusicIngestPanel(opts) {
    const {
        summary,
        subline = '',
        variant = 'default',
        kvRows = null,
        rawText = null,
        openTech = false,
    } = opts;
    const summaryEl = document.getElementById('music-ingest-summary');
    const sublineEl = document.getElementById('music-ingest-subline');
    const kvEl = document.getElementById('music-ingest-kv');
    const techEl = document.getElementById('music-ingest-tech');
    const rawEl = document.getElementById('music-ingest-raw');
    const wrapEl = document.getElementById('music-ingest-status');

    if (summaryEl) {
        summaryEl.textContent = summary;
        summaryEl.style.color = variant === 'destructive' ? 'var(--destructive)' : 'var(--foreground)';
    }
    if (sublineEl) {
        sublineEl.textContent = subline;
        sublineEl.style.color = variant === 'destructive' ? 'rgba(239,68,68,0.85)' : 'var(--muted-foreground)';
    }
    if (kvEl) {
        if (kvRows && kvRows.length) {
            kvEl.classList.remove('hidden');
            kvEl.innerHTML = kvRows
                .map(
                    ([k, v]) =>
                        `<div class="flex gap-2 justify-between gap-4"><span class="shrink-0 font-medium" style="color: var(--muted-foreground);">${escapeHtml(k)}</span><span class="text-right min-w-0 break-all" style="color: var(--foreground);">${escapeHtml(v)}</span></div>`
                )
                .join('');
        } else {
            kvEl.classList.add('hidden');
            kvEl.innerHTML = '';
        }
    }
    if (techEl && rawEl) {
        if (rawText != null && String(rawText).trim() !== '') {
            techEl.classList.remove('hidden');
            rawEl.textContent = rawText;
            techEl.open = !!openTech;
        } else {
            techEl.classList.add('hidden');
            rawEl.textContent = '';
            techEl.open = false;
        }
    }
    if (wrapEl) {
        wrapEl.style.borderColor =
            variant === 'destructive' ? 'rgba(239,68,68,0.35)' : 'var(--border)';
    }
}

function parseMusicIngestOkLines(raw) {
    const lines = String(raw || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    if (!lines.length || !/^OK$/i.test(lines[0])) return null;
    const kv = {};
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        kv[key] = line.slice(idx + 1).trim();
    }
    return kv;
}

function setMusicStatus(message, variant = 'default') {
    const raw = String(message || '');
    const okKv = parseMusicIngestOkLines(raw);
    if (okKv) {
        const title = okKv.title || '';
        const artist = okKv.artist || '';
        const objectKey = okKv.objectkey || '';
        const bytesRaw = okKv.bytes;
        const api = okKv.api || '';
        const kvRows = [
            ['Title', title || '—'],
            ['Artist', artist || '—'],
            ['Object key', objectKey || '—'],
            ['Size', bytesRaw !== undefined && bytesRaw !== '' ? formatBytes(Number(bytesRaw)) : '—'],
            ['API', api || '—'],
        ];
        updateMusicIngestPanel({
            summary: okKv.reused === 'true' ? 'Playing from library' : 'Uploaded',
            subline: okKv.reused === 'true'
                ? 'Found an existing R2 copy, no YouTube download needed.'
                : 'Track is in R2 and listed below.',
            variant: 'default',
            kvRows,
            rawText: raw,
            openTech: false,
        });
        return;
    }
    const errLine =
        variant === 'destructive' ? raw.replace(/^\s*Error:\s*/i, '').trim() || raw : raw;
    updateMusicIngestPanel({
        summary: variant === 'destructive' ? 'Could not complete ingest' : 'Working…',
        subline: errLine,
        variant,
        kvRows: null,
        rawText: variant === 'destructive' ? raw : null,
        openTech: variant === 'destructive',
    });
}

function setMusicSelectedTrack(track) {
    musicLastSelectedTrack = track;
    const el = document.getElementById('music-selected-track');
    if (!el) return;
    if (!track) {
        el.innerHTML = `<p class="text-sm leading-relaxed" style="color: var(--muted-foreground);">Choose a track from the search list, then <span class="font-medium" style="color: var(--foreground);">Save</span> or <span class="font-medium" style="color: var(--foreground);">Play</span>.</p>`;
        return;
    }
    const art = track.albumArt
        ? `<img src="${escapeHtml(track.albumArt)}" alt="" class="w-14 h-14 rounded-lg object-cover flex-shrink-0 shadow-md">`
        : `<div class="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center shadow-inner" style="background-color: rgba(0,0,0,0.25); border: 1px solid var(--border);"><span class="material-symbols-outlined text-[26px]" style="color: var(--muted-foreground);">album</span></div>`;
    el.innerHTML = `
        <div class="flex gap-3 items-start">
            ${art}
            <div class="min-w-0 flex-1">
                <div class="font-semibold leading-snug line-clamp-2" style="color: var(--foreground);">${escapeHtml(track.name || 'Unknown track')}</div>
                <div class="text-xs mt-1 leading-snug line-clamp-2" style="color: var(--muted-foreground);">${escapeHtml(track.artists || 'Unknown artist')}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</div>
            </div>
        </div>`;
}

function getMusicPlayer() {
    return document.getElementById('music-audio-player');
}

function formatMusicPlayerTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function initMusicCustomPlayer() {
    const audio = getMusicPlayer();
    const playBtn = document.getElementById('music-player-play');
    const seekEl = document.getElementById('music-player-seek');
    const volEl = document.getElementById('music-player-volume');
    const muteBtn = document.getElementById('music-player-mute');
    const currentEl = document.getElementById('music-player-current');
    const durEl = document.getElementById('music-player-duration');
    const volIcon = document.getElementById('music-player-volume-icon');
    const playIcon = playBtn?.querySelector('.music-player-play-icon');
    const pauseIcon = playBtn?.querySelector('.music-player-pause-icon');
    if (!audio || !playBtn || !seekEl || !volEl || !muteBtn || !currentEl || !durEl || !volIcon || !playIcon || !pauseIcon) return;

    let seeking = false;

    const syncPlayIcons = () => {
        const playing = !audio.paused;
        playIcon.classList.toggle('hidden', playing);
        pauseIcon.classList.toggle('hidden', !playing);
        playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    };

    const syncVolIcon = () => {
        const muted = audio.muted || audio.volume === 0;
        volIcon.textContent = muted ? 'volume_off' : audio.volume < 0.45 ? 'volume_down' : 'volume_up';
    };

    const enableChrome = () => {
        playBtn.disabled = false;
        seekEl.disabled = false;
        muteBtn.disabled = false;
        volEl.disabled = false;
    };

    const updateSeekFromAudio = () => {
        if (seeking) return;
        const d = audio.duration;
        if (Number.isFinite(d) && d > 0) {
            seekEl.value = String(Math.round((audio.currentTime / d) * 1000));
        }
    };

    const updateTimes = () => {
        currentEl.textContent = formatMusicPlayerTime(audio.currentTime);
        updateSeekFromAudio();
    };

    audio.volume = Number(volEl.value) || 1;

    audio.addEventListener('loadstart', enableChrome);

    audio.addEventListener('loadedmetadata', () => {
        const d = audio.duration;
        durEl.textContent = Number.isFinite(d) && d > 0 ? formatMusicPlayerTime(d) : '--:--';
        updateSeekFromAudio();
    });

    audio.addEventListener('durationchange', () => {
        const d = audio.duration;
        if (Number.isFinite(d) && d > 0) durEl.textContent = formatMusicPlayerTime(d);
    });

    audio.addEventListener('timeupdate', updateTimes);
    audio.addEventListener('play', syncPlayIcons);
    audio.addEventListener('pause', syncPlayIcons);
    audio.addEventListener('ended', () => {
        syncPlayIcons();
        seekEl.value = '0';
        currentEl.textContent = '0:00';
        const d = audio.duration;
        if (Number.isFinite(d) && d > 0) durEl.textContent = formatMusicPlayerTime(d);
    });

    audio.addEventListener('error', () => {
        syncPlayIcons();
    });

    seekEl.addEventListener('pointerdown', () => {
        seeking = true;
    });
    seekEl.addEventListener('pointerup', () => {
        seeking = false;
        updateSeekFromAudio();
    });
    seekEl.addEventListener('pointercancel', () => {
        seeking = false;
    });

    seekEl.addEventListener('input', () => {
        const d = audio.duration;
        if (!Number.isFinite(d) || d <= 0) return;
        const t = (Number(seekEl.value) / 1000) * d;
        audio.currentTime = t;
        currentEl.textContent = formatMusicPlayerTime(t);
    });

    seekEl.addEventListener('change', () => {
        seeking = false;
    });

    playBtn.addEventListener('click', () => {
        if (!audio.src) return;
        if (audio.paused) {
            audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    });

    volEl.addEventListener('input', () => {
        const v = Number(volEl.value);
        audio.volume = v;
        audio.muted = v === 0;
        syncVolIcon();
    });

    muteBtn.addEventListener('click', () => {
        audio.muted = !audio.muted;
        if (!audio.muted && audio.volume === 0) {
            audio.volume = 0.65;
            volEl.value = String(audio.volume);
        }
        syncVolIcon();
    });

    syncVolIcon();
    syncPlayIcons();
}

async function playMusicUrl(url, title) {
    const player = getMusicPlayer();
    if (!player || !url) return;
    player.src = url;
    player.dataset.trackTitle = title || '';
    try {
        await player.play();
    } catch (err) {
        showToast('Playback blocked', 'Press play in the audio controls to start playback.', 'default');
    }
}

async function pruneMusicSpotifyDuplicates(base) {
    const confirmed = confirm(
        'Remove duplicate copies of the same Spotify track?\n\n' +
            'Keeps one file per Spotify ID (prefers spotify/{id}.mp3 when present, otherwise the newest upload). Extra R2 objects are permanently deleted.'
    );
    if (!confirmed) return;

    const localBase = getLocalMusicApiBase();

    const tryPrune = async (apiBase) => {
        const res = await fetch(`${apiBase}/api/storage/music/prune-spotify-duplicates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dryRun: false }),
        });
        const text = await res.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = {};
        }
        return { res, data };
    };

    try {
        let { res, data } = await tryPrune(base);
        let usedLocalFallback = false;

        if (!res.ok && res.status === 404 && localBase !== base) {
            const second = await tryPrune(localBase);
            res = second.res;
            data = second.data;
            if (res.ok) usedLocalFallback = true;
        }

        if (!res.ok) {
            if (res.status === 404) {
                throw new Error(
                    'The music API at your configured URL does not expose Deduplicate yet (404). Redeploy the latest code from vulu-admin-webapp/music-ingest-server to Railway, or run npm start in that folder locally on port 3001 and try again.'
                );
            }
            throw new Error(data.error || data.message || `Prune failed (${res.status})`);
        }

        const removed = Number(data.removed) || 0;
        const extra =
            usedLocalFallback && removed
                ? ' Ran via your local ingest server (127.0.0.1:3001); redeploy Railway so dedupe works without localhost.'
                : usedLocalFallback && !removed
                  ? ' Local ingest API responded (no duplicates found). Redeploy Railway for remote dedupe.'
                  : '';

        showToast(
            removed ? 'Duplicates removed' : 'Nothing to remove',
            removed
                ? `Deleted ${removed} duplicate object(s).${extra ? ` ${extra}` : ''}`
                : `No overlapping Spotify tracks found (same Spotify ID).${extra ? ` ${extra}` : ''}`,
            removed ? 'success' : 'default'
        );
        refreshMusicR2Library();
    } catch (err) {
        showToast('Deduplicate failed', normalizeMusicFetchError(err, base), 'destructive');
    }
}

async function ingestSpotifyTrack(track, mode) {
    const base = getMusicApiBase();
    const actionLabel = mode === 'play' ? 'Play' : 'Save';
    setMusicSelectedTrack(track);
    setMusicStatus(`${actionLabel}: looking up YouTube audio, downloading with yt-dlp, and uploading to R2…`);

    try {
        let payload;
        let usedBase = base;

        try {
            payload = await requestMusicIngest(base, track, mode === 'play');
        } catch (err) {
            const message = normalizeMusicFetchError(err, base);
            const localBase = getLocalMusicApiBase();
            const shouldRetryLocally =
                localBase !== base &&
                isMusicIngestLocalFallbackCandidate(message);

            if (!shouldRetryLocally) throw err;

            setMusicStatus('Railway ingest hit a YouTube restriction. Retrying with the local helper on this machine…');
            payload = await requestMusicIngest(localBase, track, mode === 'play');
            usedBase = localBase;
            showToast('Retried locally', 'Railway was reachable, but the local yt-dlp helper handled the ingest.', 'default');
        }

        setMusicStatus(
            `OK
title: ${payload.track?.title || track.name || ''}
artist: ${payload.track?.artist || track.artists || ''}
objectKey: ${payload.objectKey || ''}
query: ${payload.youtubeQuery || track.youtubeSearchHint || ''}
bytes: ${payload.bytes ?? ''}
reused: ${payload.reused ? 'true' : 'false'}
api: ${usedBase}`
        );

        refreshMusicR2Library();

        if (mode === 'play' && payload.playbackUrl) {
            await playMusicUrl(payload.playbackUrl, track.name || '');
            showToast(
                payload.reused ? 'Playing from library' : 'Playing from R2',
                payload.reused ? 'Existing R2 copy found, no download needed.' : (payload.track?.title || track.name || 'Track ready'),
                'success'
            );
        } else {
            showToast('Uploaded to R2', payload.objectKey || track.name || 'Done', 'success');
        }
    } catch (err) {
        const message = normalizeMusicFetchError(err, base);
        setMusicStatus(`Error: ${message}`, 'destructive');
        showToast(`${actionLabel} failed`, message, 'destructive');
    }
}

async function ingestMusicTrackForBatch(track) {
    const base = getMusicApiBase();
    try {
        try {
            return await requestMusicIngest(base, track, false);
        } catch (err) {
            const message = normalizeMusicFetchError(err, base);
            const localBase = getLocalMusicApiBase();
            const shouldRetryLocally =
                localBase !== base &&
                isMusicIngestLocalFallbackCandidate(message);
            if (!shouldRetryLocally) throw err;
            return await requestMusicIngest(localBase, track, false);
        }
    } catch (err) {
        throw new Error(normalizeMusicFetchError(err, base));
    }
}

async function fetchSpotifyArtists(query) {
    const base = getMusicApiBase();
    const res = await fetch(`${base}/api/spotify/artists?q=${encodeURIComponent(query)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.message || `Artist search failed (${res.status})`);
    }
    return Array.isArray(data.artists) ? data.artists : [];
}

async function fetchArtistSyncPlan(base, artistId, includeGroups) {
    const params = new URLSearchParams({ artistId, includeGroups });
    const res = await fetch(`${base}/api/music/artist-sync/plan?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.message || `Catalog plan failed (${res.status})`);
    }
    return data;
}

function renderMusicArtistPickerResults(artists, container, onPick) {
    if (!artists.length) {
        container.innerHTML =
            '<p class="text-sm" style="color: var(--muted-foreground);">No artists match that search.</p>';
        return;
    }
    container.innerHTML = artists
        .map((a) => {
            const img = a.image
                ? `<img src="${escapeHtml(a.image)}" alt="" class="h-12 w-12 flex-shrink-0 rounded-lg object-cover">`
                : `<div class="h-12 w-12 flex-shrink-0 rounded-lg border" style="border-color: var(--border); background-color: rgba(0,0,0,0.2);"></div>`;
            const genres = Array.isArray(a.genres) && a.genres.length
                ? `<p class="mt-0.5 truncate text-xs" style="color: var(--muted-foreground);">${escapeHtml(a.genres.join(', '))}</p>`
                : '';
            const idEnc = encodeURIComponent(a.id || '');
            return `
            <div class="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-white/[0.02]" style="border-color: var(--border);">
                ${img}
                <div class="min-w-0 flex-1">
                    <p class="truncate font-medium" style="color: var(--foreground);">${escapeHtml(a.name || 'Artist')}</p>
                    ${genres}
                </div>
                <button type="button" class="music-artist-pick inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors" style="border-color: rgba(0,245,212,0.35); background-color: rgba(0,245,212,0.06); color: var(--primary);" data-artist-id="${idEnc}">
                    <span class="material-symbols-outlined text-[16px]">check_circle</span>
                    Use artist
                </button>
            </div>`;
        })
        .join('');

    container.querySelectorAll('.music-artist-pick').forEach((btn) => {
        btn.addEventListener('click', () => {
            const raw = btn.getAttribute('data-artist-id') || '';
            let id = '';
            try {
                id = decodeURIComponent(raw);
            } catch {
                id = raw;
            }
            if (!id || typeof onPick !== 'function') return;
            onPick(id);
        });
    });
}

function openMusicArtistPlanModal() {
    const wrap = document.getElementById('music-artist-plan');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
}

function closeMusicArtistPlanModal() {
    const wrap = document.getElementById('music-artist-plan');
    if (!wrap) return;
    wrap.classList.add('hidden');
    wrap.classList.remove('flex');
}

function formatMusicDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return 'Unknown date';
    return s;
}

function musicArtistPlanTracksForView(view) {
    const plan = musicArtistSyncPlan || {};
    const allTracks = Array.isArray(plan.tracks) ? plan.tracks : [];
    if (view === 'recent') {
        const recent = Array.isArray(plan.recentTracks) ? plan.recentTracks : allTracks;
        return [...recent].sort((a, b) => String(b.albumReleaseDate || '').localeCompare(String(a.albumReleaseDate || '')));
    }
    if (view === 'owned') {
        return Array.isArray(plan.ownedTracks) ? plan.ownedTracks : allTracks.filter((t) => t.inLibrary);
    }
    if (view === 'all') {
        return allTracks;
    }
    return Array.isArray(plan.missingTracks) ? plan.missingTracks : allTracks.filter((t) => !t.inLibrary);
}

function getMusicArtistTrackId(track) {
    return String(track?.id || track?.spotifyId || `${track?.name || ''}:${track?.album || ''}:${track?.artists || ''}`);
}

function musicArtistTextMatchesExcluded(text, kind) {
    const s = String(text || '').toLowerCase();
    if (kind === 'live') return /\b(live|concert|session)\b/.test(s);
    if (kind === 'remix') return /\b(remix|mix|edit|version)\b/.test(s);
    if (kind === 'instrumental') return /\b(instrumental|karaoke)\b/.test(s);
    if (kind === 'clean') return /\b(clean|radio edit)\b/.test(s);
    return false;
}

function musicArtistTrackMatchesFilters(track) {
    if (musicArtistFilters.album && String(track?.album || '') !== musicArtistFilters.album) return false;
    const text = `${track?.name || ''} ${track?.album || ''}`;
    if (musicArtistFilters.excludeLive && musicArtistTextMatchesExcluded(text, 'live')) return false;
    if (musicArtistFilters.excludeRemix && musicArtistTextMatchesExcluded(text, 'remix')) return false;
    if (musicArtistFilters.excludeInstrumental && musicArtistTextMatchesExcluded(text, 'instrumental')) return false;
    if (musicArtistFilters.excludeClean && musicArtistTextMatchesExcluded(text, 'clean')) return false;
    if (musicArtistFilters.excludeExplicit && track?.explicit === true) return false;
    return true;
}

function musicArtistTrackSearchMatches(track, query) {
    if (!query) return true;
    return [
        track?.name,
        track?.artists,
        track?.album,
        track?.albumReleaseDate,
        track?.spotifyPopularity,
        track?.explicit ? 'explicit' : '',
        track?.inLibrary ? 'in library r2 owned have' : 'missing not installed',
    ]
        .join(' ')
        .toLowerCase()
        .includes(query);
}

function getMusicArtistVisibleTracks() {
    const query = String(musicArtistTrackFilter || '').trim().toLowerCase();
    const tracks = musicArtistPlanTracksForView(musicArtistTrackView)
        .filter(musicArtistTrackMatchesFilters)
        .filter((track) => musicArtistTrackSearchMatches(track, query));
    return sortMusicArtistTracks(tracks);
}

function musicArtistQueueStatus(track) {
    return musicArtistTrackStatus.get(getMusicArtistTrackId(track)) || null;
}

function isMusicArtistTrackSelectable(track) {
    if (!track || track.inLibrary) return false;
    const state = musicArtistQueueStatus(track)?.status || '';
    return !['queued', 'downloading', 'saved'].includes(state);
}

function updateMusicArtistTrackTabs() {
    const plan = musicArtistSyncPlan || {};
    const allRaw = Array.isArray(plan.tracks) ? plan.tracks : [];
    const all = allRaw.filter(musicArtistTrackMatchesFilters);
    const missingRaw = Array.isArray(plan.missingTracks) ? plan.missingTracks : allRaw.filter((t) => !t.inLibrary);
    const recentRaw = Array.isArray(plan.recentTracks) ? plan.recentTracks : allRaw;
    const ownedRaw = Array.isArray(plan.ownedTracks) ? plan.ownedTracks : allRaw.filter((t) => t.inLibrary);
    const counts = {
        missing: missingRaw.filter(musicArtistTrackMatchesFilters).length,
        recent: recentRaw.filter(musicArtistTrackMatchesFilters).length,
        owned: ownedRaw.filter(musicArtistTrackMatchesFilters).length,
        all: all.length,
    };

    document.querySelectorAll('[data-music-artist-tab-count]').forEach((el) => {
        const key = el.getAttribute('data-music-artist-tab-count') || '';
        el.textContent = counts[key] != null ? `(${counts[key]})` : '';
    });

    document.querySelectorAll('[data-music-artist-track-tab]').forEach((btn) => {
        const active = btn.getAttribute('data-music-artist-track-tab') === musicArtistTrackView;
        btn.style.borderColor = active ? 'rgba(0,245,212,0.35)' : 'var(--border)';
        btn.style.backgroundColor = active ? 'rgba(0,245,212,0.1)' : 'transparent';
        btn.style.color = active ? 'var(--primary)' : 'var(--muted-foreground)';
    });
}

function musicArtistSortableValue(track, key) {
    if (key === 'popularity') {
        const n = Number(track?.spotifyPopularity);
        return Number.isFinite(n) ? n : -1;
    }
    if (key === 'released') {
        return Date.parse(track?.albumReleaseDate || '') || 0;
    }
    return 0;
}

function sortMusicArtistTracks(tracks) {
    if (!musicArtistTrackSort.key) return tracks;
    const direction = musicArtistTrackSort.direction === 'asc' ? 1 : -1;
    return [...tracks].sort((a, b) => {
        let cmp =
            musicArtistSortableValue(a, musicArtistTrackSort.key) -
            musicArtistSortableValue(b, musicArtistTrackSort.key);
        if (cmp === 0) {
            cmp = String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
                sensitivity: 'base',
                numeric: true,
            });
        }
        return cmp * direction;
    });
}

function musicArtistSortIcon(key) {
    if (musicArtistTrackSort.key !== key) return 'unfold_more';
    return musicArtistTrackSort.direction === 'asc' ? 'north' : 'south';
}

function musicArtistSortButton(key, label) {
    const active = musicArtistTrackSort.key === key;
    return `
        <button type="button" data-music-artist-sort="${key}" aria-pressed="${active ? 'true' : 'false'}" class="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold uppercase tracking-wide transition-colors" style="color: ${active ? 'var(--primary)' : 'var(--muted-foreground)'};">
            ${label}
            <span class="material-symbols-outlined text-[15px]">${musicArtistSortIcon(key)}</span>
        </button>`;
}

function updateMusicArtistAlbumFilterOptions() {
    const albumSel = document.getElementById('music-artist-album-filter');
    if (!albumSel) return;
    const tracks = Array.isArray(musicArtistSyncPlan?.tracks) ? musicArtistSyncPlan.tracks : [];
    const albums = [...new Set(tracks.map((track) => String(track.album || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
    const current = albums.includes(musicArtistFilters.album) ? musicArtistFilters.album : '';
    musicArtistFilters.album = current;
    albumSel.innerHTML = `
        <option value="">All albums</option>
        ${albums.map((album) => `<option value="${escapeHtml(album)}">${escapeHtml(album)}</option>`).join('')}`;
    albumSel.value = current;
    albumSel.disabled = albums.length === 0 || musicArtistQueue.running;

    const hasExplicitMetadata = tracks.some((track) => typeof track.explicit === 'boolean');
    const explicitRow = document.getElementById('music-artist-explicit-filter-row');
    const explicitInput = document.querySelector('[data-music-artist-exclude="explicit"]');
    if (explicitRow) explicitRow.classList.toggle('opacity-50', !hasExplicitMetadata);
    if (explicitInput) {
        explicitInput.disabled = !hasExplicitMetadata || musicArtistQueue.running;
        if (!hasExplicitMetadata) {
            explicitInput.checked = false;
            musicArtistFilters.excludeExplicit = false;
        }
    }
}

function updateMusicArtistSelectionUi() {
    const visible = getMusicArtistVisibleTracks();
    const selectableVisible = visible.filter(isMusicArtistTrackSelectable);
    const validIds = new Set((Array.isArray(musicArtistSyncPlan?.tracks) ? musicArtistSyncPlan.tracks : []).map(getMusicArtistTrackId));
    musicArtistSelectedTrackIds = new Set([...musicArtistSelectedTrackIds].filter((id) => validIds.has(id)));

    const selectedCount = [...musicArtistSelectedTrackIds].filter((id) => {
        const track = (musicArtistSyncPlan?.tracks || []).find((t) => getMusicArtistTrackId(t) === id);
        return track && isMusicArtistTrackSelectable(track);
    }).length;
    const selectVisibleBtn = document.getElementById('music-artist-select-visible');
    const clearBtn = document.getElementById('music-artist-clear-selection');
    const countEl = document.getElementById('music-artist-selected-count');
    const installSelectedBtn = document.getElementById('music-artist-install-selected');
    const installAllBtn = document.getElementById('music-artist-install-all');
    if (selectVisibleBtn) selectVisibleBtn.disabled = musicArtistQueue.running || selectableVisible.length === 0;
    if (clearBtn) clearBtn.disabled = musicArtistQueue.running || selectedCount === 0;
    if (installSelectedBtn) installSelectedBtn.disabled = musicArtistQueue.running || selectedCount === 0;
    const missingCount = getMusicArtistAllMissingTracks().length;
    if (installAllBtn) installAllBtn.disabled = musicArtistQueue.running || missingCount === 0;
    if (countEl) {
        countEl.textContent = selectedCount === 1 ? '1 selected' : `${selectedCount} selected`;
    }
}

function getMusicArtistAllMissingTracks() {
    const tracks = Array.isArray(musicArtistSyncPlan?.missingTracks)
        ? musicArtistSyncPlan.missingTracks
        : (musicArtistSyncPlan?.tracks || []).filter((track) => !track.inLibrary);
    return tracks.filter(musicArtistTrackMatchesFilters).filter(isMusicArtistTrackSelectable);
}

function musicArtistQueueSummary() {
    const total = musicArtistQueue.items.length;
    const remaining = Math.max(0, total - musicArtistQueue.current - (musicArtistQueue.running ? 1 : 0));
    return {
        total,
        saved: musicArtistQueue.saved,
        failed: musicArtistQueue.failed,
        cancelled: musicArtistQueue.cancelled,
        remaining,
    };
}

function updateMusicArtistQueueUi() {
    const progressEl = document.getElementById('music-artist-sync-progress');
    const barEl = document.getElementById('music-artist-queue-bar');
    const pauseBtn = document.getElementById('music-artist-queue-pause');
    const cancelBtn = document.getElementById('music-artist-queue-cancel');
    const retryBtn = document.getElementById('music-artist-retry-failed');
    const includeSel = document.getElementById('music-artist-include-groups');
    const albumSel = document.getElementById('music-artist-album-filter');
    const excludeInputs = document.querySelectorAll('[data-music-artist-exclude]');
    const summary = musicArtistQueueSummary();
    const complete = summary.saved + summary.failed + summary.cancelled;
    const pct = summary.total > 0 ? Math.round((complete / summary.total) * 100) : 0;

    if (barEl) barEl.style.width = `${pct}%`;
    if (progressEl) {
        if (!summary.total) {
            progressEl.textContent = 'No batch running.';
        } else if (musicArtistQueue.running) {
            progressEl.textContent = `${musicArtistQueue.paused ? 'Paused' : 'Running'} · saved ${summary.saved} · failed ${summary.failed} · remaining ${summary.remaining} · total ${summary.total}`;
        } else {
            progressEl.textContent = `Done · saved ${summary.saved} · failed ${summary.failed} · cancelled ${summary.cancelled} · total ${summary.total}`;
        }
    }
    if (pauseBtn) {
        pauseBtn.disabled = !musicArtistQueue.running || musicArtistQueue.cancelRequested;
        pauseBtn.textContent = musicArtistQueue.paused ? 'Resume' : 'Pause';
    }
    if (cancelBtn) cancelBtn.disabled = !musicArtistQueue.running || musicArtistQueue.cancelRequested;
    const failedCount = [...musicArtistTrackStatus.values()].filter((item) => item.status === 'failed').length;
    if (retryBtn) retryBtn.disabled = musicArtistQueue.running || failedCount === 0;
    if (includeSel) includeSel.disabled = musicArtistQueue.running;
    if (albumSel) albumSel.disabled = musicArtistQueue.running || albumSel.options.length <= 1;
    excludeInputs.forEach((input) => {
        if (input.getAttribute('data-music-artist-exclude') === 'explicit') {
            const hasExplicitMetadata = (musicArtistSyncPlan?.tracks || []).some((track) => typeof track.explicit === 'boolean');
            input.disabled = musicArtistQueue.running || !hasExplicitMetadata;
        } else {
            input.disabled = musicArtistQueue.running;
        }
    });
    updateMusicArtistSelectionUi();
}

function renderMusicArtistTrackStatus(track, queueStatus) {
    const baseClass = 'rounded-full px-2 py-1 text-xs font-medium';
    if (queueStatus?.status === 'queued') {
        return `<span class="${baseClass}" style="background-color: rgba(59,130,246,0.12); color: #93c5fd;">Queued</span>`;
    }
    if (queueStatus?.status === 'downloading') {
        return `<span class="${baseClass}" style="background-color: rgba(250,204,21,0.12); color: #fde047;">Downloading</span>`;
    }
    if (queueStatus?.status === 'saved') {
        return `<span class="${baseClass}" style="background-color: rgba(34,197,94,0.12); color: #4ade80;">Saved</span>`;
    }
    if (queueStatus?.status === 'failed') {
        return `
            <span class="${baseClass}" title="${escapeHtml(queueStatus.error || 'Install failed')}" style="background-color: rgba(239,68,68,0.12); color: #f87171;">Failed</span>
            <div class="mt-1 max-w-[12rem] truncate text-[11px]" title="${escapeHtml(queueStatus.error || '')}" style="color: var(--muted-foreground);">${escapeHtml(queueStatus.error || '')}</div>`;
    }
    if (queueStatus?.status === 'cancelled') {
        return `<span class="${baseClass}" style="background-color: rgba(148,163,184,0.12); color: #cbd5e1;">Cancelled</span>`;
    }
    return track.inLibrary
        ? `<span class="${baseClass}" style="background-color: rgba(34,197,94,0.12); color: #4ade80;">In R2</span>`
        : `<span class="${baseClass}" style="background-color: rgba(239,68,68,0.12); color: #f87171;">Missing</span>`;
}

function renderMusicArtistTrackTable(emptyText = 'No songs found.') {
    const el = document.getElementById('music-artist-track-list');
    if (!el) return;

    updateMusicArtistTrackTabs();

    const query = String(musicArtistTrackFilter || '').trim().toLowerCase();
    const sorted = getMusicArtistVisibleTracks();

    if (!sorted.length) {
        el.innerHTML = `
            <div class="flex min-h-[14rem] items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center text-sm" style="border-color: var(--border); color: var(--muted-foreground);">
                ${escapeHtml(query || musicArtistFilters.album ? 'No songs match these filters.' : emptyText)}
            </div>`;
        updateMusicArtistSelectionUi();
        return;
    }

    el.innerHTML = `
        <div class="overflow-hidden rounded-xl border" style="border-color: var(--border);">
            <table class="w-full min-w-[720px] text-left text-sm">
                <thead style="background-color: rgba(255,255,255,0.025);">
                    <tr class="border-b" style="border-color: var(--border);">
                        <th class="w-10 px-4 py-3 text-xs font-semibold uppercase tracking-wide" style="color: var(--muted-foreground);"></th>
                        <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style="color: var(--muted-foreground);">Song</th>
                        <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style="color: var(--muted-foreground);">Album</th>
                        <th class="px-4 py-2 text-xs font-semibold uppercase tracking-wide" style="color: var(--muted-foreground);">${musicArtistSortButton('released', 'Released')}</th>
                        <th class="px-4 py-2 text-xs font-semibold uppercase tracking-wide" style="color: var(--muted-foreground);">${musicArtistSortButton('popularity', 'Popularity')}</th>
                        <th class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style="color: var(--muted-foreground);">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map((track) => {
                        const trackId = getMusicArtistTrackId(track);
                        const queueStatus = musicArtistQueueStatus(track);
                        const selectable = isMusicArtistTrackSelectable(track);
                        const checked = musicArtistSelectedTrackIds.has(trackId) && selectable;
                        const status = renderMusicArtistTrackStatus(track, queueStatus);
                        const popularity = typeof track.spotifyPopularity === 'number' ? `${track.spotifyPopularity}/100` : '—';
                        return `
                        <tr class="border-b transition-colors hover:bg-white/[0.025]" style="border-color: var(--border);">
                            <td class="px-4 py-3 align-top">
                                <input type="checkbox" data-music-artist-select="${escapeHtml(trackId)}" ${checked ? 'checked' : ''} ${selectable ? '' : 'disabled'} aria-label="Select ${escapeHtml(track.name || 'track')}" style="accent-color: var(--primary);">
                            </td>
                            <td class="px-4 py-3 align-top">
                                <div class="font-medium leading-snug" style="color: var(--foreground);">${escapeHtml(track.name || 'Untitled')}</div>
                                <div class="mt-0.5 text-xs" style="color: var(--muted-foreground);">${escapeHtml(track.artists || '')}</div>
                            </td>
                            <td class="max-w-[16rem] px-4 py-3 align-top text-xs" style="color: var(--muted-foreground);">
                                <span class="line-clamp-2" title="${escapeHtml(track.album || '')}">${escapeHtml(track.album || 'Unknown album')}</span>
                            </td>
                            <td class="whitespace-nowrap px-4 py-3 align-top text-xs tabular-nums" style="color: var(--muted-foreground);">${escapeHtml(formatMusicDate(track.albumReleaseDate))}</td>
                            <td class="whitespace-nowrap px-4 py-3 align-top text-xs tabular-nums" style="color: var(--muted-foreground);">${escapeHtml(popularity)}</td>
                            <td class="whitespace-nowrap px-4 py-3 align-top text-right">${status}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    updateMusicArtistSelectionUi();
}

function updateMusicArtistPlanPanel(plan, errorMessage) {
    const wrap = document.getElementById('music-artist-plan');
    const nameEl = document.getElementById('music-artist-plan-name');
    const statsEl = document.getElementById('music-artist-plan-stats');
    const imgEl = document.getElementById('music-artist-plan-img');
    const metricsEl = document.getElementById('music-artist-metrics-note');
    const allEl = document.getElementById('music-artist-count-all');
    const ownedEl = document.getElementById('music-artist-count-owned');
    const missingEl = document.getElementById('music-artist-count-missing');
    const popEl = document.getElementById('music-artist-popularity');
    if (!wrap || !nameEl || !statsEl) return;

    openMusicArtistPlanModal();

    if (errorMessage) {
        nameEl.textContent = 'Could not load catalog';
        statsEl.textContent = errorMessage;
        statsEl.style.color = 'var(--destructive)';
        if (imgEl) imgEl.classList.add('hidden');
        if (metricsEl) metricsEl.textContent = '';
        musicArtistSyncPlan = null;
        musicArtistSelectedTrackIds.clear();
        updateMusicArtistAlbumFilterOptions();
        updateMusicArtistQueueUi();
        renderMusicArtistTrackTable('No catalog data loaded.');
        return;
    }

    statsEl.style.color = 'var(--muted-foreground)';
    const artist = plan?.artist || {};
    nameEl.textContent = artist.name || 'Artist';
    if (imgEl) {
        if (artist.image) {
            imgEl.src = artist.image;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.removeAttribute('src');
            imgEl.classList.add('hidden');
        }
    }

    const missing = Number(plan?.missingCount) || 0;
    const owned = Number(plan?.ownedInLibraryCount) || 0;
    const cat = Number(plan?.catalogTrackCount) || 0;
    const albums = Number(plan?.albumsCount) || 0;
    const popularity =
        typeof artist.popularity === 'number'
            ? `${artist.popularity}/100`
            : '—';

    statsEl.textContent = `${albums} album rows · ${cat} unique Spotify tracks in catalog`;
    if (metricsEl) {
        metricsEl.textContent =
            plan?.metricsAvailability?.note ||
            'Spotify popularity is available. Spotify stream counts and YouTube views are not available from the current integrations.';
    }
    if (allEl) allEl.textContent = String(cat);
    if (ownedEl) ownedEl.textContent = String(owned);
    if (missingEl) missingEl.textContent = String(missing);
    if (popEl) popEl.textContent = popularity;

    musicArtistSyncPlan = plan;
    updateMusicArtistAlbumFilterOptions();
    if (missing === 0 && musicArtistTrackView === 'missing') musicArtistTrackView = 'recent';
    renderMusicArtistTrackTable('Nothing to show for this view.');
    updateMusicArtistQueueUi();
}

async function loadMusicArtistCatalogPlan(base, artistId) {
    const wrap = document.getElementById('music-artist-plan');
    const includeSel = document.getElementById('music-artist-include-groups');
    const groups = includeSel ? includeSel.value : 'album,single';
    musicArtistSyncPlan = null;

    openMusicArtistPlanModal();
    const nameEl = document.getElementById('music-artist-plan-name');
    const statsEl = document.getElementById('music-artist-plan-stats');
    const imgEl = document.getElementById('music-artist-plan-img');
    const metricsEl = document.getElementById('music-artist-metrics-note');
    if (imgEl) {
        imgEl.removeAttribute('src');
        imgEl.classList.add('hidden');
    }
    if (nameEl) nameEl.textContent = 'Loading Spotify catalog…';
    if (statsEl) {
        statsEl.textContent =
            'Fetching albums from Spotify and comparing track IDs to your R2 library (large libraries may take a minute).';
        statsEl.style.color = 'var(--muted-foreground)';
    }
    if (metricsEl) metricsEl.textContent = '';
    ['music-artist-count-all', 'music-artist-count-owned', 'music-artist-count-missing', 'music-artist-popularity'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
    });
    musicArtistTrackView = 'missing';
    musicArtistTrackFilter = '';
    musicArtistTrackSort = { key: '', direction: 'desc' };
    musicArtistFilters = {
        album: '',
        excludeLive: false,
        excludeRemix: false,
        excludeInstrumental: false,
        excludeClean: false,
        excludeExplicit: false,
    };
    musicArtistSelectedTrackIds.clear();
    musicArtistTrackStatus.clear();
    const filterEl = document.getElementById('music-artist-track-filter');
    if (filterEl) filterEl.value = '';
    const albumEl = document.getElementById('music-artist-album-filter');
    if (albumEl) albumEl.value = '';
    document.querySelectorAll('[data-music-artist-exclude]').forEach((input) => {
        input.checked = false;
    });
    updateMusicArtistAlbumFilterOptions();
    updateMusicArtistQueueUi();
    renderMusicArtistTrackTable('Loading catalog data…');

    try {
        const plan = await fetchArtistSyncPlan(base, artistId, groups);
        updateMusicArtistPlanPanel(plan, '');
    } catch (err) {
        updateMusicArtistPlanPanel(null, normalizeMusicFetchError(err, base));
    }
}

function normalizeMusicArtistQueueTracks(tracks) {
    const byId = new Map();
    tracks.forEach((track) => {
        if (!isMusicArtistTrackSelectable(track)) return;
        byId.set(getMusicArtistTrackId(track), track);
    });
    return [...byId.values()];
}

function getMusicArtistSelectedTracks() {
    const tracks = Array.isArray(musicArtistSyncPlan?.tracks) ? musicArtistSyncPlan.tracks : [];
    return normalizeMusicArtistQueueTracks(tracks.filter((track) => musicArtistSelectedTrackIds.has(getMusicArtistTrackId(track))));
}

async function waitForMusicArtistQueueResume() {
    while (musicArtistQueue.paused && !musicArtistQueue.cancelRequested) {
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

async function runMusicArtistInstallQueue(base, tracks, title = 'Artist batch install') {
    const batch = normalizeMusicArtistQueueTracks(tracks);
    if (musicArtistQueue.running || !batch.length) {
        if (!batch.length) showToast('No songs selected', 'Choose missing songs before starting an install queue.', 'destructive');
        return;
    }

    musicArtistQueue = {
        running: true,
        paused: false,
        cancelRequested: false,
        items: batch,
        current: 0,
        saved: 0,
        failed: 0,
        cancelled: 0,
    };
    musicArtistSyncRunning = true;
    batch.forEach((track) => {
        musicArtistTrackStatus.set(getMusicArtistTrackId(track), { status: 'queued', error: '' });
    });
    musicArtistSelectedTrackIds.clear();
    renderMusicArtistTrackTable('No songs found for this view.');
    updateMusicArtistQueueUi();

    for (let i = 0; i < batch.length; i += 1) {
        musicArtistQueue.current = i;
        await waitForMusicArtistQueueResume();
        if (musicArtistQueue.cancelRequested) {
            batch.slice(i).forEach((track) => {
                const id = getMusicArtistTrackId(track);
                if (musicArtistTrackStatus.get(id)?.status === 'queued') {
                    musicArtistTrackStatus.set(id, { status: 'cancelled', error: '' });
                    musicArtistQueue.cancelled += 1;
                }
            });
            break;
        }

        const track = batch[i];
        const id = getMusicArtistTrackId(track);
        musicArtistTrackStatus.set(id, { status: 'downloading', error: '' });
        renderMusicArtistTrackTable('No songs found for this view.');
        updateMusicArtistQueueUi();

        try {
            await ingestMusicTrackForBatch(track);
            musicArtistTrackStatus.set(id, { status: 'saved', error: '' });
            musicArtistQueue.saved += 1;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            musicArtistTrackStatus.set(id, { status: 'failed', error: message.slice(0, 160) });
            musicArtistQueue.failed += 1;
        }

        renderMusicArtistTrackTable('No songs found for this view.');
        updateMusicArtistQueueUi();
        if (i < batch.length - 1) await new Promise((resolve) => setTimeout(resolve, 500));
    }

    musicArtistQueue.running = false;
    musicArtistQueue.paused = false;
    musicArtistSyncRunning = false;
    refreshMusicR2Library();
    renderMusicArtistTrackTable('No songs found for this view.');
    updateMusicArtistQueueUi();

    if (musicArtistQueue.failed === 0 && musicArtistQueue.saved > 0 && musicArtistSyncSelectedId) {
        await loadMusicArtistCatalogPlan(base, musicArtistSyncSelectedId);
    }

    if (musicArtistQueue.failed === 0 && musicArtistQueue.cancelled === 0) {
        showToast(title, `${musicArtistQueue.saved} track(s) saved to R2.`, 'success');
    } else if (musicArtistQueue.cancelled > 0) {
        showToast('Artist queue cancelled', `${musicArtistQueue.saved} saved · ${musicArtistQueue.cancelled} cancelled.`, 'destructive');
    } else {
        showToast('Artist queue finished with errors', `${musicArtistQueue.saved} saved · ${musicArtistQueue.failed} failed.`, 'destructive');
    }
}

function toggleMusicArtistQueuePause() {
    if (!musicArtistQueue.running) return;
    musicArtistQueue.paused = !musicArtistQueue.paused;
    updateMusicArtistQueueUi();
}

function cancelMusicArtistQueue() {
    if (!musicArtistQueue.running) return;
    musicArtistQueue.cancelRequested = true;
    musicArtistQueue.paused = false;
    updateMusicArtistQueueUi();
}

function retryMusicArtistFailed(base) {
    const failedIds = new Set([...musicArtistTrackStatus.entries()].filter(([, status]) => status.status === 'failed').map(([id]) => id));
    const tracks = (musicArtistSyncPlan?.tracks || []).filter((track) => failedIds.has(getMusicArtistTrackId(track)));
    tracks.forEach((track) => musicArtistTrackStatus.delete(getMusicArtistTrackId(track)));
    runMusicArtistInstallQueue(base, tracks, 'Retry failed artist installs');
}

function initMusicArtistSyncUi(base) {
    const qInput = document.getElementById('music-artist-query');
    const resultsEl = document.getElementById('music-artist-results');
    const includeSel = document.getElementById('music-artist-include-groups');
    const installSelectedBtn = document.getElementById('music-artist-install-selected');
    const installAllBtn = document.getElementById('music-artist-install-all');
    const pauseBtn = document.getElementById('music-artist-queue-pause');
    const cancelBtn = document.getElementById('music-artist-queue-cancel');
    const retryBtn = document.getElementById('music-artist-retry-failed');
    const selectVisibleBtn = document.getElementById('music-artist-select-visible');
    const clearSelectionBtn = document.getElementById('music-artist-clear-selection');
    const albumFilter = document.getElementById('music-artist-album-filter');
    const closeBtn = document.getElementById('music-artist-plan-close');
    const modal = document.getElementById('music-artist-plan');
    const trackFilter = document.getElementById('music-artist-track-filter');
    const trackList = document.getElementById('music-artist-track-list');

    if (!qInput || !resultsEl) return;

    const idleHint = `
        <div class="rounded-xl border border-dashed px-4 py-8 text-center text-xs" style="border-color: var(--border); color: var(--muted-foreground);">
            Enter at least two characters to search artists on Spotify.
        </div>`;

    resultsEl.innerHTML = idleHint;

    const searchArtists = () => {
        const q = qInput.value.trim();
        if (q.length < 2) {
            resultsEl.innerHTML = idleHint;
            return;
        }
        resultsEl.innerHTML =
            '<div class="flex items-center gap-2 text-sm" style="color: var(--muted-foreground);"><span class="material-symbols-outlined animate-pulse text-[20px]">progress_activity</span> Searching artists…</div>';
        fetchSpotifyArtists(q)
            .then((artists) =>
                renderMusicArtistPickerResults(artists, resultsEl, (artistId) => {
                    musicArtistSyncSelectedId = artistId;
                    loadMusicArtistCatalogPlan(base, artistId);
                }),
            )
            .catch((err) => {
                resultsEl.innerHTML = `<p style="color: var(--destructive);">${escapeHtml(normalizeMusicFetchError(err, base))}</p>`;
            });
    };

    qInput.addEventListener('input', () => {
        clearTimeout(musicArtistSyncDebounceTimer);
        musicArtistSyncDebounceTimer = setTimeout(searchArtists, 320);
    });

    qInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(musicArtistSyncDebounceTimer);
            searchArtists();
        }
    });

    if (includeSel) {
        includeSel.addEventListener('change', () => {
            if (musicArtistSyncSelectedId) loadMusicArtistCatalogPlan(base, musicArtistSyncSelectedId);
        });
    }

    if (installSelectedBtn) {
        installSelectedBtn.addEventListener('click', () => runMusicArtistInstallQueue(base, getMusicArtistSelectedTracks(), 'Selected artist installs'));
    }

    if (installAllBtn) {
        installAllBtn.addEventListener('click', () => {
            const tracks = getMusicArtistAllMissingTracks();
            if (!tracks.length) {
                showToast('No missing songs', 'There are no missing songs matching the current filters.', 'destructive');
                return;
            }
            if (window.confirm(`Install ${tracks.length} missing song(s) that match the current filters? Keep this browser tab open while the queue runs.`)) {
                runMusicArtistInstallQueue(base, tracks, 'All missing artist installs');
            }
        });
    }

    if (pauseBtn) pauseBtn.addEventListener('click', toggleMusicArtistQueuePause);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelMusicArtistQueue);
    if (retryBtn) retryBtn.addEventListener('click', () => retryMusicArtistFailed(base));

    if (selectVisibleBtn) {
        selectVisibleBtn.addEventListener('click', () => {
            getMusicArtistVisibleTracks().filter(isMusicArtistTrackSelectable).forEach((track) => {
                musicArtistSelectedTrackIds.add(getMusicArtistTrackId(track));
            });
            renderMusicArtistTrackTable('No songs found for this view.');
        });
    }

    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', () => {
            musicArtistSelectedTrackIds.clear();
            renderMusicArtistTrackTable('No songs found for this view.');
        });
    }

    if (albumFilter) {
        albumFilter.addEventListener('change', () => {
            musicArtistFilters.album = albumFilter.value;
            renderMusicArtistTrackTable('No songs found for this view.');
        });
    }

    document.querySelectorAll('[data-music-artist-exclude]').forEach((input) => {
        input.addEventListener('change', () => {
            const key = input.getAttribute('data-music-artist-exclude');
            if (key === 'live') musicArtistFilters.excludeLive = input.checked;
            if (key === 'remix') musicArtistFilters.excludeRemix = input.checked;
            if (key === 'instrumental') musicArtistFilters.excludeInstrumental = input.checked;
            if (key === 'clean') musicArtistFilters.excludeClean = input.checked;
            if (key === 'explicit') musicArtistFilters.excludeExplicit = input.checked;
            renderMusicArtistTrackTable('No songs found for this view.');
        });
    });

    document.querySelectorAll('[data-music-artist-track-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            musicArtistTrackView = btn.getAttribute('data-music-artist-track-tab') || 'missing';
            renderMusicArtistTrackTable('No songs found for this view.');
        });
    });

    if (trackFilter) {
        trackFilter.addEventListener('input', () => {
            musicArtistTrackFilter = trackFilter.value.trim();
            renderMusicArtistTrackTable('No songs found for this view.');
        });
    }

    if (trackList) {
        trackList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-music-artist-sort]');
            if (!btn) return;
            const key = btn.getAttribute('data-music-artist-sort') || '';
            if (!key) return;
            if (musicArtistTrackSort.key === key) {
                musicArtistTrackSort.direction = musicArtistTrackSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                musicArtistTrackSort = { key, direction: 'desc' };
            }
            renderMusicArtistTrackTable('No songs found for this view.');
        });
        trackList.addEventListener('change', (e) => {
            const cb = e.target.closest('[data-music-artist-select]');
            if (!cb) return;
            const id = cb.getAttribute('data-music-artist-select');
            if (!id) return;
            if (cb.checked) {
                musicArtistSelectedTrackIds.add(id);
            } else {
                musicArtistSelectedTrackIds.delete(id);
            }
            updateMusicArtistSelectionUi();
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', closeMusicArtistPlanModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeMusicArtistPlanModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMusicArtistPlanModal();
    });
}

function getMusicR2VisibleSortedObjects(objects) {
    return sortMusicR2Objects(filterMusicR2Objects(objects));
}

function updateMusicR2SelectAllCheckbox() {
    const cb = document.getElementById('music-r2-select-all');
    if (!cb) return;
    const visible = getMusicR2VisibleSortedObjects(musicR2Objects);
    const keys = visible.map((o) => o.key).filter(Boolean);
    if (!keys.length) {
        cb.checked = false;
        cb.indeterminate = false;
        cb.disabled = true;
        return;
    }
    cb.disabled = false;
    const numSel = keys.filter((k) => musicR2SelectedKeys.has(k)).length;
    cb.checked = numSel === keys.length;
    cb.indeterminate = numSel > 0 && numSel < keys.length;
}

function updateMusicR2BulkDeleteButton() {
    const btn = document.getElementById('music-r2-bulk-delete');
    const label = document.getElementById('music-r2-bulk-delete-label');
    const n = musicR2SelectedKeys.size;
    if (btn) btn.disabled = n === 0;
    if (label) label.textContent = n ? `Delete selected (${n})` : 'Delete selected';
}

function updateMusicR2SelectionUi() {
    updateMusicR2SelectAllCheckbox();
    updateMusicR2BulkDeleteButton();
}

function pruneMusicR2SelectionToLoadedObjects(objects) {
    const valid = new Set(objects.map((o) => o.key).filter(Boolean));
    for (const k of [...musicR2SelectedKeys]) {
        if (!valid.has(k)) musicR2SelectedKeys.delete(k);
    }
}

function initMusicR2LibraryUi(base) {
    const refreshBtn = document.getElementById('music-r2-refresh');
    const dedupeBtn = document.getElementById('music-r2-dedupe');
    const bulkDeleteBtn = document.getElementById('music-r2-bulk-delete');
    const selectAllCb = document.getElementById('music-r2-select-all');
    const searchInput = document.getElementById('music-r2-search');
    const searchClear = document.getElementById('music-r2-search-clear');
    const tbody = document.getElementById('music-r2-tbody');
    const sortButtons = document.querySelectorAll('[data-music-r2-sort]');
    const modal = document.getElementById('musicR2MetaModal');
    const btnClose = document.getElementById('music-r2-meta-close');
    const btnCancel = document.getElementById('music-r2-meta-cancel');
    const btnSave = document.getElementById('music-r2-meta-save');

    if (!refreshBtn || !tbody) return;

    refreshBtn.addEventListener('click', () => refreshMusicR2Library());
    if (dedupeBtn) dedupeBtn.addEventListener('click', () => pruneMusicSpotifyDuplicates(base));
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', () => bulkDeleteMusicR2Selected(base));
    if (selectAllCb) {
        selectAllCb.addEventListener('change', () => {
            const visible = getMusicR2VisibleSortedObjects(musicR2Objects);
            const keys = visible.map((o) => o.key).filter(Boolean);
            if (!keys.length) return;
            if (selectAllCb.checked) keys.forEach((k) => musicR2SelectedKeys.add(k));
            else keys.forEach((k) => musicR2SelectedKeys.delete(k));
            renderMusicR2Rows(musicR2Objects);
        });
    }
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            musicR2Filter = searchInput.value.trim();
            if (searchClear) searchClear.classList.toggle('hidden', !musicR2Filter);
            renderMusicR2Rows(musicR2Objects);
        });
    }
    if (searchClear && searchInput) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            musicR2Filter = '';
            searchClear.classList.add('hidden');
            renderMusicR2Rows(musicR2Objects);
            searchInput.focus();
        });
    }
    sortButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-music-r2-sort');
            if (!key) return;
            if (musicR2Sort.key === key) {
                musicR2Sort.direction = musicR2Sort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                musicR2Sort = {
                    key,
                    direction: key === 'alpha' ? 'asc' : 'desc',
                };
            }
            updateMusicR2SortButtons();
            renderMusicR2Rows(musicR2Objects);
        });
    });
    updateMusicR2SortButtons();

    if (btnClose) btnClose.addEventListener('click', closeMusicR2MetaModal);
    if (btnCancel) btnCancel.addEventListener('click', closeMusicR2MetaModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeMusicR2MetaModal();
        });
    }
    if (btnSave) {
        btnSave.addEventListener('click', () => saveMusicR2Metadata(base));
    }

    tbody.addEventListener('change', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || !t.matches('[data-music-r2-row-checkbox]')) return;
        const keyEnc = t.getAttribute('data-key') || '';
        let key = '';
        try {
            key = decodeURIComponent(keyEnc);
        } catch {
            return;
        }
        if (t.checked) musicR2SelectedKeys.add(key);
        else musicR2SelectedKeys.delete(key);
        updateMusicR2SelectionUi();
    });

    tbody.addEventListener('click', (e) => {
        const t = e.target.closest('[data-music-r2-action]');
        if (!t) return;

        const action = t.getAttribute('data-music-r2-action');
        const keyEnc = t.getAttribute('data-key') || '';
        let key = '';
        try {
            key = decodeURIComponent(keyEnc);
        } catch {
            return;
        }

        if (action === 'play') {
            openMusicPresigned(base, key, true);
        } else if (action === 'presign') {
            openMusicPresigned(base, key, false);
        } else if (action === 'public') {
            const raw = t.getAttribute('data-public-url');
            if (raw) window.open(decodeURIComponent(raw), '_blank', 'noopener,noreferrer');
        } else if (action === 'edit') {
            let meta = { title: '', artist: '', album: '' };
            try {
                const mj = t.getAttribute('data-meta-json');
                if (mj) meta = JSON.parse(decodeURIComponent(mj));
            } catch {
                meta = { title: '', artist: '', album: '' };
            }
            openMusicR2MetaModal(key, meta);
        } else if (action === 'delete') {
            deleteMusicR2Object(base, key);
        }
    });

    refreshMusicR2Library();
}

async function refreshMusicR2Library() {
    const base = getMusicApiBase();
    const tbody = document.getElementById('music-r2-tbody');
    const statusEl = document.getElementById('music-r2-status');
    if (!tbody) return;

    if (statusEl) statusEl.textContent = 'Loading objects from R2…';
    try {
        const res = await fetch(`${base}/api/storage/music?maxKeys=500`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || `List failed (${res.status})`);
        const objs = Array.isArray(data.objects) ? data.objects : [];
        const totalBytes = objs.reduce((sum, obj) => sum + (Number(obj?.size) || 0), 0);
        if (statusEl) {
            statusEl.textContent =
                `Prefix: ${data.prefix || '(entire bucket)'} · ${objs.length} object(s)` +
                (data.isTruncated ? ' (truncated)' : '');
        }
        setText('music-header-tracks', formatMusicCount(objs.length));
        setText('music-header-storage', formatBytes(totalBytes));
        musicR2Objects = objs;
        pruneMusicR2SelectionToLoadedObjects(objs);
        renderMusicR2Rows(musicR2Objects);
    } catch (err) {
        const message = normalizeMusicFetchError(err, base);
        if (statusEl) statusEl.textContent = `Could not list R2: ${message}`;
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-sm" style="color: var(--destructive);">${escapeHtml(message)}</td></tr>`;
    }
}

function getMusicR2BaseName(key) {
    const s = String(key || '');
    return s.includes('/') ? s.slice(s.lastIndexOf('/') + 1) : s;
}

function getMusicR2DisplayTitle(object) {
    const meta = object?.metadata || {};
    return (meta.title || '').trim() || getMusicR2BaseName(object?.key || '');
}

function getMusicR2FilterText(object) {
    const meta = object?.metadata || {};
    return [
        getMusicR2DisplayTitle(object),
        meta.artist,
        meta.album,
        meta.spotifyId,
        meta.youtubeQuery,
        getMusicR2BaseName(object?.key || ''),
        object?.key,
        formatBytes(object?.size),
    ].join(' ').toLowerCase();
}

function filterMusicR2Objects(objects) {
    const query = String(musicR2Filter || '').trim().toLowerCase();
    if (!query) return objects;
    const terms = query.split(/\s+/).filter(Boolean);
    return objects.filter((object) => {
        const haystack = getMusicR2FilterText(object);
        return terms.every((term) => haystack.includes(term));
    });
}

function sortMusicR2Objects(objects) {
    const direction = musicR2Sort.direction === 'asc' ? 1 : -1;
    const byTitle = (a, b) =>
        getMusicR2DisplayTitle(a).localeCompare(getMusicR2DisplayTitle(b), undefined, {
            sensitivity: 'base',
            numeric: true,
        });
    const byKey = (a, b) => String(a?.key || '').localeCompare(String(b?.key || ''));

    return [...objects].sort((a, b) => {
        let cmp = 0;
        if (musicR2Sort.key === 'size') {
            cmp = (Number(a?.size) || 0) - (Number(b?.size) || 0);
        } else if (musicR2Sort.key === 'alpha') {
            cmp = byTitle(a, b);
        } else {
            cmp = (Date.parse(a?.lastModified || '') || 0) - (Date.parse(b?.lastModified || '') || 0);
        }
        if (cmp === 0) cmp = byTitle(a, b) || byKey(a, b);
        return cmp * direction;
    });
}

function updateMusicR2SortButtons() {
    document.querySelectorAll('[data-music-r2-sort]').forEach((btn) => {
        const key = btn.getAttribute('data-music-r2-sort');
        const isActive = key === musicR2Sort.key;
        const icon = btn.querySelector('[data-music-r2-sort-icon]');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        btn.style.borderColor = isActive ? 'rgba(0,245,212,0.35)' : 'var(--border)';
        btn.style.backgroundColor = isActive ? 'rgba(0,245,212,0.08)' : 'transparent';
        btn.style.color = isActive ? 'var(--primary)' : 'var(--muted-foreground)';
        if (icon) {
            icon.textContent = isActive
                ? musicR2Sort.direction === 'asc'
                    ? 'north'
                    : 'south'
                : 'unfold_more';
        }
    });
}

function renderMusicR2Rows(objects) {
    const tbody = document.getElementById('music-r2-tbody');
    if (!tbody) return;
    const filteredObjects = filterMusicR2Objects(objects);
    const statusEl = document.getElementById('music-r2-status');
    if (statusEl && musicR2Filter) {
        statusEl.textContent = `${filteredObjects.length} result(s) for "${musicR2Filter}" · ${objects.length} total object(s)`;
    } else if (statusEl && !musicR2Filter && objects.length) {
        statusEl.textContent = `${objects.length} object(s)`;
    }
    if (!objects.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-sm" style="color: var(--muted-foreground);">No objects found in the configured R2 prefix.</td></tr>`;
        updateMusicR2SelectionUi();
        return;
    }
    if (!filteredObjects.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-sm" style="color: var(--muted-foreground);">No songs match "${escapeHtml(musicR2Filter)}".</td></tr>`;
        updateMusicR2SelectionUi();
        return;
    }

    const act =
        'music-r2-act inline-flex items-center justify-center rounded-md border transition-colors';

    tbody.innerHTML = sortMusicR2Objects(filteredObjects)
        .map((o) => {
            const key = o.key || '';
            const keyEnc = encodeURIComponent(key);
            const meta = o.metadata || {};
            const displayTitle = getMusicR2DisplayTitle(o);
            const displayArtist = (meta.artist || '').trim();
            const metaJsonEnc = encodeURIComponent(JSON.stringify({
                title: meta.title || '',
                artist: meta.artist || '',
                album: meta.album || '',
            }));
            const pub = o.publicUrl
                ? `<button type="button" title="Public URL" data-music-r2-action="public" data-public-url="${encodeURIComponent(o.publicUrl)}" data-key="${keyEnc}" class="${act}" style="border-color: var(--border); background-color: rgba(255,255,255,0.04); color: var(--foreground);"><span class="material-symbols-outlined text-[17px]">public</span></button>`
                : '';
            const rowChecked = musicR2SelectedKeys.has(key);
            const ariaSel = escapeHtml(displayTitle).replace(/"/g, '&quot;');
            return `
            <tr class="border-b transition-colors hover:bg-white/[0.02]" style="border-color: var(--border);">
                <td class="w-11 px-3 py-4 align-middle">
                    <input type="checkbox" data-music-r2-row-checkbox class="h-4 w-4 rounded border" style="border-color: var(--border); accent-color: var(--primary);" data-key="${keyEnc}" ${rowChecked ? 'checked' : ''} aria-label="Select ${ariaSel}">
                </td>
                <td class="max-w-[min(380px,44vw)] px-5 py-4 align-top">
                    <div class="text-sm font-semibold leading-snug line-clamp-2" title="${escapeHtml(displayTitle)}" style="color: var(--foreground);">${escapeHtml(displayTitle)}</div>
                    <div class="mt-1 line-clamp-1 text-xs" style="color: var(--muted-foreground);" title="${escapeHtml(displayArtist || '—')}">${escapeHtml(displayArtist || '—')}</div>
                </td>
                <td class="max-w-[14rem] px-5 py-4 align-top text-sm"><span class="line-clamp-2 text-[13px]" title="${escapeHtml(meta.album || '')}" style="color: var(--muted-foreground);">${escapeHtml(meta.album || '—')}</span></td>
                <td class="w-24 whitespace-nowrap px-5 py-4 align-top text-xs tabular-nums" style="color: var(--muted-foreground);">${escapeHtml(formatBytes(o.size))}</td>
                <td class="px-5 py-4 align-middle text-right">
                    <div class="music-r2-actions">
                        <button type="button" title="Play" data-music-r2-action="play" data-key="${keyEnc}" class="${act}" style="border-color: rgba(0,245,212,0.22); background-color: rgba(0,245,212,0.06); color: var(--primary);"><span class="material-symbols-outlined text-[17px]">play_circle</span></button>
                        <button type="button" title="Copy presigned link" data-music-r2-action="presign" data-key="${keyEnc}" class="${act}" style="border-color: var(--border); background-color: rgba(255,255,255,0.03); color: var(--muted-foreground);"><span class="material-symbols-outlined text-[17px]">link</span></button>
                        ${pub}
                        <button type="button" title="Edit metadata" data-music-r2-action="edit" data-key="${keyEnc}" data-meta-json="${metaJsonEnc}" class="${act}" style="border-color: var(--border); background-color: rgba(255,255,255,0.03); color: var(--foreground);"><span class="material-symbols-outlined text-[17px]">edit</span></button>
                        <button type="button" title="Delete object" data-music-r2-action="delete" data-key="${keyEnc}" class="${act}" style="border-color: rgba(239,68,68,0.28); background-color: rgba(239,68,68,0.06); color: #f87171;"><span class="material-symbols-outlined text-[17px]">delete</span></button>
                    </div>
                </td>
            </tr>`;
        })
        .join('');
    updateMusicR2SelectionUi();
}

function formatBytes(n) {
    const x = Number(n);
    if (!Number.isFinite(x) || x < 0) return '—';
    if (x < 1024) return `${x} B`;
    const kb = x / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

async function refreshMusicStats() {
    const base = getMusicApiBase();
    try {
        const res = await fetch(`${base}/api/music/stats`);
        const stats = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(stats.error || stats.message || `Stats failed (${res.status})`);
        musicStatsLoaded = true;
        musicStatsData = stats;
        renderMusicStats(stats);
    } catch (err) {
        showToast('Music stats failed', normalizeMusicFetchError(err, base), 'destructive');
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatMusicCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function getMusicStatsRangeLabel(range = musicStatsRange) {
    if (range === '24h') return 'Last 24h';
    if (range === 'week') return 'Last 7 days';
    if (range === 'month') return 'Last 30 days';
    if (range === 'year') return 'Last year';
    return 'All time';
}

function getMusicRangeMetric(metric, range = musicStatsRange) {
    if (!metric || typeof metric !== 'object') return 0;
    if (range === '24h') return Number(metric.last24h ?? metric.today ?? 0) || 0;
    if (range === 'week') return Number(metric.week ?? 0) || 0;
    if (range === 'month') return Number(metric.month ?? 0) || 0;
    if (range === 'year') return Number(metric.year ?? metric.allTime ?? 0) || 0;
    return Number(metric.allTime ?? 0) || 0;
}

function formatMusicStatsUpdatedAt(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return 'Stats loaded.';
    return `Updated ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatMusicSearchTime(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return 'Unknown time';
    return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function renderMusicRecentSearches(items) {
    const el = document.getElementById('music-recent-searches');
    if (!el) return;
    if (!items.length) {
        el.innerHTML = `<p class="text-xs" style="color: var(--muted-foreground);">No searches recorded yet.</p>`;
        return;
    }
    el.innerHTML = items
        .map((item) => {
            const mode = item.mode === 'artist' ? 'Artist search' : 'Song search';
            const icon = item.mode === 'artist' ? 'person_search' : 'music_note';
            const artistHint = Array.isArray(item.artists) && item.artists.length
                ? `<p class="mt-1 truncate text-[11px]" title="${escapeHtml(item.artists.join(', '))}" style="color: var(--muted-foreground);">Artists: ${escapeHtml(item.artists.join(', '))}</p>`
                : '';
            return `
                <div class="rounded-xl border px-3 py-2.5" style="border-color: var(--border); background-color: rgba(255,255,255,0.025);">
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex min-w-0 gap-2">
                            <span class="material-symbols-outlined mt-0.5 text-[16px] text-teal-400">${icon}</span>
                            <div class="min-w-0">
                                <p class="truncate font-semibold" title="${escapeHtml(item.query || '')}" style="color: var(--foreground);">${escapeHtml(item.query || 'Unknown search')}</p>
                                <p class="mt-1 text-[11px]" style="color: var(--muted-foreground);">${escapeHtml(mode)} · ${formatMusicCount(item.resultCount || 0)} result(s)</p>
                                ${artistHint}
                            </div>
                        </div>
                        <span class="shrink-0 text-[11px] tabular-nums" style="color: var(--muted-foreground);">${escapeHtml(formatMusicSearchTime(item.at))}</span>
                    </div>
                </div>`;
        })
        .join('');
}

function openMusicSearchesModal() {
    const modal = document.getElementById('music-searches-modal');
    if (!modal) return;
    if (!musicStatsData) {
        showToast('Search stats loading', 'Open Analytics after stats finish loading, then try again.', 'default');
        return;
    }

    const charts = musicStatsData.charts || {};
    setText('music-searches-modal-subtitle', `${formatMusicCount(getMusicRangeMetric(musicStatsData.totals?.searches || {}))} searches in ${getMusicStatsRangeLabel().toLowerCase()} · ${formatMusicCount(musicStatsData.totals?.searches?.allTime || 0)} all time`);
    renderMusicRecentSearches(charts.recentSearches || []);
    renderMusicRankList('music-top-searched-songs-modal', charts.topSearchedSongs || [], 'searches');
    renderMusicRankList('music-top-searched-artists-modal', charts.mostSearchedArtists || [], 'searches');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeMusicSearchesModal() {
    const modal = document.getElementById('music-searches-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function renderMusicStats(stats) {
    const totals = stats.totals || {};
    const installs = totals.installs || {};
    const installedBytes = totals.installedBytes || {};
    const plays = totals.plays || {};
    const searches = totals.searches || {};
    const charts = stats.charts || {};
    const rangeLabel = getMusicStatsRangeLabel();
    const trackCount = Number(totals.tracks) || 0;
    const totalBytes = Number(totals.totalBytes) || 0;
    const avgBytes = trackCount > 0 ? totalBytes / trackCount : 0;
    const topStorage = charts.storageByArtist?.[0];
    const topPlayed = charts.topPlayedSongs?.[0];

    setText('music-stats-refreshed', `${formatMusicStatsUpdatedAt(stats.generatedAt)} Showing ${rangeLabel.toLowerCase()}.`);
    setText('music-stat-tracks', formatMusicCount(trackCount));
    setText('music-stat-tracks-sub', 'Total files in R2');
    setText('music-stat-storage', formatBytes(totalBytes));
    setText('music-stat-storage-sub', `${formatBytes(avgBytes)} avg per track`);
    setText('music-header-tracks', formatMusicCount(trackCount));
    setText('music-header-storage', formatBytes(totalBytes));
    setText('music-stat-installed-value', formatMusicCount(getMusicRangeMetric(installs)));
    setText('music-stat-installed-sub', `${rangeLabel} · ${formatMusicCount(installs.allTime || 0)} all time`);
    setText('music-stat-installed-bytes', formatBytes(getMusicRangeMetric(installedBytes)));
    setText('music-stat-installed-bytes-sub', `${rangeLabel} · ${formatBytes(installedBytes.allTime || 0)} all time`);
    setText('music-stat-plays-value', formatMusicCount(getMusicRangeMetric(plays)));
    setText('music-stat-plays-sub', `${rangeLabel} · ${formatMusicCount(plays.allTime || 0)} all time`);
    setText('music-stat-searches-value', formatMusicCount(getMusicRangeMetric(searches)));
    setText('music-stat-searches-sub', `${rangeLabel} · ${formatMusicCount(searches.allTime || 0)} all time`);
    setText('music-stat-reuse-count', `${formatMusicCount(totals.reuses || 0)} avoided downloads`);
    setText('music-stat-avg-size', trackCount ? formatBytes(avgBytes) : 'No tracks yet');
    setText('music-stat-top-storage', topStorage ? `${topStorage.label} · ${formatBytes(topStorage.value)}` : 'No storage data');
    setText('music-stat-top-played-summary', topPlayed ? `${topPlayed.label} · ${formatMusicCount(topPlayed.value)} plays` : 'No play data');

    updateMusicStatsRangeButtons();
    renderMusicStatsCharts(charts);
    renderMusicStorageArtistList(charts.storageByArtist || []);
    renderMusicRankList('music-top-played', charts.topPlayedSongs || [], 'plays');
    renderMusicRankList('music-top-searched', charts.mostSearchedArtists || [], 'searches');
}

function chartColor(index) {
    const palette = ['#00f5d4', '#22d3ee', '#818cf8', '#c084fc', '#f87171', '#fbbf24', '#34d399', '#fb7185'];
    return palette[index % palette.length];
}

function getMusicDailySeriesStart(range = musicStatsRange) {
    if (range === 'allTime') return 0;
    const days = range === '24h' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : 365;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d.getTime();
}

function filterMusicDailySeries(items, range = musicStatsRange) {
    const start = getMusicDailySeriesStart(range);
    return (items || [])
        .filter((item) => {
            if (!start) return true;
            const t = Date.parse(item.label);
            return Number.isFinite(t) && t >= start;
        })
        .sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

function mergeMusicDailyLabels(...series) {
    return [...new Set(series.flat().map((item) => item.label))]
        .sort((a, b) => String(a).localeCompare(String(b)));
}

function mapMusicDailyValues(items, labels) {
    const map = new Map((items || []).map((item) => [item.label, Number(item.value) || 0]));
    return labels.map((label) => map.get(label) || 0);
}

function renderMusicActivityChart(installs, plays) {
    const canvas = document.getElementById('music-activity-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (musicStatsCharts['music-activity-chart']) musicStatsCharts['music-activity-chart'].destroy();

    const labels = mergeMusicDailyLabels(installs, plays);
    const installValues = mapMusicDailyValues(installs, labels);
    const playValues = mapMusicDailyValues(plays, labels);
    const ctx = canvas.getContext('2d');
    const installGradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 260);
    installGradient.addColorStop(0, 'rgba(0,245,212,0.22)');
    installGradient.addColorStop(1, 'rgba(0,245,212,0)');
    const playGradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 260);
    playGradient.addColorStop(0, 'rgba(34,211,238,0.18)');
    playGradient.addColorStop(1, 'rgba(34,211,238,0)');

    musicStatsCharts['music-activity-chart'] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Installs',
                    data: installValues,
                    borderColor: chartColor(0),
                    backgroundColor: installGradient,
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                },
                {
                    label: 'Listens',
                    data: playValues,
                    borderColor: chartColor(1),
                    backgroundColor: playGradient,
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: { color: '#a1a1aa', usePointStyle: true, boxWidth: 8, font: { size: 11 } },
                },
                tooltip: {
                    backgroundColor: 'rgba(24, 24, 27, 0.92)',
                    titleColor: '#e5e2e1',
                    bodyColor: '#e5e2e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                },
            },
            scales: {
                x: {
                    ticks: { color: '#71717a', maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 10 } },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#71717a', precision: 0, maxTicksLimit: 6, font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    border: { display: false },
                },
            },
        },
    });
}

function renderMusicChart(id, type, labels, values, label) {
    const canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined') return;
    if (musicStatsCharts[id]) musicStatsCharts[id].destroy();

    const ctx = canvas.getContext('2d');
    let bg = type === 'pie' || type === 'doughnut'
        ? values.map((_, i) => chartColor(i))
        : 'rgba(0,245,212,0.18)';

    if (type === 'line') {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight);
        gradient.addColorStop(0, 'rgba(0,245,212,0.3)');
        gradient.addColorStop(1, 'rgba(0,245,212,0.0)');
        bg = gradient;
    } else if (type === 'bar') {
        bg = chartColor(0);
    }

    musicStatsCharts[id] = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                borderColor: type === 'pie' || type === 'doughnut' ? 'transparent' : chartColor(0),
                backgroundColor: bg,
                tension: 0.4,
                fill: type === 'line',
                borderRadius: type === 'bar' ? 4 : 0,
                borderWidth: type === 'bar' ? 0 : 2,
                pointBackgroundColor: chartColor(0),
                pointBorderColor: '#fff',
                pointRadius: type === 'line' ? 3 : 0,
                pointHoverRadius: 5,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: type === 'pie' || type === 'doughnut',
                    position: 'right',
                    labels: { color: '#a1a1aa', usePointStyle: true, padding: 20, font: { size: 11 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(24, 24, 27, 0.9)',
                    titleColor: '#e5e2e1',
                    bodyColor: '#e5e2e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false,
                }
            },
            scales: type === 'pie' || type === 'doughnut' ? {} : {
                x: {
                    ticks: { color: '#71717a', maxRotation: 0, font: { size: 10 } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#71717a', maxTicksLimit: 6, font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.04)', borderDash: [4, 4] },
                    border: { display: false }
                },
            },
        },
    });
}

function renderMusicStatsCharts(charts) {
    const installs = filterMusicDailySeries(charts.installsByDay || []);
    const plays = filterMusicDailySeries(charts.playsByDay || []);
    const storage = charts.storageByArtist || [];
    setText('music-activity-chart-subtitle', `Daily installs and listens for ${getMusicStatsRangeLabel().toLowerCase()}.`);
    renderMusicActivityChart(installs, plays);
    renderMusicChart('music-storage-chart', 'doughnut', storage.map((x) => x.label), storage.map((x) => x.value), 'Storage');
}

function renderMusicStorageArtistList(items) {
    const el = document.getElementById('music-storage-artist-list');
    if (!el) return;
    if (!items.length) {
        el.innerHTML = `<p class="text-xs" style="color: var(--muted-foreground);">No storage data yet.</p>`;
        return;
    }
    const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
    el.innerHTML = items
        .map((item, idx) => {
            const value = Number(item.value) || 0;
            const pct = Math.max(3, Math.round((value / max) * 100));
            return `
                <div class="space-y-1">
                    <div class="flex items-center justify-between gap-3">
                        <span class="min-w-0 truncate" title="${escapeHtml(item.label)}" style="color: var(--foreground);">${idx + 1}. ${escapeHtml(item.label)}</span>
                        <span class="shrink-0 tabular-nums" style="color: var(--muted-foreground);">${formatBytes(value)}</span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full" style="background-color: rgba(255,255,255,0.08);">
                        <div class="h-full rounded-full" style="width: ${pct}%; background-color: ${chartColor(idx)};"></div>
                    </div>
                </div>`;
        })
        .join('');
}

function renderMusicRankList(id, items, unit) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!items.length) {
        el.innerHTML = `<p class="text-xs" style="color: var(--muted-foreground);">No data yet.</p>`;
        return;
    }
    el.innerHTML = items
        .map((item, idx) => `
            <div class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5" style="border-color: var(--border); background-color: rgba(255,255,255,0.025);">
                <span class="flex min-w-0 items-center gap-2">
                    <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold" style="background-color: rgba(0,245,212,0.1); color: var(--primary);">${idx + 1}</span>
                    <span class="min-w-0 truncate" title="${escapeHtml(item.label)}" style="color: var(--foreground);">${escapeHtml(item.label)}</span>
                </span>
                <span class="shrink-0 text-xs tabular-nums" style="color: var(--muted-foreground);">${formatMusicCount(item.value)} ${unit}</span>
            </div>
        `)
        .join('');
}

async function openMusicPresigned(base, key, shouldPlay) {
    try {
        const eventParam = shouldPlay ? '&event=play' : '';
        const res = await fetch(`${base}/api/storage/music/presign?key=${encodeURIComponent(key)}&expiresIn=3600${eventParam}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Presign failed');
        if (!data.url) throw new Error('No URL returned');

        if (shouldPlay) {
            await playMusicUrl(data.url, key);
            showToast('Playing from R2', key, 'success');
        } else {
            window.open(data.url, '_blank', 'noopener,noreferrer');
            showToast('Temporary link opened', 'Presigned URL expires in about one hour.', 'default');
        }
    } catch (err) {
        showToast('Presign failed', normalizeMusicFetchError(err, base), 'destructive');
    }
}

function openMusicR2MetaModal(key, meta) {
    musicR2EditingKey = key;
    const modal = document.getElementById('musicR2MetaModal');
    const keyEl = document.getElementById('music-r2-meta-key');
    const titleEl = document.getElementById('music-r2-meta-title');
    const artistEl = document.getElementById('music-r2-meta-artist');
    const albumEl = document.getElementById('music-r2-meta-album');
    if (keyEl) keyEl.textContent = key;
    if (titleEl) titleEl.value = meta.title || '';
    if (artistEl) artistEl.value = meta.artist || '';
    if (albumEl) albumEl.value = meta.album || '';
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeMusicR2MetaModal() {
    musicR2EditingKey = null;
    const modal = document.getElementById('musicR2MetaModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function saveMusicR2Metadata(base) {
    if (!musicR2EditingKey) return;
    const keySaved = musicR2EditingKey;
    const titleEl = document.getElementById('music-r2-meta-title');
    const artistEl = document.getElementById('music-r2-meta-artist');
    const albumEl = document.getElementById('music-r2-meta-album');
    const title = titleEl ? titleEl.value : '';
    const artist = artistEl ? artistEl.value : '';
    const album = albumEl ? albumEl.value : '';

    try {
        const res = await fetch(`${base}/api/storage/music/metadata`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: keySaved, title, artist, album }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Save failed');
        closeMusicR2MetaModal();
        showToast('Metadata saved', keySaved, 'success');
        refreshMusicR2Library();
    } catch (err) {
        showToast('Save failed', normalizeMusicFetchError(err, base), 'destructive');
    }
}

async function deleteMusicR2Object(base, key) {
    if (!confirm(`Delete this object from R2?\n\n${key}`)) return;
    try {
        const res = await fetch(`${base}/api/storage/music/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Delete failed');
        musicR2SelectedKeys.delete(key);
        showToast('Deleted from R2', key, 'success');
        refreshMusicR2Library();
    } catch (err) {
        showToast('Delete failed', normalizeMusicFetchError(err, base), 'destructive');
    }
}

async function bulkDeleteMusicR2Selected(base) {
    const keys = [...musicR2SelectedKeys];
    if (!keys.length) return;
    if (
        !confirm(
            `Delete ${keys.length} object(s) from R2? This cannot be undone.\n\nObjects are removed permanently from storage.`,
        )
    ) {
        return;
    }
    const bulkBtn = document.getElementById('music-r2-bulk-delete');
    if (bulkBtn) bulkBtn.disabled = true;
    let ok = 0;
    /** @type {{ key: string, message: string }[]} */
    const failures = [];
    for (const key of keys) {
        try {
            const res = await fetch(`${base}/api/storage/music/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || 'Delete failed');
            ok += 1;
            musicR2SelectedKeys.delete(key);
        } catch (err) {
            failures.push({ key, message: err instanceof Error ? err.message : String(err) });
        }
    }
    updateMusicR2BulkDeleteButton();
    if (ok && !failures.length) {
        showToast(`Deleted ${ok} object(s)`, 'Removed from R2.', 'success');
    } else if (ok && failures.length) {
        showToast(
            `Deleted ${ok}, ${failures.length} failed`,
            failures.map((f) => f.key).join(', ').slice(0, 120),
            'destructive',
        );
    } else if (!ok && failures.length) {
        showToast('Bulk delete failed', failures[0].message, 'destructive');
    }
    await refreshMusicR2Library();
}

function getMusicTrackPopularityValue(track) {
    if (typeof track?.popularity === 'number') return track.popularity;
    if (typeof track?.spotifyPopularity === 'number') return track.spotifyPopularity;
    return null;
}

function getPrimaryMusicArtistName(track) {
    return String(track?.artists || '')
        .split(',')
        .map((artist) => artist.trim())
        .filter(Boolean)[0] || '';
}

async function fetchMusicSearchArtistId(base, artistName) {
    const key = artistName.trim().toLowerCase();
    if (!key) return '';
    if (musicSearchArtistIdByName.has(key)) return musicSearchArtistIdByName.get(key);

    const res = await fetch(`${base}/api/spotify/artists?q=${encodeURIComponent(artistName)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `Spotify artist lookup failed (${res.status})`);

    const artists = Array.isArray(data.artists) ? data.artists : [];
    const exact = artists.find((artist) => String(artist.name || '').trim().toLowerCase() === key);
    const artistId = String((exact || artists[0] || {}).id || '');
    musicSearchArtistIdByName.set(key, artistId);
    return artistId;
}

async function fetchMusicSearchArtistPopularityMap(base, artistId) {
    if (!artistId) return new Map();
    if (musicSearchArtistPopularityById.has(artistId)) return musicSearchArtistPopularityById.get(artistId);

    const params = new URLSearchParams({
        artistId,
        includeGroups: 'album,single',
    });
    const res = await fetch(`${base}/api/music/artist-sync/plan?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `Artist catalog lookup failed (${res.status})`);

    const popularityMap = new Map();
    for (const track of Array.isArray(data.tracks) ? data.tracks : []) {
        const id = String(track.id || '').trim();
        const popularity = getMusicTrackPopularityValue(track);
        if (id && typeof popularity === 'number') popularityMap.set(id, popularity);
    }
    musicSearchArtistPopularityById.set(artistId, popularityMap);
    return popularityMap;
}

async function hydrateMusicSearchPopularity(tracks, base) {
    const missingTracks = tracks.filter((track) => {
        const id = String(track.id || '').trim();
        if (!id) return false;
        if (musicSearchPopularityByTrackId.has(id)) {
            track.popularity = musicSearchPopularityByTrackId.get(id);
            return false;
        }
        return typeof getMusicTrackPopularityValue(track) !== 'number';
    });

    if (!missingTracks.length) return tracks;

    const artistNames = [...new Set(missingTracks.map(getPrimaryMusicArtistName).filter(Boolean))].slice(0, 2);
    for (const artistName of artistNames) {
        try {
            const artistId = await fetchMusicSearchArtistId(base, artistName);
            const popularityMap = await fetchMusicSearchArtistPopularityMap(base, artistId);
            let matchedCount = 0;
            for (const track of missingTracks) {
                const id = String(track.id || '').trim();
                if (id && popularityMap.has(id)) {
                    const popularity = popularityMap.get(id);
                    track.popularity = popularity;
                    musicSearchPopularityByTrackId.set(id, popularity);
                    matchedCount += 1;
                }
            }
            if (matchedCount > 0) break;
        } catch (err) {
            console.warn('Search popularity fallback failed', artistName, err);
        }
    }

    return tracks;
}

async function fetchSpotifyTracks(query) {
    const base = getMusicApiBase();
    const res = await fetch(`${base}/api/spotify/search?q=${encodeURIComponent(query)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.message || `Spotify search failed (${res.status})`);
    }
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    return hydrateMusicSearchPopularity(tracks, base);
}

async function requestMusicIngest(base, track, wantPlaybackUrl) {
    const res = await fetch(`${base}/api/music/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            track,
            wantPlaybackUrl,
        }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(payload.error || payload.message || `Ingest failed (${res.status})`);
    }
    return payload;
}

function renderMusicSpotifyResults(tracks, container) {
    if (!tracks.length) {
        container.innerHTML = `<div class="rounded-xl border border-dashed px-6 py-12 text-center text-sm" style="border-color: var(--border); color: var(--muted-foreground);">No tracks match that search.</div>`;
        return;
    }

    const btn =
        'inline-flex flex-1 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors sm:flex-initial';

    container.innerHTML = tracks
        .map((track) => {
            const img = track.albumArt
                ? `<img src="${escapeHtml(track.albumArt)}" alt="" class="h-14 w-14 flex-shrink-0 rounded-xl object-cover shadow-md">`
                : `<div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border" style="border-color: var(--border); background-color: rgba(0,0,0,0.25);"><span class="material-symbols-outlined text-[26px]" style="color: var(--muted-foreground); opacity: 0.65;">album</span></div>`;
            const trackJson = encodeURIComponent(JSON.stringify(track));
            const spotifyLink = track.spotifyUrl
                ? `<a href="${escapeHtml(track.spotifyUrl)}" target="_blank" rel="noreferrer" title="Open in Spotify" class="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border transition-opacity hover:opacity-90" style="border-color: var(--border); background-color: rgba(255,255,255,0.04); color: var(--foreground);"><span class="material-symbols-outlined text-[20px]">open_in_new</span></a>`
                : '';
            const rawPopularity = getMusicTrackPopularityValue(track);
            const popularity =
                typeof rawPopularity === 'number'
                    ? `${Math.max(0, Math.min(100, Math.round(rawPopularity)))}/100`
                    : '—';

            return `
            <div class="rounded-xl border p-4 transition-colors hover:bg-white/[0.02]" style="border-color: var(--border); background-color: rgba(255,255,255,0.02);">
                <div class="flex gap-4 items-start">
                    ${img}
                    <div class="min-w-0 flex-1">
                        <div class="flex items-start justify-between gap-3">
                            <p class="min-w-0 text-[15px] font-semibold leading-snug line-clamp-2" style="color: var(--foreground);">${escapeHtml(track.name)}</p>
                            <span class="shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold tabular-nums" title="Spotify popularity score" style="border-color: rgba(0,245,212,0.3); background-color: rgba(0,245,212,0.08); color: var(--primary);">${escapeHtml(popularity)}</span>
                        </div>
                        <p class="mt-1 text-xs leading-snug line-clamp-2" style="color: var(--muted-foreground);">${escapeHtml(track.artists)}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</p>
                        <p class="mt-2 text-[11px] font-medium uppercase tracking-wide" style="color: var(--muted-foreground);">Popularity ${escapeHtml(popularity)}</p>
                        <div class="mt-4 flex flex-wrap items-stretch gap-2">
                            ${spotifyLink}
                            <button type="button" data-music-track-action="download" data-track="${trackJson}" class="${btn} border" style="border-color: var(--border); background-color: var(--secondary); color: var(--secondary-foreground);"><span class="material-symbols-outlined text-[17px]">download</span>Save</button>
                            <button type="button" data-music-track-action="play" data-track="${trackJson}" class="${btn} border" style="border-color: rgba(0,245,212,0.35); background-color: rgba(0,245,212,0.1); color: var(--primary);"><span class="material-symbols-outlined text-[17px]">play_arrow</span>Play</button>
                        </div>
                    </div>
                </div>
            </div>`;
        })
        .join('');

    container.querySelectorAll('[data-music-track-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            let track = null;
            try {
                track = JSON.parse(decodeURIComponent(btn.getAttribute('data-track') || ''));
            } catch {
                track = null;
            }
            if (!track) return;
            ingestSpotifyTrack(track, btn.getAttribute('data-music-track-action'));
        });
    });
}

function normalizeMusicFetchError(err, base) {
    const message = err?.message ? String(err.message) : String(err);
    if (message === 'Failed to fetch' || /fetch/i.test(message) && /failed/i.test(message)) {
        return `Could not reach the music API at ${base}. Start the local service or deploy it on Railway.`;
    }
    return message;
}

function initVideoUploadPage() {
    const fileInput = document.getElementById('video-file-input');
    const dropZone = document.getElementById('video-drop-zone');

    if (!fileInput || !dropZone) return;

    fileInput.addEventListener('change', () => {
        renderVideoSelectedFiles(Array.from(fileInput.files || []));
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', (event) => {
        const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
            file.type.startsWith('video/') || /\.mkv$/i.test(file.name)
        );
        renderVideoSelectedFiles(files);
    });
}

function renderVideoSelectedFiles(files) {
    const container = document.getElementById('video-selected-files');
    if (!container) return;

    if (!files.length) {
        container.innerHTML = '<div class="video-empty-row">No files selected yet.</div>';
        return;
    }

    container.innerHTML = files.map((file) => `
        <div class="video-file-row">
            <div>
                <strong>${escapeHtml(file.name)}</strong>
                <small>${escapeHtml(formatBytes(file.size || 0))} · ready to stage</small>
            </div>
            <span>Selected</span>
        </div>
    `).join('');
}

function stageVideoUpload() {
    const queue = document.getElementById('video-upload-queue');
    const titleInput = document.getElementById('video-title-input');
    const typeInput = document.getElementById('video-type-input');
    const countEl = document.getElementById('video-queue-count');
    const selectedRows = document.querySelectorAll('#video-selected-files .video-file-row');

    if (!queue) return;

    const title = titleInput?.value?.trim() || 'Untitled video';
    const type = typeInput?.value || 'Video';
    const fileLabel = selectedRows.length ? `${selectedRows.length} file${selectedRows.length === 1 ? '' : 's'}` : 'metadata only';

    queue.insertAdjacentHTML('afterbegin', `
        <div class="video-queue-row review">
            <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(type)} · ${escapeHtml(fileLabel)} · waiting for review</small></div>
            <span>Staged</span>
        </div>
    `);

    if (countEl) {
        const current = Number.parseInt(countEl.textContent || '0', 10);
        countEl.textContent = String(Number.isFinite(current) ? current + 1 : 1);
    }

    showToast('Video Upload', `${title} staged for upload review`, 'default');
}

function clearVideoUploadQueue() {
    document.querySelectorAll('#video-upload-queue .video-queue-row.done').forEach((row) => row.remove());
    showToast('Video Upload', 'Completed upload rows cleared', 'default');
}

function isMusicIngestLocalFallbackCandidate(message) {
    const s = String(message || '');
    return /sign in to confirm you('| a)re not a bot/i.test(s) ||
        /cookies-from-browser/i.test(s) ||
        /yt-dlp/i.test(s) ||
        /ENOENT/i.test(s);
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
