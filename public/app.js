const $ = selector => document.querySelector(selector);
const state = { user: null, csrf: null, catalog: [], listings: [], collection: [], cart: [], orders: { purchases: [], sales: [] }, page: 'market', search: '', type: 'all', sort: 'featured' };
const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const types = { all: 'Tất cả', fire: 'Lửa', water: 'Nước', grass: 'Cỏ', electric: 'Điện', psychic: 'Tâm linh', dragon: 'Rồng', normal: 'Thường' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function api(path, body) {
  const response = await fetch(`/api/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf || '' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      state.user = null; state.csrf = null; state.cart = []; state.collection = []; state.orders = { purchases: [], sales: [] };
      closeModal(); render();
    }
    throw new Error(result.error || 'Không thể kết nối máy chủ.');
  }
  return result;
}
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500); }
function showModal(content) { $('#modal-body').innerHTML = content; if (!$('#modal').open) $('#modal').showModal(); }
function closeModal() { $('#modal').close(); }
function showError(selector, error) { const target = $(selector); if (target) target.textContent = error.message; else toast(error.message); }
$('#close-modal').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target === $('#modal') && (e.offsetX < 0 || e.offsetY < 0 || e.offsetX > e.target.clientWidth || e.offsetY > e.target.clientHeight)) closeModal(); });
function cardArt(card, hero = false) {
  return `<div class="card-art type-${escape(card.type)} ${hero ? 'hero-card' : ''}" aria-label="Minh họa ${escape(card.name)}"><div class="tcg-top"><strong>${escape(card.name)}</strong><span>HP ${card.hp} <b>${escape(card.symbol)}</b></span></div><div class="tcg-picture"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="creature">${escape(card.symbol)}</span><span class="art-label">POKÉMON / COLLECTION</span></div><div class="tcg-caption">${escape(card.type.toUpperCase())} TYPE · SPECIAL EDITION</div><div class="tcg-move"><span>✦ &nbsp; Collector’s spirit</span><b>${Math.floor(card.hp / 3)}</b></div><p class="tcg-flavor">A little piece of a much bigger adventure.</p><div class="tcg-bottom"><span>ILLUSTRATION / POKECARD</span><b>${escape(card.number)} ★</b></div></div>`;
}
function hero() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> MỘT THẾ GIỚI NHỎ. ĐAM MÊ THẬT LỚN.</div><h1>Mỗi chiếc card,<br>một <em>câu chuyện.</em></h1><p>Tìm mảnh ghép còn thiếu. Chia sẻ bộ sưu tập.<br>Gặp những người cùng chung đam mê Pokémon.</p><div class="hero-actions"><a class="button dark" href="#cards">Khám phá card <span>↗</span></a><button class="button outline" data-action="sell">Đăng bán card <span>＋</span></button></div><div class="hero-note"><span class="avatars"><i>A</i><i>M</i><i>K</i></span><span>Góc hẹn của người sưu tầm<br><strong>Trao đổi đam mê, kết nối câu chuyện.</strong></span></div></div><div class="hero-stage"><span class="stage-label">THE COLLECTOR’S CORNER</span><div class="hero-back">${cardArt(state.catalog[2], true)}</div><div class="hero-front">${cardArt(state.catalog[0], true)}</div><span class="stage-star">✳</span><div class="stage-caption"><span>001 — 151 COLLECTION</span><strong>Find your next favorite.</strong></div><span class="stage-side">GOTTA COLLECT THE MOMENTS</span></div></section><section class="benefits"><span>✧ <strong>Card cho mọi bộ sưu tập</strong></span><span>◇ <strong>Thông tin giá minh bạch</strong></span><span>↗ <strong>Kết nối người sưu tầm</strong></span><span>◎ <strong>Quản lý ngay một nơi</strong></span></section>`;
}
function listingCard(item) {
  return `<article class="product"><button class="product-image" data-action="detail" data-id="${item.id}" aria-label="Xem ${escape(item.card.name)}">${cardArt(item.card)}<span class="condition">${escape(item.condition)}</span></button><div class="product-meta"><span>${escape(item.card.set.split(' · ')[1])}</span><span>${escape(item.card.number)}</span></div><button class="product-title" data-action="detail" data-id="${item.id}">${escape(item.card.name)} <span>↗</span></button><p class="rarity">${escape(item.card.rarity)}</p><div class="price-row"><strong>${money(item.price)}</strong><button class="add-button" data-action="add-cart" data-id="${item.id}" aria-label="Thêm ${escape(item.card.name)} vào giỏ" ${state.user?.id === item.user_id ? 'disabled' : ''}>＋</button></div><div class="seller"><span class="seller-dot"></span>${escape(item.seller)}<span>${item.quantity} card có sẵn</span></div></article>`;
}
function filteredListings() {
  let items = state.listings.filter(i => (state.type === 'all' || i.card.type === state.type) && `${i.card.name} ${i.card.set} ${i.card.number} ${i.seller}`.toLowerCase().includes(state.search.toLowerCase()));
  if (state.sort === 'price-asc') items.sort((a, b) => a.price - b.price);
  if (state.sort === 'price-desc') items.sort((a, b) => b.price - a.price);
  if (state.sort === 'newest') items.sort((a, b) => b.id - a.id);
  return items;
}
function renderProducts() {
  const items = filteredListings();
  const resultsCountElement = document.getElementById('results-count');
  resultsCountElement.textContent = `${items.length} tin bán đang chờ bạn khám phá`;
  const searchLabel = new URLSearchParams(window.location.search).get('q');
  if (searchLabel) {
    const span = document.createElement('span');
    span.textContent = searchLabel;
    resultsCountElement.appendChild(document.createTextNode(' '));
    resultsCountElement.appendChild(span);
  }
  $('#product-grid').innerHTML = items.length ? items.map(listingCard).join('') : empty('Chưa tìm thấy card phù hợp', 'Thử tên khác hoặc chọn một hệ Pokémon khác.');
}
function empty(title, copy, action = '') { return `<div class="empty"><span>◇</span><h3>${escape(title)}</h3><p>${escape(copy)}</p>${action}</div>`; }
function pageHeading(kicker, title, copy, action = '') { return `<section class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${copy}</p></div>${action}</section>`; }
function render() {
  document.querySelectorAll('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === state.page));
  $('#account-button').textContent = state.user ? `${state.user.name} ↗` : 'Đăng nhập ↗';
  $('#cart-count').textContent = state.cart.reduce((sum, i) => sum + i.cart_quantity, 0);
  const main = $('#main');
  if (state.page === 'market') {
    main.innerHTML = `${hero()}<section id="cards" class="market"><div class="section-heading"><div><span class="eyebrow">KHÁM PHÁ BỘ SƯU TẬP</span><h2>Chiếc card tiếp theo của bạn.</h2><p id="results-count"></p></div><label class="sort-label">Sắp xếp <select id="sort"><option value="featured">Nổi bật</option><option value="newest">Mới nhất</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option></select></label></div><div class="filter-bar"><div class="tabs" role="group" aria-label="Lọc theo hệ">${Object.entries(types).map(([key, label]) => `<button class="tab ${state.type === key ? 'selected' : ''}" data-action="filter" data-type="${key}">${label}</button>`).join('')}</div><label class="search"><span aria-hidden="true">⌕</span><input id="search" placeholder="Tìm tên card, bộ thẻ…" aria-label="Tìm kiếm card" value="${escape(state.search)}"></label></div><div id="product-grid" class="product-grid"></div><div class="collection-banner"><span class="banner-symbol">✳</span><div><span class="eyebrow">BỘ SƯU TẬP CỦA BẠN, CÂU CHUYỆN CỦA BẠN</span><h2>Đam mê xứng đáng có một góc riêng.</h2><p>Lưu giữ những chiếc card yêu thích và bắt đầu hành trình sưu tầm.</p></div><a href="#collection" class="button dark">Tạo bộ sưu tập ↗</a></div></section>`;
    $('#sort').value = state.sort;
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; renderProducts(); });
    $('#search').addEventListener('input', e => { state.search = e.target.value; renderProducts(); });
    renderProducts();
    return;
  }
  const headings = { collection: ['GÓC NHỎ CỦA BẠN', 'Bộ sưu tập', 'Quản lý những chiếc card bạn đang sở hữu.'], selling: ['CHIA SẺ ĐAM MÊ', 'Card đang bán', 'Theo dõi tin bán và số lượng còn lại.'], orders: ['HÀNH TRÌNH SƯU TẦM', 'Đơn hàng', 'Lịch sử mua và bán của bạn. Thanh toán được giả lập.'] };
  const h = headings[state.page];
  main.innerHTML = pageHeading(...h, `<button class="button dark" data-action="${state.page === 'collection' ? 'collect' : 'sell'}">${state.page === 'collection' ? 'Thêm card ＋' : 'Đăng bán card ＋'}</button>`) + '<section class="workspace" id="workspace"></section>';
  const workspace = $('#workspace');
  if (!state.user) { workspace.innerHTML = empty('Câu chuyện bắt đầu từ đây', 'Đăng nhập để lưu bộ sưu tập và quản lý giao dịch.', '<button class="button dark" data-action="auth">Đăng nhập / Đăng ký ↗</button>'); return; }
  if (state.page === 'collection') {
    workspace.innerHTML = `<div class="summary-strip"><span><strong>${state.collection.length}</strong> loại card</span><span><strong>${state.collection.reduce((s, i) => s + i.quantity, 0)}</strong> card trong bộ sưu tập</span><p>Card đang đăng bán được giữ riêng khỏi bộ sưu tập.</p></div>` + (state.collection.length ? `<div class="product-grid">${state.collection.map(i => `<article class="product"><div class="product-image">${cardArt(i.card)}</div><div class="product-meta">${escape(i.card.set)}</div><h3>${escape(i.card.name)}</h3><div class="price-row"><span>Sở hữu <strong>${i.quantity} card</strong></span><button class="button outline small" data-action="sell" data-card="${i.card_id}">Đăng bán ↗</button></div></article>`).join('')}</div>` : empty('Một bộ sưu tập đang chờ được viết', 'Thêm card bạn sở hữu hoặc tìm mua card trên chợ.', '<button class="button dark" data-action="collect">Thêm card đầu tiên ＋</button>'));
  } else if (state.page === 'selling') {
    const listings = state.listings.filter(i => i.user_id === state.user.id);
    workspace.innerHTML = listings.length ? `<div class="product-grid">${listings.map(i => `<div>${listingCard(i)}<button class="button outline full" data-action="cancel" data-id="${i.id}">Dừng bán & trả card về bộ sưu tập</button></div>`).join('')}</div>` : empty('Bạn chưa có tin bán nào', 'Thêm card vào bộ sưu tập, sau đó đăng bán để chia sẻ với cộng đồng.', '<button class="button dark" data-action="sell">Đăng bán card ＋</button>');
  } else {
    workspace.innerHTML = `<h2>Đơn mua (${state.orders.purchases.length})</h2>` + (state.orders.purchases.length ? state.orders.purchases.map(o => `<article class="order"><div class="order-head"><strong>Đơn #${String(o.id).padStart(5, '0')}</strong><span>${new Date(o.created).toLocaleString('vi-VN')}</span><span class="pill">Hoàn tất giả lập</span></div>${o.items.map(i => `<div class="order-line"><span>${escape(i.card.name)} × ${i.quantity}</span><strong>${money(i.price * i.quantity)}</strong></div>`).join('')}<div class="order-total">Tổng cộng <strong>${money(o.total)}</strong></div></article>`).join('') : empty('Chưa có đơn mua', 'Chiếc card tiếp theo có thể đang đợi bạn tại chợ.', '<a class="button outline" href="#market">Khám phá card ↗</a>')) + `<h2 class="sales-title">Lịch sử bán (${state.orders.sales.length})</h2>` + (state.orders.sales.length ? state.orders.sales.map(i => `<article class="order"><div class="order-line"><span>Đơn #${i.order_id} · ${escape(i.card.name)} × ${i.quantity}</span><strong>${money(i.quantity * i.price)}</strong></div><p>${new Date(i.created).toLocaleString('vi-VN')} · Hoàn tất giả lập</p></article>`).join('') : '<p class="muted">Giao dịch bán sẽ xuất hiện ở đây khi có người mua card của bạn.</p>');
  }
}
async function refresh() {
  state.listings = await api('listings');
  if (state.user) [state.collection, state.cart, state.orders] = await Promise.all([api('collection'), api('cart'), api('orders')]);
  else { state.collection = []; state.cart = []; state.orders = { purchases: [], sales: [] }; }
  render();
}
function auth(register = false) {
  showModal(`<h2 id="modal-title">${register ? 'Bắt đầu bộ sưu tập.' : 'Chào mừng trở lại.'}</h2><p class="muted">Một nơi nhỏ cho niềm đam mê lớn của bạn.</p><form id="auth-form">${register ? '<label>Tên hiển thị<input name="name" autocomplete="name" required minlength="2" maxlength="60" placeholder="Tên của bạn"></label>' : ''}<label>Email<input name="email" type="email" autocomplete="email" maxlength="160" required placeholder="ban@example.com"></label><label>Mật khẩu<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="${register ? 10 : 1}" maxlength="128" required placeholder="${register ? 'Ít nhất 10 ký tự' : 'Mật khẩu của bạn'}"></label><p id="form-error" class="form-error" role="alert"></p><button class="button dark full" type="submit">${register ? 'Tạo tài khoản' : 'Đăng nhập'} ↗</button></form><button class="text-button full" id="switch-auth">${register ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký miễn phí'}</button><p class="fine-print">Môi trường thử nghiệm: hãy dùng thông tin giả lập.</p>`);
  $('#switch-auth').addEventListener('click', () => auth(!register));
  bindForm('#auth-form', async data => { const session = await api(register ? 'register' : 'login', data); Object.assign(state, session); await refresh(); closeModal(); toast(`Xin chào ${state.user.name}!`); });
}
function bindForm(selector, callback) {
  $(selector).addEventListener('submit', async e => {
    e.preventDefault(); const button = e.target.querySelector('[type=submit]'); button.disabled = true; $('#form-error').textContent = '';
    try { await callback(Object.fromEntries(new FormData(e.target))); } catch (error) { showError('#form-error', error); } finally { button.disabled = false; }
  });
}
function requireUser() { if (state.user) return true; auth(); return false; }
function collect() {
  if (!requireUser()) return;
  showModal(`<h2 id="modal-title">Thêm vào bộ sưu tập.</h2><p class="muted">Ghi nhận card bạn sở hữu. Thao tác này không tạo giao dịch mua.</p><form id="collect-form"><label>Chọn card<select name="cardId">${state.catalog.map(c => `<option value="${c.id}">${escape(c.name)} · ${escape(c.number)}</option>`).join('')}</select></label><label>Số lượng<input name="quantity" type="number" min="1" max="100" value="1" required></label><p id="form-error" class="form-error" role="alert"></p><button type="submit" class="button dark full">Lưu vào bộ sưu tập ＋</button></form>`);
  bindForm('#collect-form', async data => { await api('collection', { cardId: Number(data.cardId), quantity: Number(data.quantity) }); await refresh(); closeModal(); toast('Đã thêm card vào bộ sưu tập.'); });
}
function sell(cardId) {
  if (!requireUser()) return;
  if (!state.collection.length) { showModal(`<h2 id="modal-title">Bắt đầu từ bộ sưu tập.</h2><p class="muted">Bạn cần có card trong bộ sưu tập trước khi đăng bán.</p><button class="button dark full" data-action="collect">Thêm card đang sở hữu ＋</button>`); return; }
  showModal(`<h2 id="modal-title">Gửi card đến một câu chuyện mới.</h2><p class="muted">Card đăng bán được giữ riêng để tránh bán trùng.</p><form id="sell-form"><label>Card trong bộ sưu tập<select name="cardId">${state.collection.map(i => `<option value="${i.card_id}" ${Number(cardId) === i.card_id ? 'selected' : ''}>${escape(i.card.name)} · đang có ${i.quantity}</option>`).join('')}</select></label><div class="form-row"><label>Giá mỗi card (₫)<input name="price" type="number" min="1000" max="100000000" step="1000" value="100000" required></label><label>Số lượng<input name="quantity" type="number" min="1" max="100" value="1" required></label></div><label>Tình trạng<select name="condition"><option>Near Mint</option><option>Mint</option><option>Lightly Played</option><option>Played</option></select></label><label>Mô tả<textarea name="description" maxlength="1000" rows="3" placeholder="Chia sẻ thêm về chiếc card của bạn…"></textarea></label><p id="form-error" class="form-error" role="alert"></p><button class="button dark full" type="submit">Đăng bán card ↗</button></form>`);
  bindForm('#sell-form', async data => { await api('listings', { ...data, cardId: Number(data.cardId), price: Number(data.price), quantity: Number(data.quantity) }); await refresh(); closeModal(); toast('Tin bán đã được đăng.'); });
}
function cart() {
  if (!requireUser()) return;
  const total = state.cart.reduce((s, i) => s + i.price * i.cart_quantity, 0);
  showModal(`<h2 id="modal-title">Giỏ hàng của bạn.</h2>${state.cart.length ? `<div class="cart-items">${state.cart.map(i => `<div class="cart-item"><div class="cart-art">${cardArt(i.card)}</div><div class="cart-item-copy"><strong>${escape(i.card.name)}</strong><p>${money(i.price)}</p><label class="quantity-label">Số lượng <input aria-label="Số lượng ${escape(i.card.name)}" type="number" min="1" max="${i.quantity}" value="${i.cart_quantity}" data-cart-id="${i.id}"></label></div><button class="icon-button" data-action="remove-cart" data-id="${i.id}" aria-label="Bỏ ${escape(i.card.name)}">×</button></div>`).join('')}</div><div class="order-total">Tổng cộng <strong>${money(total)}</strong></div><p class="fine-print">Giao dịch giả lập. Không thu tiền, không giao hàng thực tế. Card sẽ được thêm vào bộ sưu tập sau khi đặt hàng.</p><button class="button dark full" id="checkout">Xác nhận đặt hàng ↗</button>` : empty('Giỏ hàng còn trống', 'Thêm một chiếc card yêu thích để bắt đầu.')}<p class="form-error" id="cart-error" role="alert"></p>`);
  $('#checkout')?.addEventListener('click', async e => { e.target.disabled = true; try { const result = await api('checkout', {}); await refresh(); closeModal(); location.hash = 'orders'; toast(`Đã tạo đơn #${result.id}. Card đã vào bộ sưu tập.`); } catch (error) { showError('#cart-error', error); e.target.disabled = false; } });
  document.querySelectorAll('[data-cart-id]').forEach(input => input.addEventListener('change', async () => { try { await api('cart', { listingId: Number(input.dataset.cartId), quantity: Number(input.value) }); await refresh(); cart(); } catch (error) { showError('#cart-error', error); } }));
}
function detail(id) {
  const i = state.listings.find(i => i.id === Number(id));
  if (!i) return;
  showModal(`<div class="detail-art">${cardArt(i.card)}</div><span class="eyebrow">${escape(i.card.set)}</span><h2 id="modal-title">${escape(i.card.name)}</h2><p class="muted">${escape(i.card.rarity)} · ${escape(i.card.number)} · ${escape(i.condition)}</p><p class="description">${escape(i.description || 'Người bán chưa thêm mô tả.')}</p><div class="order-total"><span>${escape(i.seller)} · còn ${i.quantity}</span><strong>${money(i.price)}</strong></div><p class="fine-print">Hình minh họa được tạo bằng CSS, không phải ảnh card thực tế. Giá và tin bán là dữ liệu thử nghiệm.</p><button class="button dark full" data-action="add-cart" data-id="${i.id}" ${i.user_id === state.user?.id ? 'disabled' : ''}>${i.user_id === state.user?.id ? 'Card do bạn đăng bán' : 'Thêm vào giỏ hàng ＋'}</button>`);
}
document.addEventListener('click', async e => {
  const button = e.target.closest('[data-action]'); if (!button || button.disabled) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'auth') auth();
    if (action === 'collect') collect();
    if (action === 'sell') sell(button.dataset.card);
    if (action === 'detail') detail(id);
    if (action === 'filter') { state.type = button.dataset.type; document.querySelectorAll('.tab').forEach(t => t.classList.toggle('selected', t.dataset.type === state.type)); renderProducts(); }
    if (action === 'add-cart') { if (!requireUser()) return; button.disabled = true; const old = state.cart.find(i => i.id === Number(id)); await api('cart', { listingId: Number(id), quantity: (old?.cart_quantity || 0) + 1 }); await refresh(); toast('Đã thêm card vào giỏ hàng.'); }
    if (action === 'remove-cart') { await api('cart', { listingId: Number(id), quantity: 0 }); await refresh(); cart(); }
    if (action === 'cancel') { button.disabled = true; await api('listings/cancel', { id: Number(id) }); await refresh(); toast('Đã dừng bán và trả card về bộ sưu tập.'); }
    if (action === 'logout') { await api('logout', {}); state.user = null; state.csrf = null; await refresh(); closeModal(); toast('Đã đăng xuất.'); }
  } catch (error) { toast(error.message); } finally { button.disabled = false; }
});
$('#cart-button').addEventListener('click', cart);
$('#account-button').addEventListener('click', () => state.user ? showModal(`<h2 id="modal-title">Xin chào, ${escape(state.user.name)}.</h2><p class="muted">${escape(state.user.email)}</p><button class="button outline full" data-action="logout">Đăng xuất ↗</button>`) : auth());
function navigate() { const page = location.hash.slice(1); state.page = ['market', 'collection', 'selling', 'orders'].includes(page) ? page : 'market'; render(); if (page === 'cards') $('#cards')?.scrollIntoView(); else window.scrollTo({ top: 0, behavior: 'instant' }); }
window.addEventListener('hashchange', navigate);
try { const [session, catalog] = await Promise.all([api('me'), api('catalog')]); Object.assign(state, session, { catalog }); await refresh(); navigate(); } catch { $('#main').innerHTML = empty('Chưa kết nối được máy chủ', 'Kiểm tra ứng dụng đã chạy bằng npm start, sau đó tải lại trang.'); }
