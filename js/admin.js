// ===== ADMIN PANEL MAIN JS =====
import { db, auth } from './firebase-config.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, orderBy, where, onSnapshot, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ===== CLOUDINARY CONFIG =====
const CLOUDINARY_CLOUD_NAME = 'fplryrqe';
const CLOUDINARY_UPLOAD_PRESET = 'duqfdxw3';

// ===== STATE =====
let allOrders = [];
let allProducts = [];
let allCategories = [];
let salesChart = null;
let productsChart = null;
let currentProductImageFile = null;
let productGalleryImages = [];
let currentSliderImageFile = null;
let currentSliderMobileImageFile = null;
let currentCategoryImageFile = null;
let currentPackageImageFile = null;
let allReviews = [];

// ===== AUTH GUARD =====
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  const isAdmin = await checkAdmin(user.uid);
  if (!isAdmin) { await signOut(auth); window.location.href = 'login.html'; return; }
  document.getElementById('admin-name').textContent = user.displayName || user.email?.split('@')[0] || 'المسؤول';
  initAdmin();
});

async function checkAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (e) { return false; }
}

window.adminLogout = async () => {
  await signOut(auth);
  window.location.href = 'login.html';
};

// ===== INIT =====
async function initAdmin() {
  await loadDashboardStats();
  await loadCategories();
  await loadProducts();
  await loadPackages();
  await loadSlider();
  await loadOrders();
  await loadCoupons();
  await loadSettings();
  await loadReviews();
  populateReviewSelects();
  initCharts();
  listenPendingOrders();
  listenNewOrders();
}

// ===== NAVIGATION =====
window.showSection = (sectionName) => {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`section-${sectionName}`).classList.add('active');
  document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
  const titles = { dashboard:'لوحة التحكم', products:'المنتجات', categories:'الأقسام', packages:'الباقات', slider:'السلايدر', orders:'الطلبات', subscribers:'المشتركون', coupons:'الكوبونات', reviews:'التقييمات', settings:'الإعدادات' };
  document.getElementById('topbar-title').textContent = titles[sectionName] || 'لوحة التحكم';
  if (window.innerWidth < 768) closeSidebar();
};

window.toggleSidebar = () => {
  document.getElementById('sidebar').classList.toggle('open');
};
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ===== DASHBOARD STATS =====
async function loadDashboardStats() {
  try {
    const [ordersSnap, productsSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'users'))
    ]);
    const orders = [];
    ordersSnap.forEach(d => orders.push(d.data()));
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    document.getElementById('stat-orders').textContent = orders.length;
    document.getElementById('stat-revenue').textContent = `${revenue.toFixed(0)} د.م.`;
    document.getElementById('stat-products').textContent = productsSnap.size;
    document.getElementById('stat-customers').textContent = usersSnap.size;
    renderRecentOrders(orders.slice(-5).reverse());
  } catch (e) { console.error(e); }
}

function renderRecentOrders(orders) {
  const tbody = document.getElementById('recent-orders-body');
  if (!orders.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد طلبات</td></tr>`; return; }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><strong style="color:var(--primary)">${o.orderCode || '-'}</strong></td>
      <td>${o.customerName || '-'}</td>
      <td>${o.total?.toFixed(2) || 0} د.م.</td>
      <td><span class="status-badge status-${o.status || 'pending'}">${getStatusLabel(o.status)}</span></td>
      <td>${o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString('ar-SA') : '-'}</td>
    </tr>`).join('');
}

function listenPendingOrders() {
  const q = query(collection(db, 'orders'), where('status', '==', 'pending'));
  onSnapshot(q, (snap) => {
    const count = snap.size;
    const badge = document.getElementById('pending-badge');
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  });
}

// ===== CHARTS =====
function initCharts() {
  initSalesChart('daily');
}

async function initSalesChart(period) {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    const orders = [];
    snap.forEach(d => orders.push(d.data()));
    const ctx = document.getElementById('sales-chart').getContext('2d');
    if (salesChart) salesChart.destroy();
    let labels, data;
    if (period === 'daily') {
      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        last7.push(d.toLocaleDateString('ar-SA', { weekday: 'short' }));
      }
      labels = last7;
      data = last7.map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return orders.filter(o => {
          if (!o.createdAt) return false;
          const od = o.createdAt.toDate();
          return od.toDateString() === d.toDateString();
        }).reduce((sum, o) => sum + (o.total || 0), 0);
      });
    } else {
      labels = ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4'];
      data = [0, 0, 0, 0];
      orders.forEach(o => {
        if (!o.createdAt) return;
        const d = o.createdAt.toDate();
        const week = Math.floor(d.getDate() / 7);
        if (week < 4) data[week] += (o.total || 0);
      });
    }
    salesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات (د.م.)',
          data,
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#6c63ff',
          pointRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: 'rgba(255,255,255,0.7)', font: { family: 'Cairo' } } } },
        scales: {
          x: { ticks: { color: 'rgba(255,255,255,0.5)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: 'rgba(255,255,255,0.5)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  } catch (e) { console.error(e); }
}

async function initProductsChart() {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    const productCounts = {};
    snap.forEach(d => {
      const items = d.data().items || [];
      items.forEach(item => {
        productCounts[item.name] = (productCounts[item.name] || 0) + item.qty;
      });
    });
    const sorted = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const ctx = document.getElementById('products-chart').getContext('2d');
    if (productsChart) productsChart.destroy();
    productsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: sorted.map(s => s[0]),
        datasets: [{
          data: sorted.map(s => s[1]),
          backgroundColor: ['#6c63ff', '#ff6584', '#43e97b', '#4facfe', '#f093fb'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', font: { family: 'Cairo' }, padding: 12 } }
        }
      }
    });
  } catch (e) {}
}

window.switchChart = (period) => {
  document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  initSalesChart(period);
};

// ===== PRODUCTS =====
async function loadProducts() {
  try {
    const snap = await getDocs(collection(db, 'products'));
    allProducts = [];
    snap.forEach(d => allProducts.push({ id: d.id, ...d.data() }));
    renderProductsTable();
    populateCategorySelect();
  } catch (e) { console.error(e); }
}

