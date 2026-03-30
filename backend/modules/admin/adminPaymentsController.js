import { prisma } from "../../prisma/client.js";
import * as paymentService from "../payment/paymentService.js";
import { parsePagination, parseDateParam } from "./adminPagination.js";
import { recordAdminAudit } from "./adminAuditService.js";

function serializePayment(p) {
  return {
    id: p.id,
    userId: p.userId,
    planId: p.planId,
    amount: p.amount,
    currency: p.currency,
    paymentMethod: p.paymentMethod,
    provider: p.provider,
    gtnNumber: p.gtnNumber,
    phone: p.phone,
    status: p.status,
    idempotencyKey: p.idempotencyKey,
    reference: p.reference,
    providerTxnId: p.providerTxnId,
    metadata: p.metadata,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listAdminPayments(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req);
    const status = String(req.query.status || "").trim();
    const provider = String(req.query.provider || "").trim().toUpperCase();
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);

    const where = {};
    if (status) where.status = status;
    if (provider) where.provider = provider;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) {
        const end = new Date(to);
        end.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [rows, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      ok: true,
      data: rows.map(serializePayment),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("listAdminPayments", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to list payments" });
  }
}

export async function getAdminPayment(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "payment id is required" });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            subscriberId: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        plan: {
          select: { id: true, name: true, price: true },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ ok: false, error: "Payment not found" });
    }

    const { user, plan, ...rest } = payment;
    res.json({
      ok: true,
      data: {
        payment: serializePayment(rest),
        user,
        plan,
      },
    });
  } catch (err) {
    console.error("getAdminPayment", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to load payment" });
  }
}

export async function getAdminPaymentTrace(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "payment id is required" });
    }
    const out = await paymentService.getPaymentTraceById(id);
    res.json({ ok: true, data: out });
  } catch (err) {
    const msg = err?.message || "Trace failed";
    if (/not found/i.test(msg)) {
      return res.status(404).json({ ok: false, error: msg });
    }
    console.error("getAdminPaymentTrace", err);
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function patchAdminPayment(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "payment id is required" });
    }

    const status = String(req.body?.status || "").trim();
    if (!status) {
      return res.status(400).json({ ok: false, error: "body.status is required" });
    }

    const before = await prisma.payment.findUnique({ where: { id } });
    if (!before) {
      return res.status(404).json({ ok: false, error: "Payment not found" });
    }

    const updated = await paymentService.adminTransitionPaymentStatus(id, status);

    await recordAdminAudit(req.admin.id, {
      action: "payment.status_transition",
      entity: "payment",
      entityId: id,
      payload: {
        from: before.status,
        to: updated.status,
        requestBody: req.body,
      },
      req,
    });

    res.json({ ok: true, data: { payment: serializePayment(updated) } });
  } catch (err) {
    const msg = err?.message || "Update failed";
    if (/invalid|transition|not found|could not transition/i.test(msg)) {
      return res.status(400).json({ ok: false, error: msg });
    }
    console.error("patchAdminPayment", err);
    res.status(500).json({ ok: false, error: msg });
  }
}
