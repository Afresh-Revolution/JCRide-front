const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const source = fs.readFileSync("app/static/js/ride-voice-call.js", "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));
const call = { call_id: "call-1", ride_id: "ride-1", caller_id: "caller", receiver_id: "receiver", status: "ringing" };
function fixture() {
  const nodes = new Map(), tracks = [], peers = [], signals = [], errors = [];
  const body = { classList: { add() {}, remove() {} } };
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, disabled: false, parentNode: body,
      classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, removeAttribute() {},
      querySelector() { return null; }, addEventListener() {}, appendChild() {}, textContent: "" });
    return nodes.get(id);
  }
  const document = { body, getElementById: node, addEventListener() {}, createElement() { return node("audio"); } };
  const navigator = { mediaDevices: { async getUserMedia() {
    const track = { stopped: false, enabled: true, stop() { this.stopped = true; } }; tracks.push(track);
    return { getTracks() { return [track]; }, getAudioTracks() { return [track]; } };
  } } };
  class Peer {
    constructor() { peers.push(this); this.signalingState = "stable"; this.connectionState = "new"; }
    addTrack() {} close() { this.closed = true; }
    async createOffer() { return { type: "offer", sdp: "offer-sdp" }; }
    async createAnswer() { return { type: "answer", sdp: "answer-sdp" }; }
    async setLocalDescription(sdp) { this.localDescription = { ...sdp, toJSON() { return sdp; } }; }
    async setRemoteDescription(sdp) { this.remoteDescription = sdp; }
    async addIceCandidate(candidate) { this.candidate = candidate; }
  }
  const window = { setInterval() { return 1; }, clearInterval() {}, setTimeout, clearTimeout, alert(message) { errors.push(message); } };
  vm.runInNewContext(source, { window, document, navigator, RTCPeerConnection: Peer, console });
  const api = window.RideVoiceCall;
  api.init({ rideId: "ride-1", rideStatus: "in_progress", userId: "caller", apiBase: "/rides", callButton: node("button"),
    apiGet: async url => url.endsWith("/communication") ? { calls_paused: false } : { calls: [] },
    apiPost: async url => url.endsWith("/start") ? { ...call } : url.endsWith("/token") ? { ice_servers: [] } : {},
    sendSignal(message) { signals.push(message); return true; }, onError(message) { errors.push(message); } });
  return { api, tracks, peers, signals, errors, nodes, navigator };
}

test("native WebRTC offer/answer works and owner pause closes peers and microphones", async () => {
  const f = fixture(); await flush(); f.api.startOutgoingCall(); await flush();
  f.api.handleEvent("call_accepted", { payload: { ...call, status: "accepted" } }); await flush();
  assert.equal(f.signals[0].type, "webrtc_offer");
  assert.equal(f.signals[0].data.type, "offer");
  assert.equal(f.signals[0].data.sdp, "offer-sdp");
  f.api.handleEvent("webrtc_answer", { call_id: "call-1", data: { type: "answer", sdp: "answer-sdp" } }); await flush();
  assert.equal(f.peers[0].remoteDescription.sdp, "answer-sdp");
  f.api.handleEvent("ice_candidate", { call_id: "call-1", data: { candidate: "candidate-string", sdpMid: "audio", sdpMLineIndex: 0 } }); await flush();
  assert.equal(f.peers[0].candidate.candidate, "candidate-string");
  f.api.handleEvent("call_system_status", { payload: { paused: true } });
  assert.ok(f.peers[0].closed); assert.ok(f.tracks.every(track => track.stopped));
  assert.equal(f.nodes.get("button").disabled, true);
  const count = f.peers.length; f.api.startOutgoingCall(); await flush(); assert.equal(f.peers.length, count);
  f.api.handleEvent("call_system_status", { payload: { paused: false } });
  assert.equal(f.nodes.get("button").disabled, false);
});

test("stale terminal events cannot end another active call", async () => {
  const f = fixture(); await flush(); f.api.startOutgoingCall(); await flush();
  f.api.handleEvent("call_ended", { payload: { ...call, call_id: "unrelated" } });
  assert.ok(!f.peers[0].closed);
  f.api.handleEvent("call_ended", { payload: { ...call, failure_reason: "system_paused" } });
  assert.ok(f.peers[0].closed); assert.ok(f.tracks.every(track => track.stopped));
});

test("pause cancels an outstanding microphone request without leaving capture running", async () => {
  const f = fixture(); await flush();
  const getMedia = f.navigator.mediaDevices.getUserMedia;
  let release; let requests = 0;
  f.navigator.mediaDevices.getUserMedia = () => {
    if (++requests === 1) return getMedia();
    return new Promise(resolve => { release = async () => resolve(await getMedia()); });
  };
  f.api.startOutgoingCall(); await flush();
  f.api.handleEvent("call_system_status", { payload: { paused: true } });
  await release(); await flush();
  assert.equal(f.peers.length, 0); assert.ok(f.tracks.every(track => track.stopped));
});
