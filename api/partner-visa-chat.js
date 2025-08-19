// /api/partner-visa-chat.js  (safe testing edition)
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { question = "", topic = "partner_visa_nz", disclaimer = true } = req.body || {};
    const q = String(question).trim();
    if (!q) return res.status(400).json({ error: "Missing question" });

    // Light PII redaction (testing safety)
    const redacted = q
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
      .replace(/(\+?\d[\d\s\-()]{7,}\d)/g, "[redacted phone]")
      .replace(/\b([A-Z]{2}\d{6,9}|\d{8,10})\b/g, "[redacted id]");

    // Scope guard: NZ partner visas only
    const inScope = [
      /partner/i, /partnership/i, /spouse/i, /de facto/i, /living together/i,
      /work visa/i, /residence/i, /relationship evidence/i, /genuine.*stable/i,
      /medical|police certificate/i, /timeline|processing/i, /INZ|immigration nz/i
    ].some(re => re.test(redacted));

    const refusal =
      "I can help with general information about **New Zealand Partner (Work/Residence) visas** only. " +
      "For other visa categories or personal legal advice, please book a consultation.";

    const systemPrompt =
      "You are VisaPlex AI. Scope: ONLY New Zealand Partner visas (Partnership Work & Partner of a New Zealander Residence). " +
      "If the question is out of scope, use the refusal message. " +
      "When in scope, answer in plain language with concise bullet points. " +
      "Avoid legal advice; provide general guidance and note that details vary by case. " +
      "Prefer INZ terminology (genuine and stable, living together, health, character, police certificates, medicals). " +
      "If the user shares personal identifiers, acknowledge but do not repeat them. Keep answers under ~120 words.";

    const messages = [
      { role: "system", content: systemPrompt },
      ...(inScope ? [] : [{ role: "system", content: "If out of scope, reply ONLY with the refusal." }]),
      { role: "user", content:
        `Topic: ${topic}\nUser question (lightly redacted): ${redacted}\n` +
        (inScope ? "This appears IN SCOPE." : "This appears OUT OF SCOPE.") +
        "\nRespond accordingly." },
      ...(inScope ? [] : [{ role: "user", content: "Refusal to use: " + refusal }])
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 220,
        messages
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: "Upstream error", detail: text?.slice(0, 300) });
    }

    const j = await r.json();
    let text = j?.choices?.[0]?.message?.content?.trim() || (inScope ? "No answer." : refusal);
    if (disclaimer) text += "\n\n_(General information only — not legal advice.)_";
    return res.status(200).json({ answer: text, scope: inScope ? "in" : "out" });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
}
