# NB MAGBANUA DENTAL CLINIC

A responsive dental appointment system built with HTML, CSS, JavaScript, Bootstrap 5, Node.js, and SQLite. This project runs locally; no hosted deployment has been created.

## Run

Requires Node.js 24 or later.

```powershell
npm install
npm start
```

Open **http://localhost:3000**. The first start creates `data/clinic.sqlite` with sample patients, six dental services, appointments, and a follow-up recommendation. Bootstrap is served locally, so the interface has no CDN dependency.

### Assigned local accounts

| Name / Username | Role | Password |
| --- | --- | --- |
| dwaynelei | Patient | `NB!nv2aCylL2dxmzIld` |
| policarpio | Patient | `NB!ZgyWO4FINq3mVO7f` |
| paredes | Patient | `NB!zMNCNq9MP-Y_pYA0` |
| alicando | Patient | `NB!34ACxy9HH7STX_0g` |
| yongco | Admin | `NB!wY9VY1i80RF_uI1z` |
| angeles | Admin | `NB!bNYzz0xuu_2HjePi` |
| amerna | Admin | `NB!8iekU0Ri-V43WFd6` |

Sign in using a username or email address. Each assigned account has a different generated initial password in `data/account-credentials.json`. This file is outside the public web folder and excluded from Git. The assigned `.test` email addresses are local placeholders; no email is delivered to them.

**Staff workspace** and **Patient portal** keep the username and password you already entered. With credentials entered, either button submits the sign-in form. When the username is empty, they suggest yongco or dwaynelei; a password is still required. Passwords are not embedded in the page or its JavaScript. Separately registered users continue signing in with their existing emails and passwords. Registration always creates a patient account.

The one-time `node scripts/update-demo-accounts.mjs` conversion backs up the database, renames the first four patient demos and the original admin while preserving their IDs, adds the two other administrators, and disables the two surplus old demo logins. Historical records are retained. Separately registered accounts are unchanged. Re-running the conversion does not reset passwords. Fresh databases start with the same seven assigned accounts and write a new credentials file.

Generated initial passwords do not expire automatically. To replace one during local testing, use **Forgot password?** with the username and the local recovery workflow described below.


### If an assigned account does not sign in

- Open **http://localhost:3000** after running `npm start`. Opening `public/index.html` directly or through a separate static/Live Server does not run the login API.
- Enter one exact username from the table and its password. Passwords are case-sensitive; do not copy the surrounding Markdown backticks or extra spaces.
- Select **Sign in**. The eye icon shows or hides the entered password. The workspace/portal shortcuts no longer overwrite an entered username or clear its password.
- Refresh the page with **Ctrl+F5** to load the updated login form. Restart `npm start` if an older server is running.
- The table lists this workspace's current assigned passwords. If a password was changed through recovery, use the replacement. A newly created database generates different passwords in `data/account-credentials.json`.

## Features and purpose

