// Dashboard Logic for Mokpokpo
const API_URL = 'https://bd-mokpokokpo.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) {
        console.warn('No token found, redirecting to login');
        // alert('Vous devez vous connecter pour accéder à cette page.'); // Opional alert
        window.location.href = 'login.html';
        return;
    }

    console.log('Token found, initializing dashboard...');

    // Initialize dashboard
    initDashboard();
});

async function initDashboard() {
    try {
        const user = await loadUserInfo();
        if (user) {
            await loadDashboardStats(user);
            // loadOrders is called within loadDashboardStats or separately
            loadCart(); 
            initSectionNavigation();
            
            // Listen for cart changes from other tabs/windows
            window.addEventListener('storage', (e) => {
                if (e.key === 'cart') {
                    loadCart();
                    updateDashboardCartCount();
                }
            });
        }
    } catch (error) {
        console.error('Dashboard initialization error:', error);
    }
}

// Load User Info from API
async function loadUserInfo() {
    try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        
        const response = await fetch(`${API_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const user = await response.json();
            console.log('User info loaded:', user.email);
            
            // Update user display
            const dashboardUserName = document.getElementById('dashboardUserName');
            const dashboardUserEmail = document.getElementById('dashboardUserEmail');
            const userNameDisplay = document.getElementById('userNameDisplay');
            
            const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim() || 'Client';

            if (dashboardUserName) dashboardUserName.textContent = fullName;
            if (dashboardUserEmail) dashboardUserEmail.textContent = user.email || '';
            if (userNameDisplay) userNameDisplay.textContent = fullName;
            
            // Update profile form
            const profileFirstName = document.getElementById('profileFirstName');
            const profileLastName = document.getElementById('profileLastName');
            const profileEmail = document.getElementById('profileEmail');
            const profileRole = document.getElementById('profileRole');
            
            if (profileFirstName) profileFirstName.value = user.prenom || '';
            if (profileLastName) profileLastName.value = user.nom || '';
            if (profileEmail) profileEmail.value = user.email || '';
            if (profileRole) profileRole.value = user.role || 'CLIENT';
            
            // Store user data
            localStorage.setItem('currentUser', JSON.stringify(user));
            return user;
        } else {
            console.error('Failed to load user info, status:', response.status);
            if (response.status === 401) {
                logout();
            }
        }
    } catch (error) {
        console.error('Error loading user info:', error);
        // Fallback to cached user
        const cachedUser = JSON.parse(localStorage.getItem('currentUser'));
        if (cachedUser) return cachedUser;
    }
    return null;
}

// Load Dashboard Stats & Orders from API
async function loadDashboardStats(user) {
    try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        
        // Fetch User's Orders from API
        // Using /commandes/ endpoint
        const response = await fetch(`${API_URL}/commandes/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const allOrders = await response.json();
            
            // Filter orders belonging to this user
            // We check against user.id_utilisateur (which should be the ID from /auth/me)
            // The order object likely has 'client_id' or 'id_client' or 'id_utilisateur'
            // If the API filters server-side for clients, this might be redundant but safe if IDs match
            // However, if CommandeRead doesn't return id_utilisateur, we can't filter client-side.
            // Assuming server filters for CLIENT role.
            
            let myOrders = allOrders;
            
            // Only filter client-side if we have the necessary ID fields
            // and if we are not relying on server-side filtering (e.g. for admins viewing their own orders?)
            // For now, let's assume the server returns what we need. 
            // BUT: previous logic was trying to filter. 
            
            if (user.role !== 'CLIENT') {
                 // For non-clients (e.g. admin testing), maybe we want to see all orders?
                 // Or maybe admins also place orders?
                 // The dashboard UI says "Mes Commandes".
                 // If I am admin, I see all orders in /commandes/.
                 // Do I want to see ALL orders in "Mes Commandes"? probably not.
                 // But let's stick to fixing the client flow first.
            }

            // Fix for Client flow:
            // Since we modified the backend to filter for clients, 'allOrders' contains only my orders.
            // We don't need to filter again, especially if id_utilisateur is missing from response.
            // HOWEVER, we need to be careful if we are admin.
            
            if (user.role === 'CLIENT') {
                myOrders = allOrders;
            } else {
                 // Try to filter if possible, otherwise show all (or none?)
                 // If CommandeRead doesn't have id_utilisateur, we can't filter.
                 // Let's assume for admin we show all for now or fix CommandeRead.
                 // Let's fix CommandeRead in backend first to be clean.
                 myOrders = allOrders;
            }

            // Original code had:
            /*
            const myOrders = allOrders.filter(order => {
                const orderClientId = order.client_id || order.id_client || order.utilisateur_id;
                return orderClientId === user.id;
            });
            */
            
            console.log(`Found ${myOrders.length} orders for user`); 

            // Stats
            const totalOrders = myOrders.length;
            const totalSpent = myOrders.reduce((sum, order) => sum + (order.montant_total || order.total || 0), 0);

            // Update Stats UI
            const totalOrdersEl = document.getElementById('totalOrders');
            if(totalOrdersEl) totalOrdersEl.textContent = totalOrders;
            
            const totalSpentEl = document.getElementById('totalSpent');
            if(totalSpentEl) totalSpentEl.textContent = totalSpent.toLocaleString('fr-FR'); // Format currency

            // Recent Orders (Top 5)
            // Sort by date descending
            const recentOrders = [...myOrders].sort((a, b) => {
                const dateA = new Date(a.date_commande || a.date_creation || 0);
                const dateB = new Date(b.date_commande || b.date_creation || 0);
                return dateB - dateA;
            }).slice(0, 5);
            
            renderOrdersTable(recentOrders, 'recentOrdersList');
            
            // Store for full history view
            window.myOrdersData = myOrders; 
            
            // If we are currently on the orders tab, render full history immediately
            const historyContainer = document.getElementById('ordersHistoryList');
            if (historyContainer && !historyContainer.closest('.d-none')) {
                renderOrdersTable(myOrders, 'ordersHistoryList');
            }

        } else {
            console.warn('Could not fetch orders:', response.status);
            document.getElementById('recentOrdersList').innerHTML = getEmptyStateHTML('Erreur de chargement');
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        document.getElementById('recentOrdersList').innerHTML = getEmptyStateHTML('Erreur de connexion');
    }
    
    // Update Cart Count
    updateDashboardCartCount();
}

