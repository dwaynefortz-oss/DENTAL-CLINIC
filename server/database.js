import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';
import { generateDemoCredentials } from './demo-accounts.js';
mkdirSync('data', { recursive: true });
export const db = new DatabaseSync(process.env.DB_PATH || 'data/clinic.sqlite');
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT DEFAULT '', password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'patient');
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER);
CREATE TABLE IF NOT EXISTS resets (token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER);
CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, name TEXT, duration INTEGER, price INTEGER, description TEXT);
CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY, patient_id INTEGER REFERENCES users(id), service_id INTEGER REFERENCES services(id), date TEXT, time TEXT, status TEXT DEFAULT 'Pending', notes TEXT DEFAULT '', request TEXT DEFAULT '', requested_date TEXT DEFAULT '', requested_time TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), message TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, seen INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS followups (id INTEGER PRIMARY KEY, patient_id INTEGER REFERENCES users(id), service_id INTEGER REFERENCES services(id), date TEXT, note TEXT, appointment_id INTEGER REFERENCES appointments(id));`);
const userColumns=db.prepare('PRAGMA table_info(users)').all();
if(!userColumns.some(c=>c.name==='username'))db.exec('ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE');
if(!userColumns.some(c=>c.name==='active'))db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
if(!userColumns.some(c=>c.name==='profile_photo'))db.exec('ALTER TABLE users ADD COLUMN profile_photo BLOB');
if(!userColumns.some(c=>c.name==='photo_version'))db.exec('ALTER TABLE users ADD COLUMN photo_version TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS unique_username ON users(username COLLATE NOCASE); CREATE TABLE IF NOT EXISTS app_migrations(name TEXT PRIMARY KEY,created TEXT DEFAULT CURRENT_TIMESTAMP)');
db.exec(`CREATE TABLE IF NOT EXISTS account_role_changes (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  target_id INTEGER NOT NULL REFERENCES users(id),
  previous_role TEXT NOT NULL,
  new_role TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
// Additive migration: keep existing accounts, appointments, and history intact.
db.exec(`CREATE TABLE IF NOT EXISTS dentists (id INTEGER PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, bio TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS reschedules (id INTEGER PRIMARY KEY, appointment_id INTEGER NOT NULL REFERENCES appointments(id), actor TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, note TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
if(!db.prepare('PRAGMA table_info(appointments)').all().some(c=>c.name==='dentist_id'))db.exec('ALTER TABLE appointments ADD COLUMN dentist_id INTEGER NOT NULL DEFAULT 1');
const seedDentist=db.prepare('INSERT OR IGNORE INTO dentists VALUES (?,?,?,?,?)');
[[1,'Dr. Nina Magbanua','General & preventive dentistry','A thoughtful approach to routine care, dental health education, and comfortable check-ups.',1],
 [2,'Dr. Sofia Reyes','Restorative & cosmetic dentistry','Patient-centered consultations for fillings, whitening, and smile restoration.',1],
 [3,'Dr. Miguel Santos','General dentistry & oral care','Clear guidance on oral health, tooth concerns, and treatment planning.',1],
 [4,'Dr. Camille Garcia','Orthodontic consultations','Personalized advice on alignment, bite concerns, and orthodontic care options.',0]].forEach(d=>seedDentist.run(...d));
if(!db.prepare('PRAGMA table_info(followups)').all().some(c=>c.name==='dentist_id')){
  db.exec('ALTER TABLE followups ADD COLUMN dentist_id INTEGER NOT NULL DEFAULT 1');
  db.exec('UPDATE followups SET dentist_id=COALESCE((SELECT dentist_id FROM appointments WHERE appointments.id=followups.appointment_id),1)');
}
db.exec(`DROP INDEX IF EXISTS occupied_slot;
CREATE UNIQUE INDEX IF NOT EXISTS occupied_dentist_slot ON appointments(date,time,dentist_id) WHERE status IN ('Pending','Approved');
CREATE UNIQUE INDEX IF NOT EXISTS occupied_patient_slot ON appointments(date,time,patient_id) WHERE status IN ('Pending','Approved');`);
db.prepare("UPDATE notifications SET message=replace(message,'Pearl Dental','NB MAGBANUA DENTAL CLINIC') WHERE message LIKE '%Pearl Dental%'").run();
export function dateOffset(days) { const d = new Date(); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function clinicDateOffset(days) {
  const d=new Date();
  if(d.getDay()===0)d.setDate(d.getDate()+(days<0?-1:1));
  for(let n=Math.abs(days);n>0;){d.setDate(d.getDate()+(days<0?-1:1));if(d.getDay()!==0)n--;}
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
  const credentials=generateDemoCredentials();
  const add = db.prepare('INSERT INTO users (name,username,email,password,role) VALUES (?,?,?,?,?)');
  credentials.forEach(a=>add.run(a.username,a.username,a.email,hashPassword(a.password),a.role));
  db.prepare('INSERT INTO app_migrations(name) VALUES (?)').run('requested-demo-roster-v1');
  if(process.env.DB_PATH!==':memory:'){
    const directory=path.dirname(process.env.DB_PATH||'data/clinic.sqlite');
    writeFileSync(path.join(directory,'account-credentials.json'),JSON.stringify(credentials.map(({username,email,role,password})=>({username,email,role,password})),null,2),{mode:0o600});
  }
  const s = db.prepare('INSERT INTO services VALUES (?,?,?,?,?)');
  [[1,'Dental cleaning',30,1200,'A refreshing clean for a healthier smile.'],[2,'Dental consultation',30,600,'A complete check-up and a personalized care plan.'],[3,'Tooth filling',30,1800,'Restore and protect a tooth with gentle care.'],[4,'Teeth whitening',30,4500,'Bring a little more brightness to your smile.'],[5,'Orthodontic consultation',30,1000,'Explore your options for a beautifully aligned smile.'],[6,'Tooth extraction consultation',30,800,'Assess your tooth and discuss a comfortable treatment plan.']].forEach(x=>s.run(...x));
  const a = db.prepare('INSERT INTO appointments(patient_id,service_id,date,time,status,notes) VALUES (?,?,?,?,?,?)');
  for(let i=0;i<26;i++) a.run(2+i%4,1+i%6,clinicDateOffset(i<8 ? 0 : i<16 ? 1+Math.floor((i-8)/4) : -1-Math.floor((i-16)/3)),['09:00','09:30','10:00','10:30','11:00','13:00','13:30','14:00'][i%8],i>=16?(i%5===0?'Cancelled':'Completed'):i%3===0?'Pending':'Approved',i%4===0?'Routine dental check-up.':'');
  db.prepare('INSERT INTO followups(patient_id,service_id,date,note) VALUES (?,?,?,?)').run(2,1,dateOffset(14),'Keep your smile healthy with your next routine cleaning.');
  db.prepare('INSERT INTO notifications(user_id,message) VALUES (?,?)').run(2,'Welcome to NB MAGBANUA DENTAL CLINIC. Your next healthy smile starts here.');
}
