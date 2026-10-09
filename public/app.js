(() => {
  const $ = id => document.getElementById(id);
  const tokenKey = 'library_admin_token';
  const passwordKey = 'library_saved_admin_password';
  const state = { token: localStorage.getItem(tokenKey) || '' };
  const toast = (message, error = false) => { const el = $('toast'); el.textContent = message; el.className = `show${error ? ' error' : ''}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = ''; }, 3200); };
  async function api(path, options = {}) { const headers = options.body ? { 'content-type': 'application/json' } : {}; if (state.token) headers.Authorization = `Basic ${state.token}`; const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw Error(data.error || `请求失败（${response.status}）`); return data; }
  const post = body => ({ method: 'POST', body: JSON.stringify(body) });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const status = { BORROWED: ['借阅中', 'borrowed'], RETURN_PENDING: ['待确认归还', 'pending'], RETURNED: ['已归还', 'returned'] };
  const date = value => value ? new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')).toLocaleString('zh-CN', { hour12: false }) : '—';
  const record = (item, admin = false) => { const current = status[item.status] || [item.status, '']; return `<article class="record-card"><div class="record-top"><strong>${esc(item.title)}</strong><span class="status ${current[1]}">${current[0]}</span></div><div class="record-details"><span><b>图书编码</b>${esc(item.barcode || '—')}</span><span><b>借阅人姓名</b>${esc(item.borrower_name || '—')}</span><span><b>联系电话</b>${esc(item.phone || '—')}</span><span><b>借阅时间</b>${date(item.borrowed_at)}</span><span><b>归还时间</b>${date(item.returned_at)}</span></div>${admin && item.status === 'RETURN_PENDING' ? '<button class="small confirm" data-id="' + item.id + '">确认收到归还</button>' : ''}${!admin && item.status === 'BORROWED' ? '<button class="small request" data-id="' + item.id + '">申请归还</button>' : ''}</article>`; };
  async function loadBooks() { const rows = await api('/api/books'); $('bookList').innerHTML = rows.length ? rows.map(book => `<div class="item"><div><strong>${esc(book.title)}</strong><div class="meta">图书编码：${esc(book.barcode)} · 可借 ${book.available_quantity}/${book.total_quantity}</div></div><div class="item-actions"><button class="small edit" data-id="${book.id}" data-q="${book.total_quantity}">修改数量</button><button class="small danger del" data-id="${book.id}">删除</button></div></div>`).join('') : '<div class="empty">暂无图书</div>'; }
  async function loadRecords() { const rows = await api('/api/admin/records'); const pending = rows.filter(row => row.status === 'RETURN_PENDING'); $('returnList').innerHTML = pending.length ? pending.map(row => record(row, true)).join('') : '<div class="empty">暂无待确认归还</div>'; $('adminRecords').innerHTML = rows.length ? rows.map(row => record(row, true)).join('') : '<div class="empty">暂无借还记录</div>'; }
  async function lookupBook(value) { const barcode = value.trim(); const preview = $('borrowBookPreview'); if (!barcode) { preview.classList.add('hidden'); return; } try { const book = await api(`/api/books/barcode/${encodeURIComponent(barcode)}`); preview.innerHTML = `<b>${esc(book.title)}</b><span>图书编码：${esc(book.barcode)} · 当前可借：${book.available_quantity}/${book.total_quantity}</span>`; preview.classList.remove('hidden'); } catch { preview.textContent = '未找到对应图书，请检查条形码'; preview.classList.remove('hidden'); } }
  function readerTab(name) { document.querySelectorAll('[data-reader-tab]').forEach(button => button.classList.toggle('active', button.dataset.readerTab === name)); $('borrowPanel').classList.toggle('hidden', name !== 'borrow'); $('readerRecordsPanel').classList.toggle('hidden', name !== 'records'); }
  function adminTab(name) { document.querySelectorAll('[data-admin-tab]').forEach(button => button.classList.toggle('active', button.dataset.adminTab === name)); document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== `${name}Panel`)); if (name !== 'catalog') loadRecords().catch(error => toast(error.message, true)); }
  const showReader = () => { $('adminView').classList.add('hidden'); $('readerView').classList.remove('hidden'); };
  const showAdmin = () => { $('readerView').classList.add('hidden'); $('adminView').classList.remove('hidden'); loadBooks().catch(error => toast(error.message, true)); };
  function prepareLogin() { const saved = localStorage.getItem(passwordKey) || ''; const password = $('adminPassword'); password.value = saved; if (!$('rememberPassword')) { const row = document.createElement('label'); row.className = 'remember-row'; row.innerHTML = '<input id="rememberPassword" type="checkbox"><span>记住密码</span>'; password.closest('label').after(row); } $('rememberPassword').checked = Boolean(saved); $('loginDialog').showModal(); }
  $('adminSwitch').onclick = () => state.token ? showAdmin() : prepareLogin();
  $('adminLogout').onclick = () => { state.token = ''; localStorage.removeItem(tokenKey); showReader(); };
  if (!$('backToReader')) { const button = document.createElement('button'); button.id = 'backToReader'; button.className = 'logout'; button.textContent = '返回借阅页面'; $('adminLogout').before(button); } $('backToReader').onclick = showReader;
  const mobileAdminActions = document.createElement('div');
  mobileAdminActions.className = 'mobile-admin-actions';
  mobileAdminActions.innerHTML = '<button type="button" class="small mobile-back-reader">返回借阅界面</button><button type="button" class="small danger mobile-admin-logout">退出管理后台</button>';
  $('catalogPanel').appendChild(mobileAdminActions);
  mobileAdminActions.querySelector('.mobile-back-reader').onclick = showReader;
  mobileAdminActions.querySelector('.mobile-admin-logout').onclick = () => { state.token = ''; localStorage.removeItem(tokenKey); showReader(); };
  $('loginForm').onsubmit = async event => { event.preventDefault(); const password = $('adminPassword').value; try { const data = await api('/api/admin/login', post({ username: $('adminUsername').value, password })); state.token = data.token; localStorage.setItem(tokenKey, data.token); if ($('rememberPassword').checked) localStorage.setItem(passwordKey, password); else localStorage.removeItem(passwordKey); $('loginDialog').close(); showAdmin(); } catch (error) { toast(error.message, true); } };
  $('bookForm').onsubmit = async event => { event.preventDefault(); try { await api('/api/books', post({ title: $('bookTitle').value, barcode: $('bookBarcode').value, quantity: Number($('bookQuantity').value) })); event.target.reset(); toast('图书已添加'); loadBooks(); } catch (error) { toast(error.message, true); } };
  $('borrowBarcode').addEventListener('input', event => { clearTimeout(lookupBook.timer); lookupBook.timer = setTimeout(() => lookupBook(event.target.value), 300); });
  $('borrowForm').onsubmit = async event => { event.preventDefault(); try { const data = await api('/api/borrow', post({ name: $('borrowName').value, phone: $('borrowPhone').value, barcode: $('borrowBarcode').value })); event.target.reset(); $('borrowBookPreview').classList.add('hidden'); toast(`借阅成功：${data.title}`); } catch (error) { toast(error.message, true); } };
  $('readerLookupForm').onsubmit = async event => { event.preventDefault(); try { const rows = await api(`/api/my-records?phone=${encodeURIComponent($('lookupPhone').value)}`); $('readerRecords').className = 'record-list'; $('readerRecords').innerHTML = rows.length ? rows.map(row => record(row)).join('') : '<div class="empty">暂无借阅记录</div>'; } catch (error) { toast(error.message, true); } };
  document.addEventListener('click', async event => { const target = event.target; try { if (target.matches('[data-reader-tab]')) readerTab(target.dataset.readerTab); if (target.matches('[data-admin-tab]')) adminTab(target.dataset.adminTab); if (target.matches('.scan')) { const input = $(target.dataset.scanTarget); input.focus(); toast('请使用扫码枪输入，或手动填写条形码'); } if (target.matches('.del') && confirm('确定删除这本书吗？')) { await api(`/api/books/${target.dataset.id}`, { method: 'DELETE' }); loadBooks(); toast('图书已删除'); } if (target.matches('.edit')) { const quantity = prompt('请输入新的总库存数量', target.dataset.q); if (quantity !== null) { await api(`/api/books/${target.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: Number(quantity) }) }); loadBooks(); toast('库存已更新'); } } if (target.matches('.confirm')) { await api(`/api/records/${target.dataset.id}/confirm-return`, { method: 'POST' }); loadRecords(); toast('已确认收到归还'); } if (target.matches('.request')) { const phone = prompt('请输入借阅时登记的手机号码'); if (phone) { await api(`/api/records/${target.dataset.id}/request-return`, post({ phone })); target.remove(); toast('已提交归还申请'); } } } catch (error) { toast(error.message, true); } });
  const shareButton = document.createElement('button');
  shareButton.id = 'shareReader';
  shareButton.type = 'button';
  shareButton.className = 'share-reader-button';
  shareButton.textContent = '分享页面';
  const shareActions = document.createElement('div');
  shareActions.className = 'share-reader-actions';
  shareActions.appendChild(shareButton);
  document.querySelector('.reader-main').appendChild(shareActions);
  const shareDialog = document.createElement('dialog');
  shareDialog.id = 'shareDialog';
  shareDialog.innerHTML = '<div style="padding:30px;position:relative;max-width:420px"><button class="close" type="button" id="closeShare">×</button><span class="step">SHARE PAGE</span><h2>分享借阅页面</h2><p style="color:var(--muted);font-size:13px">复制链接分享给朋友，或扫码打开页面。</p><div style="display:flex;gap:8px"><input id="shareUrl" readonly><button id="copyShareUrl" class="primary" type="button">复制链接</button></div><img id="shareQr" alt="借阅页面二维码" style="display:block;width:220px;height:220px;margin:20px auto 0"></div>';
  document.body.appendChild(shareDialog);
  const shareUrl = `${location.origin}${location.pathname}`;
  shareButton.onclick = () => { $('shareUrl').value = shareUrl; $('shareQr').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrl)}`; shareDialog.showModal(); };
  $('closeShare').onclick = () => shareDialog.close();
  $('copyShareUrl').onclick = async () => { try { await navigator.clipboard.writeText(shareUrl); toast('借阅页面链接已复制'); } catch { $('shareUrl').select(); document.execCommand('copy'); toast('借阅页面链接已复制'); } };
  let scannerStream;
  let scannerTimer;
  const stopScanner = () => { clearTimeout(scannerTimer); scannerStream?.getTracks().forEach(track => track.stop()); scannerStream = undefined; $('scannerVideo').srcObject = null; };
  const closeScanner = () => { stopScanner(); $('scannerDialog').close(); };
  async function startScanner(input) {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { toast('当前浏览器不支持摄像头条形码识别，请使用 Chrome 浏览器或手动输入', true); return; }
    $('scannerDialog').showModal();
    $('scanStatus').textContent = '请将图书条形码放入扫描框内';
    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const video = $('scannerVideo');
      video.srcObject = scannerStream;
      await video.play();
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
      const scanFrame = async () => { if (!scannerStream) return; try { const codes = await detector.detect(video); if (codes[0]?.rawValue) { input.value = codes[0].rawValue; closeScanner(); lookupBook(input.value); toast('条形码识别成功'); return; } } catch { /* Continue scanning while the camera initializes. */ } scannerTimer = setTimeout(scanFrame, 180); };
      scanFrame();
    } catch (error) { closeScanner(); toast('无法打开摄像头，请检查浏览器授权', true); }
  }
  document.querySelectorAll('.scan').forEach(button => { button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4M8 9v6M11 9v6M14 9v6M17 9v6" /></svg>'; button.classList.add('scan-icon'); button.setAttribute('aria-label', '扫描条形码'); button.title = '扫描条形码'; });
  document.addEventListener('click', event => { const scanButton = event.target.closest('.scan'); if (!scanButton) return; event.stopImmediatePropagation(); startScanner($(scanButton.dataset.scanTarget)); }, true);
  $('closeScanner').onclick = closeScanner;
  $('scannerDialog').addEventListener('close', stopScanner);
  const bookTitleField = document.createElement('label');
  bookTitleField.className = 'full book-search-field';
  bookTitleField.innerHTML = '<span>搜索书名</span><input id="borrowBookTitle" autocomplete="off" placeholder="输入书名，选择要借阅的图书" /><div id="borrowBookOptions" class="book-search-options hidden"></div>';
  $('borrowBarcode').closest('label').before(bookTitleField);
  function selectBorrowBook(book) { $('borrowBookTitle').value = book.title; $('borrowBarcode').value = book.barcode; $('borrowBookOptions').classList.add('hidden'); lookupBook(book.barcode); }
  async function searchBorrowBooks(value) { const keyword = value.trim(); const options = $('borrowBookOptions'); if (!keyword) { options.classList.add('hidden'); options.innerHTML = ''; return; } try { const books = await api(`/api/books?title=${encodeURIComponent(keyword)}`); options.innerHTML = books.length ? books.map(book => `<button type="button" class="book-search-option" data-book-title="${esc(book.title)}" data-book-barcode="${esc(book.barcode)}"><strong>${esc(book.title)}</strong><span>条形码：${esc(book.barcode)} · 可借：${book.available_quantity}/${book.total_quantity}</span></button>`).join('') : '<div class="book-search-empty">未找到匹配的图书</div>'; options.classList.remove('hidden'); } catch (error) { options.classList.add('hidden'); toast(error.message, true); } }
  $('borrowBookTitle').addEventListener('input', event => { clearTimeout(searchBorrowBooks.timer); searchBorrowBooks.timer = setTimeout(() => searchBorrowBooks(event.target.value), 250); });
  $('borrowBookOptions').addEventListener('click', event => { const option = event.target.closest('.book-search-option'); if (option) selectBorrowBook({ title: option.dataset.bookTitle, barcode: option.dataset.bookBarcode }); });
  readerTab('borrow');
})();
