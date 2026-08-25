/**
 * cms.js — Portfolio CMS client
 * Backs certifications/events + projects with a real Supabase backend.
 * Public read: anyone. Write: gated behind admin_login()'s session token,
 * checked server-side by SECURITY DEFINER Postgres functions — the anon
 * key alone can never write, so it's safe to ship in this file.
 */
(function () {
  const SUPABASE_URL = 'https://mqgsgagjforrgcggqwwr.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xZ3NnYWdqZm9ycmdjZ2dxd3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NjUzNjMsImV4cCI6MjEwMzA0MTM2M30.5KPsE_xqeEGXL6pai1q4Pdyh0jKQhrdSLNfxHWC_4tk';
  const SESSION_KEY = 'pf_admin_session';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.PortfolioCMS = window.PortfolioCMS || {};

  // ───────────────── public reads ─────────────────
  async function fetchCertifications() {
    const { data, error } = await sb
      .from('certifications')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) { console.error('cms: fetchCertifications failed', error); return []; }
    return data;
  }

  async function fetchProjects() {
    const { data, error } = await sb
      .from('projects')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) { console.error('cms: fetchProjects failed', error); return []; }
    return data;
  }

  function certCardHTML(c) {
    const href = c.url || '#';
    const targetAttrs = c.url && c.url.startsWith('http') ? 'target="_blank" rel="noopener"' : (c.url ? 'target="_blank"' : '');
    return `<a href="${escapeAttr(href)}" ${targetAttrs} class="cert-card">
      <div class="cert-icon-wrap">${escapeHTML(c.icon || '📄')}</div>
      <div class="cert-info"><div class="cert-name">${escapeHTML(c.title)}</div><div class="cert-meta">${escapeHTML(c.issuer_line)}</div></div>
      <span class="cert-arrow">↗</span>
    </a>`;
  }

  function projectCardHTML(p, index) {
    const tags = (p.tags || []).map(t => `<span class="ptag">${escapeHTML(t)}</span>`).join('');
    const links = [
      p.live_url ? `<a href="${escapeAttr(p.live_url)}" target="_blank" rel="noopener" class="plink">Live ↗</a>` : '',
      p.github_url ? `<a href="${escapeAttr(p.github_url)}" target="_blank" rel="noopener" class="plink">GitHub</a>` : ''
    ].join('');
    const num = String(index + 1).padStart(2, '0');
    return `<article class="pcard reveal reveal-up">
      <div class="pcard-top">
        <span class="pnum">${num}</span>
        <div class="plinks">${links}</div>
      </div>
      <h3 class="pname">${escapeHTML(p.title)}</h3>
      <p class="pdesc">${escapeHTML(p.description)}</p>
      <div class="pstack">${tags}</div>
    </article>`;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function escapeAttr(s) { return escapeHTML(s); }

  function fadeSwap(el, html) {
    el.style.transition = 'opacity 0.2s ease';
    el.style.opacity = '0';
    setTimeout(() => {
      el.innerHTML = html;
      el.style.opacity = '1';
    }, 200);
  }

  async function renderIntoPage() {
    const certsGrid = document.getElementById('cms-certs-grid');
    const eventsGrid = document.getElementById('cms-events-grid');
    const projectsGrid = document.getElementById('cms-projects-grid');
    if (!certsGrid && !eventsGrid && !projectsGrid) return; // page has no CMS mount points

    if (certsGrid || eventsGrid) {
      const certs = await fetchCertifications();
      if (certsGrid) {
        const items = certs.filter(c => c.category === 'certification');
        if (items.length) fadeSwap(certsGrid, items.map(certCardHTML).join(''));
      }
      if (eventsGrid) {
        const items = certs.filter(c => c.category === 'event');
        if (items.length) fadeSwap(eventsGrid, items.map(certCardHTML).join(''));
      }
    }
    if (projectsGrid) {
      const projects = await fetchProjects();
      if (projects.length) fadeSwap(projectsGrid, projects.map((p, i) => projectCardHTML(p, i)).join(''));
    }
    // content just changed under the events grid — re-apply the show-more collapse
    setTimeout(() => { if (window.__applyEventsCollapse) window.__applyEventsCollapse(); }, 250);
  }

  // ───────────────── admin auth ─────────────────
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.token || !parsed.expires_at || new Date(parsed.expires_at) < new Date()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return parsed;
    } catch (e) { return null; }
  }

  function setSession(token) {
    const expires_at = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expires_at }));
  }

  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  async function login(password) {
    const { data, error } = await sb.rpc('admin_login', { p_password: password });
    if (error) throw new Error('Wrong password');
    setSession(data);
    return data;
  }

  async function logout() {
    const s = getSession();
    if (s) await sb.rpc('admin_logout', { p_token: s.token });
    clearSession();
  }

  async function verify() {
    const s = getSession();
    if (!s) return false;
    const { data, error } = await sb.rpc('admin_verify', { p_token: s.token });
    if (error || !data) { clearSession(); return false; }
    return true;
  }

  async function changePassword(newPassword) {
    const s = getSession();
    if (!s) throw new Error('Not logged in');
    const { error } = await sb.rpc('admin_change_password', { p_token: s.token, p_new_password: newPassword });
    if (error) throw error;
  }

  // ───────────────── admin writes ─────────────────
  async function upsertCertification(row) {
    const s = getSession();
    if (!s) throw new Error('Not logged in');
    const { data, error } = await sb.rpc('admin_upsert_certification', {
      p_token: s.token, p_id: row.id || null, p_title: row.title,
      p_issuer_line: row.issuer_line, p_url: row.url || null,
      p_icon: row.icon || '📄', p_category: row.category, p_sort_order: row.sort_order || 0
    });
    if (error) throw error;
    return data;
  }

  async function deleteCertification(id) {
    const s = getSession();
    if (!s) throw new Error('Not logged in');
    const { error } = await sb.rpc('admin_delete_certification', { p_token: s.token, p_id: id });
    if (error) throw error;
  }

  async function upsertProject(row) {
    const s = getSession();
    if (!s) throw new Error('Not logged in');
    const { data, error } = await sb.rpc('admin_upsert_project', {
      p_token: s.token, p_id: row.id || null, p_title: row.title,
      p_description: row.description, p_tags: row.tags || [],
      p_live_url: row.live_url || null, p_github_url: row.github_url || null,
      p_status_badge: row.status_badge || null, p_sort_order: row.sort_order || 0
    });
    if (error) throw error;
    return data;
  }

  async function deleteProject(id) {
    const s = getSession();
    if (!s) throw new Error('Not logged in');
    const { error } = await sb.rpc('admin_delete_project', { p_token: s.token, p_id: id });
    if (error) throw error;
  }

  // ───────────────── secret trigger: type "admin" anywhere on the site ─────────────────
  function installSecretTrigger() {
    if (window.location.pathname.endsWith('/admin.html')) return;
    let buf = '';
    window.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      buf = (buf + e.key.toLowerCase()).slice(-5);
      if (buf === 'admin') window.location.href = '/admin.html';
    });
  }

  window.PortfolioCMS = {
    fetchCertifications, fetchProjects, renderIntoPage,
    login, logout, verify, changePassword, getSession,
    upsertCertification, deleteCertification, upsertProject, deleteProject
  };

  function boot() {
    renderIntoPage();
    installSecretTrigger();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot(); // script was injected after DOMContentLoaded already fired (idle-loaded case)
  }
})();
