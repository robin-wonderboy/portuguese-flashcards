// === LEITNER BOX SPACED REPETITION SYSTEM ===
// Box 1: Review tomorrow (1 day)
// Box 2: Review in 3 days
// Box 3: Review in 1 week (7 days)
// Box 4: Review in 2 weeks (14 days)
// Box 5: Review in 1 month (30 days) — mastered

const BOX_INTERVALS = [0, 1, 3, 7, 14, 30]; // index = box number, 0 = unseen
const BOX_NAMES = ['', 'Box 1 · Daily', 'Box 2 · Every 3 days', 'Box 3 · Weekly', 'Box 4 · Bi-weekly', 'Box 5 · Monthly'];
const BOX_INTERVAL_LABELS = ['', 'Review tomorrow', 'Review in 3 days', 'Review in 1 week', 'Review in 2 weeks', 'Mastered · review in 1 month'];
const BOX_DOTS = ['', '🔴', '🟠', '🟡', '🟢', '🔵'];
const BOX_CSS_CLASSES = ['', 'box-1', 'box-2', 'box-3', 'box-4', 'box-5'];

// === STATE ===
let vocabulary = {};
let progress = loadProgress();
let currentCards = [];
let currentIndex = 0;
let correctCount = 0;
let streak = 0;
let isFlipped = false;
let frontLang = localStorage.getItem('flashcards_front_lang') || 'pt';
let backLang = localStorage.getItem('flashcards_back_lang') || 'de';
let newsVisible = false;
let newsData = null;

// Session tracking
let sessionMode = 'review'; // 'review' or 'learn'
let sessionPromoted = 0;
let sessionDemoted = 0;
let sessionStayed = 0;

const langLabels = { pt: 'Português', de: 'Deutsch', en: 'English' };
const langFlags = { pt: '🇵🇹', de: '🇩🇪', en: '🇬🇧' };
const langVoiceCodes = { pt: 'pt-PT', de: 'de-DE', en: 'en-US' };
const voicePrefs = JSON.parse(localStorage.getItem('voicePrefs') || '{}');

// === TEXT-TO-SPEECH ===

function speak(text, lang) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langVoiceCodes[lang] || 'pt-PT';
  utterance.rate = 0.85;

  const selected = getSelectedVoice(lang);
  if (selected) {
    utterance.voice = selected;
  } else {
    const voices = speechSynthesis.getVoices();
    const langCode = utterance.lang;
    const candidates = voices.filter(v => v.lang.startsWith(langCode) || v.lang.startsWith(lang));
    const enhanced = candidates.find(v => /enhanced|premium/i.test(v.name));
    const nonCompact = candidates.find(v => !/compact/i.test(v.name));
    if (enhanced || nonCompact || candidates[0]) utterance.voice = enhanced || nonCompact || candidates[0];
  }

  utterance.onstart = () => {
    const btn = isFlipped ? document.getElementById('backSpeak') : document.getElementById('frontSpeak');
    if (btn) btn.classList.add('speaking');
  };
  utterance.onend = () => {
    document.querySelectorAll('.speak-btn').forEach(b => b.classList.remove('speaking'));
  };

  speechSynthesis.speak(utterance);
}

function speakCurrent(side) {
  if (currentIndex >= currentCards.length) return;
  const card = currentCards[currentIndex];
  if (side === 'front') {
    speak(getCardText(card, frontLang), frontLang);
  } else {
    speak(getCardText(card, backLang), backLang);
    setTimeout(() => { if (card.example) speak(card.example, 'pt'); }, 1500);
  }
}

function saveVoicePref(lang, voiceName) {
  voicePrefs[lang] = voiceName;
  localStorage.setItem('voicePrefs', JSON.stringify(voicePrefs));
}

