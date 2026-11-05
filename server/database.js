// Both adapters expose asynchronous, parameterized operations. Transactions own their connection.
export async function openDatabase({ filename = ':memory:', databaseUrl } = {}) {
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
    pool.on('error', () => console.error('PostgreSQL idle connection error.'));
    const number = value => { const result = Number(value); if (!Number.isSafeInteger(result)) throw new Error('Database integer exceeds JavaScript safe range.'); return result; };
    const types = { getTypeParser: (oid, format) => oid === 20 ? number : pg.types.getTypeParser(oid, format) };
    function operations(connection) {
      const query = (sql, args) => { let index = 0; return connection.query({ text: sql.replace(/\?/g, () => `$${++index}`), values: args, types }); };
      return {
        get: async (sql, ...args) => (await query(sql, args)).rows[0],
        all: async (sql, ...args) => (await query(sql, args)).rows,
        run: async (sql, ...args) => ({ changes: (await query(sql, args)).rowCount })
      };
    }
    return {
      dialect: 'postgres', ...operations(pool), close: () => pool.end(),
      async transaction(callback, { initialization = false } = {}) {
        for (let attempt = 0; ; attempt++) {
          const client = await pool.connect();
          try {
            await client.query(initialization ? 'BEGIN' : 'BEGIN ISOLATION LEVEL SERIALIZABLE');
            if (initialization) await client.query('SELECT pg_advisory_xact_lock(73160211)');
            const result = await callback(operations(client));
            await client.query('COMMIT'); return result;
          } catch (error) {
            await client.query('ROLLBACK');
            if (!['40001', '40P01'].includes(error.code) || attempt >= 3) throw error;
          } finally { client.release(); }
        }
      }
    };
  }
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const raw = {
    get: async (sql, ...args) => sqlite.prepare(sql).get(...args),
    all: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    run: async (sql, ...args) => sqlite.prepare(sql).run(...args)
  };
  // Prevent unrelated requests from executing inside another request's SQLite transaction.
  let queue = Promise.resolve();
  const enqueue = operation => { const result = queue.then(operation); queue = result.catch(() => {}); return result; };
  return {
    dialect: 'sqlite',
    get: (...args) => enqueue(() => raw.get(...args)), all: (...args) => enqueue(() => raw.all(...args)), run: (...args) => enqueue(() => raw.run(...args)),
    close: () => enqueue(() => sqlite.close()),
    transaction: callback => enqueue(async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const result = await callback(raw); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    })
  };
}
