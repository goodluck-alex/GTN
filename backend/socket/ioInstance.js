/** Set from server.js after Socket.IO is created; used by HTTP handlers to push realtime events. */
let ioInstance = null;

export function setSocketIo(io) {
  ioInstance = io;
}

export function getSocketIo() {
  return ioInstance;
}