function populateVoiceSelects() {
  const voices = speechSynthesis.getVoices();
  const langs = { pt: 'voicePT', de: 'voiceDE', en: 'voiceEN' };

  for (const [lang, selectId] of Object.entries(langs)) {
    const select = document.getElementById(selectId);
    if (!select) continue;
    const filtered = voices.filter(v => v.lang.startsWith(lang));
    select.innerHTML = '<option value="">Auto (best available)</option>';
    filtered.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      if (voicePrefs[lang] === v.name) opt.selected = true;
      select.appendChild(opt);
    });
  }
}

function testVoice(lang) {
  const samples = { pt: 'Olá, como estás?', de: 'Hallo, wie geht es dir?', en: 'Hello, how are you?' };
  speak(samples[lang] || 'Hello', lang);
}

function getSelectedVoice(lang) {
  if (!voicePrefs[lang]) return null;
  return speechSynthesis.getVoices().find(v => v.name === voicePrefs[lang]) || null;
}

if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => { speechSynthesis.getVoices(); populateVoiceSelects(); };
  setTimeout(populateVoiceSelects, 100);
}

// === PROGRESS (with Leitner migration) ===

function loadProgress() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem('flashcards_progress') || '{}'); }
  catch { return {}; }

  // Migrate old format to Leitner format
  let migrated = false;
  for (const key in raw) {
    const p = raw[key];
    if (p.box === undefined) {
      // Old format: { correct, incorrect, lastSeen }
      const total = (p.correct || 0) + (p.incorrect || 0);
      const ratio = total > 0 ? (p.correct || 0) / total : 0;
      const correct = p.correct || 0;

      let box;
      if (total === 0) box = 1;
      else if (correct >= 12 && ratio >= 0.95) box = 5;
      else if (correct >= 8 && ratio >= 0.9) box = 4;
      else if (correct >= 5 && ratio >= 0.8) box = 3;
      else if (correct >= 3 && ratio >= 0.6) box = 2;
      else box = 1;

      p.box = box;

      // Compute nextReview from lastSeen
      let lastDate;
      if (p.lastSeen) {
        if (typeof p.lastSeen === 'number') {
          lastDate = new Date(p.lastSeen);
        } else {
          lastDate = new Date(p.lastSeen);
        }
      } else {
        lastDate = new Date();
      }
      const lastStr = lastDate.toISOString().split('T')[0];
      p.lastSeen = lastStr;
      p.nextReview = addDays(lastStr, BOX_INTERVALS[box]);

      if (!p.history) p.history = [];
      migrated = true;
    }
  }

  if (migrated) {
    try { localStorage.setItem('flashcards_progress', JSON.stringify(raw)); } catch {}
  }

  return raw;
}

function saveProgress() {
  try {
    localStorage.setItem('flashcards_progress', JSON.stringify(progress));
    updateDayStreak();
  } catch (e) { console.error('Save failed', e); }
}

function updateDayStreak() {
  try {
    const data = JSON.parse(localStorage.getItem('flashcards_streak') || '{}');
    const today = new Date().toDateString();
    if (data.lastPractice !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      data.days = data.lastPractice === yesterday ? (data.days || 0) + 1 : 1;
      data.lastPractice = today;
      localStorage.setItem('flashcards_streak', JSON.stringify(data));
    }
    document.getElementById('dayStreak').textContent = data.days || 0;
  } catch {}
}

function getWordKey(card) { return card.pt; }

function getWordProgress(card) {
  const key = getWordKey(card);
  if (!progress[key]) {
    progress[key] = {
      correct: 0,
      incorrect: 0,
      box: 0,
      nextReview: todayStr(),
      lastSeen: null,
      history: []
    };
  }
  return progress[key];
}

function getBox(card) {
  const p = getWordProgress(card);
  return p.box || 0;
}

