import { backup } from 'node:sqlite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { db } from '../server/database.js';
import { replaceDemoAccounts, demoRoster } from '../server/demo-accounts.js';

const directory=path.resolve(path.dirname(process.env.DB_PATH||'data/clinic.sqlite'));
const credentialPath=path.join(directory,'account-credentials.json');
if(db.prepare('SELECT name FROM app_migrations WHERE name=?').get('requested-demo-roster-v1')){
  console.log(`The requested account roster is already installed. Credentials file: ${existsSync(credentialPath)?credentialPath:'not available'}`);
}else{
  const originalEmails=[...demoRoster.map(a=>a.legacy).filter(Boolean),'demi@example.test','drew@example.test'];
  const registered=db.prepare(`SELECT * FROM users WHERE email NOT IN (${originalEmails.map(()=>'?').join(',')})`).all(...originalEmails);
  const appointments=db.prepare('SELECT * FROM appointments ORDER BY id').all();
  const followups=db.prepare('SELECT * FROM followups ORDER BY id').all();
  const backupDirectory=path.join(directory,'backups');mkdirSync(backupDirectory,{recursive:true});
  const backupPath=path.join(backupDirectory,`clinic-before-account-update-${Date.now()}.sqlite`);
  await backup(db,backupPath);
  delete process.env.SEED_TEST_PASSWORD;
  const result=replaceDemoAccounts(db);
  assert.deepEqual(db.prepare('SELECT * FROM appointments ORDER BY id').all(),appointments);
  assert.deepEqual(db.prepare('SELECT * FROM followups ORDER BY id').all(),followups);
  for(const account of registered)assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=?').get(account.id),account);
  writeFileSync(credentialPath,JSON.stringify(result.accounts,null,2)+'\n',{mode:0o600});
  console.log(`Updated ${result.accounts.length} demo accounts. Separately registered users and appointment records were retained.`);
  console.log(`Verified ${appointments.length} appointment records, ${followups.length} follow-up records, and ${registered.length} separately registered accounts unchanged.`);
  console.log(`Credentials file: ${credentialPath}`);
  console.log(`Database backup: ${backupPath}`);
}
db.close();
