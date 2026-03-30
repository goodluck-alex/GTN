/**
 * Public STUN endpoints (no secrets). Override via ICE_SERVERS_JSON for TURN later.
 * Example TURN: { "urls": "turn:turn.example.com:3478", "username": "u", "credential": "p" }
 */
const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function filterIceServersForP2POnly(servers) {
  if (!Array.isArray(servers)) return DEFAULT_ICE_SERVERS;
  const stunOnly = servers.filter((s) => {
    const urls = s.urls;
    const list = Array.isArray(urls) ? urls : [urls];
    return list.every((u) => typeof u === "string" && !/^turn:/i.test(u) && !/^turns:/i.test(u));
  });
  return stunOnly.length > 0 ? stunOnly : DEFAULT_ICE_SERVERS;
}

export function getIceConfig(req, res) {
  try {
    let iceServers = DEFAULT_ICE_SERVERS;
    if (process.env.ICE_SERVERS_JSON) {
      const parsed = JSON.parse(process.env.ICE_SERVERS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        iceServers = parsed;
      }
    }
    const p2pOnly = String(process.env.WEBRTC_P2P_ONLY || "true").toLowerCase() === "true";
    if (p2pOnly) {
      iceServers = filterIceServersForP2POnly(iceServers);
    }
    res.json({
      iceServers,
      iceTransportPolicy: "all",
      p2pOnly,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "ICE config error" });
  }
}
