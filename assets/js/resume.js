/**
 * resume.js — Resume Page Runtime
 * Portfolio v3.2.0 · itsyashwanth.vercel.app
 *
 * ─── Architecture Change v3.1.0 ──────────────────────────────
 * Serverless Chromium removed. Vercel's free-tier runtime lacks
 * libnss3.so (required by Chromium) and cannot be patched without
 * bundling the full ~130MB chromium package (exceeds free limit).
 *
 * PDF generation is now fully client-side:
 *   ATS    → jsPDF programmatic text-layer PDF  (auto-download, no dialog)
 *   Modern → html2pdf.js canvas render          (auto-download, themed)
 *
 * Benefits: zero cold start, works offline, no env vars, no infra.
 *
 * ─── Module Map ───────────────────────────────────────────────
 *   M1  LibCheck         Verifies jsPDF + html2pdf loaded after DOM ready.
 *                        Drives traffic-light dot (red = libs missing, green = ready).
 *   M2  DownloadModal    Two-option picker (ATS / Modern). Focus-trapped, a11y.
 *   M3  jsPDFFallback    ATS PRIMARY — programmatic text-layer PDF from live DOM.
 *                        Contacts rendered in 2 rows (no mid-URL wrap).
 *                        Certifications scoped to section[aria-label] (no event dupes).
 *   M4  Html2PDFFallback MODERN PRIMARY — canvas render via html2pdf.js.
 *   M5  ErrorModal       Last-resort dialog + "Open Print Dialog" escape hatch.
 *   M6  ComparisonToast  Post-Modern-download prompt for other theme variant.
 *   M7  Init             Wires all modules on DOMContentLoaded.
 *
 * ─── Download Chain ───────────────────────────────────────────
 *   ATS:    M3 (jsPDF) → fail → M5 ErrorModal (offers window.print())
 *   Modern: M4 (html2pdf) → fail → M5 ErrorModal
 *           On success → M6 ComparisonToast
 */

