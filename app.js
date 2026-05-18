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
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    shuffle: document.getElementById("shuffle"),
    ttsWarning: document.getElementById("ttsWarning"),
    gotIt: document.getElementById("gotIt"),
    mic: document.getElementById("mic"),
    rewardOverlay: document.getElementById("rewardOverlay"),
    rewardLoading: document.getElementById("rewardLoading"),
    rewardGif: document.getElementById("rewardGif"),
    rewardNext: document.getElementById("rewardNext"),
    masteryFront: document.getElementById("masteryFront"),
    masteryBack: document.getElementById("masteryBack"),
  };

  let deck = [];
  let index = 0;
  let chineseVoice = null;
  // Bag-shuffle queue for "🔀" so every card is shown before any repeat.
  let shuffleQueue = [];
  // Session-local star count (resets on reload).
  let stars = 0;

  // --- Smart picker state ---
  const SESSION_SIZE = 20;
  const PICKER_TARGETS = { knowIt: 10, learning: 4, review: 4, new: 2 };
  let progressMap = {}; // hanzi -> { seen, correct, wrong, flips, last_seen_at, last_correct_at }
  let smartQueue = []; // deck indexes
  let flippedThisCard = false;
  let gotItThisCard = false;

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
    show(els.studyContent);
    index = 0;
    shuffleQueue = [];
    smartQueue = [];
    // Fetch existing progress + build the first smart-picker queue, then
    // start with one of those cards. Falls back gracefully if Supabase
    // isn't reachable.
    await refreshProgress();
    buildSmartQueue();
    if (smartQueue.length) index = smartQueue.shift();
    render();
  }

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
  }

  function flip() {
    els.card.classList.toggle("flipped");
    playFlipSound();
    spawnConfetti(els.card);
    flippedThisCard = true;
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

  function nextCard() {
    maybeRecordUnresolvedFlip();
    index = (index + 1) % deck.length;
    render();
  }

  function prevCard() {
    maybeRecordUnresolvedFlip();
    index = (index - 1 + deck.length) % deck.length;
    render();
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
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playTone({ type, freqStart, freqEnd, duration, volume, when }) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const start = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, start);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function playFlipSound() {
    try { playTone({ type: "triangle", freqStart: 900, freqEnd: 250, duration: 0.13, volume: 0.18 }); } catch (_) {}
  }
  function playGotItSound() {
    try {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((f, i) => playTone({ type: "sine", freqStart: f, duration: 0.18, volume: 0.2, when: i * 0.07 }));
    } catch (_) {}
  }
  function playShuffleSound() {
    try { playTone({ type: "sawtooth", freqStart: 1100, freqEnd: 380, duration: 0.18, volume: 0.14 }); } catch (_) {}
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

  async function recordCorrect(cardKey) {
    if (!cardKey) return;
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
    if (!sb) return;
    try { await sb.from("progress").upsert(next); }
    catch (e) { console.warn("progress correct write failed:", e); }
  }

  async function recordWrong(cardKey) {
    if (!cardKey) return;
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
    if (!sb) return;
    try { await sb.from("progress").upsert(next); }
    catch (e) { console.warn("progress wrong write failed:", e); }
  }

  async function recordFlip(cardKey) {
    if (!cardKey) return;
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
    if (!sb) return;
    try { await sb.from("progress").upsert(next); }
    catch (e) { console.warn("progress flip write failed:", e); }
  }

  // Called when the user leaves a card. If they flipped it but didn't
  // confirm with "I got it!" or a successful mic check, count a flip.
  function maybeRecordUnresolvedFlip() {
    if (!flippedThisCard || gotItThisCard) return;
    const card = deck[index];
    if (card && card.hanzi) recordFlip(card.hanzi);
  }

  async function refreshProgress() {
    if (!sb) return;
    try {
      const { data } = await sb
        .from("progress")
        .select("card_key, seen, correct, wrong, flips, last_seen_at, last_correct_at");
      progressMap = {};
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
    maybeRecordUnresolvedFlip();
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

  els.next.addEventListener("click", nextCard);
  els.prev.addEventListener("click", prevCard);

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

    const rect = (originEl || els.score).getBoundingClientRect();
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

  function refillShuffleQueue(avoidFirst) {
    const idxs = [];
    for (let i = 0; i < deck.length; i++) idxs.push(i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    if (avoidFirst != null && idxs.length > 1 && idxs[0] === avoidFirst) {
      [idxs[0], idxs[1]] = [idxs[1], idxs[0]];
    }
    shuffleQueue = idxs;
  }

  function shuffleToRandomCard() {
    if (deck.length <= 1) return render();
    if (shuffleQueue.length === 0) refillShuffleQueue(index);
    index = shuffleQueue.shift();
    playShuffleSound();
    render();
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
  const MIC_IDLE_TEXT = "🎤 Try saying it";
  let micRecognition = null;
  let micListening = false;
  let micResetTimer = null;

  function setMicState(state, text) {
    if (micResetTimer) {
      clearTimeout(micResetTimer);
      micResetTimer = null;
    }
    els.mic.dataset.state = state;
    if (text !== undefined) els.mic.textContent = text;
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
    setMicState("unsupported", "🎤 not supported here");
  } else {
    els.mic.addEventListener("click", startListening);
  }
  els.shuffle.addEventListener("click", () => {
    shuffleArr(deck);
    index = 0;
    shuffleQueue = [];
    playShuffleSound();
    render();
  });

  document.addEventListener("keydown", (e) => {
    if (!deck.length) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "Escape" && els.rewardOverlay.classList.contains("show")) {
      dismissReward();
      return;
    }
    if (e.key === "ArrowRight") nextCard();
    else if (e.key === "ArrowLeft") prevCard();
    else if (e.key.toLowerCase() === "s") speak(deck[index].hanzi, els.speakFront);
    else if (e.key === " " && e.target !== els.card) {
      e.preventDefault();
      flip();
    }
  });

  loadDeck();
  preloadReward();
})();
