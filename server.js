'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = process.env.DATABASE_FILE || path.join(DATA_DIR, 'vitacheck.sqlite');
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'patient' CHECK(role IN ('patient','admin')),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    test TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    mode TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Received',
    price REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);
for (const sql of [
  "ALTER TABLE users ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE users ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}'"
]) { try { db.exec(sql); } catch (_) {} }
db.exec(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,subject TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prescriptions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,filename TEXT NOT NULL,size INTEGER NOT NULL DEFAULT 0,type TEXT,status TEXT NOT NULL DEFAULT 'Received',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,reference TEXT NOT NULL UNIQUE,amount REAL NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',created_at TEXT NOT NULL);`);

function now() { return new Date().toISOString(); }
function securityHeaders() { return {'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}; }
function json(res, status, payload, extra = {}) {
  res.writeHead(status, { ...securityHeaders(), 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...extra });
  res.end(JSON.stringify(payload));
}
function text(res, status, body) { res.writeHead(status, {...securityHeaders(), 'Content-Type':'text/plain; charset=utf-8'}); res.end(body); }
function parseBody(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => { raw += c; if(raw.length > 1024*1024) reject(new Error('Payload too large')); }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch(e) { reject(e); } }); }); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) { return crypto.timingSafeEqual(Buffer.from(hash,'hex'), Buffer.from(hashPassword(password,salt).hash,'hex')); }
function token() { return crypto.randomBytes(32).toString('hex'); }
function reference() { return `VC${crypto.randomBytes(5).toString('hex').toUpperCase()}`; }
function cookieHeader(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge/1000))}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
function clearCookie(name) { return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(v => { const i=v.indexOf('='); return [v.slice(0,i).trim(), decodeURIComponent(v.slice(i+1).trim())]; })); }
function userFromRequest(req) {
  const sid = cookies(req).vc_session;
  if (!sid) return null;
  const row = db.prepare(`SELECT u.id,u.name,u.email,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?`).get(sid);
  if (!row || new Date(row.expires_at) <= new Date()) { if(sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sid); return null; }
  return row;
}
function requireUser(req,res,role) {
  const user = userFromRequest(req);
  if (!user) { json(res,401,{ok:false,error:'Please sign in to continue.'}); return null; }
  if (role && user.role !== role) { json(res,403,{ok:false,error:'You do not have permission for this action.'}); return null; }
  return user;
}
function audit(userId, action, entity, entityId='') { db.prepare('INSERT INTO audit_log(user_id,action,entity,entity_id,created_at) VALUES(?,?,?,?,?)').run(userId || null, action, entity, entityId, now()); }
function sanitizeUser(u) { return {id:u.id,name:u.name,email:u.email,role:u.role}; }
function safePath(urlPath) { const decoded = decodeURIComponent(urlPath.split('?')[0]); const target = path.normalize(path.join(ROOT, decoded === '/' ? 'index.html' : decoded)); return target.startsWith(ROOT) ? target : null; }
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.pdf':'application/pdf','.json':'application/json','.ico':'image/x-icon'};

const rateBuckets = new Map();
function rateLimit(req, key, limit=30, windowMs=60000) {
  const ip = req.socket.remoteAddress || 'unknown'; const bucketKey = `${key}:${ip}`; const t=Date.now(); let b=rateBuckets.get(bucketKey);
  if(!b || t-b.start>windowMs) b={start:t,count:0}; b.count++; rateBuckets.set(bucketKey,b); return b.count<=limit;
}

function cleanExpiredSessions() { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now()); }
setInterval(cleanExpiredSessions, 15*60*1000).unref();

