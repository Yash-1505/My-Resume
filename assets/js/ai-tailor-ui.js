/**
 * ai-tailor-ui.js — the UI layer for the AI Tailor feature. Talks to
 * AIVault (encrypted key storage), LLM (provider calls), and Tailor
 * (prompt building + response parsing). Nothing here ever logs or
 * displays the raw API key.
 */
(function () {
  let currentSuggestions = null; // { projects: [...], certifications: [...] } from the last generate

  function showMsg(el, text, ok) {
    el.textContent = text;
    el.classList.remove('hidden');
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function refreshConfiguredView() {
    const configured = window.AIVault.hasStoredKey();
    document.getElementById('aiVaultConfigured').classList.toggle('hidden', !configured);
    document.getElementById('aiVaultSetup').classList.toggle('hidden', configured);
    if (configured) {
      const meta = window.AIVault.getMeta() || {};
      const preset = window.LLM.PROVIDER_PRESETS[meta.provider];
      document.getElementById('aiConfiguredProvider').textContent = (preset && preset.label) || meta.provider || '—';
      document.getElementById('aiConfiguredModel').textContent = meta.model || '—';
      updateUnlockButtons();
    }
  }

  function updateUnlockButtons() {
    const unlocked = window.AIVault.isUnlocked();
    document.getElementById('aiUnlockBtn').classList.toggle('hidden', unlocked);
    document.getElementById('aiLockBtn').classList.toggle('hidden', !unlocked);
    document.getElementById('aiUnlockPrompt').classList.add('hidden');
  }

  // ── Provider select prefills endpoint/model ──
  document.getElementById('aiProvider').addEventListener('change', (e) => {
    const preset = window.LLM.PROVIDER_PRESETS[e.target.value];
    if (preset) {
      document.getElementById('aiEndpoint').value = preset.defaultEndpoint;
      document.getElementById('aiModel').value = preset.defaultModel;
    }
  });
  // trigger once on load for the default-selected provider
  document.getElementById('aiProvider').dispatchEvent(new Event('change'));

  // ── Security details expand ──
  document.getElementById('aiSecurityDetailsLink').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('aiSecurityDetails').classList.toggle('hidden');
  });

  // ── Save & Encrypt ──
  document.getElementById('aiSaveKeyBtn').addEventListener('click', async () => {
    const msg = document.getElementById('aiSaveMsg');
    const provider = document.getElementById('aiProvider').value;
    const endpoint = document.getElementById('aiEndpoint').value.trim();
    const model = document.getElementById('aiModel').value.trim();
    const apiKey = document.getElementById('aiApiKey').value;
    const passphrase = document.getElementById('aiPassphrase').value;

    if (!endpoint || !model || !apiKey || !passphrase) {
      showMsg(msg, 'All fields are required.', false);
      return;
    }
    try {
      window.LLM.assertHttps(endpoint); // fail loudly here rather than silently at call time
    } catch (e) {
      showMsg(msg, e.message, false);
      return;
    }
    try {
      await window.AIVault.saveKey(apiKey, passphrase, { provider, endpoint, model });
      showMsg(msg, 'Saved and encrypted.', true);
    } catch (e) {
      showMsg(msg, 'Failed to save: ' + e.message, false);
      return;
    }
    // Clear plaintext fields from the DOM immediately — nothing sensitive should linger in an input.
    document.getElementById('aiApiKey').value = '';
    document.getElementById('aiPassphrase').value = '';
    refreshConfiguredView();
  });

  // ── Unlock / Lock / Wipe ──
  document.getElementById('aiUnlockBtn').addEventListener('click', () => {
    document.getElementById('aiUnlockPrompt').classList.remove('hidden');
  });

  document.getElementById('aiUnlockConfirmBtn').addEventListener('click', async () => {
    const msg = document.getElementById('aiVaultMsg');
    const passphraseInput = document.getElementById('aiUnlockPassphrase');
    const passphrase = passphraseInput.value;
    try {
      await window.AIVault.unlock(passphrase);
      showMsg(msg, 'Unlocked for this session.', true);
    } catch (e) {
      showMsg(msg, e.message, false);
    }
    passphraseInput.value = ''; // clear immediately regardless of outcome
    updateUnlockButtons();
  });

  document.getElementById('aiLockBtn').addEventListener('click', () => {
    window.AIVault.lock();
    updateUnlockButtons();
    showMsg(document.getElementById('aiVaultMsg'), 'Locked.', true);
  });

  document.getElementById('aiWipeBtn').addEventListener('click', () => {
    if (!confirm('Delete the stored key permanently? You will need to re-enter it to use this feature again.')) return;
    window.AIVault.wipe();
    refreshConfiguredView();
  });

  // ── Generate Suggestions ──
  document.getElementById('aiGenerateBtn').addEventListener('click', async () => {
    const msg = document.getElementById('aiGenerateMsg');
    const jobDesc = document.getElementById('aiJobDesc').value.trim();

    if (!window.AIVault.hasStoredKey()) {
      showMsg(msg, 'Set up your API key above first.', false);
      return;
    }
    if (!window.AIVault.isUnlocked()) {
      showMsg(msg, 'Unlock your key above first.', false);
      return;
    }
    if (!jobDesc) {
      showMsg(msg, 'Paste a job description first.', false);
      return;
    }

    const projects = window.AdminData.getProjects();
    const certs = window.AdminData.getCerts();
    const events = window.AdminData.getEvents();
    const allCerts = certs.concat(events);

    if (!projects.length && !allCerts.length) {
      showMsg(msg, 'Nothing to tailor yet — add some projects or certifications first.', false);
      return;
    }

    showMsg(msg, 'Asking the AI… this can take a few seconds.', true);
    document.getElementById('aiGenerateBtn').disabled = true;

    try {
      const meta = window.AIVault.getMeta();
      const userPrompt = window.Tailor.buildUserPrompt(jobDesc, projects, allCerts);
      const rawResponse = await window.AIVault.withKey(key =>
        window.LLM.callLLM(meta, key, window.Tailor.SYSTEM_PROMPT, userPrompt)
      );
      const validProjectIds = projects.map(p => p.id);
      const validCertIds = allCerts.map(c => c.id);
      currentSuggestions = window.Tailor.parseSuggestions(rawResponse, validProjectIds, validCertIds);
      renderPreview(currentSuggestions, projects, allCerts);
      showMsg(msg, 'Suggestions ready — review below.', true);
    } catch (e) {
      showMsg(msg, 'Failed: ' + e.message, false);
    } finally {
      document.getElementById('aiGenerateBtn').disabled = false;
    }
  });

  // ── Preview rendering ──
  function renderPreview(suggestions, projects, allCerts) {
    const projById = Object.fromEntries(projects.map(p => [p.id, p]));
    const certById = Object.fromEntries(allCerts.map(c => [c.id, c]));

    let html = '';
    if (suggestions.projects.length) {
      html += '<h3 class="ai-preview-section-hd">Projects</h3>';
      suggestions.projects.forEach((s, i) => {
        const orig = projById[s.id];
        if (!orig) return;
        const hasRewrite = s.rewritten_description && s.rewritten_description !== orig.description;
        html += `<div class="ai-preview-item">
          <label class="ai-preview-check">
            <input type="checkbox" checked data-kind="project" data-id="${escapeHTML(s.id)}" data-index="${i}">
            <strong>${escapeHTML(orig.title)}</strong> — new position #${s.new_sort_order / 10}
          </label>
          ${hasRewrite ? `
            <div class="ai-preview-diff">
              <div class="ai-preview-old"><span class="ai-preview-tag">current</span> ${escapeHTML(orig.description)}</div>
              <div class="ai-preview-new"><span class="ai-preview-tag">suggested</span> ${escapeHTML(s.rewritten_description)}</div>
            </div>` : ''}
        </div>`;
      });
    }
    if (suggestions.certifications.length) {
      html += '<h3 class="ai-preview-section-hd">Certifications &amp; Events</h3>';
      suggestions.certifications.forEach((s, i) => {
        const orig = certById[s.id];
        if (!orig) return;
        html += `<div class="ai-preview-item">
          <label class="ai-preview-check">
            <input type="checkbox" checked data-kind="cert" data-id="${escapeHTML(s.id)}" data-index="${i}">
            <strong>${escapeHTML(orig.title)}</strong> — new position #${s.new_sort_order / 10}
          </label>
        </div>`;
      });
    }
    document.getElementById('aiPreviewList').innerHTML = html;
    document.getElementById('aiPreviewCard').classList.remove('hidden');
  }

  // ── Apply / Discard ──
  document.getElementById('aiApplyBtn').addEventListener('click', async () => {
    const msg = document.getElementById('aiApplyMsg');
    if (!currentSuggestions) return;

    const checked = Array.from(document.querySelectorAll('#aiPreviewList input[type="checkbox"]:checked'));
    if (!checked.length) {
      showMsg(msg, 'Nothing selected.', false);
      return;
    }
    document.getElementById('aiApplyBtn').disabled = true;
    showMsg(msg, 'Applying…', true);

    const projects = window.AdminData.getProjects();
    const certs = window.AdminData.getCerts().concat(window.AdminData.getEvents());
    const projById = Object.fromEntries(projects.map(p => [p.id, p]));
    const certById = Object.fromEntries(certs.map(c => [c.id, c]));

    let failures = 0;
    for (const cb of checked) {
      const kind = cb.dataset.kind;
      const id = cb.dataset.id;
      const index = Number(cb.dataset.index);
      try {
        if (kind === 'project') {
          const suggestion = currentSuggestions.projects[index];
          const orig = projById[id];
          if (!orig || !suggestion) continue;
          const updated = Object.assign({}, orig, {
            sort_order: suggestion.new_sort_order,
            description: suggestion.rewritten_description || orig.description
          });
          await window.PortfolioCMS.upsertProject(updated);
        } else if (kind === 'cert') {
          const suggestion = currentSuggestions.certifications[index];
          const orig = certById[id];
          if (!orig || !suggestion) continue;
          const updated = Object.assign({}, orig, { sort_order: suggestion.new_sort_order });
          await window.PortfolioCMS.upsertCertification(updated);
        }
      } catch (e) {
        failures++;
      }
    }

    await window.AdminData.reloadProjects();
    await window.AdminData.reloadCerts();

    if (failures) {
      showMsg(msg, `Applied with ${failures} failure(s) — check the individual lists.`, false);
    } else {
      showMsg(msg, 'Applied. Changes are live.', true);
    }
    document.getElementById('aiApplyBtn').disabled = false;
    document.getElementById('aiPreviewCard').classList.add('hidden');
    currentSuggestions = null;
  });

  document.getElementById('aiDiscardBtn').addEventListener('click', () => {
    currentSuggestions = null;
    document.getElementById('aiPreviewCard').classList.add('hidden');
  });

  refreshConfiguredView();
})();
