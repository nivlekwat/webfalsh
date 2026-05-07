(function () {
  const els = {
    loadingState: document.getElementById("loadingState"),
    emptyState: document.getElementById("emptyState"),
    errorState: document.getElementById("errorState"),
    studyContent: document.getElementById("studyContent"),
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
    shuffle: document.getElementById("shuffle"),
    ttsWarning: document.getElementById("ttsWarning"),
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
    els.imagePlaceholder.textContent = text;
    els.imagePlaceholder.classList.remove("hidden");
    els.cardImage.classList.remove("loaded");
    els.cardImage.removeAttribute("src");
  }

  function loadCardImage(card) {
    const myIndex = index;
    if (!card.image) {
      setPlaceholder("No picture");
      return;
    }
    setPlaceholder("Loading picture…");
    els.cardImage.alt = card.english || "";
    els.cardImage.onload = () => {
      if (myIndex !== index) return;
      els.cardImage.classList.add("loaded");
      els.imagePlaceholder.classList.add("hidden");
    };
    els.cardImage.onerror = () => {
      if (myIndex !== index) return;
      setPlaceholder("(picture failed to load)");
    };
    els.cardImage.src = card.image;
  }

  function render() {
    if (!deck.length) return;
    const card = deck[index];
    els.hanzi.textContent = card.hanzi || "";
    els.pinyin.textContent = card.pinyin || "";
    els.english.textContent = card.english || "";
    els.progress.textContent = `${index + 1} / ${deck.length}`;
    els.card.classList.remove("flipped");
    loadCardImage(card);
  }

  function flip() {
    els.card.classList.toggle("flipped");
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
  els.shuffle.addEventListener("click", () => {
    shuffleArr(deck);
    index = 0;
    render();
  });

  document.addEventListener("keydown", (e) => {
    if (!deck.length) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") nextCard();
    else if (e.key === "ArrowLeft") prevCard();
    else if (e.key.toLowerCase() === "s") speak(deck[index].hanzi, els.speakFront);
    else if (e.key === " " && e.target !== els.card) {
      e.preventDefault();
      flip();
    }
  });

  loadDeck();
})();
