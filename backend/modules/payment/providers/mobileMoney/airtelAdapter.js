import * as airtel from "../../airtelMoneyClient.js";

export const airtelMobileMoneyAdapter = {
  method: "mobile_money",
  provider: "AIRTEL",
  async process({ payment, plan }) {
    const country = String(payment?.metadata?.country || "").toUpperCase() || undefined;
    const currency = payment?.currency || undefined;
    const out = await airtel.initiatePayment({
      transactionId: payment.reference,
      amount: payment.amount,
      msisdn: payment.phone,
      reference: plan?.name || "GTN plan",
      country,
      currency,
    });
    return { ok: true, providerTxnId: out.transactionId || null };
  },
  async checkStatus({ payment }) {
    const txn = payment.providerTxnId || payment.reference;
    const country = String(payment?.metadata?.country || "").toUpperCase() || undefined;
    const currency = payment?.currency || undefined;
    const st = await airtel.getPaymentStatus(txn, { country, currency });
    if (st.status === "TS" || st.status === "SUCCESS" || st.status === "SUCCESSFUL") {
      return { status: "succeeded", raw: st.raw || null };
    }
    if (st.status === "TF" || st.status === "FAILED") {
      return { status: "failed", raw: st.raw || null };
    }
    return { status: "pending", raw: st.raw || null };
  },
  async confirm() {
    return { status: "pending" };
  },
};

