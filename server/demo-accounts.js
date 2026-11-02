import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';

export const demoRoster=[
  {username:'yongco',role:'admin',legacy:'admin@pearldental.test'},
  {username:'dwaynelei',role:'patient',legacy:'alex@pearldental.test'},
  {username:'policarpio',role:'patient',legacy:'olivia@example.test'},
  {username:'paredes',role:'patient',legacy:'phoenix@example.test'},
  {username:'alicando',role:'patient',legacy:'lana@example.test'},
  {username:'angeles',role:'admin'},
  {username:'amerna',role:'admin'}
];
export function generateDemoCredentials(){
  const fixturePassword=(process.env.NODE_ENV==='test'||process.env.DB_PATH===':memory:')?process.env.SEED_TEST_PASSWORD:null;
  return demoRoster.map(account=>({...account,email:`${account.username}@nbmagbanua.test`,password:fixturePassword||`NB!${randomBytes(12).toString('base64url')}`}));
}
export function replaceDemoAccounts(db){
  const migration='requested-demo-roster-v1';
  if(db.prepare('SELECT name FROM app_migrations WHERE name=?').get(migration))return {alreadyApplied:true};
  const credentials=generateDemoCredentials();
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const account of credentials){
      const old=account.legacy?db.prepare('SELECT id FROM users WHERE email=?').get(account.legacy):null;
      if(db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(account.username,account.email))throw new Error(`The username ${account.username} is already in use. No accounts were changed.`);
      if(old){
        db.prepare('UPDATE users SET name=?,username=?,email=?,password=?,role=?,active=1 WHERE id=?').run(account.username,account.username,account.email,hashPassword(account.password),account.role,old.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(old.id);
        db.prepare('DELETE FROM resets WHERE user_id=?').run(old.id);
      }else db.prepare('INSERT INTO users(name,username,email,password,role) VALUES (?,?,?,?,?)').run(account.username,account.username,account.email,hashPassword(account.password),account.role);
    }
    for(const email of ['demi@example.test','drew@example.test']){
      const old=db.prepare('SELECT id FROM users WHERE email=?').get(email);
      if(old){
        db.prepare('UPDATE users SET active=0 WHERE id=?').run(old.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(old.id);
        db.prepare('DELETE FROM resets WHERE user_id=?').run(old.id);
      }
    }
    db.prepare('INSERT INTO app_migrations(name) VALUES (?)').run(migration);
    db.exec('COMMIT');
    return {alreadyApplied:false,accounts:credentials.map(({username,email,role,password})=>({username,email,role,password}))};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
