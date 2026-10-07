const side = document.querySelector('.sidebar');
document.querySelector('[data-sidebar-toggle]')?.addEventListener('click', () => side?.classList.toggle('open'));
const fileInput = document.querySelector('#prescription');
fileInput?.addEventListener('change', () => { const out=document.querySelector('#fileName'); if(out) out.textContent=fileInput.files[0]?.name || 'No file selected'; });

function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function money(value) { return value ? `₹${Number(value).toLocaleString('en-IN')}` : '—'; }
async function loadDashboardData() {
  if (!document.body.matches('.page-patientdash, .page-admindash')) return;
  try {
    const response = await fetch('/api/dashboard', { cache:'no-store' });
    if (!response.ok) throw new Error('Dashboard API unavailable');
    const result = await response.json();
    const m = result.metrics || {};
    document.querySelector('#patient-upcoming')?.replaceChildren(document.createTextNode(String(m.upcoming ?? 0)));
    document.querySelector('#patient-active')?.replaceChildren(document.createTextNode(String((result.recent || []).filter(b=>b.status!=='Report Ready').length)));
    document.querySelector('#patient-ready')?.replaceChildren(document.createTextNode(String(m.reportsReady ?? 0)));
    document.querySelector('#patient-bookings')?.replaceChildren(document.createTextNode(String(m.totalBookings ?? 0)));
    document.querySelector('#admin-bookings')?.replaceChildren(document.createTextNode(String(m.totalBookings ?? 0)));
    document.querySelector('#admin-tests')?.replaceChildren(document.createTextNode(String(result.recent?.length ?? 0)));
    document.querySelector('#admin-pending')?.replaceChildren(document.createTextNode(String((result.recent || []).filter(b=>b.status !== 'Report Ready').length)));
    document.querySelector('#admin-revenue')?.replaceChildren(document.createTextNode(money(m.revenue)));
    document.querySelectorAll('[data-dashboard-status]').forEach(el => el.textContent = `${m.totalBookings || 0} server booking${m.totalBookings === 1 ? '' : 's'}`);
    renderRows(result.recent || []);
    renderTrend(result.byDate || {});
    renderNotifications(result.recent || []);
  } catch (_) {
    document.querySelectorAll('[data-dashboard-status]').forEach(el => el.textContent = 'Connect the VitaCheck server to load live data.');
  }
}
function renderRows(rows) {
  document.querySelectorAll('[data-booking-rows]').forEach(tbody => {
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="4">No bookings have been received yet.</td></tr>'; return; }
    tbody.innerHTML = rows.map(b => `<tr><td>${esc(b.name || 'Patient')}<br><small>${esc(b.test || '')}</small></td><td>${esc(b.date || '—')}</td><td class="status">${esc(b.status || 'Received')}</td><td>${esc(b.reference || '—')}</td></tr>`).join('');
  });
}
function renderTrend(byDate) {
  const bars = [...document.querySelectorAll('[data-trend-bar]')]; if (!bars.length) return;
  const values = Object.values(byDate); const max = Math.max(1, ...values);
  bars.forEach((bar, i) => { const v = values[Math.max(0, values.length - bars.length + i)] || 0; bar.style.height = `${Math.max(8, Math.round((v/max)*100))}%`; bar.title = `${v} booking${v===1?'':'s'}`; });
}
function renderNotifications(rows) {
  const box=document.querySelector('[data-notifications]'); if(!box) return;
  if(!rows.length) { box.innerHTML='<p class="muted">No new booking notifications.</p>'; return; }
  box.innerHTML=rows.slice(0,3).map(b=>`<p><strong>${esc(b.reference || 'Booking')}</strong> · ${esc(b.test || 'Test')} · ${esc(b.date || '')}</p>`).join('');
}
loadDashboardData();
window.addEventListener('vitacheck:booking-created', loadDashboardData);
