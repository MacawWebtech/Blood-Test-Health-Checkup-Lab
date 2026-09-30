# VitaCheck Diagnostics

VitaCheck is a responsive diagnostic-laboratory website with a Node.js API, SQLite persistence, authenticated patient sessions, booking lifecycle controls and dashboard data endpoints.

## Included
- Responsive marketing, tests, services and patient-portal pages
- Database-backed booking creation, viewing, updating and cancellation
- Patient registration/login with password hashing and secure HTTP-only sessions
- Role-aware API access and audit logging
- Dynamic patient/admin dashboard metrics
- Dedicated patient workspaces for reports, prescriptions, notifications, messages, payments, analytics, profile and settings

## Run locally
1. Install Node.js 22.5 or newer.
2. Run `npm start`.
3. Open `http://localhost:3000`.
4. Create a patient account from Register, then sign in.

## Deployment
Use encrypted persistent storage for the SQLite database or adapt the data layer to your managed SQL provider. Put the site behind HTTPS, configure secure cookies, add rate limiting/WAF controls, configure transactional email/SMS and payment credentials, and apply the privacy, retention, access-control and audit requirements applicable to your organization before handling real patient data.