| Feature | Behavior |
| --- | --- |
| Registration and login | Patients register and sign in. Salted scrypt password hashes are stored in SQLite. Random server-side sessions use HttpOnly, SameSite=Strict cookies and expire after 24 hours. Logout revokes the session. Failed login attempts are limited in server memory. |
| Account management | Existing administrators search registered accounts and choose Make admin. A confirmation explains the permissions. The server checks the acting administrator, records who granted access and when, and ends the promoted account's existing sessions. The new admin signs in again with their existing credentials and can grant access to other accounts. Patient registration always creates a patient account. |
| Profile | Patients and staff update their names and phone numbers, and upload, replace, or remove a profile picture from Settings > Account information. JPG, PNG, and WebP images up to 2 MB and 16 megapixels are accepted. The server decodes and crops pictures to a 512-pixel square WebP and stores them in SQLite. Pictures appear in the header, account menu, and profile; removal restores initials. Uploading does not clear unsaved name or phone edits. |
| Password recovery | Expiring, single-use tokens reset passwords and revoke existing sessions. **Email delivery is not implemented.** See local testing below. |
| Appointment booking | Select a service, date, available half-hour slot, and optional notes. Staff also select the patient. Choose one of four dentist profiles. Each dentist has a separate appointment capacity per slot. |
| Availability | Monday–Saturday, 9 AM–5 PM, with lunch from noon–1 PM. Bookings are limited to future slots within 90 days. SQLite enforces one Pending or Approved appointment per dentist and slot, and prevents a patient from booking simultaneous visits, including concurrent booking attempts. |
| Status management | Staff approve or cancel active appointments and complete visits whose start time has passed. Closed appointments remain in history. |
| Cancellation and rescheduling | Patients request changes to upcoming active appointments. Staff accept or decline. The original reservation remains until acceptance; proposed reschedule slots are not held and are checked again when accepted. |
| Notifications | Booking acknowledgements, status updates, request decisions, and follow-up recommendations are saved as in-app notifications. Patients can mark them read. A red badge shows the exact unread total, including notifications beyond the 50 most recent displayed entries. Views refresh when focused and every 30 seconds while idle. **Email, SMS, and push delivery are not implemented.** |
| Appointment history | Patients access their own records, including Pending appointments and unresolved change requests under the Pending tab. Appointment dates include the year. A pending change request does not silently change the actual booking status. Staff use the patient directory to inspect each patient’s appointment history. Role and ownership checks run on the server. |
| Service history | The patient sidebar includes a history log of completed dental services, with the visit date (including year), time, attending dentist, and record details. Search by service, dentist, or date, filter by service, and browse pages. |
| Follow up appointments | Patients see administrator-provided follow-ups with the recommended date, assigned dentist, service, and care notes. They can book an available time with the assigned dentist, then view the booked date, time, and status. Follow-up cards retain their Request reschedule buttons. The patient follow-up page omits the proposed-times and rescheduling-history sections. Staff select the dentist when recommending a follow-up. |
| Dentists | Four clearly labeled sample profiles show specialty, biography, and Available / Not available status. Staff manage the availability toggle. Patient bookings and reschedule acceptance check dentist availability on the server. |
| Staff dashboard | Counts by status, date calendar, current-day appointments, upcoming confirmed appointments, patient requests, and status distribution. |
| Search and scheduling | Appointment search, service and status filters, pagination, and weekly schedule navigation. Patient directory search supports name, email, and phone. |
| Responsive interface | Sidebar navigation becomes a drawer on phones; tables scroll within their cards. Dialogs support keyboard focus trapping and Escape to close. |

## Local password reset testing

Stop the server, then run:

```powershell
$env:LOCAL_RESET_LINKS='1'
npm start
```

Use **Forgot password?** with an assigned username or a registered email. A local reset link appears below the form for an existing account. Tokens expire in 15 minutes and can be used once. Without this explicit environment flag, the API does not return reset tokens. Do not enable this flag on a publicly accessible deployment. No emails are sent in either mode.

## Project structure

```text
public/
  index.html                 Application shell
  favicon.svg                Clinic mark
  css/styles.css             Responsive design and component styles
  js/app.js                  Patient/staff views and API interactions
  vendor/bootstrap/          Locally served Bootstrap CSS
server/
  server.js                  HTTP server, API routes, authorization, availability
  database.js                SQLite schema and realistic seed records
  auth.js                    Password hashing and random token helpers
  demo-accounts.js           Assigned roster and history-preserving conversion
scripts/
  update-demo-accounts.mjs    One-time replacement with a database backup
tests/
  system.test.js             Account, booking, ownership, and follow-up API tests
  storage.test.js            Persistence across process restarts
  browser.mjs                Desktop/tablet/mobile browser workflows
data/                        Generated database; excluded from Git
test-results/                Generated browser screenshots; excluded from Git
```

## Development stages and validation

