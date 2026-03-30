const COUNTRY_MAP = {
  UG: { countryIso: "UG", countryPrefix: "+256", currencyCode: "UGX" },
  KE: { countryIso: "KE", countryPrefix: "+254", currencyCode: "KES" },
  US: { countryIso: "US", countryPrefix: "+1", currencyCode: "USD" },
  GB: { countryIso: "GB", countryPrefix: "+44", currencyCode: "GBP" },
};

function normalizeCallingCode(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("+")) return s;
  // Sometimes calling_code is already numeric like "256"
  if (/^\d+$/.test(s)) return `+${s}`;
  return null;
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  // remoteAddress may look like ::ffff:127.0.0.1
  const ip = req.socket?.remoteAddress || "";
  if (ip.startsWith("::ffff:")) return ip.replace("::ffff:", "");
  return ip;
}

export async function detectLocale(req, res) {
  try {
    const ip = getClientIp(req);

    // ipapi.co does not require an API key (rate limited).
    const endpoint = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
    const r = await fetch(endpoint, {
      headers: { "User-Agent": "GTN-backend" },
    });

    if (!r.ok) {
      return res.json(COUNTRY_MAP.UG);
    }

    const data = await r.json();
    const countryCode = String(data.country_code || data.countryCode || "").toUpperCase();
    const callingCode = normalizeCallingCode(data.calling_code || data.callingCode);

    const mapped = COUNTRY_MAP[countryCode];
    const currencyCodeFromIpapi =
      data.currency || data.currency_code || data.currencyCode || null;

    const countryIso = mapped?.countryIso || (countryCode || "UG");
    const countryPrefix = callingCode || mapped?.countryPrefix || COUNTRY_MAP.UG.countryPrefix;
    const currencyCandidate = currencyCodeFromIpapi ? String(currencyCodeFromIpapi).toUpperCase().trim() : "";
    const currencyLooksLikeCode = /^[A-Z]{3}$/.test(currencyCandidate);
    const currencyCode =
      mapped?.currencyCode || (currencyLooksLikeCode ? currencyCandidate : COUNTRY_MAP.UG.currencyCode);

    return res.json({ countryIso, countryPrefix, currencyCode });
  } catch (err) {
    return res.json(COUNTRY_MAP.UG);
  }
}

