(() => {
  "use strict";

  const DATA = window.TOEFL_NOTEBOOK_DATA;
  const STORAGE_KEY = "toefl-spelling-notebook-progress-v1";
  const MAX_CONFIRMATIONS = 5;

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
      schema: 2,
      settings: { dailyGoal: DATA.dailyGoal || 20 },
      words: {},
      daily: {}
    };
  }

  function migrateProgress(progress = {}) {
    return {
      attempts: Number(progress.attempts || 0),
      correct: Number(progress.correct || 0),
      wrong: Number(progress.wrong || 0),
      streak: Number(progress.streak || 0),
      practiceCorrect: Number(progress.practiceCorrect ?? progress.level ?? 0),
      practiceWrong: Number(progress.practiceWrong ?? progress.wrong ?? 0),
      lastSeen: progress.lastSeen || null,
      lastAnswer: progress.lastAnswer || "",
      exitedAt: progress.exitedAt || null
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
        Object.entries(parsed.words || {}).map(([id, progress]) => [id, migrateProgress(progress)])
      );
      const migrated = {
        ...fallback,
        ...parsed,
        schema: 2,
        settings: { ...fallback.settings, ...(parsed.settings || {}) },
        words: migratedWords,
        daily: parsed.daily || {}
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
    return state.words[wordId] || migrateProgress();
  }

  function baseConfirmations(word) {
    if (word.kind !== "error") return 0;
    return Math.min(MAX_CONFIRMATIONS, Math.max(1, Number(word.historicalErrors || 0)));
  }

  function requiredConfirmations(word, progress = progressFor(word.id)) {
    return Math.min(MAX_CONFIRMATIONS, baseConfirmations(word) + Number(progress.practiceWrong || 0));
  }

  function remainingConfirmations(word, progress = progressFor(word.id)) {
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
    } else {
      progress.wrong += 1;
      progress.practiceWrong += 1;
      progress.practiceCorrect = Math.max(0, progress.practiceCorrect - 1);
      progress.streak = 0;
    }

    progress.exitedAt = remainingConfirmations(word, progress) === 0 ? new Date().toISOString() : null;
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
    if (word.kind === "error") return "历史错词";
    if (word.kind === "fm-history") return "飞马已做题";
    return "拓展生词";
  }

  function kindClass(word) {
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

  function wordSortScore(word) {
    const progress = progressFor(word.id);
    const reviewedToday = Boolean(todayRecord().unique[word.id]);
    return [
      reviewedToday ? 1 : 0,
      word.kind === "error" ? 0 : word.kind === "fm-history" ? 1 : 2,
      -Number(word.historicalErrors || 0),
      -Number(progress.practiceWrong || 0),
      -remainingConfirmations(word, progress),
      Number(progress.attempts || 0),
      normalizeAnswer(word.word)
    ];
  }

  function compareScores(a, b) {
    const scoreA = wordSortScore(a);
    const scoreB = wordSortScore(b);
    for (let index = 0; index < scoreA.length; index += 1) {
      if (scoreA[index] < scoreB[index]) return -1;
      if (scoreA[index] > scoreB[index]) return 1;
    }
    return 0;
  }

  function buildQueue(limit = state.settings.dailyGoal, onlyIds = null) {
    const allowedIds = onlyIds ? new Set(onlyIds) : null;
    return DATA.words
      .filter((word) => (!allowedIds || allowedIds.has(word.id)) && remainingConfirmations(word) > 0)
      .sort(compareScores)
      .slice(0, Math.max(1, Number(limit) || DATA.dailyGoal));
  }

  function renderHome() {
    const errors = DATA.words.filter((word) => word.kind === "error");
    const active = DATA.words.filter((word) => remainingConfirmations(word) > 0);
    const retired = errors.length - active.length;
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
    byId("due-count").textContent = `${active.length} 个在队列`;
    byId("today-count").textContent = reviewedToday;
    byId("daily-goal").textContent = goal;
    byId("goal-select").value = String(goal);
    byId("today-progress").style.width = `${Math.min(100, (reviewedToday / goal) * 100)}%`;

    const weakWords = [...active].sort(compareScores).slice(0, 5);
    byId("weak-list").innerHTML = weakWords.length ? weakWords.map((word) => {
      const remaining = remainingConfirmations(word);
      const history = Number(word.historicalErrors || 0);
      const stateLabel = history ? `历史错 ${history} 次 · 还需 ${remaining} 次` : `还需正确 ${remaining} 次`;
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
      initialIds: uniqueIds(queue.map((word) => word.id))
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
    byId("practice-title").textContent = "先根据英文语境完成拼写";
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
        feedback.innerHTML = `<strong>再订正一次。</strong> 请按上面显示的正确拼写重新输入；订正正确后才能进入下一词。`;
        input.focus();
        return;
      }

      activeSession.correctionPending = false;
      activeSession.answered = true;
      activeSession.answerWasCorrect = false;
      completeAnswer(word, progressFor(word.id));
      return;
    }

    activeSession.attempts += 1;
    activeSession.answerWasCorrect = correct;

    if (correct) {
      activeSession.correct += 1;
      const progress = recordAttempt(word, true, userValue, activeSession.assisted);
      if (remainingConfirmations(word, progress) > 0) activeSession.queue.push(word);
      activeSession.answered = true;
      completeAnswer(word, progress);
      return;
    }

    if (!activeSession.wrongIds.includes(word.id)) activeSession.wrongIds.push(word.id);
    const progress = recordAttempt(word, false, userValue, activeSession.assisted);
    if (remainingConfirmations(word, progress) > 0) activeSession.queue.push(word);

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
      ? `还需独立拼对 ${remaining} 次；本词已滚动到队尾。`
      : `已退出当前复习队列；${word.kind === "error" ? "历史错词记录仍永久保留。" : "以后答错时会重新增加巩固次数。"}`;
    const source = sourceMap.get(word.sourceIds[0]);
    const chineseContext = word.meaning === "答题后查看中文语境" && source && source.passageZh
      ? `<br><span class="small"><strong>中文语境：</strong>${escapeHtml(source.passageZh)}</span>`
      : "";
    feedback.innerHTML = `
      ${resultText}<br>
      <strong>${escapeHtml(word.meaning)}</strong> · ${escapeHtml(word.part)}<br>
      <span class="small">${escapeHtml(word.phrase)}<br>${escapeHtml(word.tip)}<br>${escapeHtml(queueText)}</span>${chineseContext}`;

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
    const stillActive = activeSession.initialIds.filter((id) => {
      const word = wordMap.get(id);
      return word && !isRetired(word);
    }).length;
    byId("summary-score").textContent = attempts ? `${activeSession.correct} / ${attempts}` : "队列已清空";
    byId("summary-detail").textContent = attempts
      ? `本轮正确率 ${accuracy}%。${stillActive ? `还有 ${stillActive} 个词未退出，可继续练习。` : "本轮词已全部退出队列；历史错词仍保留在错题本。"}`
      : "当前没有需要复习的词。";
    byId("retry-wrong").hidden = true;
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
      .filter((word) => kind === "all" || word.kind === kind)
      .filter((word) => source === "all" || word.sourceIds.includes(source))
      .filter((word) => {
        if (!query) return true;
        const haystack = [word.word, word.meaning, word.phrase, word.tip, word.userAnswer].join(" ").toLocaleLowerCase("en-US");
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const kindRank = { error: 0, "fm-history": 1, vocabulary: 2 };
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
      const queueNote = remaining > 0 ? `还需独立拼对 ${remaining} 次` : "已退出队列（记录保留）";
      return `
        <article class="word-card">
          <div class="word-card-head">
            <div>
              <h3>${escapeHtml(word.word)} <span class="muted small">${escapeHtml(word.part)}</span></h3>
              <p class="meaning">${escapeHtml(word.meaning)}</p>
            </div>
            ${status}
          </div>
          <p class="phrase">${escapeHtml(word.phrase)}</p>
          <p class="muted small">${escapeHtml(sourceLabel(word))}</p>
          ${errorNote}
          <p class="tip-note">${escapeHtml(word.tip)}</p>
          <div class="mastery-line">
            <span>${escapeHtml(queueNote)}</span>
            <button class="button button-small" type="button" data-speak="${escapeHtml(word.id)}">发音</button>
          </div>
        </article>`;
    }).join("");
  }

  function highlightPassage(source) {
    const terms = DATA.words
      .filter((word) => word.kind === "error" && word.sourceIds.includes(source.id))
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
      const count = DATA.words.filter((word) => word.kind === "error" && word.sourceIds.includes(source.id)).length;
      const targetText = source.origin && source.origin.startsWith("fm-") ? `${source.targetCount} 个填词位` : "截图补充记录";
      return `
        <details>
          <summary>${escapeHtml(sourceName(source))} · ${escapeHtml(source.title)} <span class="muted small">${targetText} · ${count} 个历史错词</span></summary>
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
          schema: 2,
          settings: { ...fallback.settings, ...(imported.settings || {}) },
          words: Object.fromEntries(
            Object.entries(imported.words || {}).map(([id, progress]) => [id, migrateProgress(progress)])
          ),
          daily: imported.daily || {}
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
  byId("retry-wrong").addEventListener("click", () => {});
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
