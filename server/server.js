import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, dateOffset } from './database.js';
import { hashPassword, verifyPassword, token, publicUser } from './auth.js';
import sharp from 'sharp';
const root = path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
export const slots = ['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];
const notify = (id,message) => db.prepare('INSERT INTO notifications(user_id,message) VALUES (?,?)').run(id,message);
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function validSlot(date,time,exclude=0,dentistId=1,patientId=0) {
  const dentist=db.prepare('SELECT * FROM dentists WHERE id=?').get(Number(dentistId));
  if(!dentist||!dentist.available)fail('This dentist is not available. Please choose another dentist.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date).getTime())||new Date(date).toISOString().slice(0,10)!==date||date<dateOffset(0)||date>dateOffset(90)||new Date(date+'T12:00:00').getDay()===0||!slots.includes(time)||new Date(`${date}T${time}:00`)<=new Date()) fail('Choose an available future slot within the next 90 days. The clinic is closed Sundays.');
  if(db.prepare("SELECT id FROM appointments WHERE date=? AND time=? AND status IN ('Pending','Approved') AND id!=? AND (dentist_id=? OR patient_id=?)").get(date,time,exclude,Number(dentistId),patientId)) fail('This slot was just booked. Please choose another time.',409);
}
export const server = http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  try {
    if(!url.pathname.startsWith('/api/')) {
      if(!['GET','HEAD'].includes(req.method)) fail('Method not allowed',405);
      let file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
      if(!file.startsWith(root+path.sep)) fail('Not found',404);
      const content=await readFile(file).catch(()=>fail('Not found',404));
      const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);return;
    }
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`) fail('Invalid origin',403);
    const sessionToken=req.headers.cookie?.split('; ').find(x=>x.startsWith('pearl_session='))?.split('=')[1];
    const user=db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1').get(sessionToken||'',Date.now());
    const route=url.pathname; const method=req.method;
    if(route==='/api/profile/photo'&&method==='PUT'){
      if(!user)fail('Please sign in to continue.',401);
      if(!['image/jpeg','image/png','image/webp'].includes(req.headers['content-type']?.split(';')[0]))fail('Choose a JPG, PNG, or WebP image.');
      const maxSize=2*1024*1024;
      if(Number(req.headers['content-length'])>maxSize)fail('Choose an image no larger than 2 MB.',413);
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>maxSize)fail('Choose an image no larger than 2 MB.',413);chunks.push(chunk);}
      if(!size)fail('Choose an image to upload.');
      let photo;
      try{
        const image=sharp(Buffer.concat(chunks),{limitInputPixels:16000000,failOn:'error'});
        const metadata=await image.metadata();
        if(!['jpeg','png','webp'].includes(metadata.format))fail('Choose a JPG, PNG, or WebP image.');
        photo=await image.rotate().resize(512,512,{fit:'cover'}).webp({quality:85}).toBuffer();
      }catch(error){if(error.status)throw error;fail('This image could not be read. Choose a valid image up to 16 megapixels.');}
      db.prepare('UPDATE users SET profile_photo=?,photo_version=? WHERE id=?').run(photo,token().slice(0,16),user.id);
      send({user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});return;
    }
    let body={}; if(!['GET','HEAD'].includes(req.method)) {let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)fail('Request too large',413);}try{body=JSON.parse(raw||'{}');}catch{fail('Invalid JSON');}}
    if(route==='/api/register'&&method==='POST') {
      const name=String(body.name||'').trim(), email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
      if(name.length<2||name.length>100||!/^\S+@\S+\.\S+$/.test(email)||email.length>180||password.length<10||password.length>128)fail('Enter a name, valid email, and a password of 10–128 characters.');
      if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('An account with this email already exists.',409);
      db.prepare('INSERT INTO users(name,email,phone,password) VALUES (?,?,?,?)').run(name,email,String(body.phone||'').slice(0,30),hashPassword(password));send({message:'Account created. You can now sign in.'},201);return;
    }
    if(route==='/api/login'&&method==='POST') {
      const email=String(body.identifier||body.username||body.email||'').toLowerCase().trim();
      const key=req.socket.remoteAddress+email; const attempts=loginAttempts.get(key)||{count:0,until:Date.now()+900000};
      if(attempts.until<Date.now()){attempts.count=0;attempts.until=Date.now()+900000;}
      if(attempts.count>=10)fail('Too many attempts. Try again in 15 minutes.',429);
      const account=db.prepare('SELECT * FROM users WHERE active=1 AND (email=? OR username=?)').get(email,email);
      if(!account||!verifyPassword(String(body.password||''),account.password)){attempts.count++;loginAttempts.set(key,attempts);fail('Username, email, or password is incorrect.',401);}
      loginAttempts.delete(key);const t=token();db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(t,account.id,Date.now()+86400000);
      res.setHeader('Set-Cookie',`pearl_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);send({user:publicUser(account)});return;
    }
    if(route==='/api/forgot-password'&&method==='POST') {
      const identifier=String(body.identifier||body.username||body.email||'').toLowerCase().trim();
      const account=db.prepare('SELECT id FROM users WHERE active=1 AND (email=? OR username=?)').get(identifier,identifier);let resetUrl;
      if(account){const t=token();db.prepare('DELETE FROM resets WHERE user_id=?').run(account.id);db.prepare('INSERT INTO resets VALUES (?,?,?)').run(t,account.id,Date.now()+900000);if(process.env.LOCAL_RESET_LINKS==='1')resetUrl=`/?reset=${t}`;}
      send({message:'If the account exists, a reset has been created. Email delivery is not configured.',resetUrl});return;
    }
    if(route==='/api/reset-password'&&method==='POST') {
      const r=db.prepare('SELECT r.* FROM resets r JOIN users u ON u.id=r.user_id WHERE r.token=? AND r.expires>? AND u.active=1').get(String(body.token||''),Date.now());if(!r)fail('Reset link is invalid or expired.');
      if(typeof body.password!=='string'||body.password.length<10||body.password.length>128)fail('Use a password of 10–128 characters.');
      db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(body.password),r.user_id);db.prepare('DELETE FROM resets WHERE user_id=?').run(r.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(r.user_id);send({message:'Password updated. Please sign in.'});return;
    }
    if(!user)fail('Please sign in to continue.',401);
    if(route==='/api/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(sessionToken);res.setHeader('Set-Cookie','pearl_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');send({ok:true});return;}
    if(route==='/api/me'&&method==='GET'){send({user:publicUser(user)});return;}
    if(route==='/api/profile/photo'&&method==='GET'){
      if(!user.profile_photo)fail('No profile picture has been uploaded.',404);
      res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'private, no-store'});res.end(user.profile_photo);return;
    }
    if(route==='/api/profile/photo'&&method==='DELETE'){
      db.prepare('UPDATE users SET profile_photo=NULL,photo_version=NULL WHERE id=?').run(user.id);
      send({user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});return;
    }
    const promoteMatch=route.match(/^\/api\/accounts\/(\d+)\/promote$/);
    if(promoteMatch&&method==='POST'){
      if(user.role!=='admin')fail('Only administrators can grant admin access.',403);
      const targetId=Number(promoteMatch[1]);
      db.exec('BEGIN IMMEDIATE');
      let account;
      try{
        account=db.prepare('SELECT id,name,email,role FROM users WHERE id=? AND active=1').get(targetId);
        if(!account)fail('Account not found.',404);
        if(account.role!=='patient')fail('This account already has admin access.',409);
        db.prepare("UPDATE users SET role='admin' WHERE id=?").run(targetId);
        db.prepare("INSERT INTO account_role_changes(actor_id,target_id,previous_role,new_role) VALUES (?,?,'patient','admin')").run(user.id,targetId);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
        notify(targetId,`${user.name} granted you administrator access. Sign in again to open the staff workspace.`);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      send({message:`${account.name} now has administrator access. They must sign in again.`,account:{...account,role:'admin'}});return;
    }
    if(route==='/api/profile'&&method==='PATCH') {if(typeof body.name!=='string'||body.name.trim().length<2||body.name.length>100)fail('Please enter your full name.');db.prepare('UPDATE users SET name=?,phone=? WHERE id=?').run(body.name.trim(),String(body.phone||'').slice(0,30),user.id);send({user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});return;}
    if(route==='/api/data'&&method==='GET') {
      const appointments=db.prepare(`SELECT a.*,u.name patient_name,u.email patient_email,u.phone patient_phone,s.name service,s.price,d.name dentist_name FROM appointments a JOIN users u ON u.id=a.patient_id JOIN services s ON s.id=a.service_id JOIN dentists d ON d.id=a.dentist_id ${user.role==='admin'?'':'WHERE a.patient_id=?'} ORDER BY a.date DESC,a.time ASC`).all(...(user.role==='admin'?[]:[user.id]));
      send({user:publicUser(user),accounts:user.role==='admin'?db.prepare("SELECT u.id,u.name,u.email,u.username,u.phone,u.role,(SELECT actor.name FROM account_role_changes c JOIN users actor ON actor.id=c.actor_id WHERE c.target_id=u.id ORDER BY c.id DESC LIMIT 1) promoted_by,(SELECT created FROM account_role_changes c WHERE c.target_id=u.id ORDER BY c.id DESC LIMIT 1) promoted_at FROM users u WHERE u.active=1 ORDER BY CASE WHEN u.role='admin' THEN 0 ELSE 1 END,u.name COLLATE NOCASE").all():[],unread_count:db.prepare('SELECT count(*) total FROM notifications WHERE user_id=? AND seen=0').get(user.id).total,dentists:db.prepare('SELECT * FROM dentists ORDER BY id').all(),reschedules:db.prepare(`SELECT r.*,a.patient_id,a.service_id,a.dentist_id,s.name service,d.name dentist_name,u.name patient_name FROM reschedules r JOIN appointments a ON a.id=r.appointment_id JOIN services s ON s.id=a.service_id JOIN dentists d ON d.id=a.dentist_id JOIN users u ON u.id=a.patient_id ${user.role==='admin'?'':'WHERE a.patient_id=?'} ORDER BY r.id DESC`).all(...(user.role==='admin'?[]:[user.id])),services:db.prepare('SELECT * FROM services').all(),appointments,patients:user.role==='admin'?db.prepare("SELECT id,name,email,phone FROM users WHERE role='patient' AND active=1").all():[],followups:db.prepare(`SELECT f.*,s.name service,u.name patient_name,d.name dentist_name FROM followups f JOIN services s ON s.id=f.service_id JOIN users u ON u.id=f.patient_id JOIN dentists d ON d.id=f.dentist_id ${user.role==='admin'?'':'WHERE f.patient_id=?'} ORDER BY f.date`).all(...(user.role==='admin'?[]:[user.id])),notifications:db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50').all(user.id)});return;
    }
    if(route==='/api/notifications/read'&&method==='POST'){db.prepare('UPDATE notifications SET seen=1 WHERE user_id=?').run(user.id);send({ok:true});return;}
    if(route==='/api/slots'&&method==='GET'){
      const date=url.searchParams.get('date'),dentistId=Number(url.searchParams.get('dentist')||1);
      const dentist=db.prepare('SELECT * FROM dentists WHERE id=?').get(dentistId);
      if(!dentist)fail('Dentist not found.',404);
      const occupied=db.prepare("SELECT time FROM appointments WHERE date=? AND status IN ('Pending','Approved') AND id!=? AND (dentist_id=? OR patient_id=?)").all(date,Number(url.searchParams.get('exclude')||0),dentistId,user.role==='patient'?user.id:Number(url.searchParams.get('patient')||0)).map(x=>x.time);
      send({slots:slots.map(time=>({time,available:!!dentist.available&&!occupied.includes(time)&&date>=dateOffset(0)&&date<=dateOffset(90)&&new Date(date+'T12:00:00').getDay()!==0&&new Date(`${date}T${time}:00`)>new Date()}))});return;
    }
    const dentistMatch=route.match(/^\/api\/dentists\/(\d+)$/);
    if(dentistMatch&&method==='PATCH'){
      if(user.role!=='admin')fail('Staff access required.',403);
      if(typeof body.available!=='boolean')fail('Choose an availability status.');
      const dentist=db.prepare('SELECT * FROM dentists WHERE id=?').get(Number(dentistMatch[1]));
      if(!dentist)fail('Dentist not found.',404);
      db.prepare('UPDATE dentists SET available=? WHERE id=?').run(body.available?1:0,dentist.id);send({ok:true});return;
    }
    const rescheduleMatch=route.match(/^\/api\/reschedules\/(\d+)$/);
    if(rescheduleMatch&&method==='PATCH'){
      const r=db.prepare('SELECT r.*,a.patient_id,a.dentist_id,a.status appointment_status FROM reschedules r JOIN appointments a ON a.id=r.appointment_id WHERE r.id=?').get(Number(rescheduleMatch[1]));
      if(!r||user.role!=='patient'||r.patient_id!==user.id)fail('Reschedule proposal not found.',404);
      if(r.actor!=='admin'||r.status!=='Pending'||!['Pending','Approved'].includes(r.appointment_status))fail('This proposal is no longer awaiting a response.');
      if(!['accept','decline'].includes(body.decision))fail('Choose accept or decline.');
      if(body.decision==='accept'){
        validSlot(r.date,r.time,r.appointment_id,r.dentist_id,r.patient_id);
        db.prepare("UPDATE appointments SET date=?,time=?,status='Approved',request='',requested_date='',requested_time='' WHERE id=?").run(r.date,r.time,r.appointment_id);
      }
      db.prepare('UPDATE reschedules SET status=? WHERE id=?').run(body.decision==='accept'?'Accepted':'Declined',r.id);
      notify(user.id,body.decision==='accept'?`Your new appointment is confirmed for ${r.date} at ${r.time}.`:'You declined the proposed time. Your original appointment is unchanged.');
      for(const staff of db.prepare("SELECT id FROM users WHERE role='admin' AND active=1").all())notify(staff.id,`${user.name} ${body.decision==='accept'?'accepted':'declined'} your proposed appointment time (${r.date} at ${r.time}).`);
      send({ok:true});return;
    }
    if(route==='/api/appointments'&&method==='POST') {
      const patientId=user.role==='admin'?Number(body.patient_id):user.id;
      if(!db.prepare("SELECT id FROM users WHERE id=? AND role='patient' AND active=1").get(patientId)||!db.prepare('SELECT id FROM services WHERE id=?').get(Number(body.service_id)))fail('Choose a valid patient and service.');
      const f=body.followup_id?db.prepare('SELECT * FROM followups WHERE id=? AND patient_id=? AND service_id=? AND appointment_id IS NULL').get(Number(body.followup_id),patientId,Number(body.service_id)):null;
      if(body.followup_id&&!f)fail('This follow-up is unavailable.');
      const dentistId=Number(body.dentist_id||f?.dentist_id||1);
      if(f&&dentistId!==f.dentist_id)fail('Please book with the dentist assigned to this follow-up.');
      validSlot(body.date,body.time,0,dentistId,patientId);const result=db.prepare('INSERT INTO appointments(patient_id,service_id,date,time,notes,dentist_id) VALUES (?,?,?,?,?,?)').run(patientId,Number(body.service_id),body.date,body.time,String(body.notes||'').slice(0,1000),dentistId);
      if(f)db.prepare('UPDATE followups SET appointment_id=? WHERE id=?').run(result.lastInsertRowid,f.id);
      notify(patientId,`Your appointment on ${body.date} at ${body.time} is pending approval.`);send({id:Number(result.lastInsertRowid)},201);return;
    }
    const match=route.match(/^\/api\/appointments\/(\d+)$/);
    if(match&&method==='PATCH') {
      const a=db.prepare('SELECT * FROM appointments WHERE id=?').get(Number(match[1]));if(!a||(user.role!=='admin'&&a.patient_id!==user.id))fail('Appointment not found.',404);
      if(user.role==='admin') {
        if(body.propose){
          if(!['Pending','Approved'].includes(a.status))fail('Closed appointments cannot be rescheduled.');
          validSlot(body.date,body.time,a.id,a.dentist_id,a.patient_id);
          if(body.date===a.date&&body.time===a.time)fail('Choose a different appointment time.');
          db.prepare("UPDATE reschedules SET status='Superseded' WHERE appointment_id=? AND status='Pending'").run(a.id);
          db.prepare("INSERT INTO reschedules(appointment_id,actor,date,time,note) VALUES (?,'admin',?,?,?)").run(a.id,body.date,body.time,String(body.note||'').slice(0,1000));
          db.prepare("UPDATE appointments SET request='',requested_date='',requested_time='' WHERE id=?").run(a.id);
          notify(a.patient_id,`The clinic proposed a new time: ${body.date} at ${body.time}. Open Follow up appointments to accept or decline.`);
        } else if(body.resolve) {
          if(!a.request)fail('There is no request to review.');
          if(!['accept','decline'].includes(body.resolve))fail('Invalid decision.');
          if(body.resolve==='accept') {
            if(a.request==='Cancellation')db.prepare("UPDATE appointments SET status='Cancelled' WHERE id=?").run(a.id);
            else {validSlot(a.requested_date,a.requested_time,a.id,a.dentist_id,a.patient_id);db.prepare("UPDATE appointments SET date=?,time=?,status='Approved' WHERE id=?").run(a.requested_date,a.requested_time,a.id);}
          }
          db.prepare("UPDATE reschedules SET status=? WHERE appointment_id=? AND actor='patient' AND status='Pending'").run(body.resolve==='accept'?'Accepted':'Declined',a.id);
          db.prepare("UPDATE appointments SET request='',requested_date='',requested_time='' WHERE id=?").run(a.id);notify(a.patient_id,`Your ${a.request.toLowerCase()} request was ${body.resolve==='accept'?'accepted':'declined'}.`);
        } else {
          if(!['Pending','Approved','Cancelled','Completed'].includes(body.status))fail('Invalid status.');
          if(['Cancelled','Completed'].includes(a.status))fail('Closed appointments cannot be changed.');
          if(body.status==='Completed'&&new Date(`${a.date}T${a.time}:00`)>new Date())fail('Future appointments cannot be marked completed.');
          db.prepare("UPDATE reschedules SET status='Superseded' WHERE appointment_id=? AND status='Pending'").run(a.id);
          db.prepare("UPDATE appointments SET status=?,request='',requested_date='',requested_time='' WHERE id=?").run(body.status,a.id);notify(a.patient_id,`Your appointment on ${a.date} at ${a.time} is now ${body.status.toLowerCase()}.`);
        }
      }else {
        if(!['Pending','Approved'].includes(a.status)||new Date(`${a.date}T${a.time}:00`)<=new Date())fail('Only upcoming active appointments can be changed.');
        if(!['Cancellation','Reschedule'].includes(body.request))fail('Invalid request.');
        if(body.request==='Reschedule'){
          validSlot(body.date,body.time,a.id,a.dentist_id,a.patient_id);
          if(body.date===a.date&&body.time===a.time)fail('Choose a different appointment time.');
        }
        db.prepare("UPDATE reschedules SET status='Superseded' WHERE appointment_id=? AND status='Pending'").run(a.id);
        if(body.request==='Reschedule')db.prepare("INSERT INTO reschedules(appointment_id,actor,date,time,note) VALUES (?,'patient',?,?,?)").run(a.id,body.date,body.time,String(body.note||'').slice(0,1000));
        for(const staff of db.prepare("SELECT id FROM users WHERE role='admin' AND active=1").all())notify(staff.id,`${user.name} requested ${body.request.toLowerCase()} for appointment #${a.id}.`);
        db.prepare('UPDATE appointments SET request=?,requested_date=?,requested_time=? WHERE id=?').run(body.request,body.request==='Reschedule'?body.date:'',body.request==='Reschedule'?body.time:'',a.id);
      } send({ok:true});return;
    }
    if(route==='/api/followups'&&method==='POST') {
      if(user.role!=='admin')fail('Staff access required.',403);
      if(!db.prepare("SELECT id FROM users WHERE id=? AND role='patient' AND active=1").get(Number(body.patient_id))||!db.prepare('SELECT id FROM services WHERE id=?').get(Number(body.service_id))||!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||Number.isNaN(new Date(body.date).getTime())||body.date<dateOffset(0)||body.date>dateOffset(90))fail('Choose a patient, service, and date within the next 90 days.');
      const dentist=db.prepare('SELECT * FROM dentists WHERE id=?').get(Number(body.dentist_id||1));
      if(!dentist)fail('Choose a valid dentist for this follow-up.');
      db.prepare('INSERT INTO followups(patient_id,service_id,date,note,dentist_id) VALUES (?,?,?,?,?)').run(Number(body.patient_id),Number(body.service_id),body.date,String(body.note||'').slice(0,1000),dentist.id);
      notify(Number(body.patient_id),`The clinic recommends a follow-up appointment around ${body.date} with ${dentist.name}. View Follow up appointments to schedule your visit.`);send({ok:true},201);return;
    }
    fail('Not found',404);
  }catch(error){send({error:error.code?.includes('SQLITE_CONSTRAINT')?'This slot is unavailable or the record already exists.':error.status?error.message:'An unexpected error occurred.'},error.code?.includes('SQLITE_CONSTRAINT')?409:error.status||500);if(!error.status&&!error.code?.includes('SQLITE_CONSTRAINT'))console.error(error);}
});
const loginAttempts=new Map();
if(process.env.NODE_ENV!=='test')server.listen(process.env.PORT===undefined?3000:Number(process.env.PORT),'127.0.0.1',()=>console.log(`NB MAGBANUA DENTAL CLINIC is running at http://localhost:${server.address().port}`));
