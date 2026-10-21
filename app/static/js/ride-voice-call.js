(function (global) {
  "use strict";

  var CALL_ALLOWED_STATUSES = ["accepted", "driver_arrived", "in_progress"];
  var CALL_EVENTS = [
    "incoming_call",
    "call_accepted",
    "call_failed",
    "call_system_status",
    "webrtc_offer",
    "webrtc_answer",
    "ice_candidate",
    "call_rejected",
    "call_cancelled",
    "call_ended",
  ];
  var PHASE_CLASSES = ["is-phase-idle", "is-phase-incoming", "is-phase-outgoing", "is-phase-connecting", "is-phase-active"];

  var options = null;
  var rideId = "";
  var rideStatus = "";
  var userId = "";
  var peerLabel = "";
  var peerPhone = "";
  var apiPost = null;
  var apiGet = null;
  var callButton = null;
  var domBound = false;
  var syncTimer = null;
  var audioUnlocked = false;

  var root = null;
  var avatarEl = null;
  var titleEl = null;
  var statusEl = null;
  var timerEl = null;
  var incomingActions = null;
  var outgoingActions = null;
  var activeActions = null;
  var acceptBtn = null;
  var rejectBtn = null;
  var cancelBtn = null;
  var endBtn = null;
  var muteBtn = null;
  var audioHost = null;
  var methodModal = null;
  var methodCloseBtn = null;
  var methodDismissBtn = null;
  var methodInAppBtn = null;
  var methodPhoneBtn = null;
  var methodPhoneHint = null;
  var methodLead = null;

  var room = null;
  var localStream = null;
  var peerPromise = null;
  var peerGeneration = 0;
  var pendingIce = [];
  var signalChain = Promise.resolve();
  var callsPaused = true;
  var syncPending = false;
  var activeCall = null;
  var phase = "idle";
  var muted = false;
  var timerInterval = null;
  var connectedAt = null;
  var busy = false;
  var ending = false;
  var ringtoneTimer = null;
  var ringAudioCtx = null;

  function decodeJwtSub(token) {
    if (!token || typeof token !== "string") return "";
    var parts = token.split(".");
    if (parts.length < 2) return "";
    try {
      var base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      var padded = base64 + "===".slice((base64.length + 3) % 4);
      var json = global.atob(padded);
      var payload = JSON.parse(json);
      return normalizeId(payload.sub || payload.user_id || payload.id);
    } catch (err) {
      return "";
    }
  }

  function readJsonConfig(id) {
    var el = document.getElementById(id);
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (err) {
      return {};
    }
  }

  function normalizeId(value) {
    return value == null ? "" : String(value);
  }

  function callUrl(suffix) {
    return options.apiBase + "/" + encodeURIComponent(rideId) + suffix;
  }

  function callsUrl() {
    return options.apiBase + "/" + encodeURIComponent(rideId) + "/calls";
  }

  function unwrapPayload(message) {
    if (!message || typeof message !== "object") return {};
    return message.payload || message.data || message;
  }

  function unwrapCall(payload) {
    if (!payload || typeof payload !== "object") return null;
    return payload.call || payload;
  }

  function initialsFromName(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "JC";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function updateAvatar() {
    if (avatarEl) avatarEl.textContent = initialsFromName(peerLabel);
  }

  function isReceiver(call) {
    if (!call) return false;
    if (userId) return normalizeId(call.receiver_id) === userId;
    if (options.role === "customer") return normalizeId(call.caller_id) !== userId;
    if (options.role === "driver") return normalizeId(call.caller_id) !== userId;
    if (phase === "outgoing" || phase === "connecting" || phase === "active") return false;
    return phase === "idle" || phase === "incoming";
  }

  function isCaller(call) {
    if (!call) return false;
    if (userId) return normalizeId(call.caller_id) === userId;
    return phase === "outgoing" || phase === "connecting" || phase === "active";
  }

  function canPlaceCall(status) {
    return CALL_ALLOWED_STATUSES.indexOf(status || rideStatus) >= 0;
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      ringAudioCtx = new Ctx();
      if (ringAudioCtx.state === "suspended" && ringAudioCtx.resume) {
        ringAudioCtx.resume().catch(function () {});
      }
    } catch (err) {
      /* ignore */
    }
  }

  function stopRingtone() {
    if (ringtoneTimer) {
      global.clearInterval(ringtoneTimer);
      ringtoneTimer = null;
    }
    if (navigator.vibrate) {
      try {
        navigator.vibrate(0);
      } catch (err) {
        /* ignore */
      }
    }
  }

  function playRingPulse() {
    unlockAudio();
    if (!ringAudioCtx) return;
    try {
      if (ringAudioCtx.state === "suspended" && ringAudioCtx.resume) {
        ringAudioCtx.resume().catch(function () {});
      }
      var osc = ringAudioCtx.createOscillator();
      var gain = ringAudioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 520;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ringAudioCtx.destination);
      var now = ringAudioCtx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.46);
    } catch (err) {
      /* ignore */
    }
  }

  function startRingtone() {
    stopRingtone();
    playRingPulse();
    ringtoneTimer = global.setInterval(playRingPulse, 1400);
    if (navigator.vibrate) {
      try {
        navigator.vibrate([180, 120, 180, 400]);
      } catch (err) {
        /* ignore */
      }
    }
  }

  function normalizePhone(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var cleaned = raw.replace(/[^\d+]/g, "");
    if (!cleaned) return "";
    if (cleaned.indexOf("+") > 0) {
      cleaned = cleaned.replace(/\+/g, "");
    }
    return cleaned;
  }

  function telHref(phone) {
    var cleaned = normalizePhone(phone);
    return cleaned ? "tel:" + cleaned : "";
  }

  function closeCallMethodChooser() {
    if (!methodModal) return;
    try {
      if (typeof methodModal.close === "function" && methodModal.open) {
        methodModal.close();
      } else {
        methodModal.removeAttribute("open");
        methodModal.hidden = true;
      }
    } catch (err) {
      methodModal.removeAttribute("open");
      methodModal.hidden = true;
    }
  }

  function updateCallMethodChooser() {
    var phone = normalizePhone(peerPhone);
    if (methodPhoneBtn) {
      methodPhoneBtn.disabled = !phone;
      methodPhoneBtn.setAttribute("aria-disabled", phone ? "false" : "true");
    }
    if (methodPhoneHint) {
      methodPhoneHint.textContent = phone
        ? "Opens your phone dialer · " + phone
        : "Phone number not available yet";
    }
    if (methodLead) {
      methodLead.textContent = peerLabel
        ? "Choose how you want to call " + peerLabel + "."
        : "Choose how you want to call.";
    }
  }

  function openCallMethodChooser() {
    if (!methodModal) {
      startOutgoingCall();
      return;
    }
    updateCallMethodChooser();
    try {
      if (typeof methodModal.showModal === "function") {
        if (!methodModal.open) methodModal.showModal();
      } else {
        methodModal.setAttribute("open", "open");
        methodModal.hidden = false;
      }
    } catch (err) {
      methodModal.setAttribute("open", "open");
      methodModal.hidden = false;
    }
  }

  function placePhoneCall() {
    var href = telHref(peerPhone);
    if (!href) {
      notifyError(null, "Phone number is not available for this contact.");
      return;
    }
    closeCallMethodChooser();
    global.location.href = href;
  }

  function updateCallButton() {
    if (!callButton) return;
    var allowed = canPlaceCall(rideStatus);
    var inCall = phase !== "idle";
    callButton.hidden = !allowed;
    callButton.disabled = callsPaused || !allowed || inCall || busy;
    callButton.title = callsPaused ? "In-app calling is temporarily paused or unavailable." : "Call";
    callButton.setAttribute("aria-disabled", callButton.disabled ? "true" : "false");
  }

  function formatTimer(totalSeconds) {
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return String(minutes) + ":" + String(seconds).padStart(2, "0");
  }

  function stopTimer() {
    if (timerInterval) {
      global.clearInterval(timerInterval);
      timerInterval = null;
    }
    connectedAt = null;
    if (timerEl) {
      timerEl.hidden = true;
      timerEl.textContent = "";
    }
  }

  function startTimer() {
    if (!timerEl) return;
    stopTimer();
    connectedAt = Date.now();
    timerEl.hidden = false;
    timerEl.textContent = "0:00";
    timerInterval = global.setInterval(function () {
      if (!connectedAt || !timerEl) return;
      var elapsed = Math.max(0, Math.floor((Date.now() - connectedAt) / 1000));
      timerEl.textContent = formatTimer(elapsed);
    }, 1000);
  }

  function setPhase(nextPhase) {
    phase = nextPhase;
    if (root) {
      PHASE_CLASSES.forEach(function (cls) {
        root.classList.remove(cls);
      });
      root.classList.add("is-phase-" + nextPhase);
      root.classList.toggle("ride-voice-call--incoming", nextPhase === "incoming");
    }
    if (incomingActions) incomingActions.hidden = nextPhase !== "incoming";
    if (outgoingActions) outgoingActions.hidden = nextPhase !== "outgoing" && nextPhase !== "connecting";
    if (activeActions) activeActions.hidden = nextPhase !== "active";
    updateCallButton();
  }

  function showOverlay(show) {
    if (!root) return;
    if (show) {
      root.hidden = false;
      document.body.classList.add("ride-voice-call-open");
    } else {
      root.hidden = true;
      document.body.classList.remove("ride-voice-call-open");
    }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function setTitle(text) {
    if (titleEl) titleEl.textContent = text || "";
    updateAvatar();
  }

  function resetActionButtons() {
    if (acceptBtn) acceptBtn.disabled = false;
    if (rejectBtn) rejectBtn.disabled = false;
    if (endBtn) endBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (muteBtn) {
      muteBtn.disabled = false;
      muteBtn.setAttribute("aria-pressed", "false");
      var muteLabel = muteBtn.querySelector(".ride-voice-call__action-label");
      if (muteLabel) muteLabel.textContent = "Mute";
    }
  }

  function clearAudio() {
    if (!audioHost) return;
    while (audioHost.firstChild) {
      audioHost.removeChild(audioHost.firstChild);
    }
  }

  function disconnectRoom() {
    peerGeneration++;
    peerPromise = null;
    pendingIce = [];
    if (localStream) localStream.getTracks().forEach(function (track) { track.stop(); });
    localStream = null;
    if (room) { room.onconnectionstatechange = null; room.onicecandidate = null; room.close(); }
    room = null;
    clearAudio();
  }

  function resetUi(message) {
    stopRingtone();
    stopTimer();
    disconnectRoom();
    activeCall = null;
    muted = false;
    busy = false;
    ending = false;
    resetActionButtons();
    setPhase("idle");
    showOverlay(false);
    if (message) setStatus(message);
  }

  function notifyError(err, fallback) {
    var message = (err && err.message) || fallback || "Call failed.";
    if (typeof options.onError === "function") {
      options.onError(message);
      return;
    }
    global.alert(message);
  }

  function ensureMicPermission() {
    unlockAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("Microphone is not available in this browser."));
    }
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    });
  }

  function connectPeer(config) {
    if (room) return Promise.resolve(room);
    if (peerPromise) return peerPromise;
    if (callsPaused || !activeCall) return Promise.reject(new Error("In-app calling is paused."));
    var generation = peerGeneration;
    var callId = activeCall.call_id;
    peerPromise = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(function (stream) {
        if (generation !== peerGeneration || callsPaused || !activeCall || activeCall.call_id !== callId) {
          stream.getTracks().forEach(function (track) { track.stop(); });
          throw new Error("Call ended.");
        }
        localStream = stream;
        var peer = new RTCPeerConnection({ iceServers: config.ice_servers || [] });
        room = peer;
        stream.getTracks().forEach(function (track) { peer.addTrack(track, stream); });
        peer.onicecandidate = function (event) {
          if (event.candidate && activeCall && activeCall.call_id === callId) {
            try { sendSignal("ice_candidate", event.candidate.toJSON()); }
            catch (error) { endActiveCall(); notifyError(error); }
          }
        };
        peer.ontrack = function (event) {
          clearAudio();
          var audio = document.createElement("audio");
          audio.autoplay = true; audio.playsInline = true;
          audio.srcObject = event.streams[0] || new MediaStream([event.track]);
          if (audioHost) audioHost.appendChild(audio);
          audio.play().catch(function () {});
        };
        peer.onconnectionstatechange = function () {
          if (peer !== room) return;
          if (peer.connectionState === "connected") markConnected();
          if (peer.connectionState === "failed") { endActiveCall(); notifyError(null, "Call connection failed."); }
        };
        return peer;
      }).catch(function (error) { peerPromise = null; throw error; });
    return peerPromise;
  }

  function sendSignal(type, data) {
    if (!activeCall || callsPaused || typeof options.sendSignal !== "function" ||
      !options.sendSignal({ type: type, call_id: activeCall.call_id, data: data })) {
      throw new Error("Calling connection is unavailable. Please reconnect.");
    }
  }

  function ensurePeer() {
    if (room) return Promise.resolve(room);
    if (peerPromise) return peerPromise;
    return fetchRtcConfig().then(connectPeer);
  }

  function makeOffer() {
    return ensurePeer().then(async function (peer) {
      if (peer.signalingState !== "stable") return;
      var offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal("webrtc_offer", { type: peer.localDescription.type, sdp: peer.localDescription.sdp });
    });
  }

  async function receiveSignal(type, message) {
    if (!activeCall || callsPaused || String(message.call_id) !== String(activeCall.call_id)) return;
    var callId = activeCall.call_id;
    var data = message.data || (message.payload && message.payload.data) || {};
    var peer = await ensurePeer();
    if (!activeCall || activeCall.call_id !== callId || peer !== room) return;
    if (type === "ice_candidate") {
      if (!data.candidate) return;
      var candidate = typeof data.candidate === "string" ? data : data.candidate;
      if (peer.remoteDescription) await peer.addIceCandidate(candidate);
      else pendingIce.push(candidate);
      return;
    }
    if (!data.sdp) return;
    await peer.setRemoteDescription(typeof data.sdp === "string" ? { type: type === "webrtc_offer" ? "offer" : "answer", sdp: data.sdp } : data.sdp);
    while (pendingIce.length) await peer.addIceCandidate(pendingIce.shift());
    if (type === "webrtc_offer") {
      var answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      sendSignal("webrtc_answer", { type: peer.localDescription.type, sdp: peer.localDescription.sdp });
    }
  }

  function fetchRtcConfig() {
    return apiPost(callUrl("/call/token"), {});
  }

  function fetchCallHistory() {
    if (typeof apiGet !== "function") return Promise.resolve([]);
    return apiGet(callsUrl()).then(function (data) {
      return (data && data.calls) || [];
    });
  }

  function findOpenCall(calls) {
    if (!calls || !calls.length) return null;
    for (var i = calls.length - 1; i >= 0; i -= 1) {
      var call = calls[i];
      var status = String(call.status || "").toLowerCase();
      if (status === "ringing" || status === "accepted") {
        return call;
      }
    }
    return null;
  }

  function presentIncomingCall(call) {
    activeCall = call;
    setPhase("incoming");
    setTitle(peerLabel || "Incoming call");
    setStatus("Incoming voice call");
    showOverlay(true);
    startRingtone();
  }

  function presentOutgoingCall(call, connectRoom) {
    activeCall = call;
    setPhase(connectRoom ? "connecting" : "outgoing");
    setTitle(peerLabel || "Calling…");
    setStatus(connectRoom ? "Connecting…" : "Ringing…");
    showOverlay(true);
    startRingtone();
    if (!connectRoom) return Promise.resolve();
    return fetchRtcConfig().then(function (tokenPayload) {
      return connectPeer(tokenPayload);
    });
  }

  function markConnected() {
    stopRingtone();
    setPhase("active");
    setTitle(peerLabel || "In call");
    setStatus("Connected");
    startTimer();
  }

  function handleAnswered(payload) {
    var call = unwrapCall(payload);
    if (!call || callsPaused || String(call.ride_id) !== String(rideId)) return;
    if (activeCall && String(activeCall.call_id) !== String(call.call_id)) return;
    activeCall = call;
    if (phase === "active") return;
    stopRingtone(); setPhase("connecting"); setStatus("Connecting..."); showOverlay(true);
    if (isCaller(call)) makeOffer().catch(function (error) { resetUi(); notifyError(error); });
  }

  function handleTerminalEvent(statusText) {
    resetUi(statusText);
  }

  function handleIncoming(payload) {
    var call = unwrapCall(payload);
    if (!call) return;
    if (isCaller(call)) {
      activeCall = call;
      return;
    }
    if (!isReceiver(call)) return;
    if (phase !== "idle" && phase !== "incoming") return;
    presentIncomingCall(call);
  }

  function handleRealtimeEvent(type, message) {
    if (CALL_EVENTS.indexOf(type) < 0) return false;
    var payload = unwrapPayload(message);
    if (type === "call_system_status") {
      callsPaused = !!payload.paused;
      if (callsPaused) { closeCallMethodChooser(); resetUi("In-app calling is paused."); }
      updateCallButton(); return true;
    }
    if (["webrtc_offer", "webrtc_answer", "ice_candidate"].indexOf(type) >= 0) {
      signalChain = signalChain.then(function () { return receiveSignal(type, message); })
        .catch(function (error) { resetUi(); notifyError(error, "Call connection failed."); });
      return true;
    }
    var call = unwrapCall(payload);
    if (call && call.ride_id && String(call.ride_id) !== String(rideId)) return true;
    if (type === "incoming_call") { if (!callsPaused) handleIncoming(payload); return true; }
    if (type === "call_accepted") { handleAnswered(payload); return true; }
    if (!activeCall || (call && call.call_id && String(call.call_id) !== String(activeCall.call_id))) return true;
    if (["call_rejected", "call_cancelled", "call_ended", "call_failed"].indexOf(type) >= 0) {
      handleTerminalEvent(call.failure_reason === "system_paused" ? "In-app calling is paused." : "Call ended.");
      return true;
    }
    return false;
  }

  function isConflictError(err) {
    var message = String((err && err.message) || "").toLowerCase();
    return message.indexOf("already active") >= 0 || message.indexOf("409") >= 0;
  }

  function syncActiveCallFromServer() {
    if (!rideId || typeof apiGet !== "function" || syncPending) return Promise.resolve(false);
    syncPending = true;
    return apiGet(callUrl("/communication")).then(function (state) {
      callsPaused = !!state.calls_paused;
      updateCallButton();
      if (callsPaused) { resetUi("In-app calling is paused."); return []; }
      return fetchCallHistory();
    }).then(function (calls) {
      var openCall = findOpenCall(calls);
      if (!openCall) {
        if (activeCall) resetUi("Call ended.");
        return false;
      }
      if (openCall.status === "ringing") {
        if (isReceiver(openCall) && phase === "idle") presentIncomingCall(openCall);
        if (isCaller(openCall) && phase === "idle") presentOutgoingCall(openCall, false);
      } else if (openCall.status === "accepted" && phase === "idle") {
        activeCall = openCall; setPhase("connecting"); showOverlay(true);
        if (isCaller(openCall)) return makeOffer().then(function () { return true; });
      }
      return true;
    }).catch(function () {
      callsPaused = true;
      if (activeCall) resetUi("Calling status unavailable.");
      updateCallButton(); return false;
    }).finally(function () { syncPending = false; });
  }

  function startSyncPolling() {
    if (syncTimer) return;
    syncTimer = global.setInterval(function () {
      if (!busy && !ending) syncActiveCallFromServer();
    }, 2000);
  }

  function startOutgoingCall() {
    if (callsPaused || !rideId || !canPlaceCall(rideStatus) || busy || ending || phase !== "idle") return;
    busy = true;
    updateCallButton();

    ensureMicPermission()
      .then(function () {
        setPhase("outgoing");
        setTitle(peerLabel || "Calling…");
        setStatus("Ringing…");
        showOverlay(true);
        startRingtone();
        return apiPost(callUrl("/call/start"), {});
      })
      .then(function (call) {
        activeCall = call;
        setPhase("connecting");
        setStatus("Connecting…");
        return fetchRtcConfig();
      })
      .then(function (tokenPayload) {
        return connectPeer(tokenPayload);
      })
      .then(function () {
        busy = false;
        updateCallButton();
      })
      .catch(function (err) {
        busy = false;
        if (isConflictError(err)) {
          return syncActiveCallFromServer().then(function (recovered) {
            if (!recovered) {
              resetUi();
              notifyError(err, "A call is already in progress for this ride.");
            }
          });
        }
        resetUi();
        notifyError(err, "Could not start call.");
      });
  }

  function acceptIncomingCall() {
    if (phase !== "incoming" || busy || ending) return;
    busy = true;
    stopRingtone();
    if (acceptBtn) acceptBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    ensureMicPermission()
      .then(function () {
        setPhase("connecting");
        setStatus("Connecting…");
        return apiPost(callUrl("/call/accept"), { call_id: activeCall && activeCall.call_id });
      })
      .then(function (call) {
        if (callsPaused || !activeCall) throw new Error("Call ended or calling is paused.");
        activeCall = call || activeCall;
        return fetchRtcConfig();
      })
      .then(function (tokenPayload) {
        return connectPeer(tokenPayload);
      })
      .then(function () {
        busy = false;
        updateCallButton();
      })
      .catch(function (err) {
        busy = false;
        resetUi();
        notifyError(err, "Could not accept call.");
      });
  }

  function rejectIncomingCall() {
    if (phase !== "incoming" || ending) return;
    ending = true;
    busy = true;
    stopRingtone();
    apiPost(callUrl("/call/reject"), { call_id: activeCall && activeCall.call_id })
      .catch(function () {})
      .finally(function () {
        resetUi("Call declined.");
      });
  }

  function endActiveCall() {
    if (phase === "idle" || ending) return;
    ending = true;
    busy = true;
    stopRingtone();
    disconnectRoom();
    if (endBtn) endBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    apiPost(callUrl("/call/end"), { call_id: activeCall && activeCall.call_id, cancel: !!(activeCall && activeCall.status === "ringing" && isCaller(activeCall)) })
      .catch(function () {})
      .finally(function () {
        var message = phase === "active" ? "Call ended." : "";
        resetUi(message);
      });
  }

  function toggleMute() {
    if (!localStream || phase !== "active") return;
    muted = !muted;
    localStream.getAudioTracks().forEach(function (track) { track.enabled = !muted; });
    if (muteBtn) {
      muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
      var label = muteBtn.querySelector(".ride-voice-call__action-label");
      if (label) label.textContent = muted ? "Unmute" : "Mute";
    }
  }

  function bindDom() {
    root = document.getElementById("ride-voice-call-root");
    if (!root) return false;
    if (root.parentNode !== document.body) {
      document.body.appendChild(root);
    }
    if (domBound) return true;

    avatarEl = document.getElementById("ride-voice-call-avatar");
    titleEl = document.getElementById("ride-voice-call-title");
    statusEl = document.getElementById("ride-voice-call-status");
    timerEl = document.getElementById("ride-voice-call-timer");
    incomingActions = document.getElementById("ride-voice-call-actions-incoming");
    outgoingActions = document.getElementById("ride-voice-call-actions-outgoing");
    activeActions = document.getElementById("ride-voice-call-actions-active");
    acceptBtn = document.getElementById("ride-voice-call-accept");
    rejectBtn = document.getElementById("ride-voice-call-reject");
    cancelBtn = document.getElementById("ride-voice-call-cancel");
    endBtn = document.getElementById("ride-voice-call-end");
    muteBtn = document.getElementById("ride-voice-call-mute");
    audioHost = document.getElementById("ride-voice-call-audio");

    if (acceptBtn) acceptBtn.addEventListener("click", acceptIncomingCall);
    if (rejectBtn) rejectBtn.addEventListener("click", rejectIncomingCall);
    if (cancelBtn) cancelBtn.addEventListener("click", endActiveCall);
    if (endBtn) endBtn.addEventListener("click", endActiveCall);
    if (muteBtn) muteBtn.addEventListener("click", toggleMute);

    methodModal = document.getElementById("ride-call-method-modal");
    methodCloseBtn = document.getElementById("ride-call-method-close");
    methodDismissBtn = document.getElementById("ride-call-method-dismiss");
    methodInAppBtn = document.getElementById("ride-call-method-inapp");
    methodPhoneBtn = document.getElementById("ride-call-method-phone");
    methodPhoneHint = document.getElementById("ride-call-method-phone-hint");
    methodLead = document.getElementById("ride-call-method-lead");

    if (methodCloseBtn) methodCloseBtn.addEventListener("click", closeCallMethodChooser);
    if (methodDismissBtn) methodDismissBtn.addEventListener("click", closeCallMethodChooser);
    if (methodInAppBtn) {
      methodInAppBtn.addEventListener("click", function () {
        closeCallMethodChooser();
        unlockAudio();
        startOutgoingCall();
      });
    }
    if (methodPhoneBtn) {
      methodPhoneBtn.addEventListener("click", function () {
        placePhoneCall();
      });
    }
    if (methodModal) {
      methodModal.addEventListener("cancel", function (event) {
        event.preventDefault();
        closeCallMethodChooser();
      });
      methodModal.addEventListener("click", function (event) {
        if (event.target === methodModal) closeCallMethodChooser();
      });
    }

    if (callButton) {
      callButton.addEventListener("click", function (event) {
        event.preventDefault();
        unlockAudio();
        openCallMethodChooser();
      });
    }

    document.addEventListener("click", unlockAudio, { once: true, capture: true });
    document.addEventListener("touchstart", unlockAudio, { once: true, capture: true });

    domBound = true;
    updateCallMethodChooser();
    return true;
  }

  function resolveUserId(nextOptions) {
    var resolved = normalizeId(nextOptions.userId);
    if (resolved) return resolved;
    resolved = decodeJwtSub(nextOptions.authToken);
    if (resolved) return resolved;

    var tracking = readJsonConfig("tracking-api-config");
    resolved = normalizeId(tracking.userId);
    if (resolved) return resolved;
    resolved = decodeJwtSub(tracking.token);
    if (resolved) return resolved;

    var realtime = readJsonConfig("driver-realtime-config");
    resolved = normalizeId(realtime.userId);
    if (resolved) return resolved;
    return decodeJwtSub(realtime.token);
  }

  function init(nextOptions) {
    options = nextOptions || {};
    rideId = normalizeId(options.rideId);
    rideStatus = options.rideStatus || "";
    userId = resolveUserId(options);
    peerLabel = options.peerLabel || "";
    peerPhone = options.peerPhone || "";
    apiPost = options.apiPost;
    apiGet = options.apiGet;
    callButton =
      typeof options.callButton === "string"
        ? document.querySelector(options.callButton)
        : options.callButton || null;

    if (!rideId || typeof apiPost !== "function") return false;
    if (!bindDom()) return false;

    updateAvatar();
    updateCallButton();
    updateCallMethodChooser();
    startSyncPolling();
    syncActiveCallFromServer();
    return true;
  }

  function setRideStatus(status) {
    rideStatus = status || "";
    updateCallButton();
  }

  function setRideId(nextRideId) {
    rideId = normalizeId(nextRideId);
  }

  function setUserId(nextUserId) {
    userId = normalizeId(nextUserId);
  }

  function setPeerLabel(name) {
    peerLabel = name || "";
    updateAvatar();
    updateCallMethodChooser();
    if (phase === "incoming" || phase === "outgoing" || phase === "active") {
      setTitle(peerLabel || titleEl.textContent);
    }
  }

  function setPeerPhone(phone) {
    peerPhone = phone || "";
    updateCallMethodChooser();
  }

  function getPeerLabel() {
    return peerLabel || "";
  }

  function getPeerPhone() {
    return peerPhone || "";
  }

  function destroy() {
    if (syncTimer) {
      global.clearInterval(syncTimer);
      syncTimer = null;
    }
    closeCallMethodChooser();
    resetUi();
    options = null;
    callButton = null;
  }

  global.RideVoiceCall = {
    init: init,
    destroy: destroy,
    setRideStatus: setRideStatus,
    setRideId: setRideId,
    setUserId: setUserId,
    setPeerLabel: setPeerLabel,
    setPeerPhone: setPeerPhone,
    getPeerLabel: getPeerLabel,
    getPeerPhone: getPeerPhone,
    handleEvent: handleRealtimeEvent,
    startOutgoingCall: startOutgoingCall,
    syncActiveCall: syncActiveCallFromServer,
    canPlaceCall: canPlaceCall,
    CALL_ALLOWED_STATUSES: CALL_ALLOWED_STATUSES.slice(),
  };
})(window);
