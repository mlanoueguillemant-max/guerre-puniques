'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const { z } = require('zod');

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);
const ORIGIN = (process.env.APP_ORIGIN || '').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'antiquity.sqlite');
fs.mkdirSync(DATA_DIR, { recursive: true });
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
let SESSION_SECRET = process.env.SESSION_SECRET || '';
if (!SESSION_SECRET) {
  try { SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch {}
}
if (SESSION_SECRET.length < 32) { SESSION_SECRET = crypto.randomBytes(48).toString('hex'); fs.writeFileSync(SECRET_FILE, SESSION_SECRET, { mode: 0o600 }); }

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid PORT');

const usingPostgres = Boolean(process.env.DATABASE_URL);
let sqlite = null;
let pgPool = null;
let pool;

if (usingPostgres) {
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false } });
  pool = pgPool;
} else {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  sqlite = new DatabaseSync(DB_FILE);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  let txLocked = false;
  const waiters = [];
  async function acquire(){ if(!txLocked){txLocked=true;return;} await new Promise(resolve=>waiters.push(resolve)); txLocked=true; }
  function release(){ const next=waiters.shift(); if(next) next(); else txLocked=false; }
  function sqliteParams(params=[]){ const o={}; params.forEach((v,i)=>{o['$'+(i+1)]=v;}); return o; }
  function normalizeSql(sql){ return sql.replace(/FOR UPDATE/g,'').replace(/now\(\) \+ interval '7 days'/g,"datetime('now','+7 days')").replace(/now\(\)/g,'CURRENT_TIMESTAMP'); }
  function runQuery(sql, params=[]){
    const q=normalizeSql(sql.trim());
    const stmt=sqlite.prepare(q);
    if(/^SELECT\b/i.test(q) || /^WITH\b/i.test(q)){ const rows=stmt.all(sqliteParams(params)); return {rows,rowCount:rows.length}; }
    const info=stmt.run(sqliteParams(params)); return {rows:[],rowCount:Number(info.changes||0)};
  }
  pool={
    async query(sql,params=[]){ await acquire(); try{return runQuery(sql,params);} finally{release();} },
    async connect(){ await acquire(); return { query:async(sql,params=[])=>runQuery(sql,params), release(){release();} }; },
    async end(){ sqlite.close(); }
  };
}
const io = new Server(server, {
  cors: { origin: ORIGIN || true, credentials: true },
  allowRequest: (req, callback) => {
    if (!isProd) return callback(null, true);
    const origin = req.headers.origin;
    if (!origin) return callback(null, true);
    if (ORIGIN && origin === ORIGIN) return callback(null, true);
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const hostOrigin = `${proto}://${req.headers.host}`.replace(/\/$/, '');
    callback(null, origin === hostOrigin);
  },
  maxHttpBufferSize: 32768,
  perMessageDeflate: false,
  pingTimeout: 20000,
  pingInterval: 25000,
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cookieParser());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

const generalLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false });
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false });
app.use(generalLimit);

const factions = ['ROM', 'CAR', 'ATH', 'MAC'];
const factionSchema = z.enum(factions);
const userSchema = z.object({ username: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_]+$/), password: z.string().min(10).max(128) });
const createGameSchema = z.object({ faction: factionSchema });
const actionSchema = z.object({ action: z.enum(['collect', 'recruit', 'attack', 'endTurn']), target: z.string().trim().max(40).optional() });

const adjacency = {
  Rome: ['Capua', 'Massilia'], Capua: ['Rome', 'Syracuse'], Syracuse: ['Capua', 'Carthage'], Carthage: ['Syracuse', 'Utica'], Utica: ['Carthage'],
  Athens: ['Sparta', 'Pella', 'Alexandria'], Sparta: ['Athens'], Pella: ['Athens', 'Antioch'], Massilia: ['Rome', 'Tarraco', 'Alexandria'],
  Tarraco: ['Massilia'], Alexandria: ['Massilia', 'Athens', 'Antioch'], Antioch: ['Alexandria', 'Pella']
};

function initialState() {
  const territories = {
    Rome: { owner: 'ROM', troops: 12, food: 100, wood: 80, level: 2 }, Capua: { owner: 'ROM', troops: 8, food: 70, wood: 50, level: 1 },
    Syracuse: { owner: 'CAR', troops: 7, food: 60, wood: 60, level: 1 }, Carthage: { owner: 'CAR', troops: 12, food: 100, wood: 80, level: 2 },
    Utica: { owner: 'CAR', troops: 6, food: 50, wood: 40, level: 1 }, Athens: { owner: 'ATH', troops: 9, food: 80, wood: 70, level: 2 },
    Sparta: { owner: 'ATH', troops: 6, food: 50, wood: 40, level: 1 }, Pella: { owner: 'MAC', troops: 9, food: 80, wood: 60, level: 2 },
    Massilia: { owner: null, troops: 4, food: 50, wood: 70, level: 1 }, Tarraco: { owner: null, troops: 4, food: 60, wood: 60, level: 1 },
    Alexandria: { owner: null, troops: 5, food: 80, wood: 50, level: 2 }, Antioch: { owner: null, troops: 5, food: 70, wood: 50, level: 2 }
  };
  return { version: 1, territories, log: [], winner: null };
}

