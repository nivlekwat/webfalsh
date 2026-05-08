(function () {
  const els = {
    loadingState: document.getElementById("loadingState"),
    emptyState: document.getElementById("emptyState"),
    errorState: document.getElementById("errorState"),
    studyContent: document.getElementById("studyContent"),
    progress: document.getElementById("progress"),
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
    rewardOverlay: document.getElementById("rewardOverlay"),
    rewardLoading: document.getElementById("rewardLoading"),
    rewardGif: document.getElementById("rewardGif"),
    rewardNext: document.getElementById("rewardNext"),
  };

  let deck = [];
  let index = 0;
  let chineseVoice = null;

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
      const titles =
        card.wikiTitles && card.wikiTitles.length
          ? card.wikiTitles
          : card.wikiTitle
          ? [card.wikiTitle]
          : [];
      if (titles.length) {
        const title = titles[Math.floor(Math.random() * titles.length)];
        src = await resolveWikiImage(title);
        if (myIndex !== index) return;
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
    els.progress.textContent = `${index + 1} / ${deck.length}`;
    els.card.classList.remove("flipped");
    loadCardImage(card);
    triggerBounce();
  }

  function flip() {
    els.card.classList.toggle("flipped");
    spawnConfetti(els.card);
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
    index = (index + 1) % deck.length;
    render();
  }

  function prevCard() {
    index = (index - 1 + deck.length) % deck.length;
    render();
  }

  // --- Web Speech API ---
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

  // --- Events ---
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

  // --- "I got it!" reward (random animal pic, multi-source + preload) ---
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
    const res = await fetch(
      "https://api.thecatapi.com/v1/images/search?mime_types=gif&limit=1"
    );
    if (!res.ok) throw new Error("thecatapi " + res.status);
    const data = await res.json();
    const url = data && data[0] && data[0].url;
    if (!url) throw new Error("thecatapi no url");
    return loadImageWithTimeout(url, 6000);
  }

  async function srcCataas() {
    const url =
      "https://cataas.com/cat/gif?width=480&t=" + Date.now() + Math.random();
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

  const REWARD_SOURCES = [srcCatApi, srcCataas, srcDog, srcShibe];

  async function fetchAnimalReward() {
    const order = REWARD_SOURCES.slice().sort(() => Math.random() - 0.5);
    for (const src of order) {
      try { return await src(); } catch (_) { /* try next */ }
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

  function showReward() {
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

  function shuffleToRandomCard() {
    if (deck.length <= 1) return render();
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * deck.length);
    } while (newIndex === index);
    index = newIndex;
    render();
  }

  function dismissReward() {
    if (!els.rewardOverlay.classList.contains("show")) return;
    els.rewardOverlay.classList.remove("show");
    shuffleToRandomCard();
  }

  els.gotIt.addEventListener("click", showReward);
  els.rewardOverlay.addEventListener("click", dismissReward);
  els.rewardNext.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissReward();
  });
  els.shuffle.addEventListener("click", () => {
    shuffleArr(deck);
    index = 0;
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
