(function () {
  const CMS = window.PortfolioCMS;
  const loginView = document.getElementById('login-view');
  const dashView = document.getElementById('dash-view');

  function showMsg(el, text, ok) {
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  async function boot() {
    const ok = await CMS.verify();
    if (ok) { loginView.classList.add('hidden'); dashView.classList.remove('hidden'); loadAll(); }
    else { loginView.classList.remove('hidden'); dashView.classList.add('hidden'); }
  }

  document.getElementById('login-btn').addEventListener('click', async () => {
    const pw = document.getElementById('pw').value;
    const msg = document.getElementById('login-msg');
    msg.classList.remove('hidden');
    try {
      await CMS.login(pw);
      showMsg(msg, 'Logged in.', true);
      boot();
    } catch (e) {
      showMsg(msg, 'Wrong password.', false);
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await CMS.logout();
    boot();
  });

  // ── tabs ──
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      document.getElementById('panel-certs').classList.toggle('hidden', !(name === 'certs' || name === 'events'));
      document.getElementById('panel-projects').classList.toggle('hidden', name !== 'projects');
      document.getElementById('panel-account').classList.toggle('hidden', name !== 'account');
      if (name === 'events') document.getElementById('cert-category').value = 'event';
      if (name === 'certs') document.getElementById('cert-category').value = 'certification';
    });
  });

  // ── certs/events ──
  async function loadCerts() {
    const all = await CMS.fetchCertifications();
    renderCertList(document.getElementById('certs-list'), all.filter(c => c.category === 'certification'));
    renderCertList(document.getElementById('events-list'), all.filter(c => c.category === 'event'));
  }

  function renderCertList(container, items) {
    container.innerHTML = items.map(c => `
      <div class="item-row">
        <div>
          <div class="item-title">${c.icon || ''} ${escapeHTML(c.title)}</div>
          <div class="item-meta">${escapeHTML(c.issuer_line)}</div>
        </div>
        <div class="row">
          <button class="ghost btn-inline" data-action="edit-cert" data-id="${c.id}">Edit</button>
          <button class="danger btn-inline" data-action="delete-cert" data-id="${c.id}">Delete</button>
        </div>
      </div>`).join('') || '<p class="item-meta">Nothing here yet.</p>';
  }

  // Event delegation: one listener catches all Edit/Delete clicks in either
  // list, since CSP (script-src 'self') blocks inline onclick="" attributes.
  document.getElementById('certs-list').addEventListener('click', onCertListClick);
  document.getElementById('events-list').addEventListener('click', onCertListClick);
  function onCertListClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-cert') editCert(id);
    if (btn.dataset.action === 'delete-cert') deleteCert(id);
  }

  async function deleteCert(id) {
    if (!confirm('Delete this?')) return;
    await CMS.deleteCertification(id);
    loadCerts();
  }

  async function editCert(id) {
    const all = await CMS.fetchCertifications();
    const c = all.find(x => x.id === id);
    if (!c) return;
    document.getElementById('cert-id').value = c.id;
    document.getElementById('cert-category').value = c.category;
    document.getElementById('cert-title').value = c.title;
    document.getElementById('cert-issuer').value = c.issuer_line;
    document.getElementById('cert-url').value = c.url || '';
    document.getElementById('cert-icon').value = c.icon || '';
    document.getElementById('cert-sort').value = c.sort_order || 0;
    document.getElementById('cert-form-heading').textContent = 'Edit certification';
    document.getElementById('cert-cancel-btn').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  document.getElementById('cert-cancel-btn').addEventListener('click', resetCertForm);
  function resetCertForm() {
    ['cert-id','cert-title','cert-issuer','cert-url','cert-icon'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cert-sort').value = 0;
    document.getElementById('cert-form-heading').textContent = 'Add certification';
    document.getElementById('cert-cancel-btn').classList.add('hidden');
  }

  document.getElementById('cert-save-btn').addEventListener('click', async () => {
    const msg = document.getElementById('cert-msg');
    msg.classList.remove('hidden');
    const row = {
      id: document.getElementById('cert-id').value || null,
      title: document.getElementById('cert-title').value.trim(),
      issuer_line: document.getElementById('cert-issuer').value.trim(),
      url: document.getElementById('cert-url').value.trim(),
      icon: document.getElementById('cert-icon').value.trim() || '📄',
      category: document.getElementById('cert-category').value,
      sort_order: parseInt(document.getElementById('cert-sort').value, 10) || 0
    };
    if (!row.title || !row.issuer_line) { showMsg(msg, 'Title and issuer line are required.', false); return; }
    try {
      await CMS.upsertCertification(row);
      showMsg(msg, 'Saved.', true);
      resetCertForm();
      loadCerts();
    } catch (e) { showMsg(msg, 'Save failed: ' + e.message, false); }
  });

  // ── projects ──
  async function loadProjects() {
    const items = await CMS.fetchProjects();
    document.getElementById('projects-list').innerHTML = items.map(p => `
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHTML(p.title)}</div>
          <div class="item-meta">${(p.tags || []).join(', ')}</div>
        </div>
        <div class="row">
          <button class="ghost btn-inline" data-action="edit-project" data-id="${p.id}">Edit</button>
          <button class="danger btn-inline" data-action="delete-project" data-id="${p.id}">Delete</button>
        </div>
      </div>`).join('') || '<p class="item-meta">Nothing here yet.</p>';
  }

  document.getElementById('projects-list').addEventListener('click', onProjectListClick);
  function onProjectListClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-project') editProject(id);
    if (btn.dataset.action === 'delete-project') deleteProject(id);
  }

  async function deleteProject(id) {
    if (!confirm('Delete this?')) return;
    await CMS.deleteProject(id);
    loadProjects();
  }

  async function editProject(id) {
    const items = await CMS.fetchProjects();
    const p = items.find(x => x.id === id);
    if (!p) return;
    document.getElementById('proj-id').value = p.id;
    document.getElementById('proj-title').value = p.title;
    document.getElementById('proj-desc').value = p.description;
    document.getElementById('proj-tags').value = (p.tags || []).join(', ');
    document.getElementById('proj-live').value = p.live_url || '';
    document.getElementById('proj-github').value = p.github_url || '';
    document.getElementById('proj-sort').value = p.sort_order || 0;
    document.getElementById('proj-form-heading').textContent = 'Edit project';
    document.getElementById('proj-cancel-btn').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  document.getElementById('proj-cancel-btn').addEventListener('click', resetProjectForm);
  function resetProjectForm() {
    ['proj-id','proj-title','proj-desc','proj-tags','proj-live','proj-github'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('proj-sort').value = 0;
    document.getElementById('proj-form-heading').textContent = 'Add project';
    document.getElementById('proj-cancel-btn').classList.add('hidden');
  }

  document.getElementById('proj-save-btn').addEventListener('click', async () => {
    const msg = document.getElementById('proj-msg');
    msg.classList.remove('hidden');
    const row = {
      id: document.getElementById('proj-id').value || null,
      title: document.getElementById('proj-title').value.trim(),
      description: document.getElementById('proj-desc').value.trim(),
      tags: document.getElementById('proj-tags').value.split(',').map(s => s.trim()).filter(Boolean),
      live_url: document.getElementById('proj-live').value.trim(),
      github_url: document.getElementById('proj-github').value.trim(),
      sort_order: parseInt(document.getElementById('proj-sort').value, 10) || 0
    };
    if (!row.title || !row.description) { showMsg(msg, 'Title and description are required.', false); return; }
    try {
      await CMS.upsertProject(row);
      showMsg(msg, 'Saved.', true);
      resetProjectForm();
      loadProjects();
    } catch (e) { showMsg(msg, 'Save failed: ' + e.message, false); }
  });

  // ── account ──
  document.getElementById('change-pw-btn').addEventListener('click', async () => {
    const msg = document.getElementById('pw-msg');
    msg.classList.remove('hidden');
    const val = document.getElementById('new-pw').value;
    if (val.length < 8) { showMsg(msg, 'Use at least 8 characters.', false); return; }
    try {
      await CMS.changePassword(val);
      showMsg(msg, 'Password updated.', true);
      document.getElementById('new-pw').value = '';
    } catch (e) { showMsg(msg, 'Failed: ' + e.message, false); }
  });

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function loadAll() { loadCerts(); loadProjects(); }

  boot();
})();
