export const cardGatewayAdapter = {
  method: "card",
  provider: "GATEWAY",
  async process({ payment }) {
    const appBaseUrl = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
    if (!appBaseUrl) {
      throw new Error("Card gateway is not configured (missing APP_BASE_URL)");
    }

    // Hosted checkout mode: redirect user to a hosted page owned by your gateway/provider.
    // For now we return a safe placeholder URL (you'll swap this when you plug a real provider).
    const checkoutUrl = `${appBaseUrl}/checkout/card?paymentId=${encodeURIComponent(payment.id)}`;

    return {
      ok: true,
      mode: "hosted_checkout",
      checkoutUrl,
    };
  },
  async checkStatus() {
    return { status: "pending" };
  },
  async confirm() {
    throw new Error("Card confirmation is not implemented yet");
  },
};

