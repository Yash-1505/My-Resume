/**
 * api/llms.js — generates llms.txt on every request, pulling live
 * projects/certifications/events from Supabase instead of a hand-maintained
 * static file that drifts out of sync (confirmed: the old static file was
 * missing 6 certs and had a stale Instagram handle + degree wording).
 *
 * Identity fields (name, email, degree wording, etc.) rarely change and
 * aren't stored in Supabase, so they stay as constants below — only the
 * fast-changing lists (projects, certifications, events) are pulled live.
 * If those identity fields change, update them here.
 */

const SUPABASE_URL = 'https://mqgsgagjforrgcggqwwr.supabase.co';
// Same public anon key already shipped client-side — safe here too, since
// RLS restricts it to SELECT-only on these tables regardless of where it's used.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xZ3NnYWdqZm9ycmdjZ2dxd3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NjUzNjMsImV4cCI6MjEwMzA0MTM2M30.5KPsE_xqeEGXL6pai1q4Pdyh0jKQhrdSLNfxHWC_4tk';

const IDENTITY = {
  fullName: 'Yashwanth Siva Sai Kumar Marella',
  shortName: 'Yashwanth Marella',
  aka: 'itsyashwanth, Yash-1505',
  location: 'Vadodara, Gujarat, India',
  email: 'yashwanth.marella@yahoo.com',
  portfolio: 'https://itsyashwanth.vercel.app',
  github: 'https://github.com/Yash-1505',
  linkedin: 'https://linkedin.com/in/itsyashwanth',
  instagram: 'https://instagram.com/yashwanth.marella'
};

const EDUCATION = [
  'B.Tech AI & Data Science — Parul University (PIET), Vadodara | Aug 2024 – Present (Semester 5, Year 3 of 4)',
  'Diploma in Neural Network & Deep Learning — Parul University | Aug 2025 – Present (Semester 2 of 2, final semester)'
];

const SKILLS = [
  '**AI / ML**: Python, TensorFlow, Keras, NumPy, Pandas, Matplotlib, Scikit-learn, Supervised ML, Unsupervised ML',
  '**Deep Learning**: CNNs, RNNs, LSTMs, BiLSTM + Attention, Transfer Learning',
  '**Full Stack**: JavaScript (ES6+), TypeScript, React 19, Next.js, HTML5, CSS3, MongoDB, Django, Flask, FastAPI, REST APIs',
  '**Data**: SQL, Data Visualization, Statistical Analysis',
  '**Generative AI**: LLMs (via APIs), Prompt Engineering, Generative AI, AI Ethics',
  '**Languages & Tools**: C, C++, Java, Git, GitHub, GitHub Actions, Vite, Tailwind CSS, Linux, Shell Scripting, Postman',
  '**CS Fundamentals**: Data Structures & Algorithms, UML Diagrams'
];

async function fetchTable(table, order) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&order=${order}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase fetch failed for ${table}: ${res.status}`);
  return res.json();
}

function renderProjects(projects) {
  return projects.map(p => {
    const stack = (p.tags || []).join(', ');
    const lines = [`### ${p.title}`];
    if (p.live_url) lines.push(`- **URL**: ${p.live_url}`);
    if (p.github_url) lines.push(`- **GitHub**: ${p.github_url}`);
    lines.push(`- **Description**: ${p.description}`);
    if (stack) lines.push(`- **Stack**: ${stack}`);
    return lines.join('\n');
  }).join('\n\n');
}

function renderCertList(items) {
  return items.map(c => `- ${c.title} — ${c.issuer_line}`).join('\n');
}

function buildLlmsTxt(projects, certifications, events) {
  return `# ${IDENTITY.shortName} — Portfolio

> Applied AI Engineer & Full Stack Developer | Parul University, Vadodara, India

${IDENTITY.fullName} (also known online as "itsyashwanth") is a 3rd year B.Tech AI & Data Science student at Parul University, Vadodara, Gujarat, India. He is simultaneously completing a Diploma in Neural Network & Deep Learning. He builds real-world AI and full-stack products with a focus on usability and impact.

## Identity

- **Full name**: ${IDENTITY.fullName}
- **Also known as**: ${IDENTITY.aka}
- **Location**: ${IDENTITY.location}
- **Email**: ${IDENTITY.email}
- **Portfolio**: ${IDENTITY.portfolio}
- **GitHub**: ${IDENTITY.github}
- **LinkedIn**: ${IDENTITY.linkedin}
- **Instagram**: ${IDENTITY.instagram}

## Education

${EDUCATION.map(e => `- ${e}`).join('\n')}

## Projects

${renderProjects(projects)}

## Skills

${SKILLS.map(s => `- ${s}`).join('\n')}

## Certifications

${renderCertList(certifications)}

## Events & Masterclasses

${renderCertList(events)}

## Availability

Open to internships and collaborations in Applied AI, ML Engineering, and Full Stack Development.

## How Yashwanth Works

1. SPOT — identifies gaps others overlook
2. DEBATE — validates the approach before writing a line
3. ORCHESTRATE — uses every available tool to build it
4. SHIP — delivers complete, not half-baked
5. MEASURE — judges output by real-world impact, not lines of code

---
Generated live from current data at request time.
`;
}

// Static fallback used only if the live Supabase fetch fails, so a
// transient outage never means a broken/empty response.
const FALLBACK_TEXT = `# ${IDENTITY.shortName} — Portfolio

> Applied AI Engineer & Full Stack Developer | Parul University, Vadodara, India

Live data temporarily unavailable. Visit ${IDENTITY.portfolio} directly for current projects and certifications.

- **Email**: ${IDENTITY.email}
- **GitHub**: ${IDENTITY.github}
- **LinkedIn**: ${IDENTITY.linkedin}
`;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300'); // 5 min edge cache — live enough, not hammering Supabase on every crawler hit

  try {
    const [projects, allCertRows] = await Promise.all([
      fetchTable('projects', 'sort_order.asc'),
      fetchTable('certifications', 'sort_order.asc')
    ]);
    const certifications = allCertRows.filter(c => c.category === 'certification');
    const events = allCertRows.filter(c => c.category === 'event');
    res.status(200).send(buildLlmsTxt(projects, certifications, events));
  } catch (err) {
    console.error('llms.txt generation failed, serving fallback:', err.message);
    res.status(200).send(FALLBACK_TEXT); // 200, not 500 — a crawler should still get something useful
  }
};
