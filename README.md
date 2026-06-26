# Yashwanth Marella — Portfolio & Resume

**Live site:** [itsyashwanth.vercel.app](https://itsyashwanth.vercel.app)  
**Resume page:** [itsyashwanth.vercel.app/resume](https://itsyashwanth.vercel.app/resume)  
**Version:** 3.2.1 · Deployed on Vercel (free / Hobby tier)

Personal portfolio and resume website for Yashwanth Marella — 3rd-year B.Tech AI & Data Science student at Parul University, Vadodara, simultaneously completing a Diploma in Neural Networks & Deep Learning. Targeting AI/ML, Data Science, Full-Stack, and Prompt Engineering internships.

---

## Stack

Pure HTML5 / CSS3 / vanilla JavaScript. No framework, no build step, no runtime dependencies.

| Layer | Choice | Reason |
|-------|--------|---------|
| Hosting | Vercel (free tier) | Static-only, zero config |
| PDF — ATS | jsPDF v2.5.1 (vendored) | Programmatic text layer, ATS-safe, no browser dialog |
| PDF — Modern | html2pdf.js v0.10.1 (vendored) | Canvas render preserving dark/light theme |
| Fonts | System stack + Google Fonts (Syne, DM Sans, JetBrains Mono) | No JS dependency |
| Icons | CSS + Unicode | No icon library |

Both PDF libraries are vendored locally at `assets/js/lib/` — same-origin, CSP-safe. No CDN calls needed.

---

## Repository Structure

```
my-resume/
├── assets/
│   ├── css/
│   │   ├── tokens.css          Design tokens — colour palette, spacing, type scale.
│   │   │                       §10 (end of :root) contains download-system tokens.
│   │   ├── resume.css          Resume page styles. PDF download components at bottom
│   │   │                       (clearly marked with v3.0.0 comment block).
│   │   └── index.css           Portfolio landing page styles.
│   ├── js/
│   │   ├── lib/                LOCAL VENDOR BUNDLES — do not delete, do not CDN
│   │   │   ├── jspdf.umd.min.js          jsPDF v2.5.1
│   │   │   └── html2pdf.bundle.min.js    html2pdf.js v0.10.1
│   │   ├── resume.js           7-module IIFE — full PDF download runtime (~680 lines)
│   │   └── index.js            Portfolio landing page runtime
│   └── certs/                  Certificate images and PDFs
│       ├── jetson-ai.jpg
│       └── vadodara-hackathon.pdf
├── index.html                  Portfolio landing page
├── resume.html                 Resume page — download modal, lib script tags
├── llms.txt                    Machine-readable resume for AI crawlers
├── robots.txt
├── sitemap.xml
├── package.json                No runtime deps — version tracking only
├── .env.example                Documents that no env vars are required (v3.1.0+)
├── .gitignore
├── vercel.json                 Static routing + security headers. No functions block.
└── README.md                   This file
```

> **No `api/` directory.** Serverless PDF generation was attempted (Sparticuz Chromium v121 + v131) and abandoned — Vercel free tier lacks the `libnss3.so` system library required by Chromium. If `api/` reappears, delete it.

---

## PDF Download System

### Overview

The resume page offers two PDF download formats, both fully client-side:

| Format | Generator | Output | Use case |
|--------|-----------|--------|----------|
| **ATS PDF** | jsPDF (M3) | Text-layer PDF, black on white | Applicant tracking systems, recruiters |
| **Modern PDF** | html2pdf.js (M4) | Canvas render, matches current theme | Portfolio, human readers |

A traffic-light status dot in the nav shows lib load state (`warming` → `ready` / `failed`). The Download button opens a two-option modal (ATS / Modern). After a Modern download, a comparison toast prompts for the other theme variant.

### Module Map (`assets/js/resume.js`)

All logic lives in a single IIFE, split into seven modules:

| ID | Name | Role |
|----|------|------|
| M1 | `LibCheck` | Checks `window.jspdf` and `html2pdf` loaded. Sets dot state. Runs in `init()`. |
| M2 | `DownloadModal` | Two-option picker dialog. Focus-trapped, fully keyboard-accessible. |
| M3 | `jsPDFFallback` | **ATS primary.** DOM text extraction → jsPDF programmatic layout → auto-download. Contacts rendered in 2 rows to prevent mid-URL line-wrap. Cert query scoped to `section[aria-label="Certifications"]` to prevent event duplication. |
| M4 | `Html2PDFFallback` | **Modern primary.** html2pdf.js canvas render of `.resume-page` → auto-download. |
| M5 | `ErrorModal` | Last-resort failure dialog. Offers `window.print()` as escape hatch. |
| M6 | `ComparisonToast` | Post-Modern-download toast. "Need Dark/Light version too?" |
| M7 | `Init` | Wires M1–M6 together on `DOMContentLoaded`. |

### Download Chains

```
ATS:    M2 modal → M3 jsPDF      → fail → M5 ErrorModal (offers window.print())
Modern: M2 modal → M4 html2pdf   → fail → M5 ErrorModal
                                → success → M6 ComparisonToast
```

### jsPDF DOM Selector Reference (M3)

These selectors are verified against `resume.html`. A mismatch produces silently empty PDF sections — always verify against the live HTML before changing.

| Selector | Maps to |
|----------|---------|
| `.resume-name` | Header name |
| `.resume-role` | Header role / subtitle |
| `.contact-item a` | Contact links (anchor text only — avoids icon characters) |
| `.contact-item` (fallback) | Plain-text contact items (emoji stripped via `/[^\x20-\x7E]/g`) |
| `.summary-text` | Summary paragraph |
| `.edu-item` | Education entry container |
| `.edu-degree` | Degree title |
| `.edu-school` | Institution name |
| `.edu-date` | Date range ← **not** `.edu-period` |
| `.edu-detail` | Optional detail line |
| `.skill-row` | Skills row container |
| `.skill-cat` | Category label ← **not** `.skill-label` |
| `.skill-vals` | Skill values string |
| `.project-item` | Project entry container |
| `.project-name` | Project title ← **not** `.project-title` |
| `.project-desc` | Description paragraph |
| `.stack-tag` | Individual tech tag spans (joined with `', '`) |
| `.project-link` | Link anchors (text only) |
| `section[aria-label="Certifications"] .cert-item` | Cert entries — **scoped** to prevent event duplication |
| `.cert-name` | Cert title |
| `.cert-issuer` | Issuing organisation |
| `section[aria-label="Events and Workshops"] .cert-item` | Event entries (same structure as certs) |

### CSS Component Reference

All download components live at the **bottom of `assets/css/resume.css`**, after the `v3.0.0` comment block. Tokens are in `tokens.css §10`.

| Selector | Purpose |
|----------|---------|
| `.dl-status-dot` | Traffic-light dot in nav. `data-state="warming / ready / failed"` |
| `.dl-modal` | Download option modal overlay |
| `.dl-modal-backdrop` | Click-to-close backdrop |
| `.dl-modal-panel` | Glass panel containing options |
| `.dl-option` | ATS / Modern option button card |
| `.dl-modal-close` | × close button |
| `.dl-comparison-toast` | Bottom-centre toast after Modern download |
| `.dl-error-modal` | Last-resort error dialog overlay |
| `.pdf-export-mode` | Applied to `<html>` during html2pdf render — strips `backdrop-filter`, forces `cert-item` column layout, adds `break-inside: avoid` to section/project/cert cards |

---

## Content Sync Rule

Any change to **skills, education, projects, or certifications** must be applied to **all three files simultaneously**. Failing to sync causes ATS to see different skills than the portfolio page.

| File | Section | HTML pattern |
|------|---------|--------------|
| `resume.html` | `.skill-row` divs inside `.skills-list` | `<span class="skill-cat">` + `<span class="skill-vals">` |
| `index.html` | `.skill-group` divs inside `.skills-grid` | `<span class="sg-name">` + `.skill-tags` with `.stag` spans |
| `llms.txt` | Skills section | `- **Category**: val1, val2, val3` |

---

## Skills Honesty Framework

Every skill on the resume was rated before being added. Do not bypass this.

| Tier | Definition | Action |
|------|-----------|--------|
| **Own** | Can explain without Googling. Built something real with it. | ✅ Add |
| **Exposed** | Used in a project; AI helped but you understand what it does. Surface question defensible. | ✅ Add |
| **AI-did-it** | Copy-pasted config. No real understanding. | ❌ Do NOT add |

**Permanently removed — do not re-add:**

| Skill | Reason |
|-------|--------|
| `dc.js` | Niche charting lib, AI-configured, indefensible in 30 seconds |
| `GANs` | Studied, not implemented — no project backing |
| `Seq2Seq` | Coursework only, no project backing |
| `Azure` | Theory-only course, no AZ-900 cert, no hands-on |

**Interview trap rule:** If adding a skill would cause you to stall on *"walk me through how you'd use X"* — don't add it.

---

## Deployment Notes

- **Platform:** Vercel (free / Hobby tier) — auto-deploys from `main` on push
- **No functions block** in `vercel.json` — static hosting only
- **CSP:** `script-src 'self' 'unsafe-eval'` — `'unsafe-eval'` is required by `html2canvas` (bundled inside `html2pdf.bundle.min.js`). Both lib files are same-origin so no CDN allowlist is needed
- **Other CSP directives remain strict:** `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`
- **No environment variables required** — see `.env.example`

---

## Key Technical Decisions

| Decision | What | Why |
|----------|------|-----|
| Dropped serverless PDF | Removed `api/` entirely | Vercel free tier lacks `libnss3.so`. Both Sparticuz Chromium v121 and v131 failed identically. Full bundle likely exceeds free-tier function size limit. |
| Local vendor bundles | `assets/js/lib/` for both PDF libs | CSP is `script-src 'self'` — CDN would be blocked. Same-origin files pass cleanly. |
| `'unsafe-eval'` in CSP | `script-src` directive only | `html2canvas` inside `html2pdf.bundle.min.js` requires `eval()` for canvas render. Acceptable risk on a static personal site with no user input. |
| 2-row contact layout (M3) | Contacts split: row 1 = email · portfolio · linkedin, row 2 = github · location | Single joined string at 9pt Helvetica hit the column width mid-URL, splitting `linkedin.com/in/itsyashwanth`. |
| Cert query scoped (M3) | `section[aria-label="Certifications"] .cert-item` | Global `.querySelectorAll('.cert-item')` also captured Events section entries, duplicating Hackathon + Jetson AI items in the Certifications section. |
| `pdf-export-mode` cert layout | `flex-direction: column` on `.cert-item` | Long cert names like *"Vadodara Hackathon 6.0 — Participant"* wrapped when `white-space: nowrap` issuer sat alongside. |
| `break-inside: avoid` (pdf-export-mode) | Applied to `.section-card`, `.project-card`, `.cert-card` | Reduces blank-page gap artifact between Projects and Certifications sections in Modern PDF. |
| `printBtn` → `downloadBtn` | ID renamed in v3 | Button no longer triggers `window.print()`. CSS class `btn-print` kept for styling continuity. |

---

## Changelog

### v3.2.1 — Project content refresh
- Updated StudentMind description to reflect all 6 LLM providers, export formats, CI/CD, and BUSL licence
- Updated NotebookLM Prompt Vault description with architecture detail, 2,700+ curriculum lines, dual-host, and bug-fix record
- Stack tags updated across `resume.html`, `index.html`, `llms.txt`

### v3.2.0 — PDF output fixes
- **ATS:** Cert section scoped to `section[aria-label="Certifications"]` — events no longer duplicated in certs
- **ATS:** Contacts rendered in 2 rows with non-ASCII stripped from fallback — no mid-URL line wrap
- **Modern:** `cert-item` column layout in `pdf-export-mode` — long cert names no longer wrap against nowrap issuer
- **Modern:** `break-inside: avoid` on section/project/cert cards — reduces blank-gap page-break artifact
- Deleted `api/` (dead serverless code) and root-level `certs/` (duplicate of `assets/certs/`)

### v3.1.0 — PDF download system
- Built two-option PDF download system (ATS via jsPDF + Modern via html2pdf.js)
- Traffic-light status dot, focus-trapped modal, comparison toast, last-resort ErrorModal
- Serverless approach (Sparticuz Chromium) attempted and abandoned — pure client-side only
- Both libs vendored at `assets/js/lib/` for CSP compatibility

### v3.0.0 — FAANG-level SDLC refactor
- CSS/JS separated into asset files with semantic design tokens
- Glassmorphic redesign: deep charcoal + terracotta/copper accent, Syne/DM Sans/JetBrains Mono
- WebGL shader background, asymmetric hero grid, status card hero element
- Contact modal with focus trap and MutationObserver auto-close
- ATS-safe print stylesheets and role-based PDF download selector
