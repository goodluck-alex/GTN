/**
 * Map E.164 prefix -> display region + currency.
 * Longest prefix wins (e.g. +1 before +12…).
 */
const PREFIXES = [
  { prefix: "+256", countryIso: "UG", countryPrefix: "+256", currencyCode: "UGX", currencySymbol: "UGX" },
  { prefix: "+254", countryIso: "KE", countryPrefix: "+254", currencyCode: "KES", currencySymbol: "KES" },
  { prefix: "+250", countryIso: "RW", countryPrefix: "+250", currencyCode: "RWF", currencySymbol: "RWF" },
  { prefix: "+255", countryIso: "TZ", countryPrefix: "+255", currencyCode: "TZS", currencySymbol: "TZS" },
  { prefix: "+233", countryIso: "GH", countryPrefix: "+233", currencyCode: "GHS", currencySymbol: "GHS" },
  { prefix: "+234", countryIso: "NG", countryPrefix: "+234", currencyCode: "NGN", currencySymbol: "NGN" },
  { prefix: "+27", countryIso: "ZA", countryPrefix: "+27", currencyCode: "ZAR", currencySymbol: "ZAR" },
  { prefix: "+44", countryIso: "GB", countryPrefix: "+44", currencyCode: "GBP", currencySymbol: "£" },
  { prefix: "+1", countryIso: "US", countryPrefix: "+1", currencyCode: "USD", currencySymbol: "$" },
];

const SORTED = [...PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);

const FALLBACK = {
  countryIso: "UG",
  countryPrefix: "+256",
  currencyCode: "UGX",
  currencySymbol: "UGX",
};

/**
 * @param {string | null | undefined} phone E.164
 * @returns {{ countryIso: string, countryPrefix: string, currencyCode: string, currencySymbol: string }}
 */
export function localeFromPhone(phone) {
  if (!phone || typeof phone !== "string") return { ...FALLBACK };
  const p = phone.trim();
  for (const row of SORTED) {
    if (p.startsWith(row.prefix)) {
      return {
        countryIso: row.countryIso,
        countryPrefix: row.countryPrefix,
        currencyCode: row.currencyCode,
        currencySymbol: row.currencySymbol,
      };
    }
  }
  return { ...FALLBACK };
}
