const LEVELS = [
  {
    name: "Первое знакомство",
    style: "intro",
    title: "Первое знакомство",
    description: "Лёгкие вопросы, чтобы начать разговор и узнать человека без напряжения."
  },
  {
    name: "Сближение",
    style: "close",
    title: "Сближение",
    description: "Вопросы, которые помогают лучше понять характер, ценности и стиль мышления человека."
  },
  {
    name: "Глубокие смысловые вопросы",
    style: "deep",
    title: "Глубокие смысловые вопросы",
    description: "Вопросы для доверительной атмосферы, личных размышлений и более глубокого разговора."
  }
];

const STORAGE_KEYS = {
  sessionId: "sblizhenieSessionId",
  ratedQuestions: "sblizhenieRatedQuestions",
  shownQuestions: "sblizhenieShownQuestionsByLevel"
};

const screens = {
  home: document.querySelector("#home-screen"),
  rules: document.querySelector("#rules-screen"),
  levels: document.querySelector("#levels-screen"),
  question: document.querySelector("#question-screen"),
  finished: document.querySelector("#finished-screen")
};

const levelList = document.querySelector("#level-list");
const questionLevel = document.querySelector("#question-level");
const questionCounter = document.querySelector("#question-counter");
const questionText = document.querySelector("#question-text");
const ratingButtons = Array.from(document.querySelectorAll("[data-rating]"));
const ratingStatus = document.querySelector("#rating-status");
const retryButton = document.querySelector("#retry-rating");
const nextQuestionButton = document.querySelector("#next-question");
const restartLevelButton = document.querySelector("#restart-level");

let currentLevel = "";
let currentQuestion = null;
let pendingRatingPayload = null;
const memoryStorage = {};

// Здесь создаётся и сохраняется sessionId для текущего браузера.
const sessionId = getOrCreateSessionId();

renderLevelCards();
bindNavigation();
bindGameActions();

function renderLevelCards() {
  levelList.innerHTML = LEVELS.map((level, index) => `
    <button class="level-card" type="button" data-level="${level.name}" data-level-style="${level.style}">
      <span class="level-number">${index + 1}</span>
      <h3>${level.title}</h3>
      <p>${level.description}</p>
    </button>
  `).join("");
}

function bindNavigation() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-go]");

    if (!target) {
      return;
    }

    showScreen(target.dataset.go);
  });

  levelList.addEventListener("click", (event) => {
    const levelCard = event.target.closest("[data-level]");

    if (!levelCard) {
      return;
    }

    startLevel(levelCard.dataset.level);
  });
}

function bindGameActions() {
  ratingButtons.forEach((button) => {
    button.addEventListener("click", () => {
      rateCurrentQuestion(Number(button.dataset.rating));
    });
  });

  retryButton.addEventListener("click", () => {
    if (pendingRatingPayload) {
      sendRating(pendingRatingPayload);
    }
  });

  nextQuestionButton.addEventListener("click", () => {
    showNextQuestion();
  });

  restartLevelButton.addEventListener("click", () => {
    if (!currentLevel) {
      showScreen("levels");
      return;
    }

    resetShownQuestionsForLevel(currentLevel);
    startLevel(currentLevel);
  });
}

function showScreen(screenName) {
  if (!screens[screenName]) {
    return;
  }

  if (screenName !== "question") {
    document.body.removeAttribute("data-active-level");
  }

  Object.values(screens).forEach((screen) => screen.classList.remove("screen--active"));
  screens[screenName].classList.add("screen--active");
}

function startLevel(level) {
  currentLevel = level;
  showNextQuestion();
}

function showNextQuestion() {
  const nextQuestion = getRandomQuestion(currentLevel);

  if (!nextQuestion) {
    currentQuestion = null;
    showScreen("finished");
    return;
  }

  currentQuestion = nextQuestion;
  markQuestionAsShown(currentLevel, currentQuestion.id);
  renderQuestion();
  showScreen("question");
}

function renderQuestion() {
  const shown = getShownQuestionIds(currentLevel);
  const total = getQuestionsForLevel(currentLevel).length;

  document.body.dataset.activeLevel = getLevelStyle(currentLevel);
  questionLevel.textContent = currentLevel;
  questionCounter.textContent = `${shown.length} из ${total}`;
  questionText.textContent = currentQuestion.text;

  resetRatingState();

  if (getRatedQuestions().includes(currentQuestion.id)) {
    lockRatingButtons();
    setStatus("Вы уже оценили этот вопрос.", "error");
  }
}

function getRandomQuestion(level) {
  const questions = getQuestionsForLevel(level);
  const shownIds = getShownQuestionIds(level);
  const availableQuestions = questions.filter((question) => !shownIds.includes(question.id));

  if (availableQuestions.length === 0) {
    return null;
  }

  const previousQuestionId = shownIds[shownIds.length - 1];
  const withoutPrevious = availableQuestions.filter((question) => question.id !== previousQuestionId);
  const pool = withoutPrevious.length > 0 ? withoutPrevious : availableQuestions;
  const randomIndex = Math.floor(Math.random() * pool.length);

  return pool[randomIndex];
}

function getQuestionsForLevel(level) {
  return QUESTIONS.filter((question) => question.level === level);
}

