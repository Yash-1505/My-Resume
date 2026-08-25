/**
 * Portfolio runtime — itsyashwanth.vercel.app
 *
 * Modules (all contained in a single IIFE to avoid global scope pollution):
 *   1. Theme          — dark/light toggle (dark is hard default, no localStorage)
 *   2. ScrollProgress — top progress bar + section-colour theming
 *   3. NavBehavior    — hide-on-scroll-down + mobile drawer
 *   4. TaglineCycle   — rotating hero word animation
 *   5. ScrollReveal   — IntersectionObserver entrance animations
 *   6. MagneticCards  — subtle parallax on skill + project cards
 *   7. ContactForm    — validation, Web3Forms submission, AbortController timeout
 *   8. WebGLShader    — simplex-noise animated background canvas
 *   9. ContactModal   — open/close + focus management for the Connect modal
 */
(() => {
  'use strict';

  /* ── 1. THEME ─────────────────────────────────────────────────────────── */

  const html          = document.documentElement;
  const themeBtn      = document.getElementById('themeBtn');
  const themeBtnIcon  = document.getElementById('themeBtnIcon');
  const themeBtnLabel = document.getElementById('themeBtnLabel');

  /** Hard-default dark — no localStorage dependency. */
  function initTheme() {
    html.setAttribute('data-theme', 'dark');
    themeBtnIcon.textContent  = '☀️';
    themeBtnLabel.textContent = 'Light';
  }

  function onThemeToggle() {
    const next     = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    const canvas   = document.getElementById('shader-canvas');
    html.setAttribute('data-theme', next);
    themeBtnIcon.textContent  = next === 'dark' ? '☀️' : '🌙';
    themeBtnLabel.textContent = next === 'dark' ? 'Light' : 'Dark';
    canvas.style.opacity      = next === 'light' ? '0' : '1';
  }

  initTheme();
  themeBtn.addEventListener('click', onThemeToggle);

  /* ── 2. SCROLL PROGRESS ───────────────────────────────────────────────── */

  const progressBar = document.getElementById('scroll-progress');

  function onScrollProgress() {
    const scrollable = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    progressBar.style.width = scrollable > 0
      ? `${(window.scrollY / scrollable) * 100}%`
      : '0%';
  }

  /** Change progress-bar colour to match the active section's accent. */
  const sectionColourObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.target.dataset.theme) {
          progressBar.style.backgroundColor = entry.target.dataset.theme;
        }
      });
    },
    { threshold: 0.3 }
  );

  window.addEventListener('scroll', onScrollProgress, { passive: true });
  document.querySelectorAll('.theme-trigger').forEach((el) => sectionColourObs.observe(el));

  /* ── 3. NAV BEHAVIOUR ─────────────────────────────────────────────────── */

  const mainNav  = document.getElementById('mainNav');
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  let lastScrollY = 0;

  function onNavScroll() {
    const y = window.scrollY;
    mainNav.classList.toggle('hide', y > lastScrollY && y > 120);
    lastScrollY = y;
  }

  function onHamburgerClick() {
    const isOpen = mobileNav.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
  }

  function closeMobileNav() {
    mobileNav.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  window.addEventListener('scroll', onNavScroll, { passive: true });
  hamburger.addEventListener('click', onHamburgerClick);
  document.querySelectorAll('.mnav-link').forEach((link) =>
    link.addEventListener('click', closeMobileNav)
  );

  /* ── 4. TAGLINE CYCLE ─────────────────────────────────────────────────── */

  const CYCLE_WORDS    = ['Builder.', 'Problem Solver.', 'Thinker.', 'Maker.', 'Orchestrator.'];
  const CYCLE_INTERVAL = 2800;
  const CYCLE_FADE_MS  = 320;
  const wordEl = document.getElementById('cycleWord');
  let cycleIndex = 0;

  function advanceCycleWord() {
    wordEl.classList.add('exit');
    setTimeout(() => {
      cycleIndex = (cycleIndex + 1) % CYCLE_WORDS.length;
      wordEl.textContent = CYCLE_WORDS[cycleIndex];
      wordEl.classList.remove('exit');
    }, CYCLE_FADE_MS);
  }

  setInterval(advanceCycleWord, CYCLE_INTERVAL);

  /* ── 5. SCROLL REVEAL ─────────────────────────────────────────────────── */

  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          revealObs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -36px 0px' }
  );

  document.querySelectorAll('.reveal, .reveal-stagger').forEach((el) =>
    revealObs.observe(el)
  );

  /* ── 6. MAGNETIC CARDS ────────────────────────────────────────────────── */

  const MAGNETIC_FACTOR = 0.06;

  function onMagneticMove(card, event) {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width  / 2) * MAGNETIC_FACTOR;
    const y = (event.clientY - rect.top  - rect.height / 2) * MAGNETIC_FACTOR;
    card.style.transform = `translate(${x}px, ${y}px) translateY(-3px)`;
  }

  function onMagneticLeave(card) {
    card.style.transform = '';
  }

  document.querySelectorAll('.skill-group, .pcard').forEach((card) => {
    card.addEventListener('mousemove', (e) => onMagneticMove(card, e));
    card.addEventListener('mouseleave', () => onMagneticLeave(card));
  });

  /* ── 7. CONTACT FORM ──────────────────────────────────────────────────── */

  const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
  const WEB3FORMS_KEY      = 'fea16830-0993-4288-8c85-a2aec723394a';
  const FETCH_TIMEOUT_MS   = 10_000;

  /**
   * True once WEB3FORMS_KEY has been replaced with a real key.
   * @returns {boolean}
   */
  function isWeb3FormsConfigured() {
    return Boolean(WEB3FORMS_KEY) && WEB3FORMS_KEY !== 'YOUR_WEB3FORMS_KEY';
  }

  const formFields = {
    name:    document.getElementById('cf-name'),
    email:   document.getElementById('cf-email'),
    subject: document.getElementById('cf-subject'),
    message: document.getElementById('cf-message'),
  };
  const submitBtn   = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitLabel');
  const submitIcon  = document.getElementById('submitIcon');
  const formStatus  = document.getElementById('form-status');
  const charCount   = document.getElementById('charCount');
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** Live character counter for the message field. */
  function onMessageInput() {
    charCount.textContent = formFields.message.value.length;
  }

  /**
   * Clears all field-level validation errors.
   * @returns {void}
   */
  function clearFieldErrors() {
    document.querySelectorAll('.field-err').forEach((el) => { el.textContent = ''; });
    document.querySelectorAll('.field-input').forEach((el) => el.classList.remove('error'));
  }

  /**
   * Validates required fields and populates inline error messages.
   * @returns {boolean} true when all fields pass validation.
   */
  function validateForm() {
    let isValid = true;

    if (!formFields.name.value.trim()) {
      document.getElementById('err-name').textContent = 'Name is required';
      formFields.name.classList.add('error');
      isValid = false;
    }

    if (!EMAIL_REGEX.test(formFields.email.value)) {
      document.getElementById('err-email').textContent = 'Valid email required';
      formFields.email.classList.add('error');
      isValid = false;
    }

    if (formFields.message.value.trim().length < 10) {
      document.getElementById('err-message').textContent = 'Message too short (min 10 chars)';
      formFields.message.classList.add('error');
      isValid = false;
    }

    return isValid;
  }

  /** Puts the submit button into loading state. */
  function setSubmitLoading() {
    submitBtn.disabled    = true;
    submitLabel.textContent = 'Sending...';
    submitIcon.textContent  = '⏳';
  }

  /** Restores the submit button to its idle state. */
  function resetSubmitButton() {
    submitBtn.disabled    = false;
    submitLabel.textContent = 'Send Message';
    submitIcon.textContent  = '→';
  }

  /** Resets all form field values and char counter after successful send. */
  function resetFormFields() {
    document.getElementById('contactForm')
      .querySelectorAll('.field-input')
      .forEach((input) => { input.value = ''; });
    charCount.textContent = '0';
  }

  /** Shows a status banner above the submit button. */
  function showFormStatus(type, message) {
    formStatus.className   = `form-status ${type}`;
    formStatus.textContent = message;
  }

  /** Main form submit handler — validates, fetches with timeout, handles errors. */
  async function onFormSubmit() {
    clearFieldErrors();
    if (!validateForm()) return;

    if (!isWeb3FormsConfigured()) {
      showFormStatus(
        'fail',
        "✗ This form isn't connected yet — please email me directly at yashwanth.marella@yahoo.com"
      );
      return;
    }

    setSubmitLoading();

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(WEB3FORMS_ENDPOINT, {
        method:  'POST',
        signal:  controller.signal,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          name:       formFields.name.value,
          email:      formFields.email.value,
          subject:    formFields.subject.value || 'Portfolio Contact',
          message:    formFields.message.value,
        }),
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (data.success) {
        showFormStatus('success', "✓ Message sent — I'll get back to you within 24 hours.");
        resetFormFields();
      } else {
        throw new Error('Web3Forms returned success:false');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const isTimeout = error.name === 'AbortError';
      showFormStatus(
        'fail',
        isTimeout
          ? '✗ Request timed out. Please try again or email me directly at yashwanth.marella@yahoo.com'
          : '✗ Something went wrong. Email me directly at yashwanth.marella@yahoo.com'
      );
    } finally {
      resetSubmitButton();
    }
  }

  if (formFields.message) {
    formFields.message.addEventListener('input', onMessageInput);
  }
  submitBtn.addEventListener('click', onFormSubmit);

  /* ── 8. WEBGL SHADER BACKGROUND ──────────────────────────────────────── */

  const shaderCanvas = document.getElementById('shader-canvas');
  const gl           = shaderCanvas.getContext('webgl');

  if (gl) {
    const VERT_SRC = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const FRAG_SRC = `
      precision highp float;
      uniform float u_time;
      uniform vec2  u_res;
      uniform vec2  u_mouse;
      varying vec2  v_uv;
      vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
        vec2 i = floor(v + dot(v,C.yy));
        vec2 x0 = v - i + dot(i,C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
        vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
        m = m*m; m = m*m;
        vec3 x2 = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x2) - 0.5;
        vec3 a0 = x2 - floor(x2 + 0.5);
        m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);
        vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
        return 130.0*dot(m,g);
      }
      void main() {
        vec2 uv    = v_uv;
        vec2 mouse = u_mouse / u_res;
        float n1 = snoise(uv*1.5 + u_time*0.04 + mouse*0.25);
        float n2 = snoise(uv*3.0 - u_time*0.025);
        float n  = n1*0.7 + n2*0.3;
        vec3 c1 = vec3(0.13,0.10,0.09);
        vec3 c2 = vec3(0.08,0.07,0.07);
        vec3 c3 = vec3(1.0,0.71,0.655);
        vec3 col = mix(c2, c1, n*0.5+0.5);
        col = mix(col, c3, pow(max(0.0, 0.75 - distance(uv,mouse)), 5.0)*0.18);
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    /**
     * Compiles a single WebGL shader.
     * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
     * @param {string} src  - GLSL source string
     * @returns {WebGLShader}
     */
    function compileShader(type, src) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    }

    const shaderProg = gl.createProgram();
    gl.attachShader(shaderProg, compileShader(gl.VERTEX_SHADER,   VERT_SRC));
    gl.attachShader(shaderProg, compileShader(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(shaderProg);
    gl.useProgram(shaderProg);

    const vertBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(shaderProg, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime  = gl.getUniformLocation(shaderProg, 'u_time');
    const uRes   = gl.getUniformLocation(shaderProg, 'u_res');
    const uMouse = gl.getUniformLocation(shaderProg, 'u_mouse');

    let mouseX = 0;
    let mouseY = 0;

    function onMouseMove(event) {
      mouseX = event.clientX;
      mouseY = shaderCanvas.height - event.clientY;
    }

    document.addEventListener('mousemove', onMouseMove);

    /** Main rAF loop — resizes canvas to viewport and draws each frame. */
    function renderFrame(timestamp) {
      if (shaderCanvas.width !== innerWidth || shaderCanvas.height !== innerHeight) {
        shaderCanvas.width  = innerWidth;
        shaderCanvas.height = innerHeight;
        gl.viewport(0, 0, shaderCanvas.width, shaderCanvas.height);
      }
      gl.uniform1f(uTime,  timestamp * 0.001);
      gl.uniform2f(uRes,   shaderCanvas.width, shaderCanvas.height);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(renderFrame);
    }

    requestAnimationFrame(renderFrame);
  }

  /* ── 9. CONTACT MODAL ─────────────────────────────────────────────────── */
  /*
   * Triggers: nav pill (#navConnectBtn), hero "Get In Touch" (#heroConnectBtn),
   * and the Connect section's "Send a Message" card (#connectSectionBtn).
   * All three open the same modal; the contact form inside it (Module 7)
   * doesn't need to know it's in a modal — it just operates on field IDs.
   */

  const contactModal      = document.getElementById('contactModal');
  const modalCloseBtn     = document.getElementById('modalCloseBtn');
  const navConnectBtn     = document.getElementById('navConnectBtn');
  const mnavConnectBtn    = document.getElementById('mnavConnectBtn');
  const heroConnectBtn    = document.getElementById('heroConnectBtn');
  const connectSectionBtn = document.getElementById('connectSectionBtn');
  let modalLastFocusedEl  = null;

  /** Opens the contact modal, locks page scroll, and focuses the close button. */
  function openModal() {
    modalLastFocusedEl = document.activeElement;
    contactModal.hidden = false;
    document.body.classList.add('modal-open');
    modalCloseBtn.focus();
  }

  /** Closes the contact modal, unlocks scroll, and restores focus to the trigger. */
  function closeModal() {
    contactModal.hidden = true;
    document.body.classList.remove('modal-open');
    if (modalLastFocusedEl) modalLastFocusedEl.focus();
  }

  function onModalKeydown(event) {
    if (event.key === 'Escape' && !contactModal.hidden) closeModal();
  }

  if (navConnectBtn)     navConnectBtn.addEventListener('click', openModal);
  if (heroConnectBtn)    heroConnectBtn.addEventListener('click', openModal);
  if (connectSectionBtn) connectSectionBtn.addEventListener('click', openModal);
  if (modalCloseBtn)     modalCloseBtn.addEventListener('click', closeModal);
  if (mnavConnectBtn)    mnavConnectBtn.addEventListener('click', () => { closeMobileNav(); openModal(); });

  document.querySelectorAll('[data-modal-dismiss]').forEach((el) =>
    el.addEventListener('click', closeModal)
  );
  document.addEventListener('keydown', onModalKeydown);

  // ═══ EVENTS GRID — SHOW MORE (clutter control now that there are 8+ entries) ═══
  const EVENTS_COLLAPSE_LIMIT = 4;
  function applyEventsCollapse() {
    const grid = document.getElementById('cms-events-grid');
    const btn = document.getElementById('eventsShowMoreBtn');
    if (!grid || !btn) return;
    const cards = Array.from(grid.children);
    cards.forEach((card, i) => card.classList.remove('cert-collapsed'));
    if (cards.length <= EVENTS_COLLAPSE_LIMIT) { btn.classList.add('hidden'); return; }
    cards.forEach((card, i) => { if (i >= EVENTS_COLLAPSE_LIMIT) card.classList.add('cert-collapsed'); });
    btn.textContent = `Show all events (${cards.length}) ↓`;
    btn.classList.remove('hidden');
    btn.onclick = () => {
      cards.forEach((card) => card.classList.remove('cert-collapsed'));
      btn.classList.add('hidden');
    };
  }
  window.__applyEventsCollapse = applyEventsCollapse;
  applyEventsCollapse(); // static fallback content is already in the DOM at this point
})();
