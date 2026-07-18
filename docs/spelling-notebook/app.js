(() => {
  "use strict";

  const DATA = window.TOEFL_NOTEBOOK_DATA;
  const STORAGE_KEY = "toefl-spelling-notebook-progress-v1";
  const MAX_CONFIRMATIONS = 5;
  const GENERIC_TIP = "先判断词性，再锁定已给字母与缺失长度。";
  const FALLBACK_MEANINGS = Object.freeze({
    against: "反对；对抗", animal: "动物", around: "大约；在周围", away: "离开；远离", be: "是；存在",
    breaking: "分解；破坏", called: "被称为", carve: "雕刻；刻出", centimeter: "厘米", change: "改变；变化",
    climates: "气候（复数）", conditions: "条件；状况", engage: "参与；吸引", expression: "表达；表现",
    footprints: "足迹", frequency: "频率", galaxies: "星系（复数）", greatest: "最伟大的", hand: "手；交给",
    heated: "加热的", historical: "历史的", innovation: "创新", interactions: "互动；相互作用", leaving: "留下；离开",
    legs: "腿；支柱", longer: "更长的", meat: "肉", missions: "任务；使命", move: "移动；改变位置",
    multiple: "多个的", needed: "需要的", once: "一次；一旦", perspective: "视角；观点", pots: "锅；罐（复数）",
    producing: "生产；产生", protect: "保护", provide: "提供", reusable: "可重复使用的", shaped: "成形的；塑造的",
    simple: "简单的", stone: "石头", strategies: "策略（复数）", stretch: "拉伸；延伸", through: "通过；穿过",
    tools: "工具（复数）", weapons: "武器（复数）", what: "什么；所……的", which: "哪个；哪些", who: "谁；……的人"
  });

  if (!DATA || !Array.isArray(DATA.words)) {
    const errorBox = document.getElementById("app-error");
    errorBox.textContent = "词库没有成功载入。请确认 index.html、words.js 和 app.js 位于同一目录。";
    errorBox.hidden = false;
    return;
  }

  const byId = (id) => document.getElementById(id);
  const sourceMap = new Map(DATA.sources.map((source) => [source.id, source]));
  const wordMap = new Map(DATA.words.map((word) => [word.id, word]));
  const views = new Map([
    ["home", byId("home-view")],
    ["practice", byId("practice-view")],
    ["notebook", byId("notebook-view")],
    ["sources", byId("sources-view")]
  ]);

  let storageEnabled = true;
  let state = loadState();
  let activeSession = null;

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createDefaultState() {
    return {
      schema: 5,
      settings: { dailyGoal: DATA.dailyGoal || 20 },
      words: {},
      daily: {},
      reviewCycle: { phase: "first", seen: [] }
    };
  }

  function looksLikeLegacyCorrectionExit(progress, word) {
    if (!word || !Boolean(progress.mastered || progress.exitedAt)) return false;
    const lastAnswer = normalizeAnswer(progress.lastAnswer);
    if (!lastAnswer) return true;
    const accepted = [word.word, word.split && word.split[1]]
      .filter(Boolean)
      .map(normalizeAnswer);
    return !accepted.includes(lastAnswer);
  }

  function migrateProgress(progress = {}, word = null) {
    const wasExited = Boolean(progress.mastered || progress.exitedAt);
    const legacyCorrection = Boolean(progress.correctionPending)
      || (word?.kind === "error" && wasExited && looksLikeLegacyCorrectionExit(progress, word));
    return {
      attempts: Number(progress.attempts || 0),
      correct: Number(progress.correct || 0),
      wrong: Number(progress.wrong || 0),
      streak: Number(progress.streak || 0),
      practiceCorrect: Number(progress.practiceCorrect ?? progress.level ?? 0),
      practiceWrong: Number(progress.practiceWrong ?? progress.wrong ?? 0),
      lastSeen: progress.lastSeen || null,
      lastAnswer: progress.lastAnswer || "",
      exitedAt: progress.exitedAt || null,
      correctionPending: legacyCorrection,
      mastered: wasExited && !legacyCorrection,
      focusBatch: progress.focusBatch || null,
      focusPending: Boolean(word?.focusReview)
        && progress.focusBatch !== word.focusBatch
    };
  }

  function loadState() {
    const fallback = createDefaultState();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
        return fallback;
      }
      const parsed = JSON.parse(raw);
      const migratedWords = Object.fromEntries(
        Object.entries(parsed.words || {}).map(([id, progress]) => [id, migrateProgress(progress, wordMap.get(id))])
      );
      const migrated = {
        ...fallback,
        ...parsed,
        schema: 5,
        settings: { ...fallback.settings, ...(parsed.settings || {}) },
        words: migratedWords,
        daily: parsed.daily || {},
        reviewCycle: {
          phase: parsed.reviewCycle?.phase === "rolling" ? "rolling" : "first",
          seen: Array.isArray(parsed.reviewCycle?.seen) ? parsed.reviewCycle.seen : []
        }
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch (error) {
      storageEnabled = false;
      return fallback;
    }
  }

  function saveState() {
    if (!storageEnabled) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      storageEnabled = false;
      const errorBox = byId("app-error");
      errorBox.textContent = "当前浏览器阻止了本地保存；本次页面打开期间仍可练习，但关闭后进度可能丢失。";
      errorBox.hidden = false;
    }
  }

  function progressFor(wordId) {
    return state.words[wordId] || migrateProgress({}, wordMap.get(wordId));
  }

  function baseConfirmations(word) {
    if (word.kind !== "error") return 0;
    return Math.min(MAX_CONFIRMATIONS, Math.max(1, Number(word.historicalErrors || 0)));
  }

  function requiredConfirmations(word, progress = progressFor(word.id)) {
    if (word.focusReview && progress.focusPending) return 1;
    if (word.kind === "error") return progress.mastered && !progress.correctionPending ? 0 : 1;
    return Math.min(MAX_CONFIRMATIONS, baseConfirmations(word) + Number(progress.practiceWrong || 0));
  }

  function remainingConfirmations(word, progress = progressFor(word.id)) {
    if (word.focusReview && progress.focusPending) return 1;
    if (word.kind === "error") return progress.mastered && !progress.correctionPending ? 0 : 1;
    return Math.max(0, requiredConfirmations(word, progress) - Number(progress.practiceCorrect || 0));
  }

  function isRetired(word) {
    return remainingConfirmations(word) === 0;
  }

  function todayRecord() {
    const key = localDateKey();
    if (!state.daily[key]) state.daily[key] = { attempts: 0, correct: 0, unique: {} };
    return state.daily[key];
  }

  function recordAttempt(word, isCorrect, input, assisted) {
    const progress = { ...progressFor(word.id) };
    progress.attempts += 1;
    progress.lastSeen = new Date().toISOString();
    progress.lastAnswer = input;

    if (isCorrect) {
      progress.correct += 1;
      progress.streak += 1;
      if (!assisted) progress.practiceCorrect += 1;
      if (word.focusReview && !assisted) {
        progress.focusPending = false;
        progress.focusBatch = word.focusBatch || null;
      }
      if (word.kind === "error" && !assisted) {
        progress.mastered = true;
        progress.correctionPending = false;
      }
    } else {
      progress.wrong += 1;
      progress.practiceWrong += 1;
      progress.practiceCorrect = Math.max(0, progress.practiceCorrect - 1);
      progress.streak = 0;
      // A new wrong answer always reopens the word. This also repairs older
      // progress where a correction was mistakenly treated as mastery.
      progress.mastered = false;
      if (word.kind === "error") progress.correctionPending = true;
      if (word.focusReview) {
        progress.focusPending = true;
        progress.focusBatch = null;
      }
      progress.exitedAt = null;
    }

    progress.exitedAt = progress.mastered ? new Date().toISOString() : null;
    state.words[word.id] = progress;

    const daily = todayRecord();
    daily.attempts += 1;
    if (isCorrect) daily.correct += 1;
    daily.unique[word.id] = true;
    saveState();
    return progress;
  }

  function normalizeAnswer(value) {
    return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function meaningFor(word) {
    if (word.meaning && word.meaning !== "答题后查看中文语境") return word.meaning;
    return FALLBACK_MEANINGS[normalizeAnswer(word.word)] || "词义请结合当前句意理解";
  }

  function sentenceMeaning(word) {
    const source = sourceMap.get(word.sourceIds[0]);
    if (!source || !source.passage || !source.passageZh || !word.sentence) return "";
    const englishSentences = source.passage.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
    const englishIndex = englishSentences.findIndex((sentence) => (
      sentence.replace(/\s+/g, " ").trim() === word.sentence.replace(/\s+/g, " ").trim()
    ));
    if (englishIndex < 0) return "";
    const chineseSentences = source.passageZh.match(/[^。！？]+[。！？]?/g) || [];
    return (chineseSentences[englishIndex] || "").trim();
  }

  function memoryTipFor(word) {
    if (word.tip && word.tip !== GENERIC_TIP) return word.tip;
    const lower = normalizeAnswer(word.word);
    if (lower.endsWith("tion")) return "易错点：结尾是 -tion，注意不要漏掉 o。";
    if (lower.endsWith("sion")) return "易错点：结尾是 -sion，先记住 s 后面的 ion。";
    if (lower.endsWith("able")) return "易错点：结尾是 -able，a 后面接 b，不要写成 -ible。";
    if (lower.endsWith("ible")) return "易错点：结尾是 -ible，i 后面接 b。";
    if (lower.endsWith("ance")) return "易错点：结尾是 -ance，注意 a-n-c-e 的顺序。";
    if (lower.endsWith("ence")) return "易错点：结尾是 -ence，注意 e-n-c-e 的顺序。";
    if (lower.endsWith("ment")) return "记忆法：词根 + -ment 表示结果或状态，最后是 m-e-n-t。";
    if (lower.endsWith("ous")) return "易错点：结尾是 -ous，最后三个字母是 o-u-s。";
    if (lower.endsWith("ity")) return "易错点：结尾是 -ity，最后三个字母是 i-t-y。";
    if (lower.includes("ie")) return "易错点：留意 i/e 的顺序；先默写词根，再补后缀。";
    return "记忆法：把单词分成词根和后缀，结合当前句意默写；重点检查缺失字母的顺序。";
  }

  function sourceName(source) {
    if (!source) return "题源";
    if (source.origin && source.origin.startsWith("fm-")) return `T${source.testNumber} · Model ${source.model}-${source.modelOrder}`;
    return "截图补充";
  }

  function sourceLabel(word) {
    const labels = word.sourceIds.map((id) => sourceName(sourceMap.get(id))).filter(Boolean);
    if (labels.length <= 2) return labels.join(" / ");
    return `${labels.slice(0, 2).join(" / ")} +${labels.length - 2}`;
  }

  function kindLabel(word) {
    if (word.focusReview) return "重点复习";
    if (word.kind === "error") return "历史错词";
    if (word.kind === "fm-history") return "已做题";
    return "拓展生词";
  }

  function kindClass(word) {
    if (word.focusReview) return "pill-focus";
    if (word.kind === "error") return "pill-error";
    if (word.kind === "vocabulary") return "pill-vocab";
    return "";
  }

  function showView(name) {
    views.forEach((view, key) => { view.hidden = key !== name; });
    document.querySelectorAll(".nav-button").forEach((button) => {
      const selected = button.dataset.view === name;
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (name === "home") renderHome();
    if (name === "notebook") renderNotebook();
    if (name === "sources") renderSources();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function shuffle(values) {
    const items = [...values];
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  function markMastered(word) {
    const progress = {
      ...progressFor(word.id),
      mastered: true,
      correctionPending: false,
      exitedAt: new Date().toISOString()
    };
    state.words[word.id] = progress;
    saveState();
    return progress;
  }

  function restoreWord(wordId) {
    const word = wordMap.get(wordId);
    if (!word || (word.kind !== "error" && !word.focusReview)) return;
    state.words[word.id] = {
        ...progressFor(word.id),
        mastered: false,
        correctionPending: false,
        practiceCorrect: 0,
        focusPending: Boolean(word.focusReview),
        focusBatch: null,
        exitedAt: null
    };
    saveState();
    renderHome();
    renderNotebook();
  }

  function buildQueue(limit = state.settings.dailyGoal, onlyIds = null) {
    const allowedIds = onlyIds ? new Set(onlyIds) : null;
    const candidates = DATA.words.filter((word) => (
      (word.kind === "error" || word.focusReview) &&
      (!allowedIds || allowedIds.has(word.id)) &&
      !isRetired(word)
    ));
    const size = Math.max(1, Number(limit) || DATA.dailyGoal);
    if (allowedIds) return shuffle(candidates).slice(0, size);

    const cycle = state.reviewCycle || (state.reviewCycle = { phase: "first", seen: [] });
    const seen = new Set(Array.isArray(cycle.seen) ? cycle.seen : []);
    const unseen = candidates.filter((word) => !seen.has(word.id));
    if (unseen.length) {
      const focused = shuffle(unseen.filter((word) => word.focusReview));
      const regular = shuffle(unseen.filter((word) => !word.focusReview));
      return [...focused, ...regular].slice(0, size);
    }

    // The broad first pass is complete. From here, keep the most frequently
    // missed words at the front; mastered words are already excluded above.
    cycle.phase = "rolling";
    cycle.seen = [];
    saveState();
    return [...candidates]
      .sort((a, b) => {
        const focusRank = Number(Boolean(b.focusReview)) - Number(Boolean(a.focusReview));
        if (focusRank) return focusRank;
        const scoreA = Number(a.historicalErrors || 0) + Number(progressFor(a.id).practiceWrong || 0);
        const scoreB = Number(b.historicalErrors || 0) + Number(progressFor(b.id).practiceWrong || 0);
        return scoreB - scoreA || a.word.localeCompare(b.word, "en");
      })
      .slice(0, size);
  }

  function markCycleSeen(word) {
    if (!activeSession || activeSession.onlyIds || !state.reviewCycle || state.reviewCycle.phase !== "first") return;
    const seen = new Set(Array.isArray(state.reviewCycle.seen) ? state.reviewCycle.seen : []);
    if (seen.has(word.id)) return;
    seen.add(word.id);
    state.reviewCycle.seen = [...seen];
    saveState();
  }

  function focusWords() {
    const batch = DATA.focusBatch;
    return DATA.words.filter((word) => (
      word.focusReview && (!batch || word.focusBatch === batch)
    ));
  }

  function focusIds() {
    return focusWords().filter((word) => !isRetired(word)).map((word) => word.id);
  }

  function resetFocusQueue() {
    const focusPool = focusWords();
    focusPool.forEach((word) => {
      state.words[word.id] = {
        ...progressFor(word.id),
        mastered: false,
        correctionPending: false,
        practiceCorrect: 0,
        focusPending: true,
        focusBatch: null,
        exitedAt: null
      };
    });
    saveState();
    renderHome();
    renderNotebook();
    return focusPool.map((word) => word.id);
  }

  function errorFrequency(word) {
    return Number(progressFor(word.id).practiceWrong || 0);
  }

  function highFrequencyWords(limit = 80) {
    return DATA.words
      .filter((word) => errorFrequency(word) > 0)
      .sort((a, b) => errorFrequency(b) - errorFrequency(a)
        || a.word.localeCompare(b.word, "en"))
      .slice(0, limit);
  }

  function resetHighFrequencyQueue() {
    const queueWords = highFrequencyWords();
    queueWords.forEach((word) => {
      state.words[word.id] = {
        ...progressFor(word.id),
        mastered: false,
        correctionPending: false,
        practiceCorrect: 0,
        focusPending: Boolean(word.focusReview),
        focusBatch: null,
        exitedAt: null
      };
    });
    saveState();
    renderHome();
    renderNotebook();
    return queueWords.map((word) => word.id);
  }

  function renderHome() {
    const errors = DATA.words.filter((word) => word.kind === "error");
    const reviewable = DATA.words.filter((word) => word.kind === "error" || word.focusReview);
    const active = reviewable.filter((word) => !isRetired(word));
    const activeErrors = errors.filter((word) => !isRetired(word));
    const focusPool = focusWords();
    const activeFocus = focusPool.filter((word) => !isRetired(word));
    const retired = errors.length - activeErrors.length;
    const progressValues = Object.values(state.words);
    const attempts = progressValues.reduce((sum, item) => sum + Number(item.attempts || 0), 0);
    const correct = progressValues.reduce((sum, item) => sum + Number(item.correct || 0), 0);
    const daily = todayRecord();
    const reviewedToday = Object.keys(daily.unique).length;
    const goal = Number(state.settings.dailyGoal) || DATA.dailyGoal;
    const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0;

    byId("error-count").textContent = errors.length;
    byId("vocab-count").textContent = DATA.targetOccurrences;
    byId("accuracy").textContent = attempts ? `${accuracy}%` : "尚未开始";
    byId("mastered-count").textContent = `${retired}/${errors.length}`;
    byId("due-count").textContent = active.length ? `${active.length} 个待复习` : "已全部过完";
    byId("today-count").textContent = reviewedToday;
    byId("daily-goal").textContent = goal;
    byId("goal-select").value = String(goal);
    byId("today-progress").style.width = `${Math.min(100, (reviewedToday / goal) * 100)}%`;
    const focusButton = byId("start-focus");
    const focusLabel = `重点词（${focusPool.length}）`;
    focusButton.textContent = activeFocus.length
      ? `${focusLabel} · 待复习 ${activeFocus.length}/${focusPool.length}`
      : `${focusLabel} · 已过完`;
    focusButton.disabled = activeFocus.length === 0;
    const resetFocusButton = byId("reset-focus");
    resetFocusButton.textContent = `重新导入重点词（${focusPool.length}）`;
    resetFocusButton.disabled = focusPool.length === 0;
    const highFrequencyButton = byId("start-high-frequency");
    const highFrequencyCount = highFrequencyWords().length;
    highFrequencyButton.textContent = highFrequencyCount
      ? `网页错词（${highFrequencyCount}）·重新导入`
      : "网页错词（暂无记录）";
    highFrequencyButton.disabled = highFrequencyCount === 0;

    const weakWords = shuffle(active)
      .sort((a, b) => Number(Boolean(b.focusReview)) - Number(Boolean(a.focusReview)))
      .slice(0, 5);
    byId("weak-list").innerHTML = weakWords.length ? weakWords.map((word) => {
      const remaining = remainingConfirmations(word);
      const history = Number(word.historicalErrors || 0);
      const stateLabel = history ? `历史错 ${history} 次 · 本轮未过` : `本轮未过`;
      return `
        <li class="weak-item">
          <span>
            <span class="word-primary">${escapeHtml(word.word)}</span>
            <span class="muted small"> · ${escapeHtml(sourceLabel(word))}</span>
          </span>
          <span class="pill ${kindClass(word)}">${stateLabel}</span>
        </li>`;
    }).join("") : '<li class="empty-state">当前复习队列已经清空。</li>';

    const summary = [
      ["已完成阅读", `${DATA.completedTests} 套`],
      ["填词原文", `${DATA.rawSources} → ${DATA.completedSources} 篇`],
      ["题型覆盖", `M1 ${DATA.model1Sources} · M2 ${DATA.model2Sources}`]
    ];
    byId("source-summary").innerHTML = summary.map(([label, value]) => `
      <li class="source-mini-item"><span>${label}</span><strong>${value}</strong></li>`).join("");
  }

  function startSession(mode, onlyIds = null) {
    const queue = buildQueue(onlyIds ? onlyIds.length : state.settings.dailyGoal, onlyIds);
    const focusOnly = Boolean(
      onlyIds && onlyIds.length && onlyIds.every((id) => wordMap.get(id)?.focusReview)
    );
    activeSession = {
      mode,
      queue,
      index: 0,
      attempts: 0,
      correct: 0,
      assisted: false,
      answered: false,
      correctionPending: false,
      correctionAttempts: 0,
      answerWasCorrect: false,
      wrongIds: [],
      initialIds: uniqueIds(queue.map((word) => word.id)),
      onlyIds: Boolean(onlyIds),
      focusOnly
    };
    byId("session-summary").hidden = true;
    byId("practice-panel").hidden = false;
    showView("practice");
    renderQuestion();
  }

  function uniqueIds(values) {
    return [...new Set(values)];
  }

  function currentWord() {
    return activeSession ? activeSession.queue[activeSession.index] : null;
  }

  function maskedSentence(word, mode) {
    const sentence = escapeHtml(word.sentence);
    const regex = new RegExp(`\\b${escapeRegExp(escapeHtml(word.word))}\\b`, "i");
    const replacement = mode === "cloze"
      ? `<span class="masked-word" aria-label="${escapeHtml(word.split[0])} 加缺失字母">${escapeHtml(word.split[0])}${"_".repeat(word.split[1].length)}</span>`
      : `<span class="masked-word" aria-label="完整单词空格">${"_".repeat(Math.max(5, word.word.length))}</span>`;
    if (regex.test(sentence)) return sentence.replace(regex, replacement);
    return `${sentence}<br><span class="masked-word">${mode === "cloze" ? `${escapeHtml(word.split[0])}${"_".repeat(word.split[1].length)}` : "________"}</span>`;
  }

  function renderQuestion() {
    const word = currentWord();
    if (!word) {
      finishSession();
      return;
    }

    markCycleSeen(word);

    activeSession.answered = false;
    activeSession.assisted = false;
    activeSession.correctionPending = false;
    activeSession.correctionAttempts = 0;
    activeSession.answerWasCorrect = false;
    const pending = activeSession.queue.length - activeSession.index;
    const initialTotal = Math.max(1, activeSession.initialIds.length);
    const exited = activeSession.initialIds.filter((id) => {
      const item = wordMap.get(id);
      return item && isRetired(item);
    }).length;

    byId("session-progress-text").textContent = `已答 ${activeSession.attempts} 次 · 队列 ${pending}`;
    byId("session-progress").style.width = `${Math.min(100, (exited / initialTotal) * 100)}%`;
    byId("practice-mode-label").textContent = activeSession.mode === "cloze" ? "补全字母" : "整词拼写";
    byId("practice-source").textContent = sourceLabel(word);
    byId("practice-kind").textContent = kindLabel(word);
    byId("practice-kind").className = `pill ${kindClass(word)}`;
    byId("practice-title").textContent = activeSession.focusOnly
      ? "重点词 · 先根据英文语境完成拼写"
      : "先根据英文语境完成拼写";
    byId("practice-prompt").innerHTML = maskedSentence(word, activeSession.mode);
    byId("answer-label").textContent = activeSession.mode === "cloze"
      ? `填写 ${word.split[0]} 后缺失的 ${word.split[1].length} 个字母`
      : "拼写完整单词";

    const input = byId("answer-input");
    input.value = "";
    input.disabled = false;
    input.maxLength = activeSession.mode === "cloze" ? word.split[1].length : word.word.length;
    input.placeholder = activeSession.mode === "cloze" ? `${word.split[1].length} 个字母` : `${word.word.length} 个字母`;
    byId("check-answer").disabled = false;
    byId("check-answer").textContent = "核对答案";
    byId("hint-button").hidden = false;
    byId("hint-button").disabled = false;
    byId("feedback").hidden = true;
    byId("feedback").className = "feedback";
    byId("next-button").hidden = true;
    window.setTimeout(() => input.focus(), 0);
  }

  function expectedAnswer(word) {
    return activeSession.mode === "cloze" ? word.split[1] : word.word;
  }

  function handleAnswer(event) {
    event.preventDefault();
    if (!activeSession || activeSession.answered) return;
    const word = currentWord();
    const input = byId("answer-input");
    const userValue = input.value;
    const expected = expectedAnswer(word);
    const correct = normalizeAnswer(userValue) === normalizeAnswer(expected);
    if (activeSession.correctionPending) {
      if (!correct) {
        activeSession.correctionAttempts += 1;
        input.value = "";
        const feedback = byId("feedback");
        feedback.hidden = false;
        feedback.className = "feedback feedback-wrong";
        feedback.innerHTML = `
          <strong>再订正一次。</strong> 正确拼写是 <span class="answer-reveal">${escapeHtml(word.word)}</span>。<br>
          <span class="small">本次应填写：<strong>${escapeHtml(expected)}</strong>；订正正确后才进入下一词，订正失败时答案会一直保留。</span>`;
        input.focus();
        return;
      }

      activeSession.correctionPending = false;
      activeSession.answered = true;
      activeSession.answerWasCorrect = false;
      activeSession.queue.push(word);
      completeAnswer(word, progressFor(word.id));
      return;
    }

    activeSession.attempts += 1;
    activeSession.answerWasCorrect = correct;

    if (correct) {
      activeSession.correct += 1;
      const progress = recordAttempt(word, true, userValue, activeSession.assisted);
      activeSession.answered = true;
      completeAnswer(word, progress);
      return;
    }

    if (!activeSession.wrongIds.includes(word.id)) activeSession.wrongIds.push(word.id);
    recordAttempt(word, false, userValue, activeSession.assisted);

    activeSession.correctionPending = true;
    byId("practice-title").textContent = "先订正，再继续";
    byId("answer-label").textContent = activeSession.mode === "cloze"
      ? `订正：重新输入 ${expected.length} 个缺失字母`
      : "订正：重新输入完整单词";
    input.value = "";
    input.disabled = false;
    input.maxLength = expected.length;
    input.placeholder = `${expected.length} 个字母`;
    byId("check-answer").disabled = false;
    byId("check-answer").textContent = "提交订正";
    byId("hint-button").hidden = true;
    byId("hint-button").disabled = true;
    byId("next-button").hidden = true;

    const feedback = byId("feedback");
    feedback.hidden = false;
    feedback.className = "feedback feedback-wrong";
    feedback.innerHTML = `
      <strong>先订正一次。</strong> 正确拼写是 <span class="answer-reveal">${escapeHtml(word.word)}</span>。<br>
      <span class="small">请重新输入正确的${activeSession.mode === "cloze" ? "缺失字母" : "完整单词"}；订正正确后才显示中文和记忆提示。</span>`;
    input.focus();
    renderHome();
  }

  function completeAnswer(word, progress) {
    const input = byId("answer-input");
    input.disabled = true;
    byId("check-answer").disabled = true;
    byId("check-answer").textContent = "核对答案";
    byId("hint-button").disabled = true;

    const remaining = remainingConfirmations(word, progress);
    const feedback = byId("feedback");
    feedback.hidden = false;
    feedback.className = "feedback feedback-correct";
    const resultText = activeSession.answerWasCorrect
      ? `<strong>正确。</strong> <span class="answer-reveal">${escapeHtml(word.word)}</span>${activeSession.assisted ? "（用了提示，本次不计入退出次数）" : ""}`
      : `<strong>已订正。</strong> <span class="answer-reveal">${escapeHtml(word.word)}</span>`;
    const queueText = remaining > 0
      ? (activeSession.answerWasCorrect
        ? "本词会保留在待复习池；使用提示拼对不算独立掌握。"
        : "已完成订正；本词已滚动到本轮队尾，稍后还要独立拼写一次。")
      : "已退出当前复习队列；历史记录仍永久保留，需要时可从错题本恢复。";
    const sentenceZh = sentenceMeaning(word);
    const chineseContext = sentenceZh
      ? `<br><span class="small"><strong>句意：</strong>${escapeHtml(sentenceZh)}</span>`
      : "";
    feedback.innerHTML = `
      ${resultText}<br>
      <strong>词义：</strong>${escapeHtml(meaningFor(word))} · ${escapeHtml(word.part)}${chineseContext}<br>
      <span class="small"><strong>搭配：</strong>${escapeHtml(word.phrase)}<br><strong>记忆/易错点：</strong>${escapeHtml(memoryTipFor(word))}<br>${escapeHtml(queueText)}</span>`;

    const hasNext = activeSession.index + 1 < activeSession.queue.length;
    byId("next-button").textContent = hasNext ? "下一词" : "查看本轮结果";
    byId("next-button").hidden = false;
    byId("next-button").focus();
    renderHome();
  }

  function showHint() {
    if (!activeSession || activeSession.answered) return;
    const word = currentWord();
    const input = byId("answer-input");
    const expected = expectedAnswer(word);
    const current = normalizeAnswer(input.value);
    let keep = 0;
    while (keep < current.length && keep < expected.length && current[keep] === normalizeAnswer(expected)[keep]) keep += 1;
    const nextLength = Math.min(expected.length, Math.max(1, keep + 1));
    input.value = expected.slice(0, nextLength);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    activeSession.assisted = true;
    if (nextLength >= expected.length) byId("hint-button").disabled = true;
  }

  function nextQuestion() {
    if (!activeSession || !activeSession.answered) return;
    activeSession.index += 1;
    if (activeSession.index >= activeSession.queue.length) finishSession();
    else renderQuestion();
  }

  function finishSession() {
    if (!activeSession) return;
    byId("practice-panel").hidden = true;
    const summary = byId("session-summary");
    summary.hidden = false;
    const attempts = activeSession.attempts;
    const accuracy = attempts ? Math.round((activeSession.correct / attempts) * 100) : 0;
    const remainingPool = DATA.words.filter((word) => (
      (word.kind === "error" || word.focusReview) && !isRetired(word)
    )).length;
    const retryableIds = uniqueIds(activeSession.wrongIds).filter((id) => {
      const word = wordMap.get(id);
      return word && !isRetired(word);
    });
    byId("summary-score").textContent = attempts ? `${activeSession.correct} / ${attempts}` : "队列已清空";
    byId("summary-detail").textContent = attempts
      ? `本轮正确率 ${accuracy}%。${remainingPool ? `还有 ${remainingPool} 个未掌握复习词，下次会重新随机抽取。` : "当前复习词都已过完；历史记录仍保留在错题本。"}`
      : "当前没有需要复习的词。";
    byId("retry-wrong").hidden = retryableIds.length === 0;
    byId("retry-wrong").dataset.ids = JSON.stringify(retryableIds);
    byId("session-progress").style.width = "100%";
  }

  function speakWord(word) {
    if (!("speechSynthesis" in window)) {
      const errorBox = byId("app-error");
      errorBox.textContent = "当前浏览器不支持语音朗读。";
      errorBox.hidden = false;
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  function populateSourceFilter() {
    const select = byId("source-filter");
    if (select.options.length > 1) return;
    DATA.sources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = `${sourceName(source)} · ${source.title}`;
      select.append(option);
    });
  }

  function renderNotebook() {
    populateSourceFilter();
    const query = normalizeAnswer(byId("search-input").value);
    const kind = byId("kind-filter").value;
    const source = byId("source-filter").value;
    const words = DATA.words
      .filter((word) => kind === "all" || (kind === "focus" ? word.focusReview : word.kind === kind))
      .filter((word) => source === "all" || word.sourceIds.includes(source))
      .filter((word) => {
        if (!query) return true;
        const haystack = [word.word, meaningFor(word), word.phrase, memoryTipFor(word), word.userAnswer].join(" ").toLocaleLowerCase("en-US");
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const kindRank = { error: 0, "fm-history": 1, vocabulary: 2 };
        if (a.focusReview !== b.focusReview) return Number(Boolean(b.focusReview)) - Number(Boolean(a.focusReview));
        const rank = (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9);
        if (rank) return rank;
        const remaining = remainingConfirmations(b) - remainingConfirmations(a);
        return remaining || a.word.localeCompare(b.word, "en");
      });

    byId("notebook-count").textContent = `显示 ${words.length} / ${DATA.words.length} 个词`;
    const container = byId("word-list");
    if (!words.length) {
      container.innerHTML = '<div class="empty-state">没有找到匹配的词。</div>';
      return;
    }

    container.innerHTML = words.map((word) => {
      const remaining = remainingConfirmations(word);
      const historyCount = Number(word.historicalErrors || 0);
      const status = `<span class="pill ${kindClass(word)}">${escapeHtml(kindLabel(word))}${historyCount ? ` · ${historyCount} 次` : ""}</span>`;
      const errorNote = word.kind === "error"
        ? `<p class="error-note">历史错误写法：${escapeHtml(word.userAnswer || "空白")}</p>`
        : "";
      const focusNote = word.focusReview
        ? `<p class="focus-note">订正后仍不熟 · 已加入本批重点复习${word.focusInput ? ` · 你写过：${escapeHtml(word.focusInput)}` : ""}</p>
           <p class="sentence-note"><strong>原句：</strong>${escapeHtml(word.sentence)}</p>`
        : "";
      const queueNote = remaining > 0 ? "尚未掌握" : "已退出队列（记录保留）";
      const restoreButton = (word.kind === "error" || word.focusReview) && isRetired(word)
        ? `<button class="button button-small" type="button" data-restore="${escapeHtml(word.id)}">重新加入队列</button>`
        : "";
      return `
        <article class="word-card">
          <div class="word-card-head">
            <div>
              <h3>${escapeHtml(word.word)} <span class="muted small">${escapeHtml(word.part)}</span></h3>
              <p class="meaning">${escapeHtml(meaningFor(word))}</p>
            </div>
            ${status}
          </div>
          <p class="phrase">${escapeHtml(word.phrase)}</p>
          <p class="muted small">${escapeHtml(sourceLabel(word))}</p>
          ${errorNote}
          ${focusNote}
          <p class="tip-note">${escapeHtml(memoryTipFor(word))}</p>
          <div class="mastery-line">
            <span>${escapeHtml(queueNote)}</span>
            <button class="button button-small" type="button" data-speak="${escapeHtml(word.id)}">发音</button>
            ${restoreButton}
          </div>
        </article>`;
    }).join("");
  }

  function highlightPassage(source) {
    const terms = DATA.words
      .filter((word) => (word.kind === "error" || word.focusReview) && word.sourceIds.includes(source.id))
      .map((word) => word.word)
      .sort((a, b) => b.length - a.length);
    const escapedPassage = escapeHtml(source.passage);
    if (!terms.length) return escapedPassage;
    const regex = new RegExp(`\\b(${terms.map((term) => escapeRegExp(term)).join("|")})\\b`, "gi");
    return escapedPassage.replace(regex, '<span class="corrected-word">$1</span>');
  }

  function renderSources() {
    byId("issue-list").innerHTML = DATA.issues.map((issue) => {
      const source = sourceMap.get(issue.sourceId);
      return `
        <article class="issue-card">
          <span class="pill pill-warning">题源异常 · ${escapeHtml(sourceName(source))}</span>
          <h2>${escapeHtml(issue.title)}</h2>
          <div class="issue-compare">
            <div><span class="muted small">平台答案</span><br><span class="strike">${escapeHtml(issue.platformText)}</span></div>
            <div><span class="muted small">标准英语</span><br><span class="corrected">${escapeHtml(issue.correctedText)}</span></div>
          </div>
          <p>${escapeHtml(issue.explanation)}</p>
          <a href="${escapeHtml(issue.referenceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(issue.referenceLabel)}</a>
        </article>`;
    }).join("");

    byId("passage-list").innerHTML = DATA.sources.map((source) => {
      const count = DATA.words.filter((word) => (
        (word.kind === "error" || word.focusReview) && word.sourceIds.includes(source.id)
      )).length;
      const targetText = source.origin && source.origin.startsWith("fm-") ? `${source.targetCount} 个填词位` : "截图补充记录";
      return `
        <details>
          <summary>${escapeHtml(sourceName(source))} · ${escapeHtml(source.title)} <span class="muted small">${targetText} · ${count} 个复习词</span></summary>
          <div class="passage-body">${highlightPassage(source)}</div>
        </details>`;
    }).join("");
  }

  function exportProgress() {
    const payload = { exportedAt: new Date().toISOString(), dataVersion: DATA.version, progress: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `toefl-spelling-progress-${localDateKey()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importProgress(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || ""));
        const imported = payload && payload.progress;
        if (!imported || typeof imported !== "object" || !imported.words) {
          throw new Error("invalid progress file");
        }
        if (!window.confirm("导入会替换当前设备上的练习进度，确定继续吗？")) return;
        const fallback = createDefaultState();
        state = {
          ...fallback,
          ...imported,
          schema: 5,
          settings: { ...fallback.settings, ...(imported.settings || {}) },
          words: Object.fromEntries(
            Object.entries(imported.words || {}).map(([id, progress]) => [id, migrateProgress(progress, wordMap.get(id))])
          ),
          daily: imported.daily || {},
          reviewCycle: {
            phase: imported.reviewCycle?.phase === "rolling" ? "rolling" : "first",
            seen: Array.isArray(imported.reviewCycle?.seen) ? imported.reviewCycle.seen : []
          }
        };
        saveState();
        renderHome();
        renderNotebook();
        window.alert("学习进度已导入当前设备。");
      } catch (error) {
        window.alert("这个文件不是 TOEFL 拼写本导出的进度文件。");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  byId("start-cloze").addEventListener("click", () => startSession("cloze"));
  byId("start-spelling").addEventListener("click", () => startSession("spelling"));
  byId("start-focus").addEventListener("click", () => {
    const ids = focusIds();
    if (ids.length) startSession("cloze", ids);
  });
  byId("reset-focus").addEventListener("click", () => {
    const ids = resetFocusQueue();
    if (ids.length) startSession("cloze", ids);
  });
  byId("start-high-frequency").addEventListener("click", () => {
    const ids = resetHighFrequencyQueue();
    if (ids.length) startSession("cloze", ids);
  });
  byId("answer-form").addEventListener("submit", handleAnswer);
  byId("hint-button").addEventListener("click", showHint);
  byId("next-button").addEventListener("click", nextQuestion);
  byId("speak-button").addEventListener("click", () => {
    const word = currentWord();
    if (word) speakWord(word.word);
  });
  byId("quit-practice").addEventListener("click", () => {
    activeSession = null;
    showView("home");
  });
  byId("retry-wrong").addEventListener("click", (event) => {
    const ids = JSON.parse(event.currentTarget.dataset.ids || "[]");
    if (ids.length) startSession("cloze", ids);
  });
  byId("back-home").addEventListener("click", () => {
    activeSession = null;
    showView("home");
  });
  byId("goal-select").addEventListener("change", (event) => {
    state.settings.dailyGoal = Number(event.target.value);
    saveState();
    renderHome();
  });
  byId("search-input").addEventListener("input", renderNotebook);
  byId("kind-filter").addEventListener("change", renderNotebook);
  byId("source-filter").addEventListener("change", renderNotebook);
  byId("export-button").addEventListener("click", exportProgress);
  byId("import-progress").addEventListener("change", importProgress);
  byId("word-list").addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-restore]");
    if (restoreButton) {
      restoreWord(restoreButton.dataset.restore);
      return;
    }
    const button = event.target.closest("[data-speak]");
    if (!button) return;
    const word = wordMap.get(button.dataset.speak);
    if (word) speakWord(word.word);
  });

  if (!storageEnabled) {
    const errorBox = byId("app-error");
    errorBox.textContent = "当前浏览器阻止了本地保存；建议使用 Edge 或 Chrome 打开本页。";
    errorBox.hidden = false;
  }

  window.__TOEFL_NOTEBOOK_TEST__ = {
    data: DATA,
    progressFor,
    requiredConfirmations,
    remainingConfirmations,
    isRetired,
    recordAttempt,
    focusIds,
    resetFocusQueue,
    highFrequencyWords,
    resetHighFrequencyQueue,
    startSession,
    currentWord,
    getActiveSession: () => activeSession,
    getState: () => state
  };

  byId("data-version").textContent = `词库版本 ${DATA.version} · ${DATA.updatedAt}`;
  populateSourceFilter();
  renderHome();

  if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }, { once: true });
  }
})();
