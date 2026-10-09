const PHONE = /^1[3-9]\d{9}$/;
const ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' }
});
const clean = (value) => String(value ?? '').trim();
const validQuantity = (value) => Number.isInteger(Number(value)) && Number(value) >= 0;

function adminAuthorized(request, env) {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Basic ')) return false;
  try {
    const [user, password] = atob(header.slice(6)).split(':');
    return user === ADMIN_USERNAME && password === (env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD);
  } catch { return false; }
}

function requireAdmin(request, env) {
  return adminAuthorized(request, env) ? null : response({ error: '管理员身份验证失败' }, 401);
}

async function requestBody(request) {
  try { return await request.json(); } catch { return {}; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (request.method === 'POST' && path === '/api/admin/login') {
        const data = await requestBody(request);
        if (clean(data.username) !== ADMIN_USERNAME || clean(data.password) !== (env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD)) {
          return response({ error: '账号或密码错误' }, 401);
        }
        return response({ token: btoa(`${ADMIN_USERNAME}:${clean(data.password)}`) });
      }

      if (request.method === 'GET' && path === '/api/books') {
        const keyword = clean(url.searchParams.get('title'));
        const statement = keyword
          ? env.DB.prepare('SELECT * FROM books WHERE title LIKE ? ORDER BY title ASC LIMIT 10').bind(`%${keyword}%`)
          : env.DB.prepare('SELECT * FROM books ORDER BY id DESC');
        const data = await statement.all();
        return response(data.results);
      }

      if (request.method === 'GET' && path.startsWith('/api/books/barcode/')) {
        const barcode = decodeURIComponent(path.slice('/api/books/barcode/'.length));
        const book = await env.DB.prepare('SELECT * FROM books WHERE barcode = ?').bind(barcode).first();
        return book ? response(book) : response({ error: '未找到该条形码对应的图书' }, 404);
      }

      if (request.method === 'GET' && path === '/api/my-records') {
        const phone = clean(url.searchParams.get('phone'));
        if (!PHONE.test(phone)) return response({ error: '请输入正确的 11 位中国大陆手机号码' }, 400);
        const data = await env.DB.prepare(`SELECT r.*, b.title, b.barcode FROM borrow_records r
          JOIN books b ON b.id = r.book_id WHERE r.phone = ? ORDER BY r.borrowed_at DESC`).bind(phone).all();
        return response(data.results);
      }

      if (request.method === 'GET' && path === '/api/admin/records') {
        const denied = requireAdmin(request, env); if (denied) return denied;
        const data = await env.DB.prepare(`SELECT r.*, b.title, b.barcode FROM borrow_records r
          JOIN books b ON b.id = r.book_id ORDER BY r.borrowed_at DESC`).all();
        return response(data.results);
      }

      if (request.method === 'POST' && path === '/api/books') {
        const denied = requireAdmin(request, env); if (denied) return denied;
        const data = await requestBody(request), title = clean(data.title), barcode = clean(data.barcode), quantity = Number(data.quantity);
        if (!title || !barcode || !validQuantity(quantity) || quantity < 1) return response({ error: '请填写书名、条形码与大于 0 的数量' }, 400);
        const duplicate = await env.DB.prepare('SELECT id FROM books WHERE barcode = ?').bind(barcode).first();
        if (duplicate) return response({ error: '此条形码已存在，请直接修改库存' }, 409);
        const saved = await env.DB.prepare('INSERT INTO books(title, barcode, total_quantity, available_quantity) VALUES (?, ?, ?, ?)').bind(title, barcode, quantity, quantity).run();
        return response({ ok: true, id: saved.meta.last_row_id }, 201);
      }

      if (request.method === 'PATCH' && /^\/api\/books\/\d+$/.test(path)) {
        const denied = requireAdmin(request, env); if (denied) return denied;
        const id = Number(path.split('/').pop()), { quantity } = await requestBody(request), newTotal = Number(quantity);
        if (!validQuantity(newTotal)) return response({ error: '库存数量不正确' }, 400);
        const book = await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(id).first();
        if (!book) return response({ error: '图书不存在' }, 404);
        const onLoan = book.total_quantity - book.available_quantity;
        if (newTotal < onLoan) return response({ error: `尚有 ${onLoan} 本未完成归还，数量不能更低` }, 400);
        await env.DB.prepare('UPDATE books SET total_quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(newTotal, newTotal - onLoan, id).run();
        return response({ ok: true });
      }

      if (request.method === 'DELETE' && /^\/api\/books\/\d+$/.test(path)) {
        const denied = requireAdmin(request, env); if (denied) return denied;
        const id = Number(path.split('/').pop());
        const active = await env.DB.prepare("SELECT COUNT(*) AS amount FROM borrow_records WHERE book_id = ? AND status != 'RETURNED'").bind(id).first();
        if (active.amount) return response({ error: '此书存在未完成借还记录，不能删除' }, 400);
        await env.DB.prepare('DELETE FROM books WHERE id = ?').bind(id).run();
        return response({ ok: true });
      }

      if (request.method === 'POST' && path === '/api/borrow') {
        const data = await requestBody(request), phone = clean(data.phone), name = clean(data.name), barcode = clean(data.barcode);
        if (!PHONE.test(phone)) return response({ error: '请输入正确的 11 位中国大陆手机号码' }, 400);
        if (!name || !barcode) return response({ error: '请填写姓名并扫描或填写图书条形码' }, 400);
        const book = await env.DB.prepare('SELECT * FROM books WHERE barcode = ?').bind(barcode).first();
        if (!book) return response({ error: '未找到该图书' }, 404);
        if (book.available_quantity < 1) return response({ error: '该图书当前无可借库存' }, 400);
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO users(phone, name) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP`).bind(phone, name),
          env.DB.prepare('UPDATE books SET available_quantity = available_quantity - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND available_quantity > 0').bind(book.id),
          env.DB.prepare('INSERT INTO borrow_records(book_id, phone, borrower_name) VALUES (?, ?, ?)').bind(book.id, phone, name)
        ]);
        return response({ ok: true, title: book.title });
      }

      if (request.method === 'POST' && /^\/api\/records\/\d+\/request-return$/.test(path)) {
        const id = Number(path.split('/')[3]), { phone } = await requestBody(request);
        const changed = await env.DB.prepare(`UPDATE borrow_records SET status = 'RETURN_PENDING', return_requested_at = CURRENT_TIMESTAMP
          WHERE id = ? AND phone = ? AND status = 'BORROWED'`).bind(id, clean(phone)).run();
        return changed.meta.changes ? response({ ok: true }) : response({ error: '该借阅记录当前不能归还' }, 400);
      }

      if (request.method === 'POST' && /^\/api\/records\/\d+\/confirm-return$/.test(path)) {
        const denied = requireAdmin(request, env); if (denied) return denied;
        const id = Number(path.split('/')[3]);
        const record = await env.DB.prepare("SELECT * FROM borrow_records WHERE id = ? AND status = 'RETURN_PENDING'").bind(id).first();
        if (!record) return response({ error: '未找到待确认归还记录' }, 404);
        await env.DB.batch([
          env.DB.prepare("UPDATE borrow_records SET status = 'RETURNED', returned_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'RETURN_PENDING'").bind(id),
          env.DB.prepare('UPDATE books SET available_quantity = available_quantity + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(record.book_id)
        ]);
        return response({ ok: true });
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error(error);
      return response({ error: '服务器处理失败，请稍后重试' }, 500);
    }
  }
};
