/**
 * tailor.js — builds the prompt for job-tailored reordering/rewriting,
 * and parses the LLM's structured JSON response defensively.
 *
 * The system prompt encodes the specific, checkable findings from the
 * portfolio-review docs this was built against — not vague "make it
 * better" instructions:
 *   - lead with role/outcome, avoid generic filler ("passionate", "journey",
 *     "delightful", "seamless", "user-centric", "leverage")
 *   - stay concrete and specific — the doc's own warning is that generic
 *     AI rewrites read as "every sentence the same length, nothing specific"
 *   - never fabricate facts, numbers, or claims not already present in the
 *     source data — only reframe emphasis and reorder
 *   - match the job description's actual vocabulary where genuinely true
 */
(function () {
  const SYSTEM_PROMPT = `You are helping a software/AI engineering student tailor their portfolio for a specific job application.

You will receive:
1. A job description or role.
2. A list of their current projects (id, title, description, tags).
3. A list of their current certifications and events (id, title, issuer_line, category).

Your job: suggest a new ORDER (most relevant to this job first) for projects and for certifications/events separately, and OPTIONALLY suggest a lightly rewritten description for each project to emphasize the angle most relevant to this job.

Hard rules — follow these exactly:
- NEVER invent, exaggerate, or add any fact, number, technology, or claim that is not already present in the original description. You may reframe emphasis and reorder which existing facts come first — you may not add new ones.
- Avoid generic filler words entirely: "passionate", "journey", "delightful", "seamless", "user-centric", "leverage", "synergy", "cutting-edge". If the original text doesn't already make a specific, concrete claim, don't invent one to fill the gap.
- Stay concrete and specific. A tell-tale sign of bad AI rewriting is every sentence being the same length with nothing specific in it — avoid that. Prefer keeping specific technical details (library names, numbers, architecture choices) over smoothing them into generic language.
- If a rewrite would not genuinely improve relevance to this job, leave rewritten_description as null and just adjust ordering.
- Where the job description uses specific terminology for a skill or role, and the person's existing work genuinely reflects that skill, it's fine to use that same terminology — but only if it's already true, never to make something sound like it matches when it doesn't.

Respond with ONLY valid JSON, no other text, in exactly this shape:
{
  "projects": [
    { "id": "...", "new_sort_order": 10, "rewritten_description": "..." or null }
  ],
  "certifications": [
    { "id": "...", "new_sort_order": 10 }
  ]
}`;

  function buildUserPrompt(jobDescription, projects, certifications) {
    const projectsSummary = projects.map(p => ({
      id: p.id, title: p.title, description: p.description, tags: p.tags || []
    }));
    const certsSummary = certifications.map(c => ({
      id: c.id, title: c.title, issuer_line: c.issuer_line, category: c.category
    }));
    return `JOB DESCRIPTION / ROLE:
${jobDescription}

CURRENT PROJECTS:
${JSON.stringify(projectsSummary, null, 2)}

CURRENT CERTIFICATIONS AND EVENTS:
${JSON.stringify(certsSummary, null, 2)}`;
  }

  /**
   * Parses the LLM's response defensively — LLMs sometimes wrap JSON in
   * markdown fences or add stray text despite instructions. Extracts the
   * first {...} block and validates the expected shape before trusting it.
   */
  function parseSuggestions(rawText, validProjectIds, validCertIds) {
    let jsonText = rawText.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();
    const braceStart = jsonText.indexOf('{');
    const braceEnd = jsonText.lastIndexOf('}');
    if (braceStart === -1 || braceEnd === -1) throw new Error('No JSON object found in the AI response.');
    jsonText = jsonText.slice(braceStart, braceEnd + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('AI response was not valid JSON: ' + e.message);
    }

    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.certifications)) {
      throw new Error('AI response is missing the expected projects/certifications arrays.');
    }

    const validProjSet = new Set(validProjectIds);
    const validCertSet = new Set(validCertIds);

    // Drop any suggestion referencing an id that doesn't actually exist —
    // never trust the model to only reference real ids.
    const projects = parsed.projects.filter(p => p && validProjSet.has(p.id) && typeof p.new_sort_order === 'number');
    const certifications = parsed.certifications.filter(c => c && validCertSet.has(c.id) && typeof c.new_sort_order === 'number');

    if (!projects.length && !certifications.length) {
      throw new Error('AI response had no usable suggestions after validation.');
    }
    return { projects, certifications };
  }

  window.Tailor = { SYSTEM_PROMPT, buildUserPrompt, parseSuggestions };
})();
