(function () {
  const els = {
    category: document.getElementById("category"),
    shuffle: document.getElementById("shuffle"),
    progress: document.getElementById("progress"),
    card: document.getElementById("card"),
    cardImage: document.getElementById("cardImage"),
    imagePlaceholder: document.getElementById("imagePlaceholder"),
    hanzi: document.getElementById("hanzi"),
    pinyin: document.getElementById("pinyin"),
    english: document.getElementById("english"),
    speakFront: document.getElementById("speakFront"),
    speakBack: document.getElementById("speakBack"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    ttsWarning: document.getElementById("ttsWarning"),
  };

  let deck = [];
  let index = 0;
  let chineseVoice = null;

  // Cache of wikiTitle -> image URL (or null when no image was found).
  const imageCache = new Map();

  // Populate category dropdown.
  Object.keys(DECKS).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.category.appendChild(opt);
  });

  function loadDeck(name) {
    deck = DECKS[name].slice();
    index = 0;
    render();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- Image loading via Wikipedia REST API ---
  async function fetchImage(title) {
    if (imageCache.has(title)) return imageCache.get(title);
    const url =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(title);
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const src =
        (data.originalimage && data.originalimage.source) ||
        (data.thumbnail && data.thumbnail.source) ||
        null;
      imageCache.set(title, src);
      return src;
    } catch (e) {
      imageCache.set(title, null);
      return null;
    }
  }

  function setPlaceholder(text) {
    els.imagePlaceholder.textContent = text;
    els.imagePlaceholder.classList.remove("hidden");
    els.cardImage.classList.remove("loaded");
    els.cardImage.removeAttribute("src");
  }

  async function loadCardImage(card) {
    const myIndex = index; // guard against rapid navigation
    setPlaceholder("Loading picture…");
    const src = await fetchImage(card.wikiTitle || card.english);
    if (myIndex !== index) return; // user moved on
    if (!src) {
      setPlaceholder("(no picture available)");
      return;
    }
    els.cardImage.alt = card.english;
    els.cardImage.onload = () => {
      if (myIndex !== index) return;
      els.cardImage.classList.add("loaded");
      els.imagePlaceholder.classList.add("hidden");
    };
    els.cardImage.onerror = () => {
      if (myIndex !== index) return;
      setPlaceholder("(picture failed to load)");
    };
    els.cardImage.src = src;
  }

  function render() {
    if (!deck.length) return;
    const card = deck[index];
    els.hanzi.textContent = card.hanzi;
    els.pinyin.textContent = card.pinyin;
    els.english.textContent = card.english;
    els.progress.textContent = `${index + 1} / ${deck.length}`;
    els.card.classList.remove("flipped");
    loadCardImage(card);
  }

  function flip() {
    els.card.classList.toggle("flipped");
  }

  function next() {
    index = (index + 1) % deck.length;
    render();
  }

  function prev() {
    index = (index - 1 + deck.length) % deck.length;
    render();
  }

  // --- Web Speech API setup ---
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
    if (!chineseVoice && "speechSynthesis" in window) {
      els.ttsWarning.hidden = false;
    } else {
      els.ttsWarning.hidden = true;
    }
  }

  if ("speechSynthesis" in window) {
    refreshVoice();
    speechSynthesis.onvoiceschanged = refreshVoice;
  } else {
    els.ttsWarning.hidden = false;
  }

  function speak(text, btn) {
    if (!("speechSynthesis" in window)) return;
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

  // --- Event wiring ---
  els.category.addEventListener("change", (e) => loadDeck(e.target.value));

  els.shuffle.addEventListener("click", () => {
    shuffle(deck);
    index = 0;
    render();
  });

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
    speak(deck[index].hanzi, els.speakFront);
  });

  els.speakBack.addEventListener("click", (e) => {
    e.stopPropagation();
    speak(deck[index].hanzi, els.speakBack);
  });

  els.next.addEventListener("click", next);
  els.prev.addEventListener("click", prev);

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key.toLowerCase() === "s") speak(deck[index].hanzi, els.speakFront);
    else if (e.key === " " && e.target !== els.card) {
      e.preventDefault();
      flip();
    }
  });

  loadDeck(Object.keys(DECKS)[0]);
})();