function tokenHash(value) { return crypto.createHash('sha256').update(SESSION_SECRET || 'dev-only-secret').update(value).digest('hex'); }
function newToken() { return crypto.randomBytes(32).toString('hex'); }
function cookieOptions() { return { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' }; }
function publicCookieOptions() { return { httpOnly: false, secure: isProd, sameSite: 'lax', path: '/' }; }
function appError(message, status = 400) { return Object.assign(new Error(message), { status }); }

function originGuard(req, res, next) {
  if (!isProd || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  if (ORIGIN && origin === ORIGIN) return next();
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const hostOrigin = `${proto}://${req.get('host')}`.replace(/\/$/, '');
  if (origin !== hostOrigin) return res.status(403).json({ error: 'Origin not allowed' });
  next();
}
app.use('/api', originGuard);

async function userFromReq(req) {
  const raw = req.cookies.ac_session;
  if (!raw) return null;
  const q = await pool.query(
    'SELECT u.id,u.username,s.csrf_token,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL',
    [tokenHash(raw)]
  );
  return q.rows[0] || null;
}
async function requireAuth(req, res, next) { try { const user = await userFromReq(req); if (!user) return res.status(401).json({ error: 'Authentication required' }); req.user = user; next(); } catch (e) { next(e); } }
function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.user || !req.get('x-csrf-token') || req.get('x-csrf-token') !== req.user.csrf_token) return res.status(403).json({ error: 'CSRF validation failed' });
  next();
}

async function migrate() { const file = usingPostgres ? 'schema.sql' : 'schema.sqlite.sql'; const sql=fs.readFileSync(path.join(__dirname,file),'utf8'); if (usingPostgres) await pool.query(sql); else sqlite.exec(sql); }

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'ok' }); }
  catch { res.status(503).json({ status: 'degraded', database: 'unavailable' }); }
});
app.get('/api/config', (req, res) => res.json({ gameFree: true, gambling: false, realMoneyPrizes: false, personalizedAdsForMinors: false, chat: false, version: '1.0.0-beta.3' }));

app.post('/api/register', authLimit, async (req, res, next) => {
  try {
    const { username, password } = userSchema.parse(req.body);
    const exists = await pool.query('SELECT 1 FROM users WHERE lower(username)=lower($1) AND deleted_at IS NULL', [username]);
    if (exists.rowCount) return res.status(409).json({ error: 'Username unavailable' });
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)', [id, username, hash]);
    res.status(201).json({ ok: true });
  } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: 'Invalid registration data' }); next(e); }
});

app.post('/api/login', authLimit, async (req, res, next) => {
  try {
    const { username, password } = userSchema.parse(req.body);
    const q = await pool.query('SELECT id,username,password_hash FROM users WHERE lower(username)=lower($1) AND deleted_at IS NULL', [username]);
    if (!q.rowCount || !(await bcrypt.compare(password, q.rows[0].password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = newToken(); const csrfToken = newToken(); const sid = crypto.randomUUID();
    await pool.query('INSERT INTO sessions(id,user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,$4,now()+interval \'7 days\')', [sid, q.rows[0].id, tokenHash(token), csrfToken]);
    res.cookie('ac_session', token, cookieOptions());
    res.cookie('ac_csrf', csrfToken, publicCookieOptions());
    res.json({ username: q.rows[0].username });
  } catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: 'Invalid credentials' }); next(e); }
});

app.post('/api/logout', requireAuth, csrf, async (req, res, next) => {
  try { await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(req.cookies.ac_session)]); res.clearCookie('ac_session', cookieOptions()); res.clearCookie('ac_csrf', publicCookieOptions()); res.json({ ok: true }); }
  catch (e) { next(e); }
});
app.get('/api/me', requireAuth, (req, res) => res.json({ id: req.user.id, username: req.user.username }));

app.delete('/api/account', requireAuth, csrf, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);
    await client.query('DELETE FROM game_players WHERE user_id=$1', [req.user.id]);
    await client.query('UPDATE users SET deleted_at=now(),username=$2,password_hash=$3 WHERE id=$1', [req.user.id, `deleted_${req.user.id}`, crypto.randomBytes(32).toString('hex')]);
    await client.query('COMMIT');
    res.clearCookie('ac_session', cookieOptions()); res.clearCookie('ac_csrf', publicCookieOptions()); res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