// === DATE HELPERS ===

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date(todayStr() + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

// === CARD HELPERS ===

function getAllCards() {
  let all = [];
  for (const date in vocabulary) all = all.concat(vocabulary[date]);
  const seen = new Set();
  return all.filter(card => {
    if (seen.has(card.pt)) return false;
    seen.add(card.pt);
    return true;
  });
}

function getTodayCards() {
  const todayKey = todayStr();
  if (vocabulary[todayKey] && vocabulary[todayKey].length > 0) return vocabulary[todayKey];
  const dates = Object.keys(vocabulary).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (dates.length > 0) return vocabulary[dates[dates.length - 1]] || [];
  return [];
}

function getCardText(card, lang) {
  if (lang === 'pt') return card.pt;
  if (lang === 'en') return card.en || card.de;
  return card.de;
}

// === LEITNER REVIEW QUEUE ===

function getDueCards() {
  const today = todayStr();
  return getAllCards().filter(card => {
    const p = getWordProgress(card);
    if (p.box === 0) return false; // unseen
    if (!p.nextReview) return false;
    return p.nextReview <= today;
  }).sort((a, b) => {
    // Sort by box ascending (Box 1 first)
    return (getBox(a)) - (getBox(b));
  });
}

function getNewCards() {
  const todayCards = getTodayCards();
  return todayCards.filter(card => {
    const p = getWordProgress(card);
    return p.box === 0 || !progress[getWordKey(card)];
  });
}

function getBoxCounts() {
  const counts = [0, 0, 0, 0, 0, 0]; // index 0 = unseen, 1-5 = boxes
  const dueCounts = [0, 0, 0, 0, 0, 0];
  const today = todayStr();
  const all = getAllCards();

  for (const card of all) {
    const p = getWordProgress(card);
    const box = p.box || 0;
    counts[box]++;
    if (box > 0 && p.nextReview && p.nextReview <= today) {
      dueCounts[box]++;
    }
  }
  return { counts, dueCounts };
}

// === HOME SCREEN RENDERING ===

function renderHome() {
  const { counts, dueCounts } = getBoxCounts();
  const totalDue = dueCounts.slice(1).reduce((a, b) => a + b, 0);
  const newCards = getNewCards();

  // Due banner
  const banner = document.getElementById('dueBanner');
  if (totalDue > 0) {
    banner.classList.remove('hidden');
    document.getElementById('dueBannerCount').textContent = totalDue;
    const parts = [];
    for (let b = 1; b <= 5; b++) {
      if (dueCounts[b] > 0) parts.push(`${BOX_DOTS[b]} ${dueCounts[b]}`);
    }
    document.getElementById('dueBannerBreakdown').textContent = parts.join(' · ');
  } else {
    banner.classList.add('hidden');
  }

  // Box stack
  const stack = document.getElementById('boxStack');
  let html = '';
  for (let b = 1; b <= 5; b++) {
    const due = dueCounts[b];
    html += `
      <div class="box-row ${BOX_CSS_CLASSES[b]}" onclick="startReviewForBox(${b})">
        <div class="box-row-info">
          <div class="box-row-name">${BOX_DOTS[b]} ${BOX_NAMES[b]}</div>
          <div class="box-row-interval">${BOX_INTERVAL_LABELS[b]}</div>
        </div>
        <div class="box-row-right">
          <div class="box-row-count">${counts[b]}</div>
          <div class="box-row-due ${due === 0 ? 'zero' : ''}">${due > 0 ? due + ' due' : 'no due'}</div>
        </div>
      </div>
    `;
  }
  stack.innerHTML = html;

  // New words section
  const newSection = document.getElementById('newWordsSection');
  if (newCards.length > 0) {
    newSection.style.display = '';
    document.getElementById('newWordsCount').textContent = newCards.length;
    const todayCards = getTodayCards();
    const dates = Object.keys(vocabulary).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    const latestDate = dates.length > 0 ? dates[dates.length - 1] : todayStr();
    document.getElementById('newWordsDate').textContent = `from ${latestDate}`;
  } else {
    newSection.style.display = 'none';
  }

  // Action buttons
  document.getElementById('btnReviewCount').textContent = totalDue;
  document.getElementById('btnLearnCount').textContent = newCards.length;
  document.getElementById('btnStartReview').disabled = totalDue === 0;
  document.getElementById('btnLearnNew').disabled = newCards.length === 0;
}

function startReviewForBox(boxNum) {
  const today = todayStr();
  currentCards = getAllCards().filter(card => {
    const p = getWordProgress(card);
    return p.box === boxNum && p.nextReview && p.nextReview <= today;
  }).sort((a, b) => getBox(a) - getBox(b));

  if (currentCards.length === 0) return;

  sessionMode = 'review';
  startSession();
}

function startReviewSession() {
  currentCards = getDueCards();
  if (currentCards.length === 0) return;
  sessionMode = 'review';
  startSession();
}

function startLearnNewSession() {
  currentCards = getNewCards();
  if (currentCards.length === 0) return;
  sessionMode = 'learn';
  startSession();
}

function startSession() {
  if (document.getElementById('shuffleMode').checked) shuffle(currentCards);
  currentIndex = 0;
  correctCount = 0;
  streak = 0;
  sessionPromoted = 0;
  sessionDemoted = 0;
  sessionStayed = 0;
  isFlipped = false;

  document.getElementById('homeTab').classList.add('hidden');
  document.getElementById('completeScreen').classList.add('hidden');
  document.getElementById('reviewScreen').classList.remove('hidden');
  document.querySelector('.tabs').style.display = 'none';
  document.querySelector('.news-btn').style.display = 'none';

  showCard();
}

// === REVIEW LOGIC ===

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showCard() {
  if (currentIndex >= currentCards.length) { showComplete(); return; }

  const card = document.getElementById('flashcard');
  card.classList.remove('flipped', 'animate-correct', 'animate-wrong');
  isFlipped = false;
  showCardContent();
  updateStats();
  updateAnswerHint();
}

function showCardContent() {
  if (currentIndex >= currentCards.length) return;
  const card = currentCards[currentIndex];
  const box = getBox(card);
  const displayBox = box === 0 ? 1 : box; // New words show as Box 1

  // Box badge
  const badge = document.getElementById('frontBoxBadge');
  if (sessionMode === 'learn') {
    badge.textContent = '📖 New';
  } else {
    badge.textContent = `${BOX_DOTS[displayBox]} Box ${displayBox}`;
  }

  document.getElementById('frontLang').textContent = langLabels[frontLang];
  document.getElementById('frontWord').textContent = getCardText(card, frontLang);
  document.getElementById('backLang').textContent = langLabels[backLang];
  document.getElementById('backWord').textContent = getCardText(card, backLang);
  document.getElementById('exampleText').textContent = card.example ? `"${card.example}"` : '';

  const exampleTrans = backLang === 'en' ? card.example_en : card.example_de;
  document.getElementById('exampleTranslation').textContent = exampleTrans ? `(${exampleTrans})` : '';
}

function updateAnswerHint() {
  if (currentIndex >= currentCards.length) return;
  const card = currentCards[currentIndex];
  const box = getBox(card);

  const hint = document.getElementById('answerHint');
  if (sessionMode === 'learn') {
    hint.textContent = '✓ enters 🔴 Box 1 · ✗ stays new';
    return;
  }

  if (box === 5) {
    hint.textContent = '✓ stays in 🔵 Box 5 (mastered) · ✗ back to 🔴 Box 1';
  } else if (box === 1) {
    hint.textContent = `✓ promotes to ${BOX_DOTS[2]} Box 2 · ✗ stays in ${BOX_DOTS[1]} Box 1`;
  } else {
    const nextBox = box + 1;
    hint.textContent = `✓ promotes to ${BOX_DOTS[nextBox]} Box ${nextBox} · ✗ back to ${BOX_DOTS[1]} Box 1`;
  }
}

function flipCard() {
  document.getElementById('flashcard').classList.toggle('flipped');
  isFlipped = !isFlipped;
}

function markCard(known) {
  const card = currentCards[currentIndex];
  const p = getWordProgress(card);
  const oldBox = p.box || 0;
  const today = todayStr();

  // Track history
  if (!p.history) p.history = [];
  p.history.push({ date: today, result: known ? 'correct' : 'wrong', box: oldBox });

  if (known) {
    correctCount++;
    streak++;
    p.correct = (p.correct || 0) + 1;

    if (sessionMode === 'learn') {
      // New word enters Box 1
      p.box = 1;
      p.nextReview = addDays(today, BOX_INTERVALS[1]);
      sessionPromoted++; // entering the system counts as promoted
    } else if (oldBox === 5) {
      // Already mastered, stays in Box 5
      p.box = 5;
      p.nextReview = addDays(today, BOX_INTERVALS[5]);
      sessionStayed++;
    } else {
      // Promote to next box
      p.box = Math.min(oldBox + 1, 5);
      p.nextReview = addDays(today, BOX_INTERVALS[p.box]);
      if (p.box > oldBox) sessionPromoted++;
      else sessionStayed++;
    }
  } else {
    streak = 0;
    p.incorrect = (p.incorrect || 0) + 1;

    if (sessionMode === 'learn') {
      // Failed a new word — stays new (box 0)
      p.box = 0;
      p.nextReview = today; // due immediately
      // Don't count as demoted since it was never in a box
    } else {
      // Demote to Box 1
      if (oldBox === 1) {
        sessionStayed++; // already in box 1, stays
      } else {
        sessionDemoted++;
      }
      p.box = 1;
      p.nextReview = addDays(today, BOX_INTERVALS[1]);
    }
  }

  p.lastSeen = today;
  saveProgress();
  updateGlobalStats();

  // Animate the card out
  const cardEl = document.getElementById('flashcard');
  const rot = isFlipped ? '180deg' : '0deg';
  cardEl.style.setProperty('--rot', rot);
  cardEl.classList.add(known ? 'animate-correct' : 'animate-wrong');

  currentIndex++;
  setTimeout(() => {
    isFlipped = false;
    showCard();
  }, 400);
}

function updateStats() {
  document.getElementById('progressLabel').textContent = `${currentIndex} / ${currentCards.length}`;
  document.getElementById('streakLabel').textContent = `🔥 ${streak}`;
  const pct = currentCards.length > 0 ? (currentIndex / currentCards.length) * 100 : 0;
  document.getElementById('progressFill').style.width = pct + '%';
}

function showComplete() {
  document.getElementById('reviewScreen').classList.add('hidden');
  document.getElementById('completeScreen').classList.remove('hidden');

  document.getElementById('completeReviewed').textContent = currentCards.length;
  document.getElementById('completePromoted').textContent = sessionPromoted;
  document.getElementById('completeDemoted').textContent = sessionDemoted;
  document.getElementById('completeStayed').textContent = sessionStayed;

  // Next review info
  const { dueCounts } = getBoxCounts();
  const totalDue = dueCounts.slice(1).reduce((a, b) => a + b, 0);
  if (totalDue > 0) {
    document.getElementById('completeNext').textContent = `${totalDue} words still due for review`;
  } else {
    // Find next upcoming review
    let nextDate = null;
    for (const key in progress) {
      const p = progress[key];
      if (p.box > 0 && p.nextReview) {
        if (!nextDate || p.nextReview < nextDate) nextDate = p.nextReview;
      }
    }
    if (nextDate) {
      const days = daysUntil(nextDate);
      if (days <= 0) {
        document.getElementById('completeNext').textContent = 'All caught up! Review again tomorrow.';
      } else if (days === 1) {
        document.getElementById('completeNext').textContent = 'Next review in 1 day';
      } else {
        document.getElementById('completeNext').textContent = `Next review in ${days} days`;
      }
    } else {
      document.getElementById('completeNext').textContent = 'All caught up! 🎉';
    }
  }

  // Streak
  try {
    const data = JSON.parse(localStorage.getItem('flashcards_streak') || '{}');
    const days = data.days || 1;
    document.getElementById('completeStreak').textContent = `🔥 ${days} day streak — keep it going!`;
  } catch {
    document.getElementById('completeStreak').textContent = '';
  }
}

function exitReview() {
  backToBoxes();
}

function backToBoxes() {
  document.getElementById('reviewScreen').classList.add('hidden');
  document.getElementById('completeScreen').classList.add('hidden');
  document.getElementById('homeTab').classList.remove('hidden');
  document.querySelector('.tabs').style.display = '';
  if (newsData) document.getElementById('newsBtn').style.display = '';
  renderHome();
  updateGlobalStats();
}

// === LANGUAGE ===

function updateLangSelectors() {
  const front = document.getElementById('frontLangSelect').value;
  const back = document.getElementById('backLangSelect').value;

  if (front === back) {
    const other = ['pt', 'de', 'en'].find(l => l !== front);
    document.getElementById('backLangSelect').value = other;
  }

  frontLang = document.getElementById('frontLangSelect').value;
  backLang = document.getElementById('backLangSelect').value;
  localStorage.setItem('flashcards_front_lang', frontLang);
  localStorage.setItem('flashcards_back_lang', backLang);
  showCardContent();
}

function initLangSelectors() {
  document.getElementById('frontLangSelect').value = frontLang;
  document.getElementById('backLangSelect').value = backLang;
}

// === SETTINGS ===

function toggleSettings() {
  document.getElementById('settingsModal').classList.toggle('show');
  updateLastUpdateInfo();
}

function updateLastUpdateInfo() {
  const dates = Object.keys(vocabulary).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  const totalWords = Object.values(vocabulary).flat().length;
  const el = document.getElementById('lastUpdateInfo');
  if (dates.length > 0) {
    const latest = dates[dates.length - 1];
    const d = new Date(latest + 'T00:00:00');
    const formatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    el.textContent = `📡 Last update: ${formatted} · ${totalWords} words · ${dates.length} days`;
  } else {
    el.textContent = '📡 No vocabulary loaded';
  }
}

// === TABS ===

function showTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('homeTab').classList.toggle('hidden', tab !== 'home');
  document.getElementById('wordsTab').classList.toggle('hidden', tab !== 'words');
  if (tab === 'home') renderHome();
  if (tab === 'words') renderWordList();
}

