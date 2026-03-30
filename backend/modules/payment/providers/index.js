import { mtnMobileMoneyAdapter } from "./mobileMoney/mtnAdapter.js";
import { airtelMobileMoneyAdapter } from "./mobileMoney/airtelAdapter.js";
import { usdtTrc20Adapter } from "./crypto/usdtTrc20Adapter.js";
import { cardGatewayAdapter } from "./card/gatewayAdapter.js";

const adapters = [
  mtnMobileMoneyAdapter,
  airtelMobileMoneyAdapter,
  usdtTrc20Adapter,
  cardGatewayAdapter,
];

function key(method, provider) {
  return `${String(method || "").toLowerCase()}::${String(provider || "").toUpperCase()}`;
}

const byKey = new Map(adapters.map((a) => [key(a.method, a.provider), a]));

export function getPaymentAdapter(method, provider) {
  return byKey.get(key(method, provider)) || null;
}