function renderProductsTable() {
  const tbody = document.getElementById('products-table-body');
  if (!allProducts.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد منتجات</td></tr>`; return; }
  tbody.innerHTML = allProducts.map(p => `
    <tr>
      <td><img class="product-thumb" src="${p.imageUrl || ''}" alt="${p.name}" onerror="this.style.display='none'"/></td>
      <td><strong>${p.name}</strong></td>
      <td>${getCategoryName(p.category)}</td>
      <td><strong style="color:var(--primary)">${p.price} د.م.</strong></td>
      <td><span class="status-badge ${p.status === 'active' ? 'status-confirmed' : 'status-cancelled'}">${p.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="editProduct('${p.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteProduct('${p.id}')" title="حذف"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function getCategoryName(catId) {
  const cat = allCategories.find(c => c.id === catId);
  return cat ? cat.name : (catId || '-');
}

function populateCategorySelect() {
  const sel = document.getElementById('product-category');
  sel.innerHTML = '<option value="">اختر القسم</option>';
  allCategories.forEach(cat => {
    sel.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
  });
}

window.openProductForm = () => {
  document.getElementById('product-id').value = '';
  document.getElementById('product-name').value = '';
  document.getElementById('product-category').value = '';
  document.getElementById('product-price').value = '';
  document.getElementById('product-old-price').value = '';
  document.getElementById('product-desc').value = '';
  document.getElementById('product-badge').value = '';
  document.getElementById('product-status').value = 'active';
  document.getElementById('product-image-url').value = '';
  document.getElementById('product-image-preview').style.display = 'none';
  document.getElementById('product-upload-placeholder').style.display = 'flex';
  productGalleryImages = [];
  renderProductGallery();
  const _lay = document.getElementById('product-layout'); if (_lay) _lay.value = 'classic';
  const _rm = document.getElementById('product-related-mode'); if (_rm) _rm.value = 'auto';
  renderRelatedOptions([], '');
  const _rb = document.getElementById('product-related-box'); if (_rb) _rb.style.display = 'none';
  document.getElementById('product-modal-title').textContent = 'إضافة منتج جديد';
  currentProductImageFile = null;
  openModal('product-modal');
};

window.editProduct = (id) => {
  const p = allProducts.find(p => p.id === id);
  if (!p) return;
  document.getElementById('product-id').value = id;
  document.getElementById('product-name').value = p.name || '';
  document.getElementById('product-category').value = p.category || '';
  document.getElementById('product-price').value = p.price || '';
  document.getElementById('product-old-price').value = p.oldPrice || '';
  document.getElementById('product-desc').value = p.description || '';
  document.getElementById('product-badge').value = p.badge || '';
  document.getElementById('product-status').value = p.status || 'active';
  document.getElementById('product-image-url').value = p.imageUrl || '';
  if (p.imageUrl) {
    document.getElementById('product-image-preview').src = p.imageUrl;
    document.getElementById('product-image-preview').style.display = 'block';
    document.getElementById('product-upload-placeholder').style.display = 'none';
  }
  productGalleryImages = ((p.images || []).filter(u => u && u !== p.imageUrl)).map(u => ({ url: u }));
  renderProductGallery();
  const _lay = document.getElementById('product-layout'); if (_lay) _lay.value = p.layout || 'classic';
  const _rm = document.getElementById('product-related-mode'); if (_rm) _rm.value = p.relatedMode || 'auto';
  renderRelatedOptions(p.relatedIds || [], id);
  const _rb = document.getElementById('product-related-box'); if (_rb) _rb.style.display = (p.relatedMode === 'manual') ? 'block' : 'none';
  document.getElementById('product-modal-title').textContent = 'تعديل المنتج';
  currentProductImageFile = null;
  openModal('product-modal');
};

// ===== RELATED PRODUCTS PICKER =====
window.onRelatedModeChange = () => {
  const mode = (document.getElementById('product-related-mode') || {}).value;
  const box = document.getElementById('product-related-box');
  if (box) box.style.display = mode === 'manual' ? 'block' : 'none';
};
function renderRelatedOptions(selectedIds, excludeId) {
  const box = document.getElementById('product-related-box');
  if (!box) return;
  const sel = selectedIds || [];
  const opts = allProducts.filter(p => p.id !== excludeId);
  box.innerHTML = opts.length ? opts.map(p => `
    <label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer">
      <input type="checkbox" class="related-cb" value="${p.id}" ${sel.includes(p.id) ? 'checked' : ''}/>
      <span>${p.name}</span>
    </label>`).join('') : '<p style="color:var(--text-muted);margin:0">لا توجد منتجات أخرى</p>';
}

window.previewProductImage = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentProductImageFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('product-image-preview').src = ev.target.result;
    document.getElementById('product-image-preview').style.display = 'block';
    document.getElementById('product-upload-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
};

// ===== PRODUCT GALLERY (up to 8 extra images) =====
const PRODUCT_GALLERY_MAX = 8;
window.renderProductGallery = () => {
  const grid = document.getElementById('product-gallery-grid');
  if (!grid) return;
  let html = productGalleryImages.map((g, i) => `
    <div class="gallery-item">
      <img src="${g.dataUrl || g.url}" alt="صورة ${i + 1}"/>
      <button type="button" class="gallery-item-remove" onclick="removeProductGalleryImage(${i})" title="حذف"><i class="fas fa-times"></i></button>
    </div>`).join('');
  if (productGalleryImages.length < PRODUCT_GALLERY_MAX) {
    html += `
    <div class="gallery-add" onclick="document.getElementById('product-gallery-file').click()">
      <i class="fas fa-plus"></i>
      <span>${productGalleryImages.length}/${PRODUCT_GALLERY_MAX}</span>
    </div>`;
  }
  grid.innerHTML = html;
};
window.onProductGalleryFiles = (e) => {
  const files = Array.from(e.target.files || []);
  const remaining = PRODUCT_GALLERY_MAX - productGalleryImages.length;
  if (files.length > remaining) showToast(`يمكن إضافة ${remaining} صورة فقط (الحد الأقصى 8)`, 'info');
  files.slice(0, remaining).forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => { productGalleryImages.push({ file, dataUrl: ev.target.result }); renderProductGallery(); };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
};
window.removeProductGalleryImage = (i) => {
  productGalleryImages.splice(i, 1);
  renderProductGallery();
};

window.saveProduct = async () => {
  const id = document.getElementById('product-id').value;
  const name = document.getElementById('product-name').value.trim();
  const price = parseFloat(document.getElementById('product-price').value);
  if (!name || isNaN(price)) { showToast('يرجى ملء الحقول المطلوبة', 'error'); return; }

  let imageUrl = document.getElementById('product-image-url').value;
  if (currentProductImageFile) {
    imageUrl = await uploadFile(currentProductImageFile, `products/${Date.now()}_${currentProductImageFile.name}`);
  }

  const galleryUrls = [];
  for (const g of productGalleryImages) {
    if (g.file) {
      galleryUrls.push(await uploadFile(g.file, `products/gallery/${Date.now()}_${g.file.name}`));
    } else if (g.url) {
      galleryUrls.push(g.url);
    }
  }
  const images = [imageUrl, ...galleryUrls].filter(Boolean);

  const data = {
    name,
    category: document.getElementById('product-category').value,
    price,
    oldPrice: parseFloat(document.getElementById('product-old-price').value) || null,
    description: document.getElementById('product-desc').value.trim(),
    badge: document.getElementById('product-badge').value.trim(),
    status: document.getElementById('product-status').value,
    imageUrl,
    images,
    layout: (document.getElementById('product-layout') || {}).value || 'classic',
    relatedMode: (document.getElementById('product-related-mode') || {}).value || 'auto',
    relatedIds: Array.from(document.querySelectorAll('.related-cb:checked')).map(c => c.value),
    updatedAt: serverTimestamp()
  };
  const stockRaw = document.getElementById('product-stock').value;
  if (stockRaw !== '') data.stock = parseInt(stockRaw);
  const ratingRaw = document.getElementById('product-rating').value;
  if (ratingRaw !== '') data.rating = parseFloat(ratingRaw);
  const ratingCountRaw = document.getElementById('product-rating-count').value;
  if (ratingCountRaw !== '') data.ratingCount = parseInt(ratingCountRaw);

  try {
    if (id) await updateDoc(doc(db, 'products', id), data);
    else await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
    closeModal('product-modal');
    await loadProducts();
    showToast(id ? 'تم تحديث المنتج' : 'تم إضافة المنتج', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); console.error(e); }
};

window.deleteProduct = async (id) => {
  if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
  try {
    await deleteDoc(doc(db, 'products', id));
    await loadProducts();
    showToast('تم حذف المنتج', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); }
};

// ===== CATEGORIES =====
async function loadCategories() {
  try {
    const snap = await getDocs(collection(db, 'categories'));
    allCategories = [];
    snap.forEach(d => allCategories.push({ id: d.id, ...d.data() }));
    renderCategoriesList();
  } catch (e) {}
}

function renderCategoriesList() {
  const list = document.getElementById('categories-list');
  if (!allCategories.length) { list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">لا توجد أقسام</p>'; return; }
  list.innerHTML = allCategories.map(cat => `
    <div class="category-item">
      <div class="icon">${cat.icon || '🛍️'}</div>
      <div class="name">${cat.name}</div>
      <div class="actions">
        <button class="btn-edit" onclick="editCategory('${cat.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn-delete" onclick="deleteCategory('${cat.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

window.openCategoryForm = () => {
  document.getElementById('category-id').value = '';
  document.getElementById('category-name').value = '';
  document.getElementById('category-icon').value = '';
  document.getElementById('category-image').value = '';
  document.getElementById('category-image-preview').style.display = 'none';
  document.getElementById('category-upload-placeholder').style.display = 'flex';
  document.getElementById('category-modal-title').textContent = 'إضافة قسم جديد';
  currentCategoryImageFile = null;
  openModal('category-modal');
};

window.editCategory = (id) => {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('category-id').value = id;
  document.getElementById('category-name').value = cat.name || '';
  document.getElementById('category-icon').value = cat.icon || '';
  document.getElementById('category-image').value = cat.imageUrl || '';
  const cp = document.getElementById('category-image-preview');
  if (cat.imageUrl) { cp.src = cat.imageUrl; cp.style.display = 'block'; document.getElementById('category-upload-placeholder').style.display = 'none'; }
  else { cp.style.display = 'none'; document.getElementById('category-upload-placeholder').style.display = 'flex'; }
  document.getElementById('category-modal-title').textContent = 'تعديل القسم';
  currentCategoryImageFile = null;
  openModal('category-modal');
};

window.previewCategoryImage = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentCategoryImageFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('category-image-preview').src = ev.target.result;
    document.getElementById('category-image-preview').style.display = 'block';
    document.getElementById('category-upload-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
};
window.onCategoryImageUrlInput = (v) => {
  const cp = document.getElementById('category-image-preview');
  if (v) { cp.src = v; cp.style.display = 'block'; document.getElementById('category-upload-placeholder').style.display = 'none'; currentCategoryImageFile = null; }
};

window.saveCategory = async () => {
  const id = document.getElementById('category-id').value;
  const name = document.getElementById('category-name').value.trim();
  if (!name) { showToast('أدخل اسم القسم', 'error'); return; }
  let imageUrl = document.getElementById('category-image').value.trim();
  if (currentCategoryImageFile) {
    imageUrl = await uploadFile(currentCategoryImageFile, `categories/${Date.now()}_${currentCategoryImageFile.name}`);
  }
  const data = { name, icon: document.getElementById('category-icon').value.trim() || '🛍️', imageUrl: imageUrl || '', updatedAt: serverTimestamp() };
  try {
    if (id) await updateDoc(doc(db, 'categories', id), data);
    else await addDoc(collection(db, 'categories'), { ...data, createdAt: serverTimestamp() });
    closeModal('category-modal');
    await loadCategories();
    showToast(id ? 'تم تحديث القسم' : 'تم إضافة القسم', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); }
};

window.deleteCategory = async (id) => {
  if (!confirm('هل أنت متأكد من حذف هذا القسم؟')) return;
  try {
    await deleteDoc(doc(db, 'categories', id));
    await loadCategories();
    showToast('تم حذف القسم', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); }
};

// ===== PACKAGES =====
async function loadPackages() {
  try {
    const snap = await getDocs(collection(db, 'packages'));
    const packages = [];
    snap.forEach(d => packages.push({ id: d.id, ...d.data() }));
    renderPackagesList(packages);
  } catch (e) {}
}

function renderPackagesList(packages) {
  const list = document.getElementById('packages-list');
  if (!packages.length) { list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">لا توجد باقات</p>'; return; }
  list.innerHTML = packages.map(pkg => `
    <div class="package-item">
      <div class="pkg-name">${pkg.name} ${pkg.featured ? '<span style="background:var(--primary);color:white;padding:2px 8px;border-radius:10px;font-size:0.75rem;margin-right:8px">مميزة</span>' : ''} ${pkg.bestSeller ? '<span style="background:#f59e0b;color:#3b2600;padding:2px 8px;border-radius:10px;font-size:0.75rem;margin-right:8px">الأكثر مبيعاً</span>' : ''}</div>
      <div class="pkg-price">${pkg.price} د.م. <span style="font-size:0.85rem;color:var(--text-muted)">/ ${pkg.period || 'شهر'}</span></div>
      <ul class="pkg-features">${(pkg.features || []).map(f => `<li>• ${f}</li>`).join('')}</ul>
      <div class="actions">
        <button class="btn-edit" onclick="editPackage('${pkg.id}')"><i class="fas fa-edit"></i> تعديل</button>
        <button class="btn-delete" onclick="deletePackage('${pkg.id}')"><i class="fas fa-trash"></i> حذف</button>
      </div>
    </div>`).join('');
}

window.openPackageForm = () => {
  document.getElementById('package-id').value = '';
  document.getElementById('package-name').value = '';
  document.getElementById('package-price').value = '';
  document.getElementById('package-period').value = '';
  document.getElementById('package-featured').value = 'false';
  const _pbs = document.getElementById('package-bestseller'); if (_pbs) _pbs.value = 'false';
  document.getElementById('package-features').value = '';
  document.getElementById('package-image').value = '';
  document.getElementById('package-image-preview').style.display = 'none';
  document.getElementById('package-upload-placeholder').style.display = 'flex';
  document.getElementById('package-modal-title').textContent = 'إضافة باقة جديدة';
  currentPackageImageFile = null;
  openModal('package-modal');
};

window.editPackage = async (id) => {
  const snap = await getDoc(doc(db, 'packages', id));
  if (!snap.exists()) return;
  const pkg = snap.data();
  document.getElementById('package-id').value = id;
  document.getElementById('package-name').value = pkg.name || '';
  document.getElementById('package-price').value = pkg.price || '';
  document.getElementById('package-period').value = pkg.period || '';
  document.getElementById('package-featured').value = pkg.featured ? 'true' : 'false';
  const _pbs = document.getElementById('package-bestseller'); if (_pbs) _pbs.value = pkg.bestSeller ? 'true' : 'false';
  document.getElementById('package-features').value = (pkg.features || []).join('\n');
  document.getElementById('package-image').value = pkg.imageUrl || '';
  const pp = document.getElementById('package-image-preview');
  if (pkg.imageUrl) { pp.src = pkg.imageUrl; pp.style.display = 'block'; document.getElementById('package-upload-placeholder').style.display = 'none'; }
  else { pp.style.display = 'none'; document.getElementById('package-upload-placeholder').style.display = 'flex'; }
  document.getElementById('package-modal-title').textContent = 'تعديل الباقة';
  currentPackageImageFile = null;
  openModal('package-modal');
};

window.previewPackageImage = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentPackageImageFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('package-image-preview').src = ev.target.result;
    document.getElementById('package-image-preview').style.display = 'block';
    document.getElementById('package-upload-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
};
window.onPackageImageUrlInput = (v) => {
  const pp = document.getElementById('package-image-preview');
  if (v) { pp.src = v; pp.style.display = 'block'; document.getElementById('package-upload-placeholder').style.display = 'none'; currentPackageImageFile = null; }
};

window.savePackage = async () => {
  const id = document.getElementById('package-id').value;
  const name = document.getElementById('package-name').value.trim();
  const price = parseFloat(document.getElementById('package-price').value);
  if (!name || isNaN(price)) { showToast('يرجى ملء الحقول المطلوبة', 'error'); return; }
  const features = document.getElementById('package-features').value.split('\n').filter(f => f.trim());
  let imageUrl = document.getElementById('package-image').value.trim();
  if (currentPackageImageFile) {
    imageUrl = await uploadFile(currentPackageImageFile, `packages/${Date.now()}_${currentPackageImageFile.name}`);
  }
  const data = { name, price, period: document.getElementById('package-period').value.trim() || 'شهر', featured: document.getElementById('package-featured').value === 'true', bestSeller: (document.getElementById('package-bestseller') || {}).value === 'true', features, imageUrl: imageUrl || '', updatedAt: serverTimestamp() };
  try {
    if (id) await updateDoc(doc(db, 'packages', id), data);
    else await addDoc(collection(db, 'packages'), { ...data, createdAt: serverTimestamp() });
    closeModal('package-modal');
    await loadPackages();
    showToast(id ? 'تم تحديث الباقة' : 'تم إضافة الباقة', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); }
};

window.deletePackage = async (id) => {
  if (!confirm('حذف هذه الباقة؟')) return;
  try { await deleteDoc(doc(db, 'packages', id)); await loadPackages(); showToast('تم الحذف', 'success'); } catch (e) { showToast('خطأ', 'error'); }
};

// ===== SLIDER =====
async function loadSlider() {
  try {
    const q = query(collection(db, 'slider'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    const slides = [];
    snap.forEach(d => slides.push({ id: d.id, ...d.data() }));
    renderSliderList(slides);
  } catch (e) {}
}

function renderSliderList(slides) {
  const list = document.getElementById('slider-list');
  if (!slides.length) { list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">لا توجد شرائح</p>'; return; }
  list.innerHTML = slides.map(s => `
    <div class="slider-item">
      <div class="slider-item-img">
        ${s.imageUrl ? `<img src="${s.imageUrl}" alt="${s.title}"/>` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)"><i class="fas fa-image" style="font-size:2rem"></i></div>`}
      </div>
      <div class="slider-item-info">
        <div class="slider-item-title">${s.title || 'بدون عنوان'}</div>
        <div class="slider-item-subtitle">${s.subtitle || ''}</div>
        <div class="actions">
          <button class="btn-edit" onclick="editSlide('${s.id}')"><i class="fas fa-edit"></i> تعديل</button>
          <button class="btn-delete" onclick="deleteSlide('${s.id}')"><i class="fas fa-trash"></i> حذف</button>
        </div>
      </div>
    </div>`).join('');
}

window.openSliderForm = () => {
  document.getElementById('slider-id').value = '';
  document.getElementById('slider-title').value = '';
  document.getElementById('slider-subtitle').value = '';
  document.getElementById('slider-btn-text').value = '';
  document.getElementById('slider-btn-link').value = '';
  document.getElementById('slider-order').value = '1';
  document.getElementById('slider-image-url').value = '';
  document.getElementById('slider-image-preview').style.display = 'none';
  document.getElementById('slider-upload-placeholder').style.display = 'flex';
  const durEl = document.getElementById('slider-duration'); if (durEl) durEl.value = '5';
  const mUrl = document.getElementById('slider-image-url-mobile'); if (mUrl) mUrl.value = '';
  const mPrev = document.getElementById('slider-image-preview-mobile'); if (mPrev) mPrev.style.display = 'none';
  const mPh = document.getElementById('slider-upload-placeholder-mobile'); if (mPh) mPh.style.display = 'flex';
  currentSliderMobileImageFile = null;
  document.getElementById('slider-modal-title').textContent = 'إضافة شريحة جديدة';
  currentSliderImageFile = null;
  openModal('slider-modal');
};

window.editSlide = async (id) => {
  const snap = await getDoc(doc(db, 'slider', id));
  if (!snap.exists()) return;
  const s = snap.data();
  document.getElementById('slider-id').value = id;
  document.getElementById('slider-title').value = s.title || '';
  document.getElementById('slider-subtitle').value = s.subtitle || '';
  document.getElementById('slider-btn-text').value = s.btnText || '';
  document.getElementById('slider-btn-link').value = s.btnLink || '';
  document.getElementById('slider-order').value = s.order || 1;
  const durEl = document.getElementById('slider-duration'); if (durEl) durEl.value = s.duration || 5;
  document.getElementById('slider-image-url').value = s.imageUrl || '';
  if (s.imageUrl) {
    document.getElementById('slider-image-preview').src = s.imageUrl;
    document.getElementById('slider-image-preview').style.display = 'block';
    document.getElementById('slider-upload-placeholder').style.display = 'none';
  }
  const mUrl = document.getElementById('slider-image-url-mobile'); if (mUrl) mUrl.value = s.imageUrlMobile || '';
  const mPrev = document.getElementById('slider-image-preview-mobile');
  const mPh = document.getElementById('slider-upload-placeholder-mobile');
  if (s.imageUrlMobile) {
    if (mPrev) { mPrev.src = s.imageUrlMobile; mPrev.style.display = 'block'; }
    if (mPh) mPh.style.display = 'none';
  } else {
    if (mPrev) mPrev.style.display = 'none';
    if (mPh) mPh.style.display = 'flex';
  }
  currentSliderMobileImageFile = null;
  document.getElementById('slider-modal-title').textContent = 'تعديل الشريحة';
  currentSliderImageFile = null;
  openModal('slider-modal');
};

// Recommended / maximum dimensions for slider images.
// Desktop banner: ideal 1600×600, maximum 1920×900.
// Mobile banner:  ideal 800×1000, maximum 1200×1600.
function validateImageDimensions(file, maxW, maxH) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => resolve({ ok: img.width <= maxW && img.height <= maxH, width: img.width, height: img.height, dataUrl: ev.target.result });
      img.onerror = () => resolve({ ok: false, width: 0, height: 0, dataUrl: ev.target.result });
      img.src = ev.target.result;
    };
    reader.onerror = () => resolve({ ok: false, width: 0, height: 0, dataUrl: '' });
    reader.readAsDataURL(file);
  });
}

window.previewSliderImage = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const res = await validateImageDimensions(file, 1920, 900);
  if (!res.ok) {
    showToast(`الصورة كبيرة جداً (${res.width}×${res.height} بكسل). الحد الأقصى لصورة الحاسوب هو 1920×900 بكسل، والمقاس المثالي 1600×600 بكسل.`, 'error');
    e.target.value = '';
    return;
  }
  currentSliderImageFile = file;
  document.getElementById('slider-image-preview').src = res.dataUrl;
  document.getElementById('slider-image-preview').style.display = 'block';
  document.getElementById('slider-upload-placeholder').style.display = 'none';
};

window.previewSliderImageMobile = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const res = await validateImageDimensions(file, 1200, 1600);
  if (!res.ok) {
    showToast(`الصورة كبيرة جداً (${res.width}×${res.height} بكسل). الحد الأقصى لصورة الهاتف هو 1200×1600 بكسل، والمقاس المثالي 800×1000 بكسل.`, 'error');
    e.target.value = '';
    return;
  }
  currentSliderMobileImageFile = file;
  const mPrev = document.getElementById('slider-image-preview-mobile');
  if (mPrev) { mPrev.src = res.dataUrl; mPrev.style.display = 'block'; }
  const mPh = document.getElementById('slider-upload-placeholder-mobile'); if (mPh) mPh.style.display = 'none';
};

window.onSliderImageUrlInput = (v) => {
  const p = document.getElementById('slider-image-preview');
  if (v) { p.src = v; p.style.display = 'block'; document.getElementById('slider-upload-placeholder').style.display = 'none'; currentSliderImageFile = null; }
};
window.onSliderMobileUrlInput = (v) => {
  const p = document.getElementById('slider-image-preview-mobile');
  const ph = document.getElementById('slider-upload-placeholder-mobile');
  if (p && v) { p.src = v; p.style.display = 'block'; if (ph) ph.style.display = 'none'; currentSliderMobileImageFile = null; }
};
window.onProductImageUrlInput = (v) => {
  const p = document.getElementById('product-image-preview');
  if (v) { p.src = v; p.style.display = 'block'; document.getElementById('product-upload-placeholder').style.display = 'none'; currentProductImageFile = null; }
};

// ===== CLEAR / REMOVE selected images from modals =====
window.clearSliderImage = () => {
  currentSliderImageFile = null;
  document.getElementById('slider-image-url').value = '';
  const f = document.getElementById('slider-image-file'); if (f) f.value = '';
  document.getElementById('slider-image-preview').style.display = 'none';
  document.getElementById('slider-upload-placeholder').style.display = 'flex';
};
window.clearSliderMobileImage = () => {
  currentSliderMobileImageFile = null;
  const u = document.getElementById('slider-image-url-mobile'); if (u) u.value = '';
  const f = document.getElementById('slider-image-file-mobile'); if (f) f.value = '';
  const p = document.getElementById('slider-image-preview-mobile'); if (p) p.style.display = 'none';
  const ph = document.getElementById('slider-upload-placeholder-mobile'); if (ph) ph.style.display = 'flex';
};
window.clearProductImage = () => {
  currentProductImageFile = null;
  document.getElementById('product-image-url').value = '';
  const f = document.getElementById('product-image-file'); if (f) f.value = '';
  document.getElementById('product-image-preview').style.display = 'none';
  document.getElementById('product-upload-placeholder').style.display = 'flex';
};
window.clearCategoryImage = () => {
  currentCategoryImageFile = null;
  document.getElementById('category-image').value = '';
  const f = document.getElementById('category-image-file'); if (f) f.value = '';
  document.getElementById('category-image-preview').style.display = 'none';
  document.getElementById('category-upload-placeholder').style.display = 'flex';
};
window.clearPackageImage = () => {
  currentPackageImageFile = null;
  document.getElementById('package-image').value = '';
  const f = document.getElementById('package-image-file'); if (f) f.value = '';
  document.getElementById('package-image-preview').style.display = 'none';
  document.getElementById('package-upload-placeholder').style.display = 'flex';
};

window.saveSlide = async () => {
  const id = document.getElementById('slider-id').value;
  let imageUrl = document.getElementById('slider-image-url').value;
  if (currentSliderImageFile) {
    imageUrl = await uploadFile(currentSliderImageFile, `slider/${Date.now()}_${currentSliderImageFile.name}`);
  }
  const mUrlEl = document.getElementById('slider-image-url-mobile');
  let imageUrlMobile = mUrlEl ? mUrlEl.value.trim() : '';
  if (currentSliderMobileImageFile) {
    imageUrlMobile = await uploadFile(currentSliderMobileImageFile, `slider/${Date.now()}_m_${currentSliderMobileImageFile.name}`);
  }
  const durEl = document.getElementById('slider-duration');
  const data = {
    title: document.getElementById('slider-title').value.trim(),
    subtitle: document.getElementById('slider-subtitle').value.trim(),
    btnText: document.getElementById('slider-btn-text').value.trim(),
    btnLink: document.getElementById('slider-btn-link').value.trim(),
    order: parseInt(document.getElementById('slider-order').value) || 1,
    duration: durEl ? (parseInt(durEl.value) || 5) : 5,
    imageUrl,
    imageUrlMobile: imageUrlMobile || '',
    updatedAt: serverTimestamp()
  };
  try {
    if (id) await updateDoc(doc(db, 'slider', id), data);
    else await addDoc(collection(db, 'slider'), { ...data, createdAt: serverTimestamp() });
    closeModal('slider-modal');
    await loadSlider();
    showToast(id ? 'تم تحديث الشريحة' : 'تم إضافة الشريحة', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); console.error(e); }
};

window.deleteSlide = async (id) => {
  if (!confirm('حذف هذه الشريحة؟')) return;
  try { await deleteDoc(doc(db, 'slider', id)); await loadSlider(); showToast('تم الحذف', 'success'); } catch (e) { showToast('خطأ', 'error'); }
};

// ===== ORDERS =====
async function loadOrders() {
  try {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allOrders = [];
    snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
    renderOrdersTable(allOrders);
  } catch (e) { console.error(e); }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-table-body');
  if (!orders.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد طلبات</td></tr>`; return; }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><strong style="color:var(--primary);letter-spacing:2px">${o.orderCode || '-'}</strong></td>
      <td>${o.customerName || '-'}</td>
      <td>${o.customerPhone || '-'}</td>
      <td><strong style="color:var(--accent)">${o.total?.toFixed(2) || 0} د.م.</strong></td>
      <td><span class="status-badge status-${o.status || 'pending'}">${getStatusLabel(o.status)}</span></td>
      <td>${o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString('ar-SA') : '-'}</td>
      <td>
        <div class="action-btns">
          <button class="btn-view" onclick="viewOrder('${o.id}')" title="عرض"><i class="fas fa-eye"></i></button>
          <button class="btn-pdf" onclick="downloadOrderPDF('${o.id}')"><i class="fas fa-file-pdf"></i> فاتورة</button>
          <button class="btn-delete" onclick="deleteOrder('${o.id}')" title="حذف"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

window.filterOrders = () => {
  const status = document.getElementById('orders-status-filter').value;
  const filtered = status === 'all' ? allOrders : allOrders.filter(o => o.status === status);
  renderOrdersTable(filtered);
};

// ===== EXPORT ORDERS TO EXCEL/CSV =====
window.exportOrdersCSV = () => {
  const status = document.getElementById('orders-status-filter').value;
  const rows = status === 'all' ? allOrders : allOrders.filter(o => o.status === status);
  if (!rows.length) { showToast('لا توجد طلبات للتصدير', 'info'); return; }
  const headers = ['كود الطلب', 'العميل', 'الهاتف', 'البريد', 'المدينة', 'العنوان', 'المنتجات', 'المجموع الفرعي', 'الخصم', 'الكوبون', 'الإجمالي', 'الحالة', 'التاريخ'];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = rows.map(o => [
    o.orderCode || '', o.customerName || '', o.customerPhone || '', o.customerEmail || '',
    o.address?.city || '', o.address?.fullAddress || '',
    (o.items || []).map(i => `${i.name} x${i.qty}`).join(' | '),
    o.subtotal || 0, o.discount || 0, o.couponCode || '', o.total || 0,
    getStatusLabel(o.status), o.createdAt ? new Date(o.createdAt.toDate()).toLocaleString('ar-MA') : ''
  ].map(esc).join(','));
  const csv = '\uFEFF' + headers.map(esc).join(',') + '\n' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast('تم تصدير الطلبات بنجاح', 'success');
};

window.viewOrder = (id) => {
  const order = allOrders.find(o => o.id === id);
  if (!order) return;
  const content = document.getElementById('order-detail-content');
  content.innerHTML = `
    <div class="order-status-update">
      <select id="order-status-select">
        ${['pending','confirmed','processing','shipped','delivered','cancelled'].map(s => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${getStatusLabel(s)}</option>`).join('')}
      </select>
      <button class="btn-update-status" onclick="updateOrderStatus('${id}')"><i class="fas fa-check"></i> تحديث الحالة</button>
    </div>
    <div class="order-detail-grid">
      <div class="order-detail-section">
        <h4><i class="fas fa-user"></i> بيانات العميل</h4>
        <div class="detail-row"><span class="detail-label">الاسم</span><span class="detail-value">${order.customerName || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">الهاتف</span><span class="detail-value">${order.customerPhone || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">البريد</span><span class="detail-value">${order.customerEmail || '-'}</span></div>
      </div>
      <div class="order-detail-section">
        <h4><i class="fas fa-map-marker-alt"></i> عنوان التوصيل</h4>
        <div class="detail-row"><span class="detail-label">المدينة</span><span class="detail-value">${order.address?.city || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">الحي</span><span class="detail-value">${order.address?.district || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">العنوان</span><span class="detail-value">${order.address?.fullAddress || '-'}</span></div>
      </div>
    </div>
    <div class="order-items-list">
      <h4><i class="fas fa-box"></i> المنتجات</h4>
      ${(order.items || []).map(item => `
        <div class="order-item-row">
          <img class="order-item-img" src="${item.imageUrl || ''}" alt="${item.name}" onerror="this.style.display='none'"/>
          <span class="order-item-name">${item.name}</span>
          <span class="order-item-qty">× ${item.qty}</span>
          <span class="order-item-price">${(item.price * item.qty).toFixed(2)} د.م.</span>
        </div>`).join('')}
      <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">
        ${order.couponCode ? `<div class="detail-row"><span class="detail-label">كوبون</span><span class="detail-value" style="color:var(--accent)">${order.couponCode} (-${order.discount?.toFixed(2)} د.م.)</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">الإجمالي</span><span class="detail-value" style="color:var(--primary);font-size:1.1rem">${order.total?.toFixed(2)} د.م.</span></div>
      </div>
    </div>
    ${order.notes ? `<div class="order-detail-section"><h4><i class="fas fa-sticky-note"></i> ملاحظات</h4><p style="color:var(--text-muted)">${order.notes}</p></div>` : ''}
    <button class="btn-download-pdf" onclick="downloadOrderPDF('${id}')"><i class="fas fa-file-pdf"></i> تحميل الفاتورة PDF</button>`;
  openModal('order-modal');
};

window.updateOrderStatus = async (id) => {
  const newStatus = document.getElementById('order-status-select').value;
  try {
    await updateDoc(doc(db, 'orders', id), { status: newStatus, updatedAt: serverTimestamp() });
    const order = allOrders.find(o => o.id === id);
    if (order) order.status = newStatus;
    renderOrdersTable(allOrders);
    showToast('تم تحديث حالة الطلب', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); }
};

window.deleteOrder = async (id) => {
  if (!confirm('حذف هذا الطلب نهائياً؟')) return;
  try { await deleteDoc(doc(db, 'orders', id)); await loadOrders(); showToast('تم حذف الطلب', 'success'); } catch (e) { showToast('خطأ', 'error'); }
};

// ===== PDF INVOICE =====
window.downloadOrderPDF = (id) => {
  const order = allOrders.find(o => o.id === id);
  if (!order) return;
  generateInvoicePDF(order);
};

function generateInvoicePDF(order) {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const money = (n) => `${(Number(n) || 0).toFixed(2)} \u062f.\u0645.`;
  const storeName = (document.getElementById('store-name') && document.getElementById('store-name').value.trim()) || '\u0645\u062a\u062c\u0631\u064a';
  const storeEmail = (document.getElementById('store-email') && document.getElementById('store-email').value.trim()) || 'info@mystore.com';
  const storePhone = (document.getElementById('store-phone') && document.getElementById('store-phone').value.trim()) || '';
  const date = order.createdAt ? new Date(order.createdAt.toDate()).toLocaleDateString('ar-MA') : new Date().toLocaleDateString('ar-MA');
  const items = order.items || [];
  const rows = items.map((item, i) => `
    <tr class="${i % 2 ? 'alt' : ''}">
      <td class="prod">${esc(item.name)}</td>
      <td class="c">${esc(item.qty)}</td>
      <td class="c">${money(item.price)}</td>
      <td class="c">${money(item.price * item.qty)}</td>
    </tr>`).join('');
  const subtotal = order.subtotal != null ? order.subtotal : order.total;
  const discountRow = (order.discount > 0)
    ? `<div class="trow"><span>\u0627\u0644\u062e\u0635\u0645 ${order.couponCode ? '(' + esc(order.couponCode) + ')' : ''}</span><span class="disc">- ${money(order.discount)}</span></div>`
    : '';
  const addr = order.address || {};
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>\u0641\u0627\u062a\u0648\u0631\u0629 ${esc(order.orderCode || '')}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; font-family:'Cairo',sans-serif; }
  body { color:#0f2027; background:#fff; padding:28px; direction:rtl; }
  .inv { max-width:800px; margin:0 auto; }
  .head { background:linear-gradient(135deg,#0d9488,#0ea5e9 60%,#6366f1); color:#fff; border-radius:16px; padding:26px 28px; display:flex; justify-content:space-between; align-items:center; }
  .head h1 { font-size:1.9rem; font-weight:900; }
  .head .store { font-size:1.15rem; font-weight:700; opacity:.95; }
  .head .sub { font-size:.85rem; opacity:.85; margin-top:4px; }
  .code { background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.35); padding:8px 16px; border-radius:10px; font-weight:800; letter-spacing:1px; font-size:1.1rem; }
  .meta { display:flex; gap:16px; margin:22px 0; }
  .card { flex:1; background:#f2f7f7; border:1px solid #e0ecec; border-radius:12px; padding:16px 18px; }
  .card h3 { font-size:.95rem; color:#0d9488; margin-bottom:10px; border-bottom:1px solid #e0ecec; padding-bottom:6px; }
  .card p { font-size:.9rem; margin:5px 0; display:flex; justify-content:space-between; gap:10px; }
  .card p b { color:#5b6b73; font-weight:600; }
  table { width:100%; border-collapse:collapse; margin-top:8px; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(15,32,39,.06); }
  thead th { background:#0d9488; color:#fff; padding:12px 14px; font-size:.9rem; text-align:right; }
  thead th.c { text-align:center; }
  tbody td { padding:11px 14px; font-size:.9rem; border-bottom:1px solid #eef4f4; }
  tbody td.c { text-align:center; }
  tbody tr.alt td { background:#f8fbfb; }
  td.prod { font-weight:600; }
  .totals { margin-top:18px; margin-right:auto; width:320px; }
  .trow { display:flex; justify-content:space-between; padding:7px 4px; font-size:.92rem; color:#5b6b73; }
  .trow .disc { color:#0ea5e9; font-weight:700; }
  .grand { display:flex; justify-content:space-between; background:linear-gradient(135deg,#0d9488,#0f766e); color:#fff; padding:13px 16px; border-radius:10px; font-weight:800; font-size:1.1rem; margin-top:6px; }
  .status { display:inline-block; background:#5eead4; color:#0f766e; padding:3px 12px; border-radius:20px; font-size:.8rem; font-weight:700; }
  .foot { text-align:center; margin-top:34px; color:#5b6b73; font-size:.85rem; border-top:1px dashed #cddddd; padding-top:16px; }
  .foot b { color:#0d9488; }
  .noprint { text-align:center; margin-top:26px; }
  .noprint button { background:#0d9488; color:#fff; border:none; padding:12px 26px; border-radius:10px; font-size:1rem; font-weight:700; cursor:pointer; font-family:'Cairo',sans-serif; }
  @media print { .noprint { display:none; } body { padding:0; } }
</style>
</head>
<body>
  <div class="inv">
    <div class="head">
      <div>
        <h1>\u0641\u0627\u062a\u0648\u0631\u0629</h1>
        <div class="sub">\u0641\u0627\u062a\u0648\u0631\u0629 \u0628\u064a\u0639 \u2014 ${esc(date)}</div>
      </div>
      <div style="text-align:left">
        <div class="store">${esc(storeName)}</div>
        <div class="code">${esc(order.orderCode || '-')}</div>
      </div>
    </div>
    <div class="meta">
      <div class="card">
        <h3>\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0639\u0645\u064a\u0644</h3>
        <p><b>\u0627\u0644\u0627\u0633\u0645</b><span>${esc(order.customerName || '-')}</span></p>
        <p><b>\u0627\u0644\u0647\u0627\u062a\u0641</b><span>${esc(order.customerPhone || '-')}</span></p>
        <p><b>\u0627\u0644\u0628\u0631\u064a\u062f</b><span>${esc(order.customerEmail || '-')}</span></p>
        <p><b>\u0627\u0644\u062d\u0627\u0644\u0629</b><span class="status">${esc(getStatusLabel(order.status))}</span></p>
      </div>
      <div class="card">
        <h3>\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062a\u0648\u0635\u064a\u0644</h3>
        <p><b>\u0627\u0644\u0645\u062f\u064a\u0646\u0629</b><span>${esc(addr.city || '-')}</span></p>
        <p><b>\u0627\u0644\u062d\u064a</b><span>${esc(addr.district || '-')}</span></p>
        <p><b>\u0627\u0644\u0639\u0646\u0648\u0627\u0646</b><span>${esc(addr.fullAddress || '-')}</span></p>
      </div>
    </div>
    <table>
      <thead><tr><th>\u0627\u0644\u0645\u0646\u062a\u062c</th><th class="c">\u0627\u0644\u0643\u0645\u064a\u0629</th><th class="c">\u0627\u0644\u0633\u0639\u0631</th><th class="c">\u0627\u0644\u0645\u062c\u0645\u0648\u0639</th></tr></thead>
      <tbody>${rows || '<tr><td colspan=4 class=c>\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a</td></tr>'}</tbody>
    </table>
    <div class="totals">
      <div class="trow"><span>\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064a</span><span>${money(subtotal)}</span></div>
      ${discountRow}
      <div class="grand"><span>\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a</span><span>${money(order.total)}</span></div>
    </div>
    ${order.notes ? `<div class="card" style="margin-top:18px"><h3>\u0645\u0644\u0627\u062d\u0638\u0627\u062a</h3><p><span>${esc(order.notes)}</span></p></div>` : ''}
    <div class="foot">
      <p><b>\u0634\u0643\u0631\u0627\u064b \u0644\u062a\u0633\u0648\u0642\u0643 \u0645\u0639\u0646\u0627! \ud83d\udecd\ufe0f</b></p>
      <p>${esc(storeName)} \u00b7 ${esc(storeEmail)}${storePhone ? ' \u00b7 ' + esc(storePhone) : ''}</p>
    </div>
    <div class="noprint"><button onclick="window.print()">\ud83d\udda8\ufe0f \u0637\u0628\u0627\u0639\u0629 / \u062d\u0641\u0638 PDF</button></div>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 500); };<\/script>
</body>
</html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('\u064a\u0631\u062c\u0649 \u0627\u0644\u0633\u0645\u0627\u062d \u0628\u0627\u0644\u0646\u0648\u0627\u0641\u0630 \u0627\u0644\u0645\u0646\u0628\u062b\u0642\u0629', 'error'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  showToast('\u062a\u0645 \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629', 'success');
}

// ===== COUPONS =====
async function loadCoupons() {
  try {
    const snap = await getDocs(collection(db, 'coupons'));
    const coupons = [];
    snap.forEach(d => coupons.push({ id: d.id, ...d.data() }));
    renderCouponsTable(coupons);
  } catch (e) {}
}

function renderCouponsTable(coupons) {
  const tbody = document.getElementById('coupons-table-body');
  if (!coupons.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد كوبونات</td></tr>`; return; }
  tbody.innerHTML = coupons.map(c => `
    <tr>
      <td><strong style="color:var(--primary);letter-spacing:2px">${c.code}</strong></td>
      <td>${c.type === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت'}</td>
      <td>${c.value}${c.type === 'percentage' ? '%' : ' د.م.'}</td>
      <td>${c.usedCount || 0} / ${c.maxUses || '∞'}</td>
      <td>${c.forSubscribersOnly ? '<span style="color:var(--accent)">للمشتركين فقط</span>' : 'للجميع'}</td>
      <td><span class="status-badge ${c.active ? 'status-confirmed' : 'status-cancelled'}">${c.active ? 'فعال' : 'غير فعال'}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="editCoupon('${c.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" onclick="deleteCoupon('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

window.openCouponForm = () => {
  document.getElementById('coupon-id').value = '';
  document.getElementById('coupon-code').value = '';
  document.getElementById('coupon-type').value = 'percentage';
  document.getElementById('coupon-value').value = '';
  document.getElementById('coupon-max-uses').value = '';
  document.getElementById('coupon-subscribers-only').value = 'false';
  document.getElementById('coupon-active').value = 'true';
  document.getElementById('coupon-modal-title').textContent = 'إضافة كوبون جديد';
  openModal('coupon-modal');
};

window.editCoupon = async (id) => {
  const snap = await getDoc(doc(db, 'coupons', id));
  if (!snap.exists()) return;
  const c = snap.data();
  document.getElementById('coupon-id').value = id;
  document.getElementById('coupon-code').value = c.code || '';
  document.getElementById('coupon-type').value = c.type || 'percentage';
  document.getElementById('coupon-value').value = c.value || '';
  document.getElementById('coupon-max-uses').value = c.maxUses || '';
  document.getElementById('coupon-subscribers-only').value = c.forSubscribersOnly ? 'true' : 'false';
  document.getElementById('coupon-active').value = c.active ? 'true' : 'false';
  document.getElementById('coupon-modal-title').textContent = 'تعديل الكوبون';
  openModal('coupon-modal');
};

window.saveCoupon = async () => {
  const id = document.getElementById('coupon-id').value;
  const code = document.getElementById('coupon-code').value.trim().toUpperCase();
  const value = parseFloat(document.getElementById('coupon-value').value);
  if (!code || isNaN(value)) { showToast('يرجى ملء الحقول المطلوبة', 'error'); return; }
  const data = {
    code,
    type: document.getElementById('coupon-type').value,
    value,
    maxUses: parseInt(document.getElementById('coupon-max-uses').value) || 9999,
    forSubscribersOnly: document.getElementById('coupon-subscribers-only').value === 'true',
    active: document.getElementById('coupon-active').value === 'true',
    usedCount: 0,
    updatedAt: serverTimestamp()
  };
  try {
    if (id) { delete data.usedCount; await updateDoc(doc(db, 'coupons', id), data); }
    else await addDoc(collection(db, 'coupons'), { ...data, createdAt: serverTimestamp() });
    closeModal('coupon-modal');
    await loadCoupons();
    showToast(id ? 'تم تحديث الكوبون' : 'تم إضافة الكوبون', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); }
};

window.deleteCoupon = async (id) => {
  if (!confirm('حذف هذا الكوبون؟')) return;
  try { await deleteDoc(doc(db, 'coupons', id)); await loadCoupons(); showToast('تم الحذف', 'success'); } catch (e) { showToast('خطأ', 'error'); }
};

// ===== SETTINGS =====
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) {
      const data = snap.data();
      if (data.logoUrl) {
        document.getElementById('current-logo').src = data.logoUrl;
        document.getElementById('current-logo').style.display = 'block';
        document.getElementById('no-logo').style.display = 'none';
      }
      if (data.storeName) document.getElementById('store-name').value = data.storeName;
      if (data.storeEmail) document.getElementById('store-email').value = data.storeEmail;
      if (data.storePhone) document.getElementById('store-phone').value = data.storePhone;
      const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
      setVal('store-address', data.storeAddress);
      setVal('store-announcement', data.announcementText);
      setVal('social-instagram', data.socialInstagram);
      setVal('social-twitter', data.socialTwitter);
      setVal('social-facebook', data.socialFacebook);
      setVal('social-whatsapp', data.socialWhatsapp);
      setVal('store-whatsapp-support', data.whatsappSupport);
    }
  } catch (e) {}
}

window.uploadLogo = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const progressDiv = document.getElementById('logo-progress');
  const progressFill = document.getElementById('logo-progress-fill');
  const progressText = document.getElementById('logo-progress-text');
  progressDiv.style.display = 'flex';
  try {
    const url = await uploadFileWithProgress(file, (pct) => {
      progressFill.style.width = pct + '%';
      progressText.textContent = pct + '%';
    });
    await updateDoc(doc(db, 'settings', 'general'), { logoUrl: url });
    document.getElementById('current-logo').src = url;
    document.getElementById('current-logo').style.display = 'block';
    document.getElementById('no-logo').style.display = 'none';
    progressDiv.style.display = 'none';
    showToast('تم رفع الشعار بنجاح', 'success');
  } catch (err) { showToast('فشل رفع الشعار', 'error'); progressDiv.style.display = 'none'; }
};

// رفع ملف على Cloudinary مع تتبع نسبة التقدم (يستخدم لشريط التقدم عند رفع الشعار)
function uploadFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.round((event.loaded / event.total) * 100);
        onProgress(pct);
      }
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve(data.secure_url);
      } else {
        reject(new Error('فشل رفع الملف'));
      }
    };
    xhr.onerror = () => reject(new Error('حدث خطأ في الاتصال'));
    xhr.send(formData);
  });
}

window.saveStoreSettings = async () => {
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const data = {
    storeName: document.getElementById('store-name').value.trim(),
    storeEmail: document.getElementById('store-email').value.trim(),
    storePhone: document.getElementById('store-phone').value.trim(),
    storeAddress: val('store-address'),
    announcementText: val('store-announcement'),
    socialInstagram: val('social-instagram'),
    socialTwitter: val('social-twitter'),
    socialFacebook: val('social-facebook'),
    socialWhatsapp: val('social-whatsapp'),
    whatsappSupport: val('store-whatsapp-support'),
    updatedAt: serverTimestamp()
  };
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) await updateDoc(doc(db, 'settings', 'general'), data);
    else await addDoc(collection(db, 'settings'), { ...data, id: 'general' });
    showToast('تم حفظ الإعدادات', 'success');
  } catch (e) { showToast('حدث خطأ', 'error'); }
};

// ===== UPLOAD FILE HELPER (Cloudinary) =====
// ملاحظة: البارامتر path كان بيستخدم مع Firebase Storage لتحديد المجلد،
// دلوقتي مش لازم لأن Cloudinary بيرجع رابط الصورة مباشرة.
async function uploadFile(file, path) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    throw new Error('فشل رفع الصورة إلى Cloudinary');
  }

  const data = await response.json();
  return data.secure_url;
}

// ===== MODAL HELPERS =====
window.openModal = (id) => {
  document.getElementById(`${id}-overlay`).classList.add('open');
  document.getElementById(id).classList.add('open');
};
window.closeModal = (id) => {
  document.getElementById(`${id}-overlay`).classList.remove('open');
  document.getElementById(id).classList.remove('open');
};

// ===== STATUS HELPER =====
function getStatusLabel(status) {
  const map = { pending: 'قيد الانتظار', confirmed: 'مؤكد', processing: 'قيد المعالجة', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي' };
  return map[status] || 'قيد الانتظار';
}
window.getStatusLabel = getStatusLabel;

// ===== TOAST =====
window.showToast = (msg, type = 'info') => {
  const toast = document.getElementById('admin-toast');
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
  toast.className = `admin-toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
};

// ===== NEW-ORDER SOUND =====
let _audioCtx = null;
function playNewOrderSound() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    [880, 1174.66, 1567.98].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t = now + i * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.start(t); o.stop(t + 0.36);
    });
  } catch (e) { /* audio not available */ }
}

function listenNewOrders() {
  let first = true;
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(15));
  onSnapshot(q, (snap) => {
    if (first) { first = false; return; }
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'added') {
        playNewOrderSound();
        showToast('\ud83d\udd14 \u0637\u0644\u0628 \u062c\u062f\u064a\u062f \u0648\u0635\u0644!', 'success');
        if (typeof loadDashboardStats === 'function') loadDashboardStats();
        if (typeof loadOrders === 'function') loadOrders();
      }
    });
  });
}

// ===== REVIEWS MANAGEMENT =====
function getProductName(id) {
  const p = allProducts.find(x => x.id === id);
  return p ? p.name : '\u2014';
}

function populateReviewSelects() {
  const sel = document.getElementById('review-product');
  const filt = document.getElementById('review-filter-product');
  const opts = allProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if (sel) sel.innerHTML = opts || '<option value="">\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a</option>';
  if (filt) filt.innerHTML = '<option value="all">\u0643\u0644 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a</option>' + opts;
}

async function loadReviews() {
  try {
    const snap = await getDocs(collection(db, 'reviews'));
    allReviews = [];
    snap.forEach(d => allReviews.push({ id: d.id, ...d.data() }));
    allReviews.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderAdminReviews();
  } catch (e) { console.error('loadReviews', e); }
}

window.renderAdminReviews = () => {
  const tbody = document.getElementById('reviews-table-body');
  if (!tbody) return;
  const filt = document.getElementById('review-filter-product');
  const f = filt ? filt.value : 'all';
  const list = (f === 'all' || !f) ? allReviews : allReviews.filter(r => r.productId === f);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px">\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0642\u064a\u064a\u0645\u0627\u062a</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => `<tr>
    <td>${getProductName(r.productId)}</td>
    <td>${r.author || '-'}</td>
    <td style="color:#f59e0b;white-space:nowrap">${'\u2605'.repeat(r.rating || 0)}${'\u2606'.repeat(5 - (r.rating || 0))}</td>
    <td style="max-width:280px">${r.comment || ''}${r.source === 'admin' ? ' <span style="font-size:.7rem;opacity:.6">(\u0645\u0636\u0627\u0641 \u064a\u062f\u0648\u064a\u0627\u064b)</span>' : ''}</td>
    <td><button class="btn-delete" onclick="deleteReview('${r.id}')"><i class="fas fa-trash"></i></button></td>
  </tr>`).join('');
};

window.addAdminReview = async () => {
  const productId = document.getElementById('review-product').value;
  const author = document.getElementById('review-author').value.trim();
  const rating = parseInt(document.getElementById('review-rating').value);
  const comment = document.getElementById('review-comment').value.trim();
  const dateLabel = document.getElementById('review-date').value.trim();
  if (!productId || !author || !comment) { showToast('\u064a\u0631\u062c\u0649 \u0645\u0644\u0621 \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0644', 'error'); return; }
  try {
    await addDoc(collection(db, 'reviews'), { productId, author, rating, comment, dateLabel, source: 'admin', createdAt: serverTimestamp() });
    document.getElementById('review-author').value = '';
    document.getElementById('review-comment').value = '';
    document.getElementById('review-date').value = '';
    await updateProductRatingAgg(productId);
    await loadReviews();
    showToast('\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u062a\u0642\u064a\u064a\u0645', 'success');
  } catch (e) { showToast('\u062d\u062f\u062b \u062e\u0637\u0623', 'error'); console.error(e); }
};

window.deleteReview = async (id) => {
  const r = allReviews.find(x => x.id === id);
  if (!confirm('\u062d\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u062a\u0642\u064a\u064a\u0645\u061f')) return;
  try {
    await deleteDoc(doc(db, 'reviews', id));
    if (r) await updateProductRatingAgg(r.productId);
    await loadReviews();
    showToast('\u062a\u0645 \u0627\u0644\u062d\u0630\u0641', 'success');
  } catch (e) { showToast('\u062e\u0637\u0623', 'error'); }
};

async function updateProductRatingAgg(productId) {
  try {
    const snap = await getDocs(query(collection(db, 'reviews'), where('productId', '==', productId)));
    let sum = 0, n = 0;
    snap.forEach(d => { const v = d.data().rating; if (v) { sum += v; n++; } });
    const avg = n ? Math.round((sum / n) * 10) / 10 : 0;
    await updateDoc(doc(db, 'products', productId), { rating: avg, ratingCount: n });
  } catch (e) { console.error('agg', e); }
}