// === WORD LIST ===

function renderWordList() {
  const html = getAllCards().map(card => {
    const box = getBox(card);
    const boxLabel = box === 0 ? 'New' : `${BOX_DOTS[box]} B${box}`;
    const boxClass = box === 0 ? 'box-0' : BOX_CSS_CLASSES[box];
    return `
      <div class="word-item">
        <div class="word-item-text">
          <div class="word-item-pt">${langFlags.pt} ${card.pt}</div>
          <div class="word-item-de">${langFlags.de} ${card.de}</div>
          <div class="word-item-en">${langFlags.en} ${card.en || '-'}</div>
        </div>
        <span class="word-item-box ${boxClass}">${boxLabel}</span>
      </div>
    `;
  }).join('');
  document.getElementById('wordList').innerHTML = html;
}

// === GLOBAL STATS ===

function updateGlobalStats() {
  const all = getAllCards();
  const { counts } = getBoxCounts();
  // Mastered = Box 5
  document.getElementById('totalMastered').textContent = counts[5];
  document.getElementById('totalWords').textContent = all.length;
  try {
    const data = JSON.parse(localStorage.getItem('flashcards_streak') || '{}');
    document.getElementById('dayStreak').textContent = data.days || 0;
  } catch {}
}

// === EXPORT/IMPORT ===