(() => {
  'use strict';

  /** Auto-dismiss delay for comparison toast (ms). */
  const TOAST_DISMISS_MS = 8_000;

  // ═══════════════════════════════════════════════════════════
  // M1 — LIB CHECK
  // ═══════════════════════════════════════════════════════════
  /**
   * M1: LibCheck
   * Checks whether jsPDF and html2pdf.js loaded successfully.
   * Updates the traffic-light dot accordingly.
   *   green = both libs ready, downloads will work
   *   red   = one or both libs failed to load
   */
  const LibCheck = (() => {
    function run() {
      const dot  = document.getElementById('dlStatusDot');
      const hint = document.getElementById('dlStatusHint');

      const jsPDFReady    = typeof window.jspdf !== 'undefined';
      const html2pdfReady = typeof html2pdf    !== 'undefined';
      const allReady      = jsPDFReady && html2pdfReady;

      if (!dot) return;

      if (allReady) {
        dot.dataset.state = 'ready';
        dot.ariaLabel     = 'PDF generator ready';
        if (hint) hint.textContent = 'Ready to download';
      } else {
        dot.dataset.state = 'failed';
        dot.ariaLabel     = 'PDF library failed to load — try refreshing';
        if (hint) hint.textContent = 'PDF library failed — refresh the page';
        console.warn(
          '[LibCheck] Missing libs →',
          !jsPDFReady    ? 'jsPDF '    : '',
          !html2pdfReady ? 'html2pdf'  : ''
        );
      }
    }

    return { run };
  })();

  // ═══════════════════════════════════════════════════════════
  // M2 — DOWNLOAD MODAL
  // ═══════════════════════════════════════════════════════════
  /**
   * M2: DownloadModal
   * Two-option download picker. Focus-trapped dialog.
   * Keyboard: Escape closes, Tab cycles within modal.
   */
  const DownloadModal = (() => {
    let modalEl   = null;
    let triggerEl = null;
    let onChoose  = null;

    function open() {
      if (!modalEl) return;
      triggerEl              = document.activeElement;
      modalEl.hidden         = false;
      modalEl.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const first = modalEl.querySelector('button:not([disabled])');
      if (first) first.focus();
    }

    function close() {
      if (!modalEl) return;
      modalEl.hidden = true;
      modalEl.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (triggerEl) triggerEl.focus();
    }

    function init(el, cb) {
      modalEl  = el;
      onChoose = cb;

      el.querySelector('#dlModalClose')?.addEventListener('click', close);
      el.querySelector('.dl-modal-backdrop')?.addEventListener('click', close);

      el.querySelector('#dlATSBtn')?.addEventListener('click', () => {
        close();
        if (onChoose) onChoose('ats');
      });
      el.querySelector('#dlModernBtn')?.addEventListener('click', () => {
        close();
        if (onChoose) onChoose('modern');
      });

      // Focus trap + Escape
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { close(); return; }
        if (e.key !== 'Tab') return;

        const focusable = [...el.querySelectorAll('button:not([disabled])')];
        if (!focusable.length) return;

        const first = focusable[0];
        const last  = focusable.at(-1);

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      });
    }

    return { open, close, init };
  })();

  // ═══════════════════════════════════════════════════════════
  // M3 — jsPDF (ATS PRIMARY)
  // ═══════════════════════════════════════════════════════════
  /**
   * M3: jsPDFFallback (now ATS primary path)
   * Builds a programmatic text-layer PDF directly from the live DOM.
   * Text-searchable, ATS-parseable, auto-downloads — no dialog.
   *
   * Requires: /assets/js/lib/jspdf.umd.min.js
   * Selectors verified against resume.html class names.
   */
  const jsPDFFallback = (() => {
    const A4_W = 595.28;
    const MH   = 47;   // horizontal margin (pt)
    const MV   = 43;   // vertical margin (pt)
    const CW   = A4_W - MH * 2;

    /** Safe text extractor — returns '' if element absent. */
    const q  = (s) => document.querySelector(s)?.textContent?.trim() ?? '';
    /** Safe multi-element text extractor. */
    const qa = (s) => [...document.querySelectorAll(s)]
      .map((e) => e.textContent?.trim()).filter(Boolean);

    async function generate() {
      if (!window.jspdf) throw new Error('jsPDF not loaded');

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      let y = MV;

      // ── Helpers ────────────────────────────────────────────
      function txt(text, x, size, style, maxW = CW, lh = 1.35) {
        if (!text) return;
        doc.setFontSize(size);
        doc.setFont('helvetica', style);
        const lines = doc.splitTextToSize(String(text), maxW);
        doc.text(lines, x, y);
        y += lines.length * size * lh;
      }

      function rule() {
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.5);
        doc.line(MH, y, A4_W - MH, y);
        y += 6;
      }

      function gap(n) { y += n; }

      function checkBreak(needed = 20) {
        if (y + needed > 841.89 - MV) { doc.addPage(); y = MV; }
      }

      // ── HEADER ─────────────────────────────────────────────
      const name = q('.resume-name').replace(/\.$/, '').trim();
      doc.setTextColor(20, 20, 20);
      txt(name, MH, 22, 'bold');
      gap(3);

      doc.setTextColor(80, 80, 80);
      txt(q('.resume-role'), MH, 11, 'normal');
      gap(5);

      // Contact items — grab anchor text to avoid icon characters.
      // Fallback strips non-ASCII (emoji, icons) from plain-text nodes.
      const contactParts = [...document.querySelectorAll('.contact-item')]
        .map((el) =>
          el.querySelector('a')?.textContent?.trim()
          || el.textContent?.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim()
        )
        .filter(Boolean);
      // Render in two rows so no URL gets split mid-word by jsPDF's line-wrapper.
      // Row 1: email · portfolio · linkedin  |  Row 2: github · location
      const SEP  = '  ·  ';
      const row1 = contactParts.slice(0, 3).join(SEP);
      const row2 = contactParts.slice(3).join(SEP);
      doc.setTextColor(100, 100, 100);
      txt(row1, MH, 9, 'normal');
      if (row2) { gap(2); txt(row2, MH, 9, 'normal'); }
      gap(9);
      rule();

      // ── SUMMARY ────────────────────────────────────────────
      const summary = q('.summary-text');
      if (summary) {
        checkBreak(40);
        doc.setTextColor(40, 40, 40);
        txt('SUMMARY', MH, 9, 'bold');
        gap(4);
        doc.setTextColor(55, 55, 55);
        txt(summary, MH, 10, 'normal');
        gap(10);
        rule();
      }

      // ── EDUCATION ──────────────────────────────────────────
      // Classes: .edu-item > .edu-degree, .edu-school, .edu-date, .edu-detail
      const eduItems = [...document.querySelectorAll('.edu-item')].map((el) => ({
        degree: el.querySelector('.edu-degree')?.textContent?.trim() ?? '',
        school: el.querySelector('.edu-school')?.textContent?.trim() ?? '',
        date:   el.querySelector('.edu-date')?.textContent?.trim()   ?? '',
        detail: el.querySelector('.edu-detail')?.textContent?.trim() ?? '',
      }));

      if (eduItems.length) {
        checkBreak(30);
        doc.setTextColor(40, 40, 40);
        txt('EDUCATION', MH, 9, 'bold');
        gap(4);

        eduItems.forEach((e) => {
          checkBreak(44);
          doc.setTextColor(20, 20, 20);
          txt(e.degree, MH, 11, 'bold');
          doc.setTextColor(70, 70, 70);
          txt(`${e.school}  ·  ${e.date}`, MH, 9, 'normal');
          if (e.detail) {
            doc.setTextColor(100, 100, 100);
            txt(e.detail, MH, 8, 'italic');
          }
          gap(7);
        });
        rule();
      }

      // ── TECHNICAL SKILLS ───────────────────────────────────
      // Classes: .skill-row > .skill-cat + .skill-vals
      const skillRows = [...document.querySelectorAll('.skill-row')].map((el) => ({
        label:  el.querySelector('.skill-cat')?.textContent?.trim()  ?? '',
        values: el.querySelector('.skill-vals')?.textContent?.trim() ?? '',
      })).filter((r) => r.label && r.values);

      if (skillRows.length) {
        checkBreak(30);
        doc.setTextColor(40, 40, 40);
        txt('TECHNICAL SKILLS', MH, 9, 'bold');
        gap(4);

        skillRows.forEach((row) => {
          checkBreak(18);
          const label = `${row.label}:  `;
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          const labelW = doc.getTextWidth(label);
          doc.setTextColor(30, 30, 30);
          doc.text(label, MH, y);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          const valLines = doc.splitTextToSize(row.values, CW - labelW);
          doc.text(valLines, MH + labelW, y);
          y += Math.max(1, valLines.length) * 9 * 1.35;
          gap(2);
        });
        rule();
      }

      // ── PROJECTS ───────────────────────────────────────────
      // Classes: .project-item > .project-name, .project-desc,
      //          .project-stack > .stack-tag spans, .project-link anchors
      const projects = [...document.querySelectorAll('.project-item')].map((el) => ({
        title: el.querySelector('.project-name')?.textContent?.trim() ?? '',
        desc:  el.querySelector('.project-desc')?.textContent?.trim() ?? '',
        stack: [...el.querySelectorAll('.stack-tag')]
                 .map((s) => s.textContent?.trim()).filter(Boolean).join(', '),
        links: [...el.querySelectorAll('.project-link, a[href]')]
                 .filter((a) => a.href && !a.href.startsWith('javascript'))
                 .map((a) => a.textContent?.trim())
                 .filter(Boolean)
                 .join('  ·  '),
      })).filter((p) => p.title);

      if (projects.length) {
        checkBreak(30);
        doc.setTextColor(40, 40, 40);
        txt('PROJECTS', MH, 9, 'bold');
        gap(4);

        projects.forEach((p) => {
          checkBreak(55);
          doc.setTextColor(20, 20, 20);
          txt(p.title, MH, 11, 'bold');
          if (p.stack) {
            doc.setTextColor(80, 80, 80);
            txt(p.stack, MH, 9, 'italic');
          }
          if (p.desc) {
            doc.setTextColor(50, 50, 50);
            txt(p.desc, MH, 10, 'normal');
          }
          if (p.links) {
            doc.setTextColor(100, 100, 100);
            txt(p.links, MH, 8, 'normal');
          }
          gap(9);
        });
        rule();
      }

      // ── CERTIFICATIONS ─────────────────────────────────────
      // Scoped to section[aria-label="Certifications"] — prevents the global
      // .cert-item selector from also picking up Events & Workshops entries.
      const certSection = document.querySelector('section[aria-label="Certifications"]');
      const certItems = (certSection
        ? [...certSection.querySelectorAll('.cert-item')]
        : []
      ).map((el) => ({
        name:   el.querySelector('.cert-name')?.textContent?.trim()   ?? '',
        issuer: el.querySelector('.cert-issuer')?.textContent?.trim() ?? '',
      })).filter((c) => c.name);

      if (certItems.length) {
        checkBreak(30);
        doc.setTextColor(40, 40, 40);
        txt('CERTIFICATIONS', MH, 9, 'bold');
        gap(4);

        certItems.forEach((c) => {
          checkBreak(22);
          doc.setTextColor(25, 25, 25);
          txt(c.name, MH + 4, 10, 'bold');
          if (c.issuer) {
            doc.setTextColor(80, 80, 80);
            txt(c.issuer, MH + 4, 9, 'normal');
          }
          gap(3);
        });
        rule();
      }

      // ── EVENTS & WORKSHOPS ─────────────────────────────────
      // Events section reuses .cert-item structure —
      // scoped via section[aria-label] to avoid double-counting certs.
      const evSection  = document.querySelector(
        'section[aria-label="Events and Workshops"], #events, .events-section'
      );
      const eventItems = evSection
        ? [...evSection.querySelectorAll('.cert-item')].map((el) => ({
            name:   el.querySelector('.cert-name')?.textContent?.trim()   ?? '',
            issuer: el.querySelector('.cert-issuer')?.textContent?.trim() ?? '',
          })).filter((ev) => ev.name)
        : [];

      if (eventItems.length) {
        checkBreak(30);
        doc.setTextColor(40, 40, 40);
        txt('EVENTS & WORKSHOPS', MH, 9, 'bold');
        gap(4);

        eventItems.forEach((ev) => {
          checkBreak(22);
          doc.setTextColor(25, 25, 25);
          txt(ev.name, MH + 4, 10, 'bold');
          if (ev.issuer) {
            doc.setTextColor(80, 80, 80);
            txt(ev.issuer, MH + 4, 9, 'normal');
          }
          gap(3);
        });
      }

      doc.save('Yashwanth_Marella_ATS.pdf');
    }

    return { generate };
  })();

  // ═══════════════════════════════════════════════════════════
  // M4 — html2pdf (MODERN PRIMARY)
  // ═══════════════════════════════════════════════════════════
  /**
   * M4: Html2PDFFallback (now Modern primary path)
   * Canvas-renders the themed resume page via html2pdf.js.
   * Auto-downloads as a branded PDF matching the current theme.
   *
   * Requires: /assets/js/lib/html2pdf.bundle.min.js
   */
  const Html2PDFFallback = (() => {
    /**
     * @param {'dark'|'light'} theme
     * @param {boolean}        [isComparison=false]
     * @returns {Promise<void>}
     */
    async function generate(theme, isComparison = false) {
      if (typeof html2pdf === 'undefined') throw new Error('html2pdf not loaded');

      const pageEl = document.querySelector('.resume-page, .page-wrap, main');
      if (!pageEl) throw new Error('Resume page element not found');

      // Inject export mode — removes backdrop-filter for canvas compatibility
      document.documentElement.classList.add('pdf-export-mode');
      document.documentElement.dataset.theme = theme;

      // Wait for CSS transitions to settle
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, 350));

      const bgColor  = theme === 'dark' ? '#161312' : '#faf6f2';
      const suffix   = isComparison
        ? `_${theme.charAt(0).toUpperCase() + theme.slice(1)}`
        : '';
      const filename = `Yashwanth_Marella_Modern${suffix}.pdf`;

      const opt = {
        margin:      0,
        filename,
        image:       { type: 'jpeg', quality: 0.97 },
        html2canvas: {
          scale:           2,
          useCORS:         true,
          allowTaint:      true,
          backgroundColor: bgColor,
          logging:         false,
          windowWidth:     794,   // A4 at 96 dpi
        },
        jsPDF: {
          unit:        'mm',
          format:      'a4',
          orientation: 'portrait',
          compress:    true,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      try {
        await html2pdf().set(opt).from(pageEl).save();
      } finally {
        // Always restore document state — even on error
        document.documentElement.classList.remove('pdf-export-mode');
      }
    }

    return { generate };
  })();

  // ═══════════════════════════════════════════════════════════
  // M5 — ERROR MODAL
  // ═══════════════════════════════════════════════════════════
  /**
   * M5: ErrorModal
   * Last-resort failure dialog.
   * Offers "Open Print Dialog" as the final escape hatch.
   * @param {'ats'|'modern'} variant
   */
  const ErrorModal = (() => {
    function show(variant) {
      document.getElementById('dlErrorModal')?.remove();

      const el = document.createElement('div');
      el.id        = 'dlErrorModal';
      el.className = 'dl-error-modal';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-modal', 'true');

      el.innerHTML = `
        <div class="dl-error-backdrop"></div>
        <div class="dl-error-panel">
          <h3 class="dl-error-title">Download Failed</h3>
          <p class="dl-error-body">
            ${variant === 'ats'
              ? 'PDF generation encountered an error. Try refreshing — if the problem persists, use the print dialog to save as PDF.'
              : 'Styled PDF generation failed. Try refreshing or switching themes.'}
          </p>
          <div class="dl-error-actions">
            <button id="dlErrorPrintBtn" class="dl-error-btn dl-error-btn--primary">
              Open Print Dialog
            </button>
            <button id="dlErrorCloseBtn" class="dl-error-btn dl-error-btn--ghost">
              Dismiss
            </button>
          </div>
        </div>`;

      document.body.appendChild(el);

      el.querySelector('#dlErrorPrintBtn').addEventListener('click', () => {
        el.remove(); window.print();
      });
      el.querySelector('#dlErrorCloseBtn').addEventListener('click', () => el.remove());
      el.querySelector('.dl-error-backdrop').addEventListener('click', () => el.remove());
      el.querySelector('#dlErrorPrintBtn').focus();
    }

    return { show };
  })();

  // ═══════════════════════════════════════════════════════════
  // M6 — COMPARISON TOAST
  // ═══════════════════════════════════════════════════════════
  /**
   * M6: ComparisonToast
   * Shows after a Modern PDF download.
   * Prompts: "Need the Dark/Light version too?"
   *
   * @param {'dark'|'light'} downloadedTheme
   * @param {() => void}     onCompare
   */
  const ComparisonToast = (() => {
    let timer = null;

    function show(downloadedTheme, onCompare) {
      document.getElementById('dlCompToast')?.remove();
      if (timer) clearTimeout(timer);

      const otherLabel = downloadedTheme === 'dark' ? 'Light' : 'Dark';

      const el = document.createElement('div');
      el.id        = 'dlCompToast';
      el.className = 'dl-comparison-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');

      el.innerHTML = `
        <span class="dl-toast-check" aria-hidden="true">✓</span>
        <span class="dl-toast-msg">Downloaded Modern PDF</span>
        <button class="dl-toast-compare" id="dlToastCmpBtn">
          Need ${otherLabel} version? →
        </button>
        <button class="dl-toast-dismiss" id="dlToastDismBtn" aria-label="Dismiss toast">
          ×
        </button>`;

      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('dl-toast--visible'));

      function dismiss() {
        clearTimeout(timer);
        el.classList.remove('dl-toast--visible');
        el.classList.add('dl-toast--hiding');
        setTimeout(() => el.remove(), 300);
      }

      el.querySelector('#dlToastCmpBtn').addEventListener('click', () => {
        dismiss(); onCompare();
      });
      el.querySelector('#dlToastDismBtn').addEventListener('click', dismiss);
      timer = setTimeout(dismiss, TOAST_DISMISS_MS);
    }

    return { show };
  })();

  // ═══════════════════════════════════════════════════════════
  // ORCHESTRATOR HELPERS
  // ═══════════════════════════════════════════════════════════

  /** Returns current theme from document root data attribute. */
  function getTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  /**
   * Runs the ATS download chain.
   * Primary: jsPDF → fail → ErrorModal (offers print dialog).
   */
  async function handleATS() {
    try {
      await jsPDFFallback.generate();
    } catch (err) {
      console.error('[ATS] jsPDF failed:', err.message);
      ErrorModal.show('ats');
    }
  }

  /**
   * Runs the Modern download chain.
   * Primary: html2pdf.js → fail → ErrorModal.
   * On success → ComparisonToast.
   */
  async function handleModern() {
    const theme = getTheme();

    function afterSuccess() {
      const otherTheme = theme === 'dark' ? 'light' : 'dark';
      ComparisonToast.show(theme, async () => {
        try {
          await Html2PDFFallback.generate(otherTheme, true);
        } catch (err) {
          console.error('[Modern comparison] html2pdf failed:', err.message);
          ErrorModal.show('modern');
        }
      });
    }

    try {
      await Html2PDFFallback.generate(theme, false);
      afterSuccess();
    } catch (err) {
      console.error('[Modern] html2pdf failed:', err.message);
      ErrorModal.show('modern');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // M7 — INIT
  // ═══════════════════════════════════════════════════════════
  function init() {
    // Check libs loaded → drive status dot
    LibCheck.run();

    // Wire download button → modal
    const downloadBtn = document.getElementById('downloadBtn');
    const modalEl     = document.getElementById('dlModal');

    if (!downloadBtn || !modalEl) {
      console.warn('[Init] #downloadBtn or #dlModal not found in DOM');
      return;
    }

    DownloadModal.init(modalEl, async (variant) => {
      downloadBtn.disabled = true;
      try {
        if (variant === 'ats')    await handleATS();
        if (variant === 'modern') await handleModern();
      } finally {
        downloadBtn.disabled = false;
      }
    });

    downloadBtn.addEventListener('click', () => DownloadModal.open());
  }

  // ── Entry point ────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