function updateDashboardCartCount() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const countElements = document.querySelectorAll('#cartItemsCount, #sidebarCartCount');
    countElements.forEach(el => el.textContent = count);
}

// Load full orders history
async function loadOrders() {
    // If we already fetched orders in loadDashboardStats, use them
    if (window.myOrdersData) {
        renderOrdersTable(window.myOrdersData, 'ordersHistoryList');
    } else {
        // Fallback
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (user) {
           await loadDashboardStats(user);
           if (window.myOrdersData) {
                renderOrdersTable(window.myOrdersData, 'ordersHistoryList');
           }
        }
    }
}

function renderOrdersTable(orders, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = getEmptyStateHTML();
        return;
    }

    container.innerHTML = orders.map(order => {
        const dateRaw = order.date_commande || order.date_creation;
        const date = dateRaw ? new Date(dateRaw).toLocaleDateString('fr-FR') : 'N/A';
        const itemsCount = (order.lignes_commande || []).length; 
        const total = (order.montant_total || order.total || 0).toLocaleString('fr-FR');
        const orderId = order.id || order.id_commande || 'N/A';
        const status = order.statut || 'En attente';
        
        return `
        <tr>
            <td><span class="fw-bold">#${orderId}</span></td>
            <td>${date}</td>
            <td>${itemsCount} article(s)</td>
            <td class="fw-bold">${total} FCFA</td>
            <td>${getStatusBadge(status)}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewOrderDetails(${orderId})" title="Voir détails">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

function getEmptyStateHTML(message = 'Aucune commande trouvée') {
    return `
        <tr>
            <td colspan="6" class="text-center py-5">
                <div class="d-flex flex-column align-items-center justify-content-center">
                    <div class="bg-light rounded-circle p-3 mb-3">
                        <i class="fas fa-box-open fa-2x text-secondary opacity-50"></i>
                    </div>
                    <p class="text-muted mb-0 fw-medium">${message}</p>
                    <a href="products.html" class="btn btn-sm btn-link text-decoration-none mt-1">Commencer vos achats &rarr;</a>
                </div>
            </td>
        </tr>`;
}

function getStatusBadge(status) {
    let badgeClass = 'bg-secondary';
    let label = status || 'Inconnu';
    const s = label.toString().toUpperCase();

    if (s.includes('LIVR') || s.includes('TERMINE') || s.includes('DELIVERED')) {
        badgeClass = 'bg-success';
    } else if (s.includes('ATTENTE') || s.includes('PENDING')) {
        badgeClass = 'bg-warning text-dark';
    } else if (s.includes('ANNUL') || s.includes('CANCEL')) {
        badgeClass = 'bg-danger';
    } else if (s.includes('COURS') || s.includes('PROCESS')) {
        badgeClass = 'bg-info text-dark';
    }

    return `<span class="badge ${badgeClass} rounded-pill shadow-sm" style="font-size: 0.75rem;">${label}</span>`;
}

// Section Navigation
function initSectionNavigation() {
    const navLinks = document.querySelectorAll('[data-section]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('.dashboard-section').forEach(section => {
                section.classList.add('d-none');
            });
            
            const sectionId = link.getAttribute('data-section');
            const sectionElement = document.getElementById(`${sectionId}-section`);
            
            if (sectionElement) {
                sectionElement.classList.remove('d-none');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                
                // Refresh data if needed
                if (sectionId === 'orders') {
                    loadOrders();
                } else if (sectionId === 'cart') {
                    loadCart();
                }
            }
        });
    });
    
    // Hash navigation
    const hash = window.location.hash.substring(1);
    if (hash) {
        const link = document.querySelector(`[data-section="${hash}"]`);
        if (link) link.click();
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

function viewOrderDetails(orderId) {
    // Implement detail view logic here
    // For now simple alert
    alert(`Détails de la commande #${orderId} - Fonctionnalité en cours de développement`);
}

// Cart Management (Merged from previous cart logic but simplified for dashboard check)
function loadCart() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const cartItemsList = document.getElementById('cartItemsList');
    const cartSummary = document.getElementById('cartSummary');
    const totalDisplay = document.getElementById('cartTotal');
    const totalDisplaySummary = document.getElementById('cartTotalDisplay');
    
    if (!cartItemsList) return;

    // Update count
    updateDashboardCartCount();
    
    if (cart.length === 0) {
        cartItemsList.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-shopping-basket fa-3x text-light mb-3" style="color: #e5e7eb !important;"></i>
                <p class="text-muted">Votre panier est vide</p>
                <a href="products.html" class="btn btn-primary mt-3 rounded-pill">Aller au catalogue</a>
            </div>`;
        if(cartSummary) cartSummary.classList.add('d-none');
        return;
    }
    
    if(cartSummary) cartSummary.classList.remove('d-none');

    // Render Items
    cartItemsList.innerHTML = cart.map(item => `
        <div class="cart-item border-bottom pb-3 mb-3">
            <div class="row align-items-center">
                <div class="col-md-6 mb-2 mb-md-0">
                    <div class="d-flex align-items-center gap-3">
                        <div class="bg-light rounded p-1">
                            <img src="${item.image || 'https://via.placeholder.com/80'}" alt="${item.name}" class="rounded" style="width: 60px; height: 60px; object-fit: cover;">
                        </div>
                        <div>
                            <h6 class="fw-bold mb-1 text-dark" style="font-size: 0.95rem;">${item.name}</h6>
                            <p class="text-muted small mb-0">${(item.price || 0).toLocaleString()} FCFA / unit</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-2 mb-md-0">
                    <div class="input-group input-group-sm bg-light rounded-pill p-1 border">
                        <button class="btn btn-link text-decoration-none text-muted p-0 px-2" onclick="updateCartQuantity(${item.id}, ${item.quantity - 1})">
                            <i class="fas fa-minus fa-xs"></i>
                        </button>
                        <input type="number" class="form-control border-0 bg-transparent text-center p-0" value="${item.quantity}" min="1" readonly style="max-width: 40px; font-weight: 600;">
                        <button class="btn btn-link text-decoration-none text-muted p-0 px-2" onclick="updateCartQuantity(${item.id}, ${item.quantity + 1})">
                            <i class="fas fa-plus fa-xs"></i>
                        </button>
                    </div>
                </div>
                <div class="col-md-2 text-md-end mb-2 mb-md-0">
                    <p class="fw-bold text-dark mb-0">${(item.price * item.quantity).toLocaleString()} FCFA</p>
                </div>
                <div class="col-md-1 text-end">
                    <button class="btn btn-link text-danger p-0" onclick="removeFromCart(${item.id})" title="Retirer">
                        <i class="far fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    // Totals
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const formattedTotal = total.toLocaleString('fr-FR');
    
    if(totalDisplay) totalDisplay.textContent = formattedTotal;
    if(totalDisplaySummary) totalDisplaySummary.textContent = formattedTotal;
}

function updateCartQuantity(productId, newQuantity) {
    if (newQuantity < 1) return;
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const index = cart.findIndex(i => i.id === productId);
    if (index !== -1) {
        cart[index].quantity = newQuantity;
        localStorage.setItem('cart', JSON.stringify(cart));
        loadCart();
    }
}

function removeFromCart(productId) {
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const newCart = cart.filter(i => i.id !== productId);
    localStorage.setItem('cart', JSON.stringify(newCart));
    loadCart();
}

function clearCart() {
    if(confirm('Voulez-vous vraiment vider votre panier ?')) {
        localStorage.setItem('cart', '[]');
        loadCart();
    }
}

function proceedToCheckout() {
    // window.location.href = 'checkout.html';
    alert('Passage en caisse (Page checkout à implémenter)');
}

function showNotification(message, type = 'info') {
    // Simple toast implementation or just alert for now
    // Could inject a bootstrap toast
    console.log(`Notification [${type}]: ${message}`);
}


// Proceed to Checkout
function proceedToCheckout() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    
    if (cart.length === 0) {
        showNotification('Votre panier est vide', 'warning');
        return;
    }
    
    // Create order
    const order = {
        id: Date.now(),
        date: new Date().toISOString(),
        status: 'En attente',
        items: cart,
        total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    };
    
    // Save order
    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    orders.push(order);
    localStorage.setItem('orders', JSON.stringify(orders));
    
    // Clear cart
    localStorage.setItem('cart', JSON.stringify([]));
    
    // Show success
    showNotification('Commande passée avec succès !', 'success');
    
    // Reload dashboard
    loadDashboardStats();
    loadCart();
    loadOrders();
    updateAllCartCounts();
    
    // Switch to orders section
    document.querySelector('[data-section="orders"]').click();
}

