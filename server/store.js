import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { catalog } from './catalog.js';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new AppError(`${label} không hợp lệ.`);
  return value;
}
export function text(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new AppError(`${label} phải có ${min}–${max} ký tự.`);
  return value.trim();
}
function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function validatePassword(value, minimum) {
  if (typeof value !== 'string' || value.length < minimum || value.length > 128) throw new AppError(`Mật khẩu phải có ${minimum}–128 ký tự.`);
  return value;
}
export function openStore(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS collection (user_id INTEGER REFERENCES users(id), card_id INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity >= 0), PRIMARY KEY(user_id,card_id));
    CREATE TABLE IF NOT EXISTS listings (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), card_id INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity >= 0), price INTEGER NOT NULL CHECK(price > 0), condition TEXT NOT NULL, description TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cart (user_id INTEGER REFERENCES users(id), listing_id INTEGER REFERENCES listings(id), quantity INTEGER NOT NULL CHECK(quantity > 0), PRIMARY KEY(user_id,listing_id));
    CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), total INTEGER NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id), seller_id INTEGER REFERENCES users(id), card_id INTEGER NOT NULL, quantity INTEGER NOT NULL, price INTEGER NOT NULL);
  `);
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    const seller = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run('PokeCard Studio', 'studio@example.invalid', passwordHash(randomBytes(32).toString('hex'))).lastInsertRowid;
    for (const c of catalog) db.prepare('INSERT INTO listings(user_id,card_id,quantity,price,condition,description) VALUES(?,?,?,?,?,?)').run(seller, c.id, 3 + c.id % 4, c.price, 'Near Mint', 'Card mẫu cho giao dịch giả lập. Thiết kế minh họa, không phải ảnh sản phẩm thực tế.');
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const withCard = row => ({ ...row, card: catalog.find(c => c.id === row.card_id) });
  const store = {
    close: () => db.close(),
    register(body) {
      const name = text(body.name, 2, 60, 'Tên');
      const email = text(body.email, 3, 160, 'Email').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Email không hợp lệ.');
      const password = validatePassword(body.password, 10);
      if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new AppError('Email đã được sử dụng.', 409);
      const result = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name, email, passwordHash(password));
      return { id: Number(result.lastInsertRowid), name, email };
    },
    login(body) {
      const email = text(body.email, 3, 160, 'Email').toLowerCase();
      const password = validatePassword(body.password, 1);
      const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      // Perform the same expensive derivation even for an unknown email.
      const [salt, hash] = (row?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
      const valid = timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
      if (!row || !valid) throw new AppError('Email hoặc mật khẩu chưa đúng.', 401);
      return { id: row.id, name: row.name, email: row.email };
    },
    createSession(user) {
      const token = randomBytes(32).toString('hex');
      const csrf = randomBytes(24).toString('hex');
      const now = Date.now();
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
      db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(token, user.id, csrf, now + 86400000);
      return { token, csrf, user };
    },
    session(token) {
      const row = db.prepare('SELECT users.id,users.name,users.email,sessions.csrf FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(token || '', Date.now());
      return row ? { user: { id: row.id, name: row.name, email: row.email }, csrf: row.csrf } : null;
    },
    logout(token) { db.prepare('DELETE FROM sessions WHERE token=?').run(token); },
    listings() { return db.prepare('SELECT listings.*, users.name AS seller FROM listings JOIN users ON users.id=listings.user_id WHERE quantity>0 ORDER BY listings.id').all().map(withCard); },
    collection(userId) { return db.prepare('SELECT * FROM collection WHERE user_id=? AND quantity>0').all(userId).map(withCard); },
    addCollection(userId, body) {
      const cardId = integer(body.cardId, 1, catalog.length, 'Card');
      const quantity = integer(body.quantity, 1, 100, 'Số lượng');
      db.prepare('INSERT INTO collection VALUES(?,?,?) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+excluded.quantity').run(userId, cardId, quantity);
    },
    createListing(userId, body) {
      const cardId = integer(body.cardId, 1, catalog.length, 'Card');
      const quantity = integer(body.quantity, 1, 100, 'Số lượng');
      const price = integer(body.price, 1000, 100000000, 'Giá');
      const condition = text(body.condition, 1, 30, 'Tình trạng');
      if (!['Mint', 'Near Mint', 'Lightly Played', 'Played'].includes(condition)) throw new AppError('Tình trạng không hợp lệ.');
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (description.length > 1000) throw new AppError('Mô tả tối đa 1000 ký tự.');
      return transaction(() => {
        const held = db.prepare('SELECT quantity FROM collection WHERE user_id=? AND card_id=?').get(userId, cardId);
        if (!held || held.quantity < quantity) throw new AppError('Bộ sưu tập không đủ card để đăng bán.');
        db.prepare('UPDATE collection SET quantity=quantity-? WHERE user_id=? AND card_id=?').run(quantity, userId, cardId);
        return Number(db.prepare('INSERT INTO listings(user_id,card_id,quantity,price,condition,description) VALUES(?,?,?,?,?,?)').run(userId, cardId, quantity, price, condition, description).lastInsertRowid);
      });
    },
    cancelListing(userId, id) {
      transaction(() => {
        const row = db.prepare('SELECT * FROM listings WHERE id=? AND user_id=? AND quantity>0').get(id, userId);
        if (!row) throw new AppError('Không tìm thấy tin bán của bạn.', 404);
        db.prepare('INSERT INTO collection VALUES(?,?,?) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+excluded.quantity').run(userId, row.card_id, row.quantity);
        db.prepare('UPDATE listings SET quantity=0 WHERE id=?').run(id);
        db.prepare('DELETE FROM cart WHERE listing_id=?').run(id);
      });
    },
    cart(userId) { return db.prepare('SELECT cart.quantity AS cart_quantity,listings.*,users.name AS seller FROM cart JOIN listings ON listings.id=cart.listing_id JOIN users ON users.id=listings.user_id WHERE cart.user_id=?').all(userId).map(withCard); },
    setCart(userId, body) {
      const id = integer(body.listingId, 1, Number.MAX_SAFE_INTEGER, 'Tin bán');
      const quantity = integer(body.quantity, 0, 100, 'Số lượng');
      if (!quantity) { db.prepare('DELETE FROM cart WHERE user_id=? AND listing_id=?').run(userId, id); return; }
      const row = db.prepare('SELECT * FROM listings WHERE id=?').get(id);
      if (!row || row.quantity < quantity) throw new AppError('Tin bán không đủ số lượng.');
      if (row.user_id === userId) throw new AppError('Bạn không thể mua card của chính mình.');
      db.prepare('INSERT INTO cart VALUES(?,?,?) ON CONFLICT(user_id,listing_id) DO UPDATE SET quantity=excluded.quantity').run(userId, id, quantity);
    },
    checkout(userId) {
      return transaction(() => {
        const items = store.cart(userId);
        if (!items.length) throw new AppError('Giỏ hàng đang trống.');
        for (const item of items) if (item.cart_quantity > item.quantity) throw new AppError(`${item.card.name} không còn đủ số lượng. Vui lòng cập nhật giỏ hàng.`, 409);
        const total = items.reduce((s, i) => s + i.price * i.cart_quantity, 0);
        const id = Number(db.prepare('INSERT INTO orders(user_id,total,created) VALUES(?,?,?)').run(userId, total, new Date().toISOString()).lastInsertRowid);
        for (const i of items) {
          db.prepare('UPDATE listings SET quantity=quantity-? WHERE id=?').run(i.cart_quantity, i.id);
          db.prepare('INSERT INTO order_items(order_id,seller_id,card_id,quantity,price) VALUES(?,?,?,?,?)').run(id, i.user_id, i.card_id, i.cart_quantity, i.price);
          db.prepare('INSERT INTO collection VALUES(?,?,?) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+excluded.quantity').run(userId, i.card_id, i.cart_quantity);
        }
        db.prepare('DELETE FROM cart WHERE user_id=?').run(userId);
        return { id, total };
      });
    },
    orders(userId) {
      const purchases = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(userId).map(order => ({ ...order, items: db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id).map(withCard) }));
      const sales = db.prepare('SELECT order_items.*,orders.created FROM order_items JOIN orders ON orders.id=order_items.order_id WHERE seller_id=? ORDER BY order_id DESC').all(userId).map(withCard);
      return { purchases, sales };
    }
  };
  return store;
}
