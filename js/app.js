// === VOCABULARY DATA ===
        // (will be populated from the original file)
        let vocabulary = {};
        
        // === STORAGE KEYS ===
        const STORAGE_KEY = 'flashcards_progress';
        const STREAK_KEY = 'flashcards_streak';
        const FRONT_LANG_KEY = 'flashcards_front_lang';
        const BACK_LANG_KEY = 'flashcards_back_lang';
        const MODE_KEY = 'flashcards_mode';
        
        // === STATE ===
        let progress = loadProgress();
        let currentCards = [];
        let currentIndex = 0;
        let correctCount = 0;
        let streak = 0;
        let missedCards = [];
        let isFlipped = false;
        
        let frontLang = localStorage.getItem(FRONT_LANG_KEY) || 'pt';
        let backLang = localStorage.getItem(BACK_LANG_KEY) || 'de';
        
        const langLabels = { pt: 'Português', de: 'Deutsch', en: 'English' };
        const langFlags = { pt: '🇵🇹', de: '🇩🇪', en: '🇬🇧' };
        const langVoiceCodes = { pt: 'pt-PT', de: 'de-DE', en: 'en-US' };
        
        // === TEXT-TO-SPEECH ===
        function speak(text, lang) {
            if (!('speechSynthesis' in window)) return;
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = langVoiceCodes[lang] || 'pt-PT';
            utterance.rate = 0.85;
            
            // Use user-selected voice, or auto-pick best available
            const selected = getSelectedVoice(lang);
            if (selected) {
                utterance.voice = selected;
            } else {
                const voices = speechSynthesis.getVoices();
                const langCode = utterance.lang;
                const candidates = voices.filter(v => v.lang.startsWith(langCode) || v.lang.startsWith(lang));
                const enhanced = candidates.find(v => /enhanced|premium/i.test(v.name));
                const nonCompact = candidates.find(v => !/compact/i.test(v.name));
                const match = enhanced || nonCompact || candidates[0];
                if (match) utterance.voice = match;
            }
            
            // Visual feedback
            const btn = document.querySelector('.speak-btn.speaking');
            if (btn) btn.classList.remove('speaking');
            
            utterance.onstart = () => {
                const activeBtn = isFlipped ? document.getElementById('backSpeak') : document.getElementById('frontSpeak');
                activeBtn.classList.add('speaking');
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
                // On back: speak the word in back language, then the PT example
                speak(getCardText(card, backLang), backLang);
                // Queue the example in Portuguese after
                setTimeout(() => {
                    if (card.example) speak(card.example, 'pt');
                }, 1500);
            }
        }
        
        // Voice preferences
        const voicePrefs = JSON.parse(localStorage.getItem('voicePrefs') || '{}');
        
        function saveVoicePref(lang, voiceName) {
            voicePrefs[lang] = voiceName;
            localStorage.setItem('voicePrefs', JSON.stringify(voicePrefs));
        }
        
        function populateVoiceSelects() {
            const voices = speechSynthesis.getVoices();
            const langMap = { pt: 'pt', de: 'de', en: 'en' };
            const selectMap = { pt: 'voicePT', de: 'voiceDE', en: 'voiceEN' };
            
            for (const [lang, prefix] of Object.entries(langMap)) {
                const select = document.getElementById(selectMap[lang]);
                if (!select) continue;
                const filtered = voices.filter(v => v.lang.startsWith(prefix));
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
            const voices = speechSynthesis.getVoices();
            return voices.find(v => v.name === voicePrefs[lang]) || null;
        }
        
        // Preload voices (some browsers load them async)
        if ('speechSynthesis' in window) {
            speechSynthesis.getVoices();
            speechSynthesis.onvoiceschanged = () => { speechSynthesis.getVoices(); populateVoiceSelects(); };
            setTimeout(populateVoiceSelects, 100);
        }
        
        // === PROGRESS ===
        function loadProgress() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            } catch { return {}; }
        }
        
        function saveProgress() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
                updateDayStreak();
            } catch (e) { console.error('Save failed', e); }
        }
        
        function updateDayStreak() {
            try {
                const data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}');
                const today = new Date().toDateString();
                
                if (data.lastPractice !== today) {
                    const yesterday = new Date(Date.now() - 86400000).toDateString();
                    data.days = data.lastPractice === yesterday ? (data.days || 0) + 1 : 1;
                    data.lastPractice = today;
                    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
                }
                
                document.getElementById('dayStreak').textContent = data.days || 0;
            } catch {}
        }
        
        function getWordKey(card) { return card.pt; }
        
        function getWordProgress(card) {
            const key = getWordKey(card);
            if (!progress[key]) progress[key] = { correct: 0, incorrect: 0, lastSeen: null };
            return progress[key];
        }
        
        function getMasteryLevel(card) {
            const p = getWordProgress(card);
            const total = p.correct + p.incorrect;
            if (total === 0) return { level: 'new', label: 'New', class: 'mastery-new' };
            const ratio = p.correct / total;
            if (p.correct >= 5 && ratio >= 0.8) return { level: 'mastered', label: '⭐', class: 'mastery-mastered' };
            if (p.correct >= 3 && ratio >= 0.6) return { level: 'familiar', label: '📘', class: 'mastery-familiar' };
            return { level: 'learning', label: '📖', class: 'mastery-learning' };
        }
        
        // === CARD HELPERS ===
        function getAllCards() {
            let all = [];
            for (let date in vocabulary) all = all.concat(vocabulary[date]);
            const seen = new Set();
            return all.filter(card => {
                if (seen.has(card.pt)) return false;
                seen.add(card.pt);
                return true;
            });
        }
        
        function getTodayCards() {
            const todayKey = new Date().toISOString().split('T')[0];
            return vocabulary[todayKey] || [];
        }
        
        function getWeakCards() {
            return getAllCards().sort((a, b) => {
                const pA = getWordProgress(a), pB = getWordProgress(b);
                return (pA.correct - pA.incorrect * 2) - (pB.correct - pB.incorrect * 2);
            });
        }
        
        function getCardText(card, lang) {
            if (lang === 'pt') return card.pt;
            if (lang === 'en') return card.en || card.de;
            return card.de;
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
            
            localStorage.setItem(FRONT_LANG_KEY, frontLang);
            localStorage.setItem(BACK_LANG_KEY, backLang);
            
            showCardContent();
        }
        
        function initLangSelectors() {
            document.getElementById('frontLangSelect').value = frontLang;
            document.getElementById('backLangSelect').value = backLang;
        }
        
        // === SETTINGS MODAL ===
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
        function showTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById('practiceTab').classList.toggle('hidden', tab !== 'practice');
            document.getElementById('wordsTab').classList.toggle('hidden', tab !== 'words');
            if (tab === 'words') renderWordList();
        }
        
        // === WORD LIST ===
        function renderWordList() {
            const html = getAllCards().map(card => {
                const mastery = getMasteryLevel(card);
                return `
                    <div class="word-item">
                        <div class="word-item-text">
                            <div class="word-item-pt">${langFlags.pt} ${card.pt}</div>
                            <div class="word-item-de">${langFlags.de} ${card.de}</div>
                            <div class="word-item-en">${langFlags.en} ${card.en || '-'}</div>
                        </div>
                        <span class="word-item-mastery ${mastery.class}">${mastery.label}</span>
                    </div>
                `;
            }).join('');
            document.getElementById('wordList').innerHTML = html;
        }
        
        // === QUIZ ===
        function loadDate() {
            const mode = document.getElementById('dateSelect').value;
            localStorage.setItem(MODE_KEY, mode);
            
            if (mode === 'today') {
                currentCards = getTodayCards();
                if (currentCards.length === 0) {
                    // No vocab for today, fall back to daily mix
                    currentCards = getAllCards().slice(0, 20);
                }
            } else if (mode === 'daily') {
                currentCards = getAllCards().slice(0, 20);
            } else if (mode === 'random10') {
                currentCards = shuffle([...getAllCards()]).slice(0, 10);
            } else if (mode === 'weak') {
                currentCards = getWeakCards().slice(0, 20);
            } else if (mode === 'all') {
                currentCards = [...getAllCards()];
            } else if (mode === 'manual') {
                currentCards = [...(vocabulary['manual'] || [])];
            } else {
                currentCards = [...(vocabulary[mode] || [])];
            }
            
            restartQuiz();
        }
        
        function shuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }
        
        function restartQuiz() {
            if (document.getElementById('shuffleMode').checked) shuffle(currentCards);
            
            currentIndex = 0;
            correctCount = 0;
            streak = 0;
            missedCards = [];
            isFlipped = false;
            
            document.getElementById('cardScreen').classList.remove('hidden');
            document.getElementById('completeScreen').classList.add('hidden');
            document.getElementById('reviewList').classList.add('hidden');
            
            updateStats();
            showCard();
        }
        
        function showCard() {
            if (currentIndex >= currentCards.length) { showComplete(); return; }
            document.getElementById('flashcard').classList.remove('flipped');
            isFlipped = false;
            showCardContent();
            updateStats();
        }
        
        function showCardContent() {
            if (currentIndex >= currentCards.length) return;
            
            const card = currentCards[currentIndex];
            const mastery = getMasteryLevel(card);
            
            const masteryEl = document.getElementById('frontMastery');
            masteryEl.textContent = mastery.label;
            masteryEl.className = 'card-mastery ' + mastery.class;
            
            document.getElementById('frontLang').textContent = langLabels[frontLang];
            document.getElementById('frontWord').textContent = getCardText(card, frontLang);
            document.getElementById('backLang').textContent = langLabels[backLang];
            document.getElementById('backWord').textContent = getCardText(card, backLang);
            document.getElementById('exampleText').textContent = card.example ? `"${card.example}"` : '';
            
            // Show example translation based on back language
            const exampleTrans = backLang === 'en' ? card.example_en : card.example_de;
            document.getElementById('exampleTranslation').textContent = exampleTrans ? `(${exampleTrans})` : '';
        }
        
        function flipCard() {
            document.getElementById('flashcard').classList.toggle('flipped');
            isFlipped = !isFlipped;
        }
        
        function markCard(known) {
            const card = currentCards[currentIndex];
            const p = getWordProgress(card);
            
            if (known) { correctCount++; streak++; p.correct++; }
            else { streak = 0; p.incorrect++; missedCards.push(card); }
            
            p.lastSeen = Date.now();
            saveProgress();
            updateGlobalStats();
            
            currentIndex++;
            document.getElementById('flashcard').classList.remove('flipped');
            isFlipped = false;
            
            setTimeout(() => { showCard(); }, 300);
        }
        
        function updateStats() {
            document.getElementById('progressLabel').textContent = `${currentIndex} / ${currentCards.length}`;
            document.getElementById('streakLabel').textContent = `🔥 ${streak}`;
            const pct = currentCards.length > 0 ? (currentIndex / currentCards.length) * 100 : 0;
            document.getElementById('progressFill').style.width = pct + '%';
        }
        
        function showComplete() {
            document.getElementById('cardScreen').classList.add('hidden');
            document.getElementById('completeScreen').classList.remove('hidden');
            
            const pct = Math.round((correctCount / currentCards.length) * 100);
            document.getElementById('finalScore').textContent = pct + '%';
            
            let msg = pct === 100 ? '🌟 Perfect!' : pct >= 80 ? '💪 Great!' : pct >= 60 ? '👍 Good!' : '📚 Keep going!';
            document.getElementById('finalMessage').textContent = msg;
            updateGlobalStats();
        }
        
        function reviewMissed() {
            const list = document.getElementById('reviewList');
            const items = document.getElementById('reviewItems');
            
            if (missedCards.length === 0) {
                items.innerHTML = '<p style="color:#4ade80">No missed words! 🎉</p>';
            } else {
                items.innerHTML = missedCards.map(card => `
                    <div class="review-item">
                        <strong>${langFlags.pt} ${card.pt}</strong><br>
                        <span style="color:#aaa">${langFlags.de} ${card.de}</span><br>
                        <span style="color:#aaa">${langFlags.en} ${card.en || '-'}</span><br>
                        <small style="color:#666">${card.example ? `"${card.example}"` : ''}</small>
                    </div>
                `).join('');
            }
            list.classList.toggle('hidden');
        }
        
        // === GLOBAL STATS ===
        function updateGlobalStats() {
            const all = getAllCards();
            const mastered = all.filter(c => getMasteryLevel(c).level === 'mastered').length;
            document.getElementById('totalMastered').textContent = mastered;
            document.getElementById('totalWords').textContent = all.length;
            
            try {
                const data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}');
                document.getElementById('dayStreak').textContent = data.days || 0;
            } catch {}
        }
        
        // === EXPORT/IMPORT ===
        function exportProgress() {
            const data = {
                progress,
                streak: JSON.parse(localStorage.getItem(STREAK_KEY) || '{}'),
                exportedAt: new Date().toISOString()
            };
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob(['\ufeff' + jsonStr], { type: 'application/json;charset=utf-8' });
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
                            if (!progress[key]) progress[key] = data.progress[key];
                            else {
                                progress[key].correct = Math.max(progress[key].correct || 0, data.progress[key].correct || 0);
                                progress[key].incorrect = Math.min(progress[key].incorrect || 0, data.progress[key].incorrect || 0);
                            }
                        }
                        saveProgress();
                        updateGlobalStats();
                        alert('Imported! 🎉');
                    }
                } catch (err) { alert('Error: ' + err.message); }
            };
            reader.readAsText(file);
            event.target.value = '';
        }
        
        function resetProgress() {
            if (confirm('Reset all progress? Cannot be undone!')) {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(STREAK_KEY);
                progress = {};
                updateGlobalStats();
                restartQuiz();
                toggleSettings();
            }
        }
        
        // === INIT ===
        async function init() {
            // Load vocabulary from JSON
            try {
                const response = await fetch('data/vocab.json');
                vocabulary = await response.json();
            } catch (e) {
                console.error('Failed to load vocabulary:', e);
                // Try cache
                try {
                    const cache = await caches.open('pt-vocab-v3');
                    const cached = await cache.match('data/vocab.json');
                    if (cached) vocabulary = await cached.json();
                } catch (e2) {
                    console.error('Cache fallback failed:', e2);
                }
            }
            
            initLangSelectors();
            updateGlobalStats();
            
            // Populate date selector with available dates
            const select = document.getElementById('dateSelect');
            const dates = Object.keys(vocabulary)
                .filter(k => k !== 'manual' && /^\d{4}-\d{2}-\d{2}$/.test(k))
                .sort((a, b) => b.localeCompare(a));
            
            dates.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = `📰 ${d}`;
                select.appendChild(opt);
            });
            
            // Default to today's vocab
            const todayKey = new Date().toISOString().split('T')[0];
            if (vocabulary[todayKey]) {
                select.value = 'today';
            }
            
            loadDate();
        }
        
        init();
        
        // Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/portuguese-flashcards/sw.js').catch(() => {});
        }