1. **Accounts and profiles:** registration, password hashing, sessions, ownership, profile edits, expiring reset links, and session revocation.
2. **Booking and status workflows:** slot availability, concurrent booking conflicts, approval, cancellation/reschedule requests, notifications, and patient history.
3. **Staff and patient interfaces:** responsive dashboards, filters, directory, schedule, recommendations, and browser workflow checks.

Run the API and file persistence checks:

```powershell
npm test
```

Run browser checks:

```powershell
npx playwright install chromium
npm run test:browser
```

Browser checks use an isolated, in-memory database on port 3001. They cover staff and patient navigation, booking, approval, reschedule requests and acceptance, dentist profile selection, admin-proposed times and patient acceptance, Pending history, red unread count, green/yellow/red calendar dots, notification read state, profile editing, and document overflow at 1440, 768, and 390 pixels. Screenshots are saved in `test-results/`. On Windows the test can reuse a cached Chromium installation; `BROWSER_PATH` can specify another Chromium executable.

API tests also use isolated data. They verify concurrent same-slot conflicts, cross-patient access denial, denial of patient staff operations, single-use follow-up booking, future-completion rejection, password-reset token reuse rejection, and logout/session invalidation. The persistence test upgrades a legacy disk database and restarts the server, checking retained account changes, sessions, appointment records, and simultaneous bookings for different dentists.

## Configuration and limits

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local HTTP port |
| `DB_PATH` | `data/clinic.sqlite` | SQLite database location |
| `LOCAL_RESET_LINKS` | off | Return recovery links for local testing only |
| `COOKIE_SECURE` | off | Set to `1` to require HTTPS session cookies |

The server binds to `127.0.0.1`. Dates and clinic hours use the server’s local timezone; use Asia/Manila for this clinic when deploying elsewhere. The application assumes one clinic with four dentists and separate appointment capacity per dentist, and every listed service reserves a 30-minute initial visit. The extraction service is a consultation, not a promise of a 30-minute extraction procedure.

This is a tested local implementation, not a production security certification. Before real patient use, remove demo entry points and seed accounts, configure HTTPS and secure cookies, integrate actual email recovery, review healthcare privacy requirements and retention, add operational logging/monitoring and backups, and review abuse controls. Login throttling currently resets when the server restarts. No clinical treatment records or attachments are collected.

Back up the database before changing or removing sample data. No paid messaging or external services are required for local testing.

## Clinic update

The interface uses classic navy and blue accents, warm off-white surfaces, darker box borders, and muted green, gold, and red status colors. The administrator?s calendar shows green dots for Approved, yellow for Pending, red for Cancelled, and a muted violet for Completed. Mixed-status dates show multiple dots and have accessible status descriptions.

Existing records migrate automatically when starting the updated server. Existing unbooked follow-up recommendations default to the first sample dentist; booked follow-ups retain their appointment?s dentist. Existing appointments are assigned to the first sample dentist; original patient IDs, services, dates, and statuses are retained. Demo account emails and passwords remain unchanged for compatibility. Dentist names and profile details are placeholders for the clinic?s real team.

The admin sidebar omits Dental services. Staff can still choose a dental service when booking appointments or recommending follow-ups.

## Add another administrator

1. Have the person register an account using their own email and password.
2. Sign in as an existing administrator and open **Account management** in the sidebar.
3. Search for the person's name or email, choose **Make admin**, and confirm **Grant admin access**.
4. The person signs in again to access the staff workspace.

The account list shows the current role and who granted admin access. Existing appointment records are retained. This feature grants administrator access; it does not remove or downgrade existing administrators. Role changes and their audit records are stored in SQLite and covered by restart and authorization tests.

The upper-right account arrow opens a dropdown in both portals. **Settings** opens **Account information** to view the account email and update the name or phone number. **Log out** ends the current session. The dropdown supports outside-click dismissal, Escape, and arrow-key navigation, and remains within the viewport on mobile screens.

Profile picture tests cover both roles, invalid and oversized files, account isolation, removal, browser reloads, and persistence after server restart. The picture endpoint requires an authenticated session and returns only the signed-in account's picture.
