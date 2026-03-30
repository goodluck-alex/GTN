import { prisma } from "../../prisma/client.js";

const ALLOWED_METHODS = new Set(["mobile_money", "crypto", "card"]);

function normMethod(input) {
  const m = String(input || "").trim().toLowerCase();
  if (!m) throw new Error("paymentMethod is required");
  if (!ALLOWED_METHODS.has(m)) throw new Error(`paymentMethod must be one of: ${[...ALLOWED_METHODS].join(", ")}`);
  return m;
}

function normProvider(input) {
  const p = String(input || "").trim().toUpperCase();
  if (!p) throw new Error("provider is required");
  return p;
}

function normCountry(input) {
  const c = String(input || "").trim().toUpperCase();
  if (!c) throw new Error("country is required");
  return c;
}

function normCurrency(input) {
  const c = String(input || "").trim().toUpperCase();
  if (!c) throw new Error("currency is required");
  return c;
}

function serializeCapability(r) {
  return {
    id: r.id,
    paymentMethod: r.paymentMethod,
    provider: r.provider,
    country: r.country,
    currency: r.currency,
    active: r.active,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listPaymentCapabilities(req, res) {
  try {
    const rows = await prisma.paymentProviderCapability.findMany({
      orderBy: [{ paymentMethod: "asc" }, { provider: "asc" }, { country: "asc" }, { currency: "asc" }],
    });
    res.json({
      ok: true,
      data: rows.map(serializeCapability),
    });
  } catch (err) {
    console.error("listPaymentCapabilities", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to list capabilities" });
  }
}

export async function patchPaymentCapability(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "id is required" });
    }

    const body = req.body || {};
    const data = {};
    if (typeof body.active === "boolean") data.active = body.active;
    if (body.metadata !== undefined) {
      if (body.metadata === null) data.metadata = null;
      else if (typeof body.metadata === "object") data.metadata = body.metadata;
      else {
        return res.status(400).json({ ok: false, error: "metadata must be an object or null" });
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, error: "Provide active and/or metadata to update" });
    }

    const row = await prisma.paymentProviderCapability.update({
      where: { id },
      data,
    });
    res.json({ ok: true, data: serializeCapability(row) });
  } catch (err) {
    if (err?.code === "P2025") {
      return res.status(404).json({ ok: false, error: "Capability not found" });
    }
    console.error("patchPaymentCapability", err);
    res.status(500).json({ ok: false, error: err?.message || "Update failed" });
  }
}

export async function createPaymentCapability(req, res) {
  try {
    const body = req.body || {};
    const paymentMethod = normMethod(body.paymentMethod);
    const provider = normProvider(body.provider);
    const country = normCountry(body.country);
    const currency = normCurrency(body.currency);
    const active = typeof body.active === "boolean" ? body.active : true;
    let metadata = undefined;
    if (body.metadata !== undefined) {
      if (body.metadata === null) metadata = null;
      else if (typeof body.metadata === "object") metadata = body.metadata;
      else {
        return res.status(400).json({ ok: false, error: "metadata must be an object or null" });
      }
    }

    const row = await prisma.paymentProviderCapability.create({
      data: {
        paymentMethod,
        provider,
        country,
        currency,
        active,
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
    res.status(201).json({ ok: true, data: serializeCapability(row) });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({
        ok: false,
        error: "A row already exists for this paymentMethod, provider, country, and currency",
      });
    }
    console.error("createPaymentCapability", err);
    const msg = err?.message || "Create failed";
    const status = /required|must be/i.test(msg) ? 400 : 500;
    res.status(status).json({ ok: false, error: msg });
  }
}
