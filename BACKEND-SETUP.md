# VitaCheck API deployment

The website now uses a SQLite database rather than a JSON booking file. The API includes authentication, role checks, booking lifecycle operations and audit logging.

## Endpoints
- `POST /api/auth/register` — create a patient account
- `POST /api/auth/login` — start an authenticated session
- `POST /api/auth/logout` — end the current session
- `GET /api/auth/me` — current session/user
- `POST /api/bookings` — create a booking (guest or signed-in patient)
- `GET /api/bookings` — signed-in patient's bookings or all bookings for admins
- `PATCH /api/bookings/:reference` — admin booking status/schedule update
- `DELETE /api/bookings/:reference` — cancel an owned booking or an admin booking
- `GET /api/dashboard` — role-scoped dashboard data
- `GET /api/audit` — admin audit log
- `GET /api/health` — service health

## Production checklist
Before accepting real patient data, deploy behind HTTPS, use encrypted persistent storage, configure backups and retention, add rate limiting and monitoring, integrate your approved payment provider and transactional notification provider, and complete the required privacy/security review for your organization.