function exportProgress() {
  const data = {
    progress,
    streak: JSON.parse(localStorage.getItem('flashcards_streak') || '{}'),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob(['\ufeff' + JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `flashcards-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

function importProgress(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.progress) { alert('Invalid file'); return; }
      if (confirm('Import backup? This will merge with current progress.')) {
        for (const key in data.progress) {
          if (!progress[key]) {
            progress[key] = data.progress[key];
          } else {
            // Merge: take the higher box, keep correct/incorrect maxes
            progress[key].correct = Math.max(progress[key].correct || 0, data.progress[key].correct || 0);
            progress[key].incorrect = Math.max(progress[key].incorrect || 0, data.progress[key].incorrect || 0);
            const importBox = data.progress[key].box || 0;
            const localBox = progress[key].box || 0;
            progress[key].box = Math.max(importBox, localBox);
            // Take the later nextReview
            if (data.progress[key].nextReview && (!progress[key].nextReview || data.progress[key].nextReview > progress[key].nextReview)) {
              progress[key].nextReview = data.progress[key].nextReview;
            }
            if (data.progress[key].lastSeen && (!progress[key].lastSeen || data.progress[key].lastSeen > progress[key].lastSeen)) {
              progress[key].lastSeen = data.progress[key].lastSeen;
            }
            // Merge history
            const localHist = progress[key].history || [];
            const importHist = data.progress[key].history || [];
            progress[key].history = localHist.concat(importHist).slice(-50);
          }
        }
        saveProgress();
        updateGlobalStats();
        renderHome();
        alert('Imported! 🎉');
      }
    } catch (err) { alert('Error: ' + err.message); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function resetProgress() {
  if (confirm('Reset all progress? This will clear all box assignments and history!')) {
    localStorage.removeItem('flashcards_progress');
    localStorage.removeItem('flashcards_streak');
    progress = {};
    updateGlobalStats();
    renderHome();
    toggleSettings();
  }
}

// === NEWS READER ===

async function checkNewsForDate(dateStr) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    try {
      const response = await fetch(`data/news/${ds}.json`);
      if (response.ok) {
        newsData = await response.json();
        document.getElementById('newsBtn').classList.remove('hidden');
        return;
      }
    } catch {}
  }
  document.getElementById('newsBtn').classList.add('hidden');
  newsData = null;
}

function toggleNews() {
  newsVisible = !newsVisible;
  const container = document.getElementById('newsContainer');
  const btn = document.getElementById('newsBtn');

  if (newsVisible && newsData) {
    container.classList.remove('hidden');
    btn.classList.add('active');
    renderNews();
  } else {
    container.classList.add('hidden');
    btn.classList.remove('active');
    newsVisible = false;
  }
}

function renderNews() {
  if (!newsData || !newsData.sections) {
    document.getElementById('newsContent').innerHTML = '<div class="news-empty">No news available</div>';
    return;
  }

  const html = newsData.sections.map(section => {
    const storiesHtml = section.stories.map(story => `
      <div class="news-story">
        <div class="news-headline">• ${story.headline}</div>
        ${story.text ? `<div class="news-text">${story.text}</div>` : ''}
      </div>
    `).join('');

    return `
      <div class="news-section">
        <div class="news-category">${section.emoji || ''} ${section.category}</div>
        ${storiesHtml}
      </div>
    `;
  }).join('');

  const source = newsData.source ? `<div class="news-source">Fonte: ${newsData.source}</div>` : '';
  const dateHeader = newsData.date ? `<div class="news-date">📰 ${new Date(newsData.date + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>` : '';
  document.getElementById('newsContent').innerHTML = dateHeader + html + source;
}

// === INIT ===

async function init() {
  try {
    const response = await fetch('data/vocab.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    vocabulary = await response.json();
  } catch (e) {
    console.error('Failed to load vocabulary:', e);
    try {
      const cache = await caches.open('pt-vocab-v5');
      const cached = await cache.match('data/vocab.json');
      if (cached) vocabulary = await cached.json();
    } catch (e2) {
      console.error('Cache fallback failed:', e2);
    }
  }

  if (Object.keys(vocabulary).length === 0) {
    document.getElementById('frontWord').textContent = 'No vocabulary loaded';
    document.getElementById('frontWord').style.fontSize = '1rem';
    return;
  }

  initLangSelectors();
  updateGlobalStats();

  const today = todayStr();
  checkNewsForDate(today);

  renderHome();
}

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/portuguese-flashcards/sw.js').catch(() => {});
}