app.post('/api/games', requireAuth, csrf, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { faction } = createGameSchema.parse(req.body);
    const id = crypto.randomUUID(); const state = initialState();
    await client.query('BEGIN');
    await client.query('INSERT INTO games(id,status,state) VALUES($1,\'waiting\',$2)', [id, JSON.stringify(state)]);
    await client.query('INSERT INTO game_players(game_id,user_id,faction) VALUES($1,$2,$3)', [id, req.user.id, faction]);
    await client.query('COMMIT');
    res.status(201).json({ id, faction });
  } catch (e) { await client.query('ROLLBACK'); if (e.name === 'ZodError') return res.status(400).json({ error: 'Choose a valid faction' }); next(e); }
  finally { client.release(); }
});

app.get('/api/games', requireAuth, async (req, res, next) => {
  try {
    const q = await pool.query(`SELECT g.id,g.status,g.turn,g.current_player,g.created_at,g.updated_at FROM games g WHERE g.status='waiting' ORDER BY g.created_at DESC LIMIT 20`);
    const games = [];
    for (const row of q.rows) {
      const p = await pool.query(`SELECT u2.username,p2.faction FROM game_players p2 JOIN users u2 ON u2.id=p2.user_id WHERE p2.game_id=$1 ORDER BY p2.joined_at`, [row.id]);
      games.push({...row, players:p.rows});
    }
    res.json(games);
  } catch (e) { next(e); }
});

app.post('/api/games/:id/join', requireAuth, csrf, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const g = await client.query('SELECT id,status FROM games WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!g.rowCount) throw appError('Game not found', 404);
    if (g.rows[0].status !== 'waiting') throw appError('Game is no longer joinable', 409);
    const existing = await client.query('SELECT faction FROM game_players WHERE game_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (existing.rowCount) { await client.query('COMMIT'); return res.json({ ok: true, faction: existing.rows[0].faction }); }
    const used = await client.query('SELECT faction FROM game_players WHERE game_id=$1', [req.params.id]);
    const available = factions.find(f => !used.rows.some(x => x.faction === f));
    if (!available) throw appError('Game full', 409);
    await client.query('INSERT INTO game_players(game_id,user_id,faction) VALUES($1,$2,$3)', [req.params.id, req.user.id, available]);
    const count = used.rowCount + 1;
    if (count >= 2) await client.query("UPDATE games SET status='active',current_player=(SELECT user_id FROM game_players WHERE game_id=$1 ORDER BY joined_at LIMIT 1),updated_at=now() WHERE id=$1", [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true, faction: available });
  } catch (e) { await client.query('ROLLBACK'); if (e.code === '23505') return res.status(409).json({ error: 'Game state changed; try again' }); next(e); } finally { client.release(); }
});

