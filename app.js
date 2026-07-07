(function () {
  const els = {
    loadingState: document.getElementById("loadingState"),
    emptyState: document.getElementById("emptyState"),
    errorState: document.getElementById("errorState"),
    studyContent: document.getElementById("studyContent"),
    score: document.getElementById("score"),
    starCount: document.getElementById("starCount"),
    card: document.getElementById("card"),
    cardImage: document.getElementById("cardImage"),
    cardImageBack: document.getElementById("cardImageBack"),
    imagePlaceholder: document.getElementById("imagePlaceholder"),
    imagePlaceholderBack: document.getElementById("imagePlaceholderBack"),
    hanzi: document.getElementById("hanzi"),
    hanziBack: document.getElementById("hanziBack"),
    pinyin: document.getElementById("pinyin"),
    english: document.getElementById("english"),
    speakFront: document.getElementById("speakFront"),
    speakBack: document.getElementById("speakBack"),
    next: document.getElementById("next"),
    ttsWarning: document.getElementById("ttsWarning"),
    gotIt: document.getElementById("gotIt"),
    mic: document.getElementById("mic"),
    micStatus: document.getElementById("micStatus"),
    rewardOverlay: document.getElementById("rewardOverlay"),
    rewardLoading: document.getElementById("rewardLoading"),
    rewardGif: document.getElementById("rewardGif"),
    rewardNext: document.getElementById("rewardNext"),
    masteryFront: document.getElementById("masteryFront"),
    masteryBack: document.getElementById("masteryBack"),
    profilePicker: document.getElementById("profilePicker"),
    profilePickerTitle: document.getElementById("profilePickerTitle"),
    profileList: document.getElementById("profileList"),
    newProfileBtn: document.getElementById("newProfileBtn"),
    newProfileForm: document.getElementById("newProfileForm"),
    newProfileName: document.getElementById("newProfileName"),
    newProfileEmoji: document.getElementById("newProfileEmoji"),
    createProfileBtn: document.getElementById("createProfileBtn"),
    cancelProfileBtn: document.getElementById("cancelProfileBtn"),
    profileChip: document.getElementById("profileChip"),
    profileChipEmoji: document.getElementById("profileChipEmoji"),
    profileChipName: document.getElementById("profileChipName"),
    statsOverlay: document.getElementById("statsOverlay"),
    statsAvatar: document.getElementById("statsAvatar"),
    statsName: document.getElementById("statsName"),
    statsSince: document.getElementById("statsSince"),
    statsSessions: document.getElementById("statsSessions"),
    statsTotalShown: document.getElementById("statsTotalShown"),
    statsAccuracy: document.getElementById("statsAccuracy"),
    statsMastered: document.getElementById("statsMastered"),
    statsMasteryBars: document.getElementById("statsMasteryBars"),
    statsHardest: document.getElementById("statsHardest"),
    statsSessionsList: document.getElementById("statsSessionsList"),
    statsCloseBtn: document.getElementById("statsCloseBtn"),
    statsSwitchBtn: document.getElementById("statsSwitchBtn"),
    statsPuzzleBtn: document.getElementById("statsPuzzleBtn"),
    puzzleOverlay: document.getElementById("puzzleOverlay"),
    puzzleSubtitle: document.getElementById("puzzleSubtitle"),
    puzzleEmpty: document.getElementById("puzzleEmpty"),
    puzzleEmptyCount: document.getElementById("puzzleEmptyCount"),
    puzzleBody: document.getElementById("puzzleBody"),
    puzzleGrid: document.getElementById("puzzleGrid"),
    puzzleClueArrow: document.getElementById("puzzleClueArrow"),
    puzzleClueText: document.getElementById("puzzleClueText"),
    puzzleTiles: document.getElementById("puzzleTiles"),
    puzzleAcrossList: document.getElementById("puzzleAcrossList"),
    puzzleDownList: document.getElementById("puzzleDownList"),
    puzzleCloseBtn: document.getElementById("puzzleCloseBtn"),
    puzzleNewBtn: document.getElementById("puzzleNewBtn"),
    puzzleCheckBtn: document.getElementById("puzzleCheckBtn"),
    puzzleWin: document.getElementById("puzzleWin"),
    puzzleWinStars: document.getElementById("puzzleWinStars"),
    quizBlock: document.getElementById("quizBlock"),
    quizSound: document.getElementById("quizSound"),
    quizAnswers: document.getElementById("quizAnswers"),
  };

  let deck = [];
  let index = 0;
  let chineseVoice = null;
  // Session-local star count (resets on reload).
  let stars = 0;

  // --- Smart picker state ---
  const SESSION_SIZE = 20;
  const PICKER_TARGETS = { knowIt: 10, learning: 4, review: 4, new: 2 };
  let progressMap = {}; // hanzi -> { seen, correct, wrong, flips, last_seen_at, last_correct_at }
  let smartQueue = []; // deck indexes
  let flippedThisCard = false;
  let gotItThisCard = false;

  // --- Quiz (multiple-choice) mode state ---
  let cardMode = "flash"; // "flash" | "quiz", re-rolled on every render
  let quizSolved = false;
  let quizMissRecorded = false;

  // --- Multi-user profile + session state ---
  const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
  let currentProfile = null;
  let currentSessionId = null;
  let sessionCounters = { shown: 0, correct: 0, wrong: 0, flipped: 0 };
  let lastInteractionAt = Date.now();
  let sessionFlushTimer = null;

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // --- Load deck from data/cards.json ---
  async function loadDeck() {
    try {
      const res = await fetch("data/cards.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("cards.json is not an array");
      deck = data;
    } catch (e) {
      hide(els.loadingState);
      show(els.errorState);
      console.error(e);
      return;
    }
    hide(els.loadingState);
    if (!deck.length) {
      show(els.emptyState);
      return;
    }
    // Don't show study content yet — the startup flow gates this on
    // profile selection. Just initialize the deck state.
    index = 0;
    smartQueue = [];
  }

  function setPlaceholder(text) {
    for (const ph of [els.imagePlaceholder, els.imagePlaceholderBack]) {
      ph.textContent = text;
      ph.classList.remove("hidden");
    }
    for (const img of [els.cardImage, els.cardImageBack]) {
      img.classList.remove("loaded");
      img.removeAttribute("src");
    }
  }

  // Cache of wikiTitle -> image URL (or null if not found).
  const wikiImageCache = new Map();

  async function resolveWikiImage(title) {
    if (wikiImageCache.has(title)) return wikiImageCache.get(title);
    const url =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(title);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const src =
        (data.originalimage && data.originalimage.source) ||
        (data.thumbnail && data.thumbnail.source) ||
        null;
      wikiImageCache.set(title, src);
      return src;
    } catch (e) {
      wikiImageCache.set(title, null);
      return null;
    }
  }

  async function loadCardImage(card) {
    const myIndex = index;
    setPlaceholder("Loading picture…");

    let src = card.image || null;
    if (!src) {
      const pool = [];
      if (card.images && card.images.length) {
        for (const url of card.images) pool.push({ kind: "url", value: url });
      }
      if (card.wikiTitles && card.wikiTitles.length) {
        for (const title of card.wikiTitles) {
          if (card.localImages && card.localImages[title]) {
            pool.push({ kind: "url", value: card.localImages[title] });
          } else {
            pool.push({ kind: "fetch", value: title });
          }
        }
      } else if (card.wikiTitle) {
        if (card.localImages && card.localImages[card.wikiTitle]) {
          pool.push({ kind: "url", value: card.localImages[card.wikiTitle] });
        } else {
          pool.push({ kind: "fetch", value: card.wikiTitle });
        }
      }
      if (pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick.kind === "url") {
          src = pick.value;
        } else {
          src = await resolveWikiImage(pick.value);
          if (myIndex !== index) return;
        }
      }
    }
    if (!src) {
      setPlaceholder("No picture");
      return;
    }
    const alt = card.english || "";
    els.cardImage.alt = alt;
    els.cardImageBack.alt = alt;
    els.cardImage.onload = () => {
      if (myIndex !== index) return;
      els.cardImage.classList.add("loaded");
      els.imagePlaceholder.classList.add("hidden");
    };
    els.cardImage.onerror = () => {
      if (myIndex !== index) return;
      els.imagePlaceholder.textContent = "(failed to load)";
    };
    els.cardImageBack.onload = () => {
      if (myIndex !== index) return;
      els.cardImageBack.classList.add("loaded");
      els.imagePlaceholderBack.classList.add("hidden");
    };
    els.cardImageBack.onerror = () => {
      if (myIndex !== index) return;
      els.imagePlaceholderBack.textContent = "(failed to load)";
    };
    els.cardImage.src = src;
    els.cardImageBack.src = src;
  }

  function render() {
    if (!deck.length) return;
    const card = deck[index];
    els.hanzi.textContent = card.hanzi || "";
    els.hanziBack.textContent = card.hanzi || "";
    els.pinyin.textContent = card.pinyin || "";
    els.english.textContent = card.english || "";
    els.card.classList.remove("flipped");
    renderMastery(masteryLevel(progressMap[card.hanzi]));
    loadCardImage(card);
    triggerBounce();
    flippedThisCard = false;
    gotItThisCard = false;
    quizSolved = false;
    quizMissRecorded = false;
    // 50/50 flashcard vs multiple-choice quiz (quiz needs 4+ cards).
    cardMode = deck.length >= 4 && Math.random() < 0.5 ? "quiz" : "flash";
    els.card.classList.toggle("quiz-mode", cardMode === "quiz");
    els.quizBlock.classList.toggle("hidden", cardMode !== "quiz");
    els.gotIt.classList.toggle("hidden", cardMode === "quiz");
    els.mic.classList.toggle("hidden", cardMode === "quiz");
    if (cardMode === "quiz") buildQuizAnswers(card);
    if (currentSessionId) {
      sessionCounters.shown += 1;
      scheduleSessionFlush();
    }
    bumpInteraction();
  }

  function flip() {
    if (cardMode === "quiz") return; // quiz cards don't flip
    els.card.classList.toggle("flipped");
    playFlipSound();
    spawnConfetti(els.card);
    flippedThisCard = true;
  }

  // --- Multiple-choice quiz mode ---

  function buildQuizAnswers(card) {
    // 3 unique distractor hanzi from other cards.
    const others = deck.filter((c) => c.hanzi && c.hanzi !== card.hanzi);
    const seen = new Set([card.hanzi]);
    const distractors = [];
    while (distractors.length < 3 && others.length) {
      const pick = others[Math.floor(Math.random() * others.length)];
      if (!seen.has(pick.hanzi)) {
        seen.add(pick.hanzi);
        distractors.push(pick.hanzi);
      }
      if (seen.size >= others.length + 1) break;
    }
    const options = [card.hanzi, ...distractors];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    els.quizAnswers.innerHTML = "";
    for (const hanzi of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-answer";
      btn.textContent = hanzi;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onQuizPick(btn, hanzi, card);
      });
      els.quizAnswers.appendChild(btn);
    }
  }

  function onQuizPick(btn, hanzi, card) {
    if (quizSolved) return;
    bumpInteraction();
    if (hanzi === card.hanzi) {
      quizSolved = true;
      gotItThisCard = true;
      btn.classList.add("correct");
      for (const b of els.quizAnswers.children) b.disabled = true;
      if (!quizMissRecorded) {
        // First-try correct → the full "I got it" flow (records correct,
        // star, GIF reward; dismissing advances via smart picker).
        setTimeout(showReward, 350);
      } else {
        // Solved after a mistake — celebrate lightly, no star, auto-advance.
        playGotItSound();
        spawnConfetti(btn);
        setTimeout(nextSmartCard, 900);
      }
    } else {
      btn.classList.add("wrong-pick");
      btn.disabled = true;
      if (!quizMissRecorded) {
        quizMissRecorded = true;
        if (card.hanzi) recordWrong(card.hanzi);
      }
    }
  }

  function spawnConfetti(centerEl) {
    const rect = centerEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const emojis = ["⭐", "✨", "🌟", "🎉", "💫", "🎈"];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "confetti";
      p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const dist = 100 + Math.random() * 80;
      p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1100);
    }
  }

  function triggerBounce() {
    els.card.classList.remove("bounce-in");
    void els.card.offsetWidth;
    els.card.classList.add("bounce-in");
  }

  function pickChineseVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    return (
      voices.find((v) => /^zh[-_]CN/i.test(v.lang)) ||
      voices.find((v) => /^zh/i.test(v.lang)) ||
      null
    );
  }

  function refreshVoice() {
    chineseVoice = pickChineseVoice();
    els.ttsWarning.hidden = !!(chineseVoice || !("speechSynthesis" in window));
    if (!("speechSynthesis" in window)) els.ttsWarning.hidden = false;
  }

  if ("speechSynthesis" in window) {
    refreshVoice();
    speechSynthesis.onvoiceschanged = refreshVoice;
  } else {
    els.ttsWarning.hidden = false;
  }

  function speak(text, btn) {
    if (!text || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = 0.85;
    utter.pitch = 1;
    if (chineseVoice) utter.voice = chineseVoice;
    if (btn) {
      btn.classList.add("speaking");
      utter.onend = utter.onerror = () => btn.classList.remove("speaking");
    }
    speechSynthesis.speak(utter);
  }

  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  // Pre-unlock the AudioContext on the very first user interaction so
  // iOS Safari is already running by the time we play any sound.
  function unlockAudio() {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }
  document.addEventListener("touchstart", unlockAudio, { once: true, passive: true });
  document.addEventListener("click", unlockAudio, { once: true });

  function playTone({ type, freqStart, freqEnd, duration, volume, when }) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const start = ctx.currentTime + (when || 0);
    const end = start + duration;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, start);
    if (freqEnd && freqEnd !== freqStart) {
      // Linear ramps survive iOS Safari's quirks better than exponential.
      osc.frequency.linearRampToValueAtTime(freqEnd, end);
    }
    const attack = Math.min(0.015, duration * 0.2);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.03);
  }

  function playFlipSound() {
    try {
      // Sharp click — short square wave with quick frequency drop.
      playTone({ type: "square", freqStart: 600, freqEnd: 200, duration: 0.09, volume: 0.18 });
    } catch (_) {}
  }
  function playGotItSound() {
    try {
      // Bell-like chime — stacked sines (A5 fundamental + E6 5th).
      playTone({ type: "sine", freqStart: 880, duration: 0.42, volume: 0.22 });
      playTone({ type: "sine", freqStart: 1320, duration: 0.42, volume: 0.12 });
    } catch (_) {}
  }
  function playShuffleSound() {
    try {
      // Ascending sparkle — three quick triangle notes (E5, A5, D6).
      const notes = [659.25, 880, 1174.66];
      notes.forEach((f, i) =>
        playTone({ type: "triangle", freqStart: f, duration: 0.1, volume: 0.16, when: i * 0.06 })
      );
    } catch (_) {}
  }

  // --- Supabase progress sync (cross-device per-card mastery) ---
  const sb =
    window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY
      ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY)
      : null;

  function localProgress(cardKey) {
    return progressMap[cardKey] || {};
  }

  function patchLocal(cardKey, patch) {
    progressMap[cardKey] = { ...(progressMap[cardKey] || {}), card_key: cardKey, ...patch };
  }

  function progressRowWithProfile(row) {
    if (!currentProfile) return row;
    return { ...row, profile_id: currentProfile.id };
  }

  async function recordCorrect(cardKey) {
    if (!cardKey || !currentProfile) return;
    const now = new Date().toISOString();
    const cur = localProgress(cardKey);
    const next = {
      card_key: cardKey,
      seen: (cur.seen || 0) + 1,
      correct: (cur.correct || 0) + 1,
      wrong: cur.wrong || 0,
      flips: cur.flips || 0,
      last_seen_at: now,
      last_correct_at: now,
    };
    patchLocal(cardKey, next);
    sessionCounters.correct += 1;
    scheduleSessionFlush();
    if (!sb) return;
    try { await sb.from("progress").upsert(progressRowWithProfile(next)); }
    catch (e) { console.warn("progress correct write failed:", e); }
  }

  async function recordWrong(cardKey) {
    if (!cardKey || !currentProfile) return;
    const now = new Date().toISOString();
    const cur = localProgress(cardKey);
    const next = {
      card_key: cardKey,
      seen: (cur.seen || 0) + 1,
      correct: cur.correct || 0,
      wrong: (cur.wrong || 0) + 1,
      flips: cur.flips || 0,
      last_seen_at: now,
      last_correct_at: cur.last_correct_at || null,
    };
    patchLocal(cardKey, next);
    sessionCounters.wrong += 1;
    scheduleSessionFlush();
    if (!sb) return;
    try { await sb.from("progress").upsert(progressRowWithProfile(next)); }
    catch (e) { console.warn("progress wrong write failed:", e); }
  }

  async function recordFlip(cardKey) {
    if (!cardKey || !currentProfile) return;
    const cur = localProgress(cardKey);
    const next = {
      card_key: cardKey,
      seen: cur.seen || 0,
      correct: cur.correct || 0,
      wrong: cur.wrong || 0,
      flips: (cur.flips || 0) + 1,
      last_seen_at: cur.last_seen_at || new Date().toISOString(),
      last_correct_at: cur.last_correct_at || null,
    };
    patchLocal(cardKey, next);
    sessionCounters.flipped += 1;
    scheduleSessionFlush();
    if (!sb) return;
    try { await sb.from("progress").upsert(progressRowWithProfile(next)); }
    catch (e) { console.warn("progress flip write failed:", e); }
  }

  // Called when the user leaves a card. If they didn't confirm with
  // "I got it!" or a successful mic check, count it as a flip (a miss).
  // Quiz cards that already recorded a wrong pick don't get double-counted.
  function maybeRecordMiss() {
    if (gotItThisCard || quizMissRecorded) return;
    const card = deck[index];
    if (card && card.hanzi) recordFlip(card.hanzi);
  }

  async function refreshProgress() {
    progressMap = {};
    if (!sb || !currentProfile) return;
    try {
      const { data } = await sb
        .from("progress")
        .select("card_key, seen, correct, wrong, flips, last_seen_at, last_correct_at")
        .eq("profile_id", currentProfile.id);
      if (data) for (const r of data) progressMap[r.card_key] = r;
    } catch (e) {
      console.warn("progress fetch failed:", e);
    }
  }

  function hoursSince(t) {
    if (!t) return 1e9;
    return (Date.now() - new Date(t).getTime()) / 3600000;
  }

  function masteryLevel(p) {
    if (!p || (p.seen || 0) === 0) return 0;
    const correct = p.correct || 0;
    const seen = p.seen || 0;
    const wrong = p.wrong || 0;
    const flips = p.flips || 0;
    const accuracy = seen > 0 ? correct / seen : 0;
    if (correct >= 5 && accuracy >= 0.9 && (wrong + flips) <= 1) return 5;
    if (correct >= 4 && accuracy >= 0.8) return 4;
    if (correct >= 2 && accuracy >= 0.6) return 3;
    if (correct >= 1) return 2;
    return 1;
  }

  function renderMastery(level) {
    let html = "";
    for (let i = 0; i < 5; i++) {
      const filled = i < level;
      html +=
        '<span class="star' +
        (filled ? " filled" : "") +
        '">' +
        (filled ? "★" : "☆") +
        "</span>";
    }
    if (els.masteryFront) els.masteryFront.innerHTML = html;
    if (els.masteryBack) els.masteryBack.innerHTML = html;
  }

  function classifyCard(p) {
    if (!p || (p.seen || 0) === 0) return "new";
    const seen = p.seen || 0;
    const correct = p.correct || 0;
    const wrong = p.wrong || 0;
    const flips = p.flips || 0;
    const accuracy = correct / Math.max(seen, 1);
    if ((wrong + flips) >= 1 && accuracy < 0.7) return "review";
    if (accuracy < 0.5) return "review";
    if (accuracy >= 0.8 && seen >= 3) return "knowIt";
    return "learning";
  }

  function buildSmartQueue() {
    const buckets = { knowIt: [], learning: [], review: [], new: [] };
    for (let i = 0; i < deck.length; i++) {
      const card = deck[i];
      const p = progressMap[card.hanzi];
      const bucket = classifyCard(p);
      let score = 0;
      if (bucket === "review") {
        score = ((p && p.wrong) || 0) * 3 + ((p && p.flips) || 0) * 2 + hoursSince(p && p.last_seen_at) * 0.05;
      } else if (bucket === "new") {
        score = Math.random();
      } else {
        score = hoursSince(p && p.last_seen_at);
      }
      buckets[bucket].push({ i, score });
    }
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => b.score - a.score);
    }
    const queue = [];
    const used = new Set();
    for (const key of ["knowIt", "learning", "review", "new"]) {
      const take = Math.min(PICKER_TARGETS[key], buckets[key].length);
      for (let i = 0; i < take; i++) {
        queue.push(buckets[key][i].i);
        used.add(buckets[key][i].i);
      }
    }
    // Top up from non-new buckets if the queue's short (e.g., not enough
    // know-it cards yet). Never top up from "new" — that's the whole
    // point of the cap.
    if (queue.length < SESSION_SIZE) {
      for (const key of ["knowIt", "learning", "review"]) {
        for (const entry of buckets[key]) {
          if (queue.length >= SESSION_SIZE) break;
          if (used.has(entry.i)) continue;
          queue.push(entry.i);
          used.add(entry.i);
        }
      }
    }
    // Shuffle so card types are interleaved.
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    smartQueue = queue;
  }

  async function nextSmartCard() {
    if (deck.length <= 1) return render();
    maybeRecordMiss();
    if (smartQueue.length === 0) {
      await refreshProgress();
      buildSmartQueue();
    }
    if (smartQueue.length === 0) {
      // Fallback if everything failed: random non-current card.
      let n;
      do { n = Math.floor(Math.random() * deck.length); } while (n === index && deck.length > 1);
      index = n;
    } else {
      // Avoid showing the same card back-to-back if the queue's first
      // entry happens to be the current card.
      if (smartQueue[0] === index && smartQueue.length > 1) {
        [smartQueue[0], smartQueue[1]] = [smartQueue[1], smartQueue[0]];
      }
      index = smartQueue.shift();
    }
    playShuffleSound();
    render();
  }

  els.card.addEventListener("click", (e) => {
    if (e.target.closest(".speak-btn")) return;
    flip();
  });

  els.card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flip();
    }
  });

  els.speakFront.addEventListener("click", (e) => {
    e.stopPropagation();
    speak(deck[index] && deck[index].hanzi, els.speakFront);
  });

  els.speakBack.addEventListener("click", (e) => {
    e.stopPropagation();
    speak(deck[index] && deck[index].hanzi, els.speakBack);
  });

  els.quizSound.addEventListener("click", (e) => {
    e.stopPropagation();
    speak(deck[index] && deck[index].hanzi, els.quizSound);
  });

  els.next.addEventListener("click", nextSmartCard);

  function loadImageWithTimeout(url, ms) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => {
        img.onload = img.onerror = null;
        reject(new Error("timeout"));
      }, ms);
      img.onload = () => { clearTimeout(timer); resolve(url); };
      img.onerror = () => { clearTimeout(timer); reject(new Error("img error")); };
      img.src = url;
    });
  }

  async function srcCatApi() {
    const res = await fetch("https://api.thecatapi.com/v1/images/search?mime_types=gif&limit=1");
    if (!res.ok) throw new Error("thecatapi " + res.status);
    const data = await res.json();
    const url = data && data[0] && data[0].url;
    if (!url) throw new Error("thecatapi no url");
    return loadImageWithTimeout(url, 6000);
  }

  async function srcCataas() {
    const url = "https://cataas.com/cat/gif?width=480&t=" + Date.now() + Math.random();
    return loadImageWithTimeout(url, 7000);
  }

  async function srcDog() {
    const res = await fetch("https://dog.ceo/api/breeds/image/random");
    if (!res.ok) throw new Error("dog " + res.status);
    const data = await res.json();
    const url = data && data.message;
    if (!url) throw new Error("dog no url");
    return loadImageWithTimeout(url, 6000);
  }

  async function srcShibe() {
    const res = await fetch("https://shibe.online/api/shibes?count=1");
    if (!res.ok) throw new Error("shibe " + res.status);
    const data = await res.json();
    const url = data && data[0];
    if (!url) throw new Error("shibe no url");
    return loadImageWithTimeout(url, 6000);
  }

  const REWARD_SOURCES = [
    { fn: srcDog,    weight: 3 },
    { fn: srcShibe,  weight: 3 },
    { fn: srcCatApi, weight: 1 },
    { fn: srcCataas, weight: 1 },
  ];

  async function fetchAnimalReward() {
    const expanded = [];
    for (const s of REWARD_SOURCES) {
      for (let i = 0; i < s.weight; i++) expanded.push(s);
    }
    for (let i = expanded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [expanded[i], expanded[j]] = [expanded[j], expanded[i]];
    }
    const tried = new Set();
    for (const s of expanded) {
      if (tried.has(s.fn)) continue;
      tried.add(s.fn);
      try { return await s.fn(); } catch (_) {}
    }
    return null;
  }

  let preloadedReward = null;
  let preloadingReward = false;

  function preloadReward() {
    if (preloadedReward || preloadingReward) return;
    preloadingReward = true;
    fetchAnimalReward()
      .then((url) => { preloadedReward = url; })
      .finally(() => { preloadingReward = false; });
  }

  function renderRewardUrl(url) {
    if (!url) {
      els.rewardLoading.style.display = "block";
      els.rewardLoading.textContent = "🎉 Great job! 🐱";
      return;
    }
    els.rewardLoading.style.display = "block";
    els.rewardLoading.textContent = "🎉";
    els.rewardGif.onload = () => {
      els.rewardGif.classList.add("loaded");
      els.rewardLoading.style.display = "none";
    };
    els.rewardGif.onerror = () => {
      els.rewardLoading.textContent = "🎉 Great job! 🐱";
    };
    els.rewardGif.src = url;
  }

  function awardStar(originEl) {
    stars += 1;
    els.starCount.textContent = stars;
    els.score.classList.remove("bump");
    void els.score.offsetWidth;
    els.score.classList.add("bump");

    let origin = originEl || els.score;
    let rect = origin.getBoundingClientRect();
    if (!rect.width && !rect.height) rect = els.score.getBoundingClientRect();
    const popup = document.createElement("span");
    popup.className = "score-popup";
    popup.textContent = "+1 ⭐";
    popup.style.left = rect.left + rect.width / 2 + "px";
    popup.style.top = rect.top + "px";
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 950);

    const card = deck[index];
    if (card && card.hanzi) recordCorrect(card.hanzi);
    gotItThisCard = true;
  }

  function showReward() {
    playGotItSound();
    awardStar(els.gotIt);
    spawnConfetti(els.gotIt);
    els.rewardOverlay.classList.add("show");
    els.rewardGif.classList.remove("loaded");
    els.rewardGif.removeAttribute("src");

    if (preloadedReward) {
      renderRewardUrl(preloadedReward);
      preloadedReward = null;
      preloadReward();
    } else {
      els.rewardLoading.style.display = "block";
      els.rewardLoading.textContent = "Loading your prize…";
      fetchAnimalReward().then((url) => {
        if (!els.rewardOverlay.classList.contains("show")) return;
        renderRewardUrl(url);
      });
      preloadReward();
    }
  }

  function dismissReward() {
    if (!els.rewardOverlay.classList.contains("show")) return;
    els.rewardOverlay.classList.remove("show");
    nextSmartCard();
  }

  els.gotIt.addEventListener("click", showReward);
  els.rewardOverlay.addEventListener("click", dismissReward);
  els.rewardNext.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissReward();
  });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const MIC_IDLE_TEXT = "";
  let micRecognition = null;
  let micListening = false;
  let micResetTimer = null;

  // The mic button stays an icon; status text lives in a pill above the bar.
  function setMicState(state, text) {
    if (micResetTimer) {
      clearTimeout(micResetTimer);
      micResetTimer = null;
    }
    els.mic.dataset.state = state;
    if (text !== undefined) {
      els.micStatus.dataset.state = state;
      els.micStatus.textContent = text;
      els.micStatus.hidden = !text;
    }
  }

  function resetMicSoon(ms) {
    if (micResetTimer) clearTimeout(micResetTimer);
    micResetTimer = setTimeout(() => {
      setMicState("idle", MIC_IDLE_TEXT);
    }, ms);
  }

  function normalizeForCompare(s) {
    return (s || "")
      .replace(/\s+/g, "")
      .replace(/[\.,!?。，！？、:;"'’“”]/g, "")
      .toLowerCase();
  }

  function stripTones(s) {
    return s
      .replace(/[āáǎà]/g, "a")
      .replace(/[ēéěè]/g, "e")
      .replace(/[īíǐì]/g, "i")
      .replace(/[ōóǒò]/g, "o")
      .replace(/[ūúǔù]/g, "u")
      .replace(/[ǖǘǚǜü]/g, "v");
  }

  function hanziToPinyin(text) {
    const dict = window.PINYIN_DICT || {};
    let out = "";
    for (const ch of text) {
      if (dict[ch]) out += dict[ch];
      else if (/[a-z]/i.test(ch)) out += ch.toLowerCase();
      else if (/[一-龥]/.test(ch)) out += "?";
    }
    return out;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let curr = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        const next = Math.min(prev[j] + 1, curr + 1, prev[j - 1] + cost);
        prev[j - 1] = curr;
        curr = next;
      }
      prev[b.length] = curr;
    }
    return prev[b.length];
  }

  function similarity(a, b) {
    if (a === b) return 1;
    const longer = a.length >= b.length ? a : b;
    if (!longer.length) return 1;
    return (longer.length - levenshtein(a, b)) / longer.length;
  }

  function checkPronunciation(transcripts) {
    const card = deck[index];
    if (!card) return false;

    const expectedHanzi = normalizeForCompare(card.hanzi);
    const expectedPinyin = card.pinyin
      ? stripTones(normalizeForCompare(card.pinyin))
      : hanziToPinyin(expectedHanzi);

    if (!expectedHanzi && !expectedPinyin) return false;

    return transcripts.some((heard) => {
      const heardNorm = normalizeForCompare(heard);
      if (!heardNorm) return false;

      if (expectedHanzi && (heardNorm.includes(expectedHanzi) || expectedHanzi.includes(heardNorm))) return true;

      const heardPinyin = hanziToPinyin(heardNorm);
      if (heardPinyin && expectedPinyin && (heardPinyin.includes(expectedPinyin) || expectedPinyin.includes(heardPinyin))) return true;

      if (heardPinyin && expectedPinyin && similarity(heardPinyin, expectedPinyin) >= 0.6) return true;

      return false;
    });
  }

  function evaluateTranscripts(transcripts) {
    if (checkPronunciation(transcripts)) {
      setMicState("success", "✓ Great job!");
      setTimeout(() => {
        setMicState("idle", MIC_IDLE_TEXT);
        showReward();
      }, 500);
      return;
    }
    const heard = (transcripts && transcripts[0]) || "";
    if (heard) {
      setMicState("error", `Heard: "${heard}" — try again`);
      // Only count an actual transcript-mismatch as a wrong answer.
      const card = deck[index];
      if (card && card.hanzi) recordWrong(card.hanzi);
    } else {
      setMicState("error", "🎤 Didn't catch that — try again");
    }
    resetMicSoon(2800);
  }

  function startListening() {
    if (!SR) {
      setMicState("unsupported", "🎤 not supported here");
      return;
    }
    if (micListening) {
      try { micRecognition && micRecognition.stop(); } catch (_) {}
      return;
    }
    if (els.rewardOverlay.classList.contains("show")) return;

    micRecognition = new SR();
    micRecognition.lang = "zh-CN";
    micRecognition.continuous = false;
    micRecognition.interimResults = true;
    micRecognition.maxAlternatives = 5;

    let lastInterim = "";
    let lastFinalTranscripts = null;
    let handled = false;

    micRecognition.onstart = () => {
      micListening = true;
      setMicState("listening", "🎤 Listening…");
    };

    micRecognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcripts = [];
        for (let j = 0; j < result.length; j++) {
          transcripts.push(result[j].transcript);
        }
        if (result.isFinal) {
          lastFinalTranscripts = transcripts;
        } else {
          lastInterim = transcripts[0] || lastInterim;
          if (lastInterim) {
            setMicState("listening", `🎤 "${lastInterim}"`);
          }
        }
      }
      if (lastFinalTranscripts && !handled) {
        handled = true;
        micListening = false;
        evaluateTranscripts(lastFinalTranscripts);
      }
    };

    micRecognition.onerror = (e) => {
      micListening = false;
      handled = true;
      let msg = "🎤 Try again";
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        msg = "🎤 Allow microphone access";
      } else if (e.error === "no-speech") {
        msg = "🎤 Didn't hear you — try again";
      } else if (e.error === "audio-capture") {
        msg = "🎤 No mic detected";
      } else if (e.error === "network") {
        msg = "🎤 Network error";
      } else if (e.error) {
        msg = `🎤 ${e.error}`;
      }
      setMicState("error", msg);
      resetMicSoon(2800);
    };

    micRecognition.onend = () => {
      micListening = false;
      if (handled) return;
      handled = true;
      if (lastFinalTranscripts) {
        evaluateTranscripts(lastFinalTranscripts);
      } else if (lastInterim) {
        evaluateTranscripts([lastInterim]);
      } else {
        setMicState("error", "🎤 Didn't catch that — try again");
        resetMicSoon(2500);
      }
    };

    try {
      micRecognition.start();
    } catch (err) {
      micListening = false;
      setMicState("error", "🎤 Try again");
      resetMicSoon(1500);
    }
  }

  if (!SR) {
    els.mic.hidden = true;
  } else {
    els.mic.addEventListener("click", startListening);
  }
  document.addEventListener("keydown", (e) => {
    if (!deck.length) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "Escape" && els.rewardOverlay.classList.contains("show")) {
      dismissReward();
      return;
    }
    if (e.key === "ArrowRight") nextSmartCard();
    else if (e.key.toLowerCase() === "s") speak(deck[index].hanzi, els.speakFront);
    else if (e.key === " " && e.target !== els.card) {
      e.preventDefault();
      flip();
    }
  });

  // --- Profiles + session lifecycle ---

  function bumpInteraction() {
    lastInteractionAt = Date.now();
  }

  function scheduleSessionFlush() {
    if (sessionFlushTimer || !currentSessionId) return;
    sessionFlushTimer = setTimeout(async () => {
      sessionFlushTimer = null;
      await flushSessionCounters();
    }, 3000);
  }

  async function flushSessionCounters(extra) {
    if (!sb || !currentSessionId) return;
    const patch = {
      cards_shown: sessionCounters.shown,
      cards_correct: sessionCounters.correct,
      cards_wrong: sessionCounters.wrong,
      cards_flipped: sessionCounters.flipped,
      ...(extra || {}),
    };
    try {
      await sb.from("sessions").update(patch).eq("id", currentSessionId);
    } catch (e) {
      console.warn("session update failed:", e);
    }
  }

  async function startSession(profileId) {
    sessionCounters = { shown: 0, correct: 0, wrong: 0, flipped: 0 };
    lastInteractionAt = Date.now();
    currentSessionId = null;
    if (!sb) return;
    try {
      const { data, error } = await sb
        .from("sessions")
        .insert({ profile_id: profileId })
        .select()
        .single();
      if (error) throw error;
      currentSessionId = data && data.id;
    } catch (e) {
      console.warn("session start failed:", e);
    }
  }

  async function endSession() {
    if (sessionFlushTimer) {
      clearTimeout(sessionFlushTimer);
      sessionFlushTimer = null;
    }
    if (!currentSessionId) return;
    const sessionId = currentSessionId;
    currentSessionId = null;
    if (!sb) return;
    try {
      await sb.from("sessions").update({
        ended_at: new Date().toISOString(),
        cards_shown: sessionCounters.shown,
        cards_correct: sessionCounters.correct,
        cards_wrong: sessionCounters.wrong,
        cards_flipped: sessionCounters.flipped,
      }).eq("id", sessionId);
    } catch (e) {
      console.warn("session end failed:", e);
    }
  }

  function checkIdle() {
    if (!currentSessionId) return;
    if (Date.now() - lastInteractionAt > IDLE_TIMEOUT_MS) {
      endSession();
      showProfilePicker();
    }
  }
  setInterval(checkIdle, 60 * 1000);
  window.addEventListener("pagehide", () => {
    if (currentSessionId) endSession();
  });
  document.addEventListener("pointerdown", bumpInteraction, { passive: true });

  // Profile picker UI

  async function fetchProfiles() {
    if (!sb) return [];
    try {
      const { data } = await sb
        .from("profiles")
        .select("id, name, emoji, color, created_at")
        .order("created_at", { ascending: true });
      return data || [];
    } catch (e) {
      console.warn("profiles fetch failed:", e);
      return [];
    }
  }

  function renderProfileList(profiles) {
    els.profileList.innerHTML = "";
    for (const p of profiles) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "profile-tile";
      btn.innerHTML =
        '<span class="profile-tile-avatar">' +
        escapeHtml(p.emoji || "🐱") +
        '</span><span class="profile-tile-name">' +
        escapeHtml(p.name || "") +
        "</span>";
      btn.addEventListener("click", () => selectProfile(p));
      els.profileList.appendChild(btn);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  async function showProfilePicker() {
    els.profilePicker.classList.remove("hidden");
    els.newProfileForm.classList.add("hidden");
    els.profilePicker.querySelector(".profile-picker-card").classList.remove("hidden");
    const profiles = await fetchProfiles();
    renderProfileList(profiles);
  }

  function hideProfilePicker() {
    els.profilePicker.classList.add("hidden");
  }

  function showNewProfileForm() {
    els.profilePicker.querySelector(".profile-picker-card").classList.add("hidden");
    els.newProfileForm.classList.remove("hidden");
    els.newProfileName.value = "";
    els.newProfileEmoji.value = "🐱";
    setTimeout(() => els.newProfileName.focus(), 0);
  }

  function hideNewProfileForm() {
    els.newProfileForm.classList.add("hidden");
    els.profilePicker.querySelector(".profile-picker-card").classList.remove("hidden");
  }

  async function onCreateProfile() {
    const name = (els.newProfileName.value || "").trim();
    const emoji = (els.newProfileEmoji.value || "").trim() || "🐱";
    if (!name) {
      els.newProfileName.focus();
      return;
    }
    if (!sb) return;
    try {
      const { data, error } = await sb
        .from("profiles")
        .insert({ name, emoji })
        .select()
        .single();
      if (error) throw error;
      await selectProfile(data);
    } catch (e) {
      console.warn("profile create failed:", e);
    }
  }

  async function selectProfile(profile) {
    if (!profile) return;
    if (currentSessionId) await endSession();
    currentProfile = profile;
    try {
      localStorage.setItem("currentProfileId", profile.id);
    } catch (_) {}
    els.profileChipEmoji.textContent = profile.emoji || "🐱";
    els.profileChipName.textContent = profile.name || "";
    hideProfilePicker();
    show(els.studyContent);
    stars = 0;
    if (els.starCount) els.starCount.textContent = "0";
    await startSession(profile.id);
    await refreshProgress();
    smartQueue = [];
    buildSmartQueue();
    if (smartQueue.length) {
      index = smartQueue.shift();
    } else {
      index = 0;
    }
    render();
  }

  els.profileChip.addEventListener("click", showStats);
  els.newProfileBtn.addEventListener("click", showNewProfileForm);
  els.createProfileBtn.addEventListener("click", onCreateProfile);
  els.cancelProfileBtn.addEventListener("click", hideNewProfileForm);
  els.newProfileName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCreateProfile();
    }
  });
  els.statsCloseBtn.addEventListener("click", hideStats);
  els.statsSwitchBtn.addEventListener("click", () => {
    hideStats();
    showProfilePicker();
  });

  // --- Stats overlay ---

  async function showStats() {
    if (!currentProfile) {
      showProfilePicker();
      return;
    }
    els.statsAvatar.textContent = currentProfile.emoji || "🐱";
    els.statsName.textContent = currentProfile.name || "—";
    els.statsSince.textContent = currentProfile.created_at
      ? "since " + formatDate(currentProfile.created_at)
      : "";
    // Show placeholders while loading.
    els.statsSessions.textContent = "…";
    els.statsTotalShown.textContent = "…";
    els.statsAccuracy.textContent = "…";
    els.statsMastered.textContent = "…";
    els.statsMasteryBars.innerHTML = "";
    els.statsHardest.innerHTML = '<p class="stats-empty">Loading…</p>';
    els.statsSessionsList.innerHTML = '<p class="stats-empty">Loading…</p>';
    els.statsOverlay.classList.remove("hidden");

    // Flush pending session counters so totals reflect the current session.
    if (sessionFlushTimer) {
      clearTimeout(sessionFlushTimer);
      sessionFlushTimer = null;
      try { await flushSessionCounters(); } catch (_) {}
    }

    const [sessions, progressRows] = await Promise.all([
      fetchProfileSessions(currentProfile.id),
      fetchProfileProgress(currentProfile.id),
    ]);
    renderStats(sessions, progressRows);
  }

  function hideStats() {
    els.statsOverlay.classList.add("hidden");
  }

  async function fetchProfileSessions(profileId) {
    if (!sb) return [];
    try {
      const { data } = await sb
        .from("sessions")
        .select("id, started_at, ended_at, cards_shown, cards_correct, cards_wrong, cards_flipped")
        .eq("profile_id", profileId)
        .order("started_at", { ascending: false });
      return data || [];
    } catch (e) {
      console.warn("sessions fetch failed:", e);
      return [];
    }
  }

  async function fetchProfileProgress(profileId) {
    if (!sb) return [];
    try {
      const { data } = await sb
        .from("progress")
        .select("card_key, seen, correct, wrong, flips, last_seen_at, last_correct_at")
        .eq("profile_id", profileId);
      return data || [];
    } catch (e) {
      console.warn("progress fetch failed:", e);
      return [];
    }
  }

  function isRealSession(s) {
    const interactions =
      (s.cards_correct || 0) + (s.cards_wrong || 0) + (s.cards_flipped || 0);
    return (s.cards_shown || 0) >= 3 || interactions >= 1;
  }

  function renderStats(sessions, progressRows) {
    // Filter out phantom sessions (e.g. page reloads that just rendered one card).
    const realSessions = sessions.filter(isRealSession);

    // Totals from real sessions only.
    let totalShown = 0, totalCorrect = 0, totalWrong = 0, totalFlipped = 0;
    for (const s of realSessions) {
      totalShown += s.cards_shown || 0;
      totalCorrect += s.cards_correct || 0;
      totalWrong += s.cards_wrong || 0;
      totalFlipped += s.cards_flipped || 0;
    }
    const answered = totalCorrect + totalWrong;
    const acc = answered > 0 ? Math.round((totalCorrect / answered) * 100) : 0;

    // Mastery breakdown across the deck.
    const progressByKey = {};
    for (const r of progressRows) progressByKey[r.card_key] = r;
    const masteryCounts = [0, 0, 0, 0, 0, 0]; // levels 0..5
    for (const card of deck) {
      const lvl = masteryLevel(progressByKey[card.hanzi]);
      masteryCounts[lvl] = (masteryCounts[lvl] || 0) + 1;
    }
    const masteredCount = masteryCounts[5] + masteryCounts[4];

    els.statsSessions.textContent = String(realSessions.length);
    els.statsTotalShown.textContent = String(totalShown);
    els.statsAccuracy.textContent = String(acc);
    els.statsMastered.textContent = String(masteredCount);

    // Mastery bars.
    const deckSize = deck.length || 1;
    const labels = ["☆☆☆☆☆", "★☆☆☆☆", "★★☆☆☆", "★★★☆☆", "★★★★☆", "★★★★★"];
    let barsHtml = "";
    for (let lvl = 5; lvl >= 0; lvl--) {
      const n = masteryCounts[lvl] || 0;
      const pct = Math.round((n / deckSize) * 100);
      barsHtml +=
        '<div class="stats-bar-row">' +
        '<span class="stats-bar-label">' + labels[lvl] + "</span>" +
        '<div class="stats-bar-track">' +
        '<div class="stats-bar-fill lvl-' + lvl + '" style="width:' + pct + '%"></div>' +
        "</div>" +
        '<span class="stats-bar-num">' + n + "</span>" +
        "</div>";
    }
    els.statsMasteryBars.innerHTML = barsHtml;

    // Hardest words: top wrongs + flips, excluding zero-miss rows.
    const deckByHanzi = {};
    for (const c of deck) deckByHanzi[c.hanzi] = c;
    const hard = progressRows
      .filter((r) => (r.wrong || 0) + (r.flips || 0) > 0)
      .map((r) => ({
        hanzi: r.card_key,
        pinyin: (deckByHanzi[r.card_key] && deckByHanzi[r.card_key].pinyin) || "",
        miss: (r.wrong || 0) + (r.flips || 0),
        wrong: r.wrong || 0,
        flips: r.flips || 0,
      }))
      .sort((a, b) => b.miss - a.miss)
      .slice(0, 10);
    if (hard.length === 0) {
      els.statsHardest.innerHTML = '<p class="stats-empty">No misses yet. 🎉</p>';
    } else {
      els.statsHardest.innerHTML = hard
        .map(
          (h) =>
            '<span class="stats-hard-pill">' +
            '<span class="hp-hanzi">' + escapeHtml(h.hanzi) + "</span>" +
            (h.pinyin ? '<span class="hp-pinyin">' + escapeHtml(h.pinyin) + "</span>" : "") +
            '<span class="hp-miss">×' + h.miss + "</span>" +
            "</span>"
        )
        .join("");
    }

    // Recent sessions: last 10 real ones.
    const recent = realSessions.slice(0, 10);
    if (recent.length === 0) {
      els.statsSessionsList.innerHTML = '<p class="stats-empty">No sessions yet.</p>';
    } else {
      els.statsSessionsList.innerHTML = recent
        .map((s) => {
          const started = new Date(s.started_at);
          const ended = s.ended_at ? new Date(s.ended_at) : null;
          const dur = ended ? formatDuration(ended - started) : "in progress";
          return (
            '<div class="stats-session-row">' +
            "<div>" +
            '<div class="stats-session-date">' + escapeHtml(formatDate(s.started_at)) + " · " + escapeHtml(formatTime(s.started_at)) + "</div>" +
            '<div class="stats-session-meta">' + escapeHtml(dur) + " · " + (s.cards_shown || 0) + " cards</div>" +
            "</div>" +
            '<div class="stats-session-counts">' +
            '<span class="ok">' + (s.cards_correct || 0) + "✓</span> " +
            '<span class="bad">' + (s.cards_wrong || 0) + "✗</span> " +
            '<span class="flip">' + (s.cards_flipped || 0) + "↺</span>" +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (_) {
      return "";
    }
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    } catch (_) {
      return "";
    }
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return "—";
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0) return s + "s";
    return m + "m " + s + "s";
  }

  // --- Crossword puzzle ---
  // Grid: rows × cols of { ch, num, words: [wordIndex], blank }.
  // Word: { idx, row, col, dir: "across"|"down", hanzi, english, pinyin, num, cells: [{r,c}] }.
  // State: puzzleState = { grid, words, filled: Map<"r,c", char>, selected, selectedWord, completed }.
  let puzzleState = null;

  async function openPuzzle() {
    hideStats();
    els.puzzleOverlay.classList.remove("hidden");
    els.puzzleWin.classList.add("hidden");
    // Ensure we have fresh progress for the current profile.
    if (currentProfile) await refreshProgress();
    const pool = deck.filter((c) => masteryLevel(progressMap[c.hanzi]) >= 3);
    if (pool.length < 5) {
      els.puzzleEmpty.classList.remove("hidden");
      els.puzzleBody.classList.add("hidden");
      els.puzzleEmptyCount.textContent = String(pool.length);
      return;
    }
    els.puzzleEmpty.classList.add("hidden");
    els.puzzleBody.classList.remove("hidden");
    generateAndRenderPuzzle(pool);
  }

  function generateAndRenderPuzzle(pool) {
    let layout = null;
    // Generator is stochastic; try a few times to get a denser fill.
    for (let attempt = 0; attempt < 12 && !layout; attempt++) {
      const sample = sampleWordsForPuzzle(pool, 7 + Math.floor(Math.random() * 3));
      layout = generateCrossword(sample);
    }
    if (!layout) {
      // Fallback: single horizontal word so the screen never blanks.
      const w = pool[0];
      layout = singleWordLayout(w);
    }
    puzzleState = {
      ...layout,
      filled: new Map(),
      selected: null,
      selectedWord: null,
      completed: false,
    };
    // Auto-select the first cell of the first word (before render so painting picks it up).
    const w0 = layout.words[0];
    if (w0) {
      puzzleState.selected = { r: w0.cells[0].r, c: w0.cells[0].c };
      puzzleState.selectedWord = w0;
    }
    renderPuzzleGrid();
    renderClueList();
    renderTileBank();
    updateClueText();
  }

  function sampleWordsForPuzzle(pool, n) {
    // Prefer single-hanzi words first (easier intersections), then compounds.
    const single = pool.filter((c) => c.hanzi.length === 1);
    const multi = pool.filter((c) => c.hanzi.length > 1);
    shuffleInPlace(single);
    shuffleInPlace(multi);
    const take = Math.min(n, single.length + multi.length);
    const out = [];
    let si = 0, mi = 0;
    // Bias: 2 multi-char per 5 if available.
    while (out.length < take) {
      const wantMulti = (out.length % 5 < 2) && mi < multi.length;
      if (wantMulti) out.push(multi[mi++]);
      else if (si < single.length) out.push(single[si++]);
      else if (mi < multi.length) out.push(multi[mi++]);
      else break;
    }
    return out;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function singleWordLayout(card) {
    const chars = [...card.hanzi];
    const cells = chars.map((_, i) => ({ r: 0, c: i }));
    return {
      rows: 1,
      cols: chars.length,
      cells: chars.map((ch, i) => ({ r: 0, c: i, ch, num: i === 0 ? 1 : 0, words: [0] })),
      words: [{
        idx: 0, row: 0, col: 0, dir: "across",
        hanzi: card.hanzi, english: card.english, pinyin: card.pinyin,
        num: 1, cells,
      }],
    };
  }

  // Greedy crossword generator. Returns null if too few words fit.
  function generateCrossword(words) {
    if (!words.length) return null;
    // Sort by length descending so longer anchors place first.
    const sorted = [...words].sort((a, b) => b.hanzi.length - a.hanzi.length);

    // Use a sparse map { "r,c": char } during placement; bound recomputed at end.
    const placed = []; // { hanzi, english, pinyin, dir, row, col, cells }
    const grid = new Map();

    function gridGet(r, c) { return grid.get(r + "," + c); }
    function gridSet(r, c, ch) { grid.set(r + "," + c, ch); }

    function canPlace(chars, r, c, dir) {
      // chars must not collide with non-matching letters and must not create
      // adjacent same-direction runs that aren't this word.
      const drR = dir === "down" ? 1 : 0;
      const drC = dir === "across" ? 1 : 0;
      const perpR = dir === "down" ? 0 : 1;
      const perpC = dir === "across" ? 0 : 1;

      // Cell BEFORE the word must be empty/blank.
      const beforeR = r - drR, beforeC = c - drC;
      if (gridGet(beforeR, beforeC)) return false;
      // Cell AFTER the word must be empty.
      const afterR = r + drR * chars.length, afterC = c + drC * chars.length;
      if (gridGet(afterR, afterC)) return false;

      let intersections = 0;
      for (let i = 0; i < chars.length; i++) {
        const rr = r + drR * i, cc = c + drC * i;
        const existing = gridGet(rr, cc);
        if (existing) {
          if (existing !== chars[i]) return false;
          intersections++;
        } else {
          // Check perpendicular neighbors are empty (no accidental abuts).
          if (gridGet(rr + perpR, cc + perpC)) return false;
          if (gridGet(rr - perpR, cc - perpC)) return false;
        }
      }
      return intersections;
    }

    function commit(chars, r, c, dir, card) {
      const cells = [];
      const drR = dir === "down" ? 1 : 0;
      const drC = dir === "across" ? 1 : 0;
      for (let i = 0; i < chars.length; i++) {
        const rr = r + drR * i, cc = c + drC * i;
        gridSet(rr, cc, chars[i]);
        cells.push({ r: rr, c: cc });
      }
      placed.push({
        hanzi: card.hanzi, english: card.english, pinyin: card.pinyin,
        dir, row: r, col: c, cells,
      });
    }

    // Place first word horizontally at origin.
    const first = sorted[0];
    const firstChars = [...first.hanzi];
    commit(firstChars, 0, 0, "across", first);

    // Try to place remaining words, intersecting at any shared character.
    for (let wi = 1; wi < sorted.length; wi++) {
      const card = sorted[wi];
      const chars = [...card.hanzi];
      const candidates = [];
      // For each char in this word, try aligning against existing matching cells.
      for (let ci = 0; ci < chars.length; ci++) {
        for (const [key, existingCh] of grid) {
          if (existingCh !== chars[ci]) continue;
          const [er, ec] = key.split(",").map(Number);
          // Try both orientations.
          for (const dir of ["across", "down"]) {
            const drR = dir === "down" ? 1 : 0;
            const drC = dir === "across" ? 1 : 0;
            const r = er - drR * ci;
            const c = ec - drC * ci;
            const intersections = canPlace(chars, r, c, dir);
            if (intersections) candidates.push({ r, c, dir, intersections });
          }
        }
      }
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => b.intersections - a.intersections);
      const pick = candidates[0];
      commit(chars, pick.r, pick.c, pick.dir, card);
    }

    if (placed.length < 3) return null;

    // Normalize to a 2D grid.
    let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    for (const key of grid.keys()) {
      const [r, c] = key.split(",").map(Number);
      if (r < minR) minR = r;
      if (c < minC) minC = c;
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;
    if (rows * cols > 100) return null; // too sparse for a small overlay

    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = grid.get((r + minR) + "," + (c + minC)) || null;
        cells.push({ r, c, ch, num: 0, words: [] });
      }
    }
    function cellAt(r, c) { return cells[r * cols + c]; }

    // Translate placed words into final coords + cells.
    const finalWords = placed.map((w, idx) => ({
      idx,
      dir: w.dir,
      row: w.row - minR,
      col: w.col - minC,
      hanzi: w.hanzi,
      english: w.english,
      pinyin: w.pinyin,
      cells: w.cells.map((cc) => ({ r: cc.r - minR, c: cc.c - minC })),
      num: 0,
    }));

    // Mark which words touch which cells.
    for (const w of finalWords) {
      for (const cc of w.cells) cellAt(cc.r, cc.c).words.push(w.idx);
    }

    // Assign clue numbers: any cell that's the start of an across or down word.
    let num = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cellAt(r, c);
        if (!cell.ch) continue;
        let startsWord = false;
        for (const w of finalWords) {
          if (w.cells[0].r === r && w.cells[0].c === c) {
            startsWord = true;
            w.num = w.num || num;
          }
        }
        if (startsWord) {
          cell.num = num;
          num++;
        }
      }
    }
    // Ensure every word has a num.
    for (const w of finalWords) {
      if (!w.num) w.num = cellAt(w.cells[0].r, w.cells[0].c).num;
    }
    return { rows, cols, cells, words: finalWords };
  }

  function renderPuzzleGrid() {
    const { rows, cols, cells } = puzzleState;
    const wrap = els.puzzleGrid;
    wrap.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    const maxCellPx = Math.min(48, Math.floor(Math.min(window.innerWidth - 60, 480) / cols));
    wrap.style.width = (maxCellPx * cols + cols * 2 + 4) + "px";
    wrap.innerHTML = "";
    for (const cell of cells) {
      const el = document.createElement("div");
      el.className = "puzzle-cell";
      if (!cell.ch) {
        el.classList.add("blank");
      } else {
        const filled = puzzleState.filled.get(cell.r + "," + cell.c);
        if (cell.num) {
          const n = document.createElement("span");
          n.className = "puzzle-cell-num";
          n.textContent = cell.num;
          el.appendChild(n);
        }
        const ch = document.createElement("span");
        ch.className = "puzzle-cell-ch";
        ch.textContent = filled || "";
        el.appendChild(ch);
        el.dataset.r = cell.r;
        el.dataset.c = cell.c;
        el.addEventListener("click", () => onCellClick(cell.r, cell.c));
      }
      wrap.appendChild(el);
    }
    paintSelection();
  }

  function paintSelection() {
    if (!puzzleState) return;
    const { cols, cells } = puzzleState;
    const nodes = els.puzzleGrid.children;
    const selectedW = puzzleState.selectedWord;
    const selectedKey = puzzleState.selected
      ? puzzleState.selected.r + "," + puzzleState.selected.c
      : null;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const node = nodes[i];
      if (!cell.ch) continue;
      node.classList.remove("selected", "highlight");
      if (selectedW && selectedW.cells.some((cc) => cc.r === cell.r && cc.c === cell.c)) {
        node.classList.add("highlight");
      }
      if (selectedKey === cell.r + "," + cell.c) {
        node.classList.add("selected");
      }
    }
  }

  function onCellClick(r, c) {
    if (!puzzleState) return;
    const cell = cellByCoord(r, c);
    if (!cell || !cell.ch) return;
    // If the user clicks the already-selected cell, toggle word direction.
    let word = puzzleState.selectedWord;
    if (
      puzzleState.selected &&
      puzzleState.selected.r === r &&
      puzzleState.selected.c === c &&
      cell.words.length > 1 &&
      word
    ) {
      const other = cell.words.find((idx) => idx !== word.idx);
      if (other != null) word = puzzleState.words[other];
    } else {
      // Pick a word that contains this cell — prefer same direction as current.
      const containing = cell.words.map((i) => puzzleState.words[i]);
      word = containing.find((w) => w.dir === (word && word.dir)) || containing[0];
    }
    selectCell(r, c, word);
  }

  function selectCell(r, c, word) {
    puzzleState.selected = { r, c };
    puzzleState.selectedWord = word || null;
    updateClueText();
    paintSelection();
  }

  function cellByCoord(r, c) {
    const { cols, cells } = puzzleState;
    if (r < 0 || c < 0 || r >= puzzleState.rows || c >= cols) return null;
    return cells[r * cols + c];
  }

  function updateClueText() {
    const w = puzzleState.selectedWord;
    if (!w) {
      els.puzzleClueArrow.textContent = "→";
      els.puzzleClueText.textContent = "Pick a cell to start";
      return;
    }
    els.puzzleClueArrow.textContent = w.dir === "across" ? "→" : "↓";
    els.puzzleClueText.innerHTML =
      escapeHtml(w.english) +
      (w.pinyin
        ? ' <span class="clue-pinyin">(' + escapeHtml(w.pinyin) + ", " + w.hanzi.length + " chars)</span>"
        : "");
  }

  function renderClueList() {
    const across = puzzleState.words.filter((w) => w.dir === "across");
    const down = puzzleState.words.filter((w) => w.dir === "down");
    function render(list) {
      return list
        .sort((a, b) => a.num - b.num)
        .map(
          (w) =>
            "<li><b>" + w.num + ".</b> " + escapeHtml(w.english) +
            ' <span class="clue-pinyin">(' + escapeHtml(w.pinyin || "") +
            ", " + w.hanzi.length + ")</span></li>"
        )
        .join("");
    }
    els.puzzleAcrossList.innerHTML = render(across) || "<li>(none)</li>";
    els.puzzleDownList.innerHTML = render(down) || "<li>(none)</li>";
  }

  function renderTileBank() {
    // Tile bank = every hanzi character that appears in the answers,
    // plus 2-4 distractor characters from other mastered cards.
    const need = new Set();
    for (const w of puzzleState.words) for (const ch of w.hanzi) need.add(ch);
    const tiles = [...need];
    // Distractors: pick chars from other mastered single-char cards not in `need`.
    const distractors = [];
    for (const card of deck) {
      if (masteryLevel(progressMap[card.hanzi]) < 3) continue;
      for (const ch of card.hanzi) {
        if (!need.has(ch) && !distractors.includes(ch)) distractors.push(ch);
      }
    }
    shuffleInPlace(distractors);
    for (let i = 0; i < Math.min(3, distractors.length); i++) tiles.push(distractors[i]);
    shuffleInPlace(tiles);

    els.puzzleTiles.innerHTML = "";
    for (const ch of tiles) {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "puzzle-tile";
      t.textContent = ch;
      t.addEventListener("click", () => onTilePlace(ch));
      els.puzzleTiles.appendChild(t);
    }
  }

  function onTilePlace(ch) {
    if (!puzzleState || !puzzleState.selected) return;
    const { r, c } = puzzleState.selected;
    puzzleState.filled.set(r + "," + c, ch);
    // Auto-advance within the selected word.
    const w = puzzleState.selectedWord;
    if (w) {
      const idx = w.cells.findIndex((cc) => cc.r === r && cc.c === c);
      const nextCell = w.cells.find(
        (cc, i) => i > idx && !puzzleState.filled.get(cc.r + "," + cc.c)
      );
      if (nextCell) selectCell(nextCell.r, nextCell.c, w);
      else selectCell(r, c, w);
    }
    renderPuzzleGrid();
    // If the whole grid is filled correctly, win.
    if (isPuzzleSolved(false)) {
      onPuzzleWin();
    }
  }

  function isPuzzleSolved(showWrong) {
    if (!puzzleState) return false;
    for (const cell of puzzleState.cells) {
      if (!cell.ch) continue;
      const got = puzzleState.filled.get(cell.r + "," + cell.c);
      if (got !== cell.ch) return false;
    }
    return true;
  }

  function checkPuzzle() {
    if (!puzzleState) return;
    const nodes = els.puzzleGrid.children;
    let anyMistake = false;
    for (let i = 0; i < puzzleState.cells.length; i++) {
      const cell = puzzleState.cells[i];
      const node = nodes[i];
      node.classList.remove("correct", "wrong");
      if (!cell.ch) continue;
      const got = puzzleState.filled.get(cell.r + "," + cell.c);
      if (!got) continue;
      if (got === cell.ch) node.classList.add("correct");
      else { node.classList.add("wrong"); anyMistake = true; }
    }
    if (!anyMistake && isPuzzleSolved(false)) onPuzzleWin();
    // Clear the green/red after a moment so the player can keep editing.
    setTimeout(() => {
      for (const n of nodes) n.classList.remove("correct", "wrong");
    }, 1500);
  }

  async function onPuzzleWin() {
    if (puzzleState.completed) return;
    puzzleState.completed = true;
    const starsWon = puzzleState.words.length;
    if (els.puzzleWinStars) els.puzzleWinStars.textContent = String(starsWon);
    els.puzzleWin.classList.remove("hidden");
    stars += starsWon;
    if (els.starCount) els.starCount.textContent = String(stars);
    playGotItSound();
    spawnConfetti(els.puzzleOverlay);
    // Each correctly-placed word counts as a "got it" for the smart picker.
    for (const w of puzzleState.words) {
      try { await recordCorrect(w.hanzi); } catch (_) {}
    }
  }

  function closePuzzle() {
    els.puzzleOverlay.classList.add("hidden");
    puzzleState = null;
  }

  els.statsPuzzleBtn.addEventListener("click", openPuzzle);
  els.puzzleCloseBtn.addEventListener("click", closePuzzle);
  els.puzzleNewBtn.addEventListener("click", async () => {
    if (currentProfile) await refreshProgress();
    const pool = deck.filter((c) => masteryLevel(progressMap[c.hanzi]) >= 3);
    if (pool.length < 5) return;
    els.puzzleWin.classList.add("hidden");
    generateAndRenderPuzzle(pool);
  });
  els.puzzleCheckBtn.addEventListener("click", checkPuzzle);

  // --- Startup ---

  async function startup() {
    // Load deck first.
    await loadDeck();
    if (!deck.length) return; // empty / error state already shown
    hide(els.studyContent); // keep hidden until profile chosen
    // Try to auto-select last profile.
    let autoProfile = null;
    if (sb) {
      const savedId = (() => {
        try { return localStorage.getItem("currentProfileId"); } catch (_) { return null; }
      })();
      const profiles = await fetchProfiles();
      if (savedId) autoProfile = profiles.find((p) => p.id === savedId);
    }
    if (autoProfile) {
      await selectProfile(autoProfile);
    } else {
      await showProfilePicker();
    }
    preloadReward();
  }

  startup();
})();