function getLevelStyle(level) {
  const levelConfig = LEVELS.find((item) => item.name === level);
  return levelConfig ? levelConfig.style : "";
}

function rateCurrentQuestion(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return;
  }

  if (!currentQuestion || getRatedQuestions().includes(currentQuestion.id)) {
    lockRatingButtons();
    setStatus("Вы уже оценили этот вопрос.", "error");
    return;
  }

  const payload = {
    createdAt: new Date().toISOString(),
    sessionId,
    questionId: currentQuestion.id,
    level: currentQuestion.level,
    questionText: currentQuestion.text,
    rating
  };

  pendingRatingPayload = payload;
  selectRatingButton(rating);
  lockRatingButtons();
  sendRating(payload);
}

// Здесь настраивается отправка рейтинга в Google Apps Script.
async function sendRating(payload) {
  if (!isRatingsEndpointReady()) {
    setStatus("Не указан адрес для отправки оценок.", "error");
    retryButton.classList.add("is-hidden");
    return;
  }

  setStatus("Отправляем оценку...", "");
  retryButton.classList.add("is-hidden");

  try {
    await fetch(CONFIG.RATINGS_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    markQuestionAsRated(payload.questionId);
    setStatus("Спасибо за оценку!", "success");
    pendingRatingPayload = null;
  } catch (error) {
    setStatus("Оценка не отправлена. Проверьте интернет и попробуйте ещё раз.", "error");
    retryButton.classList.remove("is-hidden");
  }
}

function isRatingsEndpointReady() {
  return Boolean(
    CONFIG.RATINGS_ENDPOINT &&
      CONFIG.RATINGS_ENDPOINT !== "ВСТАВИТЬ_ССЫЛКУ_GOOGLE_APPS_SCRIPT_WEB_APP"
  );
}

function resetRatingState() {
  pendingRatingPayload = null;
  retryButton.classList.add("is-hidden");
  setStatus("", "");

  ratingButtons.forEach((button) => {
    button.disabled = false;
    button.classList.remove("is-selected");
  });
}

function selectRatingButton(rating) {
  ratingButtons.forEach((button) => {
    button.classList.toggle("is-selected", Number(button.dataset.rating) === rating);
  });
}

function lockRatingButtons() {
  ratingButtons.forEach((button) => {
    button.disabled = true;
  });
}

function setStatus(message, type) {
  ratingStatus.textContent = message;
  ratingStatus.classList.toggle("is-success", type === "success");
  ratingStatus.classList.toggle("is-error", type === "error");
}

function getOrCreateSessionId() {
  const savedSessionId = storageGetItem(STORAGE_KEYS.sessionId);

  if (savedSessionId) {
    return savedSessionId;
  }

  const newSessionId = `session_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  storageSetItem(STORAGE_KEYS.sessionId, newSessionId);
  return newSessionId;
}

// Здесь хранится список уже оценённых вопросов.
function getRatedQuestions() {
  const ratedQuestions = readJsonFromStorage(STORAGE_KEYS.ratedQuestions, []);
  return Array.isArray(ratedQuestions) ? getUniqueStrings(ratedQuestions) : [];
}

function markQuestionAsRated(questionId) {
  const ratedQuestions = getRatedQuestions();

  if (!ratedQuestions.includes(questionId)) {
    ratedQuestions.push(questionId);
    storageSetItem(STORAGE_KEYS.ratedQuestions, JSON.stringify(ratedQuestions));
  }
}

// Здесь хранится список уже показанных вопросов по каждому уровню.
function getShownQuestionsByLevel() {
  const shownQuestionsByLevel = readJsonFromStorage(STORAGE_KEYS.shownQuestions, {});

  if (!shownQuestionsByLevel || Array.isArray(shownQuestionsByLevel) || typeof shownQuestionsByLevel !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(shownQuestionsByLevel).map(([level, questionIds]) => [
      level,
      Array.isArray(questionIds) ? getUniqueStrings(questionIds) : []
    ])
  );
}

function getShownQuestionIds(level) {
  const validQuestionIds = getQuestionsForLevel(level).map((question) => question.id);
  const shownQuestionIds = getShownQuestionsByLevel()[level] || [];
  return shownQuestionIds.filter((questionId) => validQuestionIds.includes(questionId));
}

function markQuestionAsShown(level, questionId) {
  const shownQuestionsByLevel = getShownQuestionsByLevel();
  const shownForLevel = shownQuestionsByLevel[level] || [];

  if (!shownForLevel.includes(questionId)) {
    shownForLevel.push(questionId);
    shownQuestionsByLevel[level] = shownForLevel;
    storageSetItem(STORAGE_KEYS.shownQuestions, JSON.stringify(shownQuestionsByLevel));
  }
}

function resetShownQuestionsForLevel(level) {
  const shownQuestionsByLevel = getShownQuestionsByLevel();
  shownQuestionsByLevel[level] = [];
  storageSetItem(STORAGE_KEYS.shownQuestions, JSON.stringify(shownQuestionsByLevel));
}

function readJsonFromStorage(key, fallbackValue) {
  try {
    const value = storageGetItem(key);
    return value ? JSON.parse(value) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function storageGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return Object.prototype.hasOwnProperty.call(memoryStorage, key) ? memoryStorage[key] : null;
  }
}

function storageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    memoryStorage[key] = String(value);
  }
}

function getUniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string")));
}