const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    const pathName=url.pathname;
    if(pathName==='/api/health' && req.method==='GET') return json(res,200,{ok:true,service:'VitaCheck API',database:'sqlite',time:now()});

    if(pathName==='/api/auth/register' && req.method==='POST') {
      if(!rateLimit(req,'register',8,600000)) return json(res,429,{ok:false,error:'Too many registration attempts. Please try again later.'});
      const b=await parseBody(req); const name=String(b.name||'').trim(); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||'');
      if(name.length<2 || !/^\S+@\S+\.\S+$/.test(email) || password.length<8) return json(res,422,{ok:false,error:'Enter a valid name, email and password of at least 8 characters.'});
      if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) return json(res,409,{ok:false,error:'An account with this email already exists.'});
      const hp=hashPassword(password); const created=now(); const result=db.prepare('INSERT INTO users(name,email,password_hash,password_salt,role,created_at) VALUES(?,?,?,?,?,?)').run(name,email,hp.hash,hp.salt,'patient',created); const u=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(result.lastInsertRowid);
      audit(u.id,'register','user',String(u.id)); return json(res,201,{ok:true,user:sanitizeUser(u)});
    }
    if(pathName==='/api/auth/login' && req.method==='POST') {
      if(!rateLimit(req,'login',10,600000)) return json(res,429,{ok:false,error:'Too many sign-in attempts. Please try again later.'});
      const b=await parseBody(req); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||''); const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
      if(!u || !verifyPassword(password,u.password_hash,u.password_salt)) return json(res,401,{ok:false,error:'Email or password is incorrect.'});
      const sid=token(); const expires=new Date(Date.now()+SESSION_TTL_MS).toISOString(); db.prepare('INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(sid,u.id,expires,now()); audit(u.id,'login','user',String(u.id));
      return json(res,200,{ok:true,user:sanitizeUser(u),expiresAt:expires}, {'Set-Cookie':cookieHeader('vc_session',sid,SESSION_TTL_MS)});
    }
    if(pathName==='/api/auth/logout' && req.method==='POST') { const sid=cookies(req).vc_session; if(sid){const u=userFromRequest(req); db.prepare('DELETE FROM sessions WHERE id=?').run(sid); if(u)audit(u.id,'logout','user',String(u.id));} return json(res,200,{ok:true},{'Set-Cookie':clearCookie('vc_session')}); }
    if(pathName==='/api/auth/me' && req.method==='GET') { const u=userFromRequest(req); return json(res,200,{ok:true,authenticated:!!u,user:u?sanitizeUser(u):null}); }

    if(pathName==='/api/bookings' && req.method==='POST') {
      if(!rateLimit(req,'booking',20,60000)) return json(res,429,{ok:false,error:'Too many booking requests. Please try again shortly.'});
      const b=await parseBody(req); const required=['name','phone','test','date','time','mode','address']; const missing=required.filter(k=>!String(b[k]||'').trim());
      if(missing.length) return json(res,422,{ok:false,error:'Required booking details are missing.',missing});
      const mode=String(b.mode); if(!['home','lab'].includes(mode)) return json(res,422,{ok:false,error:'Invalid collection method.'});
      const date=String(b.date); if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < new Date().toISOString().slice(0,10)) return json(res,422,{ok:false,error:'Please choose a valid future booking date.'});
      const u=userFromRequest(req); const created=now(); const ref=reference();
      db.prepare(`INSERT INTO bookings(reference,user_id,name,email,phone,test,date,time,mode,address,status,price,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref,u?.id||null,String(b.name).trim(),String(b.email||'').trim(),String(b.phone).trim(),String(b.test).trim(),date,String(b.time).trim(),mode,String(b.address).trim(),'Received',Number(b.price||0),created,created);
      audit(u?.id||null,'create','booking',ref); const booking=db.prepare('SELECT * FROM bookings WHERE reference=?').get(ref); return json(res,201,{ok:true,booking});
    }
    if(pathName==='/api/bookings' && req.method==='GET') {
      const u=requireUser(req,res); if(!u)return; const rows=u.role==='admin'?db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all():db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY created_at DESC').all(u.id); return json(res,200,{ok:true,bookings:rows});
    }
    const bookingMatch=pathName.match(/^\/api\/bookings\/([^/]+)$/);
    if(bookingMatch && req.method==='PATCH') {
      const u=requireUser(req,res,'admin'); if(!u)return; const ref=decodeURIComponent(bookingMatch[1]); const b=await parseBody(req); const allowed=['status','date','time','mode','address']; const updates=allowed.filter(k=>b[k]!==undefined);
      if(!updates.length)return json(res,422,{ok:false,error:'No booking fields were supplied.'});
      const vals=updates.map(k=>b[k]); vals.push(now(),ref); db.prepare(`UPDATE bookings SET ${updates.map(k=>`${k}=?`).join(',')}, updated_at=? WHERE reference=?`).run(...vals); const row=db.prepare('SELECT * FROM bookings WHERE reference=?').get(ref); if(!row)return json(res,404,{ok:false,error:'Booking not found.'}); audit(u.id,'update','booking',ref); return json(res,200,{ok:true,booking:row});
    }
    if(bookingMatch && req.method==='DELETE') {
      const u=requireUser(req,res); if(!u)return; const ref=decodeURIComponent(bookingMatch[1]); const row=db.prepare('SELECT * FROM bookings WHERE reference=?').get(ref); if(!row)return json(res,404,{ok:false,error:'Booking not found.'}); if(u.role!=='admin' && row.user_id!==u.id)return json(res,403,{ok:false,error:'You cannot cancel this booking.'}); db.prepare(`UPDATE bookings SET status='Cancelled',updated_at=? WHERE reference=?`).run(now(),ref); audit(u.id,'cancel','booking',ref); return json(res,200,{ok:true,reference:ref,status:'Cancelled'});
    }
    if(pathName==='/api/dashboard' && req.method==='GET') {
      const u=requireUser(req,res); if(!u)return; const rows=u.role==='admin'?db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all():db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY created_at DESC').all(u.id); const upcoming=rows.filter(b=>b.status!=='Cancelled' && b.date>=new Date().toISOString().slice(0,10)).length; const ready=rows.filter(b=>b.status==='Report Ready').length; const revenue=rows.reduce((s,b)=>s+Number(b.price||0),0); const byDate=rows.reduce((a,b)=>(a[b.date]=(a[b.date]||0)+1,a),{}); return json(res,200,{ok:true,user:sanitizeUser(u),metrics:{totalBookings:rows.length,upcoming,reportsReady:ready,revenue},recent:rows.slice(0,8),byDate});
    }
    if(pathName==='/api/audit' && req.method==='GET') { const u=requireUser(req,res,'admin'); if(!u)return; return json(res,200,{ok:true,entries:db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100').all()}); }
    if(pathName==='/api/profile' && req.method==='GET'){const u=requireUser(req,res);if(!u)return;const p=JSON.parse(u.profile_json||'{}');return json(res,200,{ok:true,user:sanitizeUser(u),profile:{...p,name:p.name||u.name,email:p.email||u.email}});}
    if(pathName==='/api/profile' && req.method==='PUT'){const u=requireUser(req,res);if(!u)return;const b=await parseBody(req);const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase();if(name.length<2||!/^\S+@\S+\.\S+$/.test(email))return json(res,422,{ok:false,error:'Enter a valid name and email.'});const existing=db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(email,u.id);if(existing)return json(res,409,{ok:false,error:'That email is already in use.'});db.prepare('UPDATE users SET name=?,email=?,profile_json=? WHERE id=?').run(name,email,JSON.stringify({name,email}),u.id);audit(u.id,'update','profile',String(u.id));return json(res,200,{ok:true});}
    if(pathName==='/api/settings' && req.method==='GET'){const u=requireUser(req,res);if(!u)return;return json(res,200,{ok:true,settings:JSON.parse(u.settings_json||'{}')});}
    if(pathName==='/api/settings' && req.method==='PUT'){const u=requireUser(req,res);if(!u)return;const b=await parseBody(req);db.prepare('UPDATE users SET settings_json=? WHERE id=?').run(JSON.stringify({theme:String(b.theme||'system'),notifications:b.notifications!==false}),u.id);audit(u.id,'update','settings',String(u.id));return json(res,200,{ok:true});}
    if(pathName==='/api/messages' && req.method==='GET'){const u=requireUser(req,res);if(!u)return;return json(res,200,{ok:true,messages:db.prepare('SELECT subject,body,created_at FROM messages WHERE user_id=? ORDER BY created_at DESC').all(u.id)});}
    if(pathName==='/api/messages' && req.method==='POST'){const u=requireUser(req,res);if(!u)return;const b=await parseBody(req);const subject=String(b.subject||'').trim(),body=String(b.body||'').trim();if(!subject||!body)return json(res,422,{ok:false,error:'Subject and message are required.'});db.prepare('INSERT INTO messages(user_id,subject,body,created_at) VALUES(?,?,?,?)').run(u.id,subject,body,now());audit(u.id,'create','message','');return json(res,201,{ok:true});}
    if(pathName==='/api/notifications' && req.method==='GET'){const u=requireUser(req,res);if(!u)return;const rows=db.prepare('SELECT title,body,created_at FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50').all(u.id);return json(res,200,{ok:true,notifications:rows});}
    if(pathName==='/api/analytics' && req.method==='GET'){const u=requireUser(req,res,'admin');if(!u)return;const r=db.prepare("SELECT COUNT(*) bookings,SUM(status='Received') received,SUM(status='Report Ready') completed,SUM(status='Cancelled') cancelled FROM bookings").get();return json(res,200,{ok:true,metrics:{bookings:r.bookings||0,received:r.received||0,completed:r.completed||0,cancelled:r.cancelled||0}});}
    if(pathName==='/api/prescriptions' && req.method==='GET'){const u=requireUser(req,res);if(!u)return;return json(res,200,{ok:true,prescriptions:db.prepare('SELECT filename,size,type,status,created_at FROM prescriptions WHERE user_id=? ORDER BY created_at DESC').all(u.id)});}
    if(pathName==='/api/prescriptions' && req.method==='POST'){const u=requireUser(req,res);if(!u)return;const b=await parseBody(req);const filename=String(b.filename||'').trim();if(!filename)return json(res,422,{ok:false,error:'A prescription file is required.'});db.prepare('INSERT INTO prescriptions(user_id,filename,size,type,status,created_at) VALUES(?,?,?,?,?,?)').run(u.id,filename,Number(b.size||0),String(b.type||''),'Received',now());audit(u.id,'create','prescription',filename);return json(res,201,{ok:true});}
    if(pathName==='/api/payments' && req.method==='GET'){const u=requireUser(req,res);if(!u)return;return json(res,200,{ok:true,payments:db.prepare('SELECT reference,amount,status,created_at FROM payments WHERE user_id=? ORDER BY created_at DESC').all(u.id)});}
    if(pathName==='/api/payments/create' && req.method==='POST'){const u=requireUser(req,res);if(!u)return;const b=await parseBody(req);const amount=Math.max(0,Number(b.amount||0));if(!amount)return json(res,422,{ok:false,error:'A valid payment amount is required.'});const ref=reference();db.prepare('INSERT INTO payments(user_id,reference,amount,status,created_at) VALUES(?,?,?,?,?)').run(u.id,ref,amount,'Pending',now());audit(u.id,'create','payment',ref);return json(res,201,{ok:true,reference:ref,status:'Pending',message:'Payment record created. Configure your approved payment provider to enable online settlement.'});}

    if(req.method!=='GET') return json(res,405,{ok:false,error:'Method not allowed'});
    const file=safePath(pathName); if(!file || !fs.existsSync(file) || fs.statSync(file).isDirectory())return text(res,404,'Not found'); const ext=path.extname(file).toLowerCase(); res.writeHead(200,{...securityHeaders(),'Content-Type':`${mime[ext]||'application/octet-stream'}; charset=utf-8`}); fs.createReadStream(file).pipe(res);
  } catch(err) { console.error(err); json(res,500,{ok:false,error:'Server error'}); }
});

server.listen(PORT,()=>console.log(`VitaCheck running at http://localhost:${PORT}`));
process.on('SIGINT',()=>{db.close();process.exit(0);});
process.on('SIGTERM',()=>{db.close();process.exit(0);});

