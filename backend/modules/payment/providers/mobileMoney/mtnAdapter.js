import * as mtn from "../../mtnMomoCollectionsClient.js";

export const mtnMobileMoneyAdapter = {
  method: "mobile_money",
  provider: "MTN",
  async process({ payment, plan }) {
    await mtn.requestToPay({
      referenceId: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
      payerMsisdn: payment.phone,
      payerMessage: "GTN plan purchase",
      payeeNote: plan?.name || "GTN plan",
      externalId: String(payment.id),
    });
    return { ok: true };
  },
  async checkStatus({ payment }) {
    const st = await mtn.getRequestToPayStatus(payment.reference);
    if (st.status === "SUCCESSFUL") return { status: "succeeded", raw: st.raw || null };
    if (st.status === "FAILED") return { status: "failed", raw: st.raw || null };
    return { status: "pending", raw: st.raw || null };
  },
  async confirm() {
    return { status: "pending" };
  },
};

