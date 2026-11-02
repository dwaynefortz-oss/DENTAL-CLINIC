import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { replaceDemoAccounts, generateDemoCredentials } from '../server/demo-accounts.js';
import { hashPassword, verifyPassword } from '../server/auth.js';

function legacyDatabase(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT,role TEXT,username TEXT COLLATE NOCASE UNIQUE,active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires INTEGER);
  CREATE TABLE resets(token TEXT PRIMARY KEY,user_id INTEGER,expires INTEGER);
  CREATE TABLE app_migrations(name TEXT PRIMARY KEY);
  CREATE TABLE appointments(id INTEGER PRIMARY KEY,patient_id INTEGER,date TEXT,notes TEXT);`);
  const emails=['admin@pearldental.test','alex@pearldental.test','olivia@example.test','phoenix@example.test','lana@example.test','demi@example.test','drew@example.test','lovi@gmail.com'];
  emails.forEach((email,i)=>{
    db.prepare('INSERT INTO users(id,name,email,password,role) VALUES (?,?,?,?,?)').run(i+1,i===7?'lovi lovi':'Original '+i,email,hashPassword('OriginalPassword123!'),i===0?'admin':'patient');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run('session'+i,i+1,Date.now()+900000);
    db.prepare('INSERT INTO resets VALUES (?,?,?)').run('reset'+i,i+1,Date.now()+900000);
    if(i>0)db.prepare('INSERT INTO appointments(patient_id,date,notes) VALUES (?,?,?)').run(i+1,'2026-10-30','Keep original history');
  });
  return db;
}
test('Demo roster replacement preserves registered users and every appointment, and runs only once',()=>{
  const db=legacyDatabase();
  try{
    const originalRegistered=db.prepare('SELECT * FROM users WHERE id=8').get();
    const history=db.prepare('SELECT * FROM appointments ORDER BY id').all();
    const result=replaceDemoAccounts(db);
    assert.equal(result.accounts.length,7);
    assert.equal(new Set(result.accounts.map(a=>a.password)).size,7);
    assert.deepEqual(db.prepare('SELECT username FROM users WHERE active=1 AND role=\'patient\' AND username IS NOT NULL ORDER BY id').all().map(a=>a.username),['dwaynelei','policarpio','paredes','alicando']);
    assert.deepEqual(db.prepare("SELECT username FROM users WHERE active=1 AND role='admin' ORDER BY id").all().map(a=>a.username),['yongco','angeles','amerna']);
    assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=8').get(),originalRegistered);
    assert.deepEqual(db.prepare('SELECT * FROM appointments ORDER BY id').all(),history);
    assert.equal(db.prepare('SELECT count(*) total FROM sessions').get().total,1);
    assert.equal(db.prepare('SELECT count(*) total FROM resets').get().total,1);
    assert.equal(db.prepare('SELECT active FROM users WHERE id=6').get().active,0);
    assert.equal(db.prepare('SELECT active FROM users WHERE id=7').get().active,0);
    for(const account of result.accounts){
      const row=db.prepare('SELECT * FROM users WHERE username=?').get(account.username.toUpperCase());
      assert.ok(verifyPassword(account.password,row.password));
      assert.equal(verifyPassword('OriginalPassword123!',row.password),false);
      assert.equal(row.role,account.role);
    }
    const snapshot=db.prepare('SELECT * FROM users ORDER BY id').all();
    assert.equal(replaceDemoAccounts(db).alreadyApplied,true);
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),snapshot);
  }finally{db.close();}
});
test('A conflicting registered username rolls back the entire demo conversion',()=>{
  const db=legacyDatabase();
  try{
    db.prepare('UPDATE users SET username=? WHERE id=8').run('policarpio');
    const before=db.prepare('SELECT * FROM users ORDER BY id').all();
    assert.throws(()=>replaceDemoAccounts(db),/already in use/);
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),before);
    assert.equal(db.prepare('SELECT count(*) total FROM sessions').get().total,8);
  }finally{db.close();}
});
test('Generated account passwords are distinct and meet the application length requirement',()=>{
  const credentials=generateDemoCredentials();
  assert.equal(new Set(credentials.map(a=>a.password)).size,7);
  assert.ok(credentials.every(a=>a.password.length>=10&&a.password!==a.username));
});