// Load Orders
function loadOrders() {
    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    const ordersHistoryList = document.getElementById('ordersHistoryList');
    
    if (orders.length === 0) {
        ordersHistoryList.innerHTML = '<p class="text-muted text-center py-4">Aucune commande</p>';
        return;
    }
    
    ordersHistoryList.innerHTML = orders.reverse().map(order => `
        <div class="card border-0 shadow-sm mb-3">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h5 class="fw-bold mb-1">Commande #${order.id}</h5>
                    <p class="text-muted small mb-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="me-1">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${new Date(order.date).toLocaleDateString('fr-FR', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            }).replace(/?/g, 'é')}
                        </p>
                    </div>
                    <span class="badge bg-${getStatusColor(order.status)} px-3 py-2">${order.status}</span>
                </div>
                
                <div class="order-items mb-3">
                    ${order.items.map(item => `
                        <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                            <div class="d-flex align-items-center gap-2">
                                <img src="${item.image}" alt="${item.name}" class="rounded" style="width: 50px; height: 50px; object-fit: cover;">
                                <div>
                                    <p class="fw-semibold mb-0">${item.name}</p>
                                    <p class="text-muted small mb-0">Quantité: ${item.quantity}</p>
                                </div>
                            </div>
                            <span class="fw-bold">${(item.price * item.quantity).toLocaleString()} FCFA</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="d-flex justify-content-between align-items-center pt-3 border-top">
                    <span class="fw-bold">Total</span>
                    <span class="h5 fw-bold text-success mb-0">${order.total.toLocaleString()} FCFA</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Update All Cart Counts
function updateAllCartCounts() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    // Update all cart badges
    document.querySelectorAll('.cart-badge').forEach(badge => {
        badge.textContent = count;
        badge.style.display = count === 0 ? 'none' : 'flex';
    });
}

// Show Notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} position-fixed top-0 start-50 translate-middle-x mt-3 shadow-lg animate__animated animate__fadeInDown`;
    notification.style.zIndex = '9999';
    
    const icons = {
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
        info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
        warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
        danger: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
    };
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="me-2">
                ${icons[type] || icons.info}
            </svg>
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds with fade out animation
    setTimeout(() => {
        notification.classList.add('animate__fadeOutUp');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

