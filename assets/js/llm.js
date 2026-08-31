/**
 * llm.js — provider-agnostic LLM request layer for the AI Tailor feature.
 *
 * SECURITY: every function here enforces https:// on the endpoint before
 * sending anything (rejects http:// outright — this is the choke point
 * that prevents ever sending the key over an unencrypted connection). The
 * API key is only ever placed in a request HEADER, never appended to a
 * URL — headers don't get logged in browser history, proxy access logs,
 * or leaked via the Referer header the way a query string would.
 */
(function () {
  const PROVIDER_PRESETS = {
    anthropic: {
      label: 'Anthropic (Claude)',
      defaultEndpoint: 'https://api.anthropic.com',
      defaultModel: 'claude-sonnet-4-6'
    },
    openai: {
      label: 'OpenAI',
      defaultEndpoint: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini'
    },
    groq: {
      label: 'Groq (free tier, open models)',
      defaultEndpoint: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile'
    },
    openrouter: {
      label: 'OpenRouter',
      defaultEndpoint: 'https://openrouter.ai/api/v1',
      defaultModel: 'meta-llama/llama-3.3-70b-instruct:free'
    }
  };

  function assertHttps(url) {
    if (!/^https:\/\//i.test(url)) {
      throw new Error('Refusing to call a non-HTTPS endpoint. This is a hard security rule, not configurable.');
    }
  }

  async function callAnthropic(endpoint, apiKey, model, systemPrompt, userPrompt) {
    assertHttps(endpoint);
    const res = await fetch(`${endpoint}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey, // header, never a URL param
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' // Anthropic's documented opt-in for BYOK client-side apps
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error && data.error.message) || `Request failed (${res.status})`);
    const text = data && data.content && data.content[0] && data.content[0].text;
    if (!text) throw new Error('Unexpected response shape from Anthropic.');
    return text;
  }

  // Covers OpenAI, Groq, OpenRouter, and most other OpenAI-compatible providers.
  async function callOpenAICompatible(endpoint, apiKey, model, systemPrompt, userPrompt) {
    assertHttps(endpoint);
    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}` // header, never a URL param
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4
      })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error && data.error.message) || `Request failed (${res.status})`);
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Unexpected response shape from provider.');
    return text;
  }

  /**
   * config: { provider: 'anthropic'|'openai'|'groq'|'openrouter', endpoint, model }
   * apiKey is passed in explicitly by the caller (from AIVault.withKey), never read from storage here.
   */
  async function callLLM(config, apiKey, systemPrompt, userPrompt) {
    if (config.provider === 'anthropic') {
      return callAnthropic(config.endpoint, apiKey, config.model, systemPrompt, userPrompt);
    }
    // openai, groq, openrouter, and any other custom OpenAI-compatible endpoint all use this path
    return callOpenAICompatible(config.endpoint, apiKey, config.model, systemPrompt, userPrompt);
  }

  window.LLM = { PROVIDER_PRESETS, callLLM, assertHttps };
})();