app.get('/api/games/:id', requireAuth, async (req, res, next) => {
  try {
    const q = await pool.query('SELECT g.id,g.status,g.turn,g.current_player,g.state,p.faction FROM games g JOIN game_players p ON p.game_id=g.id WHERE g.id=$1 AND p.user_id=$2', [req.params.id, req.user.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Game not found' });
    const row=q.rows[0]; if(row && typeof row.state==='string') row.state=JSON.parse(row.state); res.json(row);
  } catch (e) { next(e); }
});

async function performAction(gameId, userId, body) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const g = await client.query('SELECT * FROM games WHERE id=$1 FOR UPDATE', [gameId]);
    const p = await client.query('SELECT faction FROM game_players WHERE game_id=$1 AND user_id=$2', [gameId, userId]);
    if (!g.rowCount || !p.rowCount) throw appError('Not in game', 404);
    const game = g.rows[0]; const faction = p.rows[0].faction; game.state = typeof game.state === 'string' ? JSON.parse(game.state) : game.state;
    if (game.status !== 'active') throw appError('Game is not active', 409);
    if (game.current_player !== userId) throw appError('Not your turn', 409);
    const { action, target } = actionSchema.parse(body);
    const state = game.state;

    if (action === 'collect') {
      for (const t of Object.values(state.territories)) if (t.owner === faction) { t.food += 10; t.wood += 5; }
      state.log.push(`${faction} collecte des ressources.`);
    } else if (action === 'recruit') {
      if (!target || !state.territories[target] || state.territories[target].owner !== faction) throw appError('Invalid territory', 400);
      const t = state.territories[target];
      if (t.food < 20 || t.wood < 10) throw appError('Not enough resources', 409);
      t.food -= 20; t.wood -= 10; t.troops += 2; state.log.push(`${faction} recrute à ${target}.`);
    } else if (action === 'attack') {
      if (!target || !state.territories[target]) throw appError('Invalid target', 400);
      const sourceEntry = Object.entries(state.territories).filter(([name, t]) => t.owner === faction && t.troops >= 3 && (adjacency[name] || []).includes(target)).sort((a,b)=>b[1].troops-a[1].troops)[0];
      if (!sourceEntry) throw appError('No adjacent territory can attack this target', 409);
      const [sourceName, source] = sourceEntry; const targetTerritory = state.territories[target];
      if (targetTerritory.owner === faction) throw appError('Cannot attack your own territory', 409);
      const power = source.troops; source.troops = Math.max(1, Math.floor(source.troops / 2));
      if (power > targetTerritory.troops * 1.2) { targetTerritory.owner = faction; targetTerritory.troops = Math.max(2, Math.floor(power / 2)); state.log.push(`${faction} conquiert ${target} depuis ${sourceName}.`); }
      else { targetTerritory.troops = Math.max(1, targetTerritory.troops - 2); state.log.push(`${faction} attaque ${target} depuis ${sourceName}.`); }
    }

    const players = await client.query('SELECT user_id FROM game_players WHERE game_id=$1 ORDER BY joined_at', [gameId]);
    const owned = Object.values(state.territories).filter(t => t.owner === faction).length;
    if (owned === Object.keys(state.territories).length) state.winner = faction;
    let next = game.current_player;
    if (!state.winner) {
      const idx = players.rows.findIndex(x => x.user_id === userId);
      next = players.rows[(idx + 1) % players.rowCount].user_id;
    }
    const status = state.winner ? 'finished' : 'active';
    await client.query('UPDATE games SET state=$2,turn=turn+1,current_player=$3,status=$4,updated_at=now() WHERE id=$1', [gameId, JSON.stringify(state), next, status]);
    await client.query('COMMIT');
    return state;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

app.post('/api/games/:id/action', requireAuth, csrf, async (req, res, next) => {
  try { const state = await performAction(req.params.id, req.user.id, req.body); io.to(`game:${req.params.id}`).emit('state', state); res.json({ ok: true, state }); }
  catch (e) { if (e.name === 'ZodError') return res.status(400).json({ error: 'Invalid action' }); next(e); }
});

io.use(async (socket, next) => {
  try {
    const rawCookie = socket.request.headers.cookie || '';
    const match = rawCookie.match(/(?:^|; )ac_session=([^;]+)/);
    if (!match) return next(new Error('Unauthorized'));
    const raw = decodeURIComponent(match[1]);
    const q = await pool.query('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL', [tokenHash(raw)]);
    if (!q.rowCount) return next(new Error('Unauthorized'));
    socket.user = q.rows[0]; next();
  } catch { next(new Error('Unauthorized')); }
});

io.on('connection', socket => {
  socket.on('joinGame', async (gameId, cb) => {
    try {
      if (typeof gameId !== 'string' || !/^[0-9a-f-]{36}$/i.test(gameId)) return cb?.({ ok: false, error: 'Invalid game' });
      const q = await pool.query('SELECT 1 FROM game_players WHERE game_id=$1 AND user_id=$2', [gameId, socket.user.id]);
      if (!q.rowCount) return cb?.({ ok: false, error: 'Not in game' });
      socket.join(`game:${gameId}`); cb?.({ ok: true });
    } catch { cb?.({ ok: false, error: 'Server error' }); }
  });
  socket.on('action', async (payload, cb) => {
    try {
      const gameId = typeof payload?.gameId === 'string' ? payload.gameId : '';
      if (!/^[0-9a-f-]{36}$/i.test(gameId)) return cb?.({ ok: false, error: 'Invalid game' });
      const state = await performAction(gameId, socket.user.id, payload);
      io.to(`game:${gameId}`).emit('state', state); cb?.({ ok: true });
    } catch (e) { cb?.({ ok: false, error: e.name === 'ZodError' ? 'Invalid action' : e.message }); }
  });
});

app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', index: 'index.html', maxAge: isProd ? '1h' : 0 }));
app.use((req, res) => res.status(404).send('Not found'));
app.use((err, req, res, next) => { console.error('server error:', err.message); res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' }); });

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return; shuttingDown = true; console.log(`${signal}: shutting down`);
  io.close(); server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(async () => { await pool.end(); process.exit(1); }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));

(async () => { await migrate(); server.listen(PORT, () => console.log(`Antiquity Conquest beta listening on ${PORT}`)); })().catch(e => { console.error('Startup failed:', e); process.exit(1); });
