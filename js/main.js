import { initHaptic, triggerHaptic, triggerHapticError } from "./haptic.js";

initHaptic();

let props = {};

const ui = {
  helpTitle: document.querySelector("#help-title"),
};

async function fetchSelfManifest() {
  try {
    const response = await fetch("./manifest.json");
    if (response.ok) {
      let loadedManifest = await response.text();
      let version = JSON.parse(loadedManifest).version;
      props.version = version;
      ui.helpTitle.innerHTML = ui.helpTitle.innerHTML.replace(
        "{{version}}",
        version,
      );
      console.log("Version fetched.");
    } else {
      console.warn("Failed to fetch manifest", response.statusText);
    }
  } catch (error) {
    console.error("Error fetching manifest: ", error);
  }
}

fetchSelfManifest();

document.addEventListener("DOMContentLoaded", () => {
  const helpBtn = document.getElementById("help-btn");
  const helpModal = document.getElementById("help-modal");
  const modalCloseBtn = helpModal.querySelector(".modal-close-btn");
  const loaderEl = document.getElementById("loader");
  const quizContainerEl = document.getElementById("quiz-container");
  const datasetSourceEl = document.getElementById("dataset-source");
  const questionStemEl = document.getElementById("question-stem");
  const choicesContainerEl = document.getElementById("choices-container");
  const restartBtn = document.getElementById("restart-btn");
  const skipBtn = document.getElementById("skip-btn");
  const scoreCorrectEl = document.getElementById("score-correct");
  const scoreIncorrectEl = document.getElementById("score-incorrect");
  const scoreSkippedEl = document.getElementById("score-skipped");

  let allQuestions = [],
    currentCorrectAnswerIndex = -1,
    scoreCorrect = 0,
    scoreIncorrect = 0,
    scoreSkipped = 0;

  const FADE_DURATION_MS = 400; // Must match --fade-duration in CSS
  const POST_INCORRECT_ANSWER_DELAY_MS = 2000; // Time to see the result before advancing
  const POST_CORRECT_ANSWER_DELAY_MS = 500; // Reduced time for correct answers

  const datasetMapping = {
    scan: "scan",
    trex: "t_rex_relational_similarity",
    conceptnet: "conceptnet_relational_similarity",
    bats: "bats",
    nell: "nell_relational_similarity",
    google: "google",
    u4: "u4",
    sat: "sat",
    u2: "u2",
    sat_metaphor: "sat_metaphor",
    semeval: "semeval2012_relational_similarity",
  };
  const fetchAndParseJsonl = async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(
          `${url} was missing. This could be ok, some of the folders don't have test.jsonl files`,
        );
        return null;
      }
      const text = await response.text();
      return text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    } catch (error) {
      return null;
    }
  };
  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  };
  const updateScoreDisplay = () => {
    scoreCorrectEl.textContent = scoreCorrect;
    scoreIncorrectEl.textContent = scoreIncorrect;
    scoreSkippedEl.textContent = scoreSkipped;
  };

  const loadAllData = async () => {
    let loadedQuestions = [];
    const promises = Object.entries(datasetMapping).map(
      async ([shortName, longName]) => {
        const [testData, validData] = await Promise.all([
          fetchAndParseJsonl(`./data/${longName}/test.jsonl`),
          fetchAndParseJsonl(`./data/${longName}/valid.jsonl`),
        ]);
        return { shortName, test: testData, valid: validData };
      },
    );
    const results = await Promise.all(promises);
    results.forEach(({ shortName, test, valid }) => {
      const addSource = (q) => ({ ...q, source: shortName });
      if (test) loadedQuestions.push(...test.map(addSource));
      if (valid) loadedQuestions.push(...valid.map(addSource));
    });
    allQuestions = loadedQuestions.filter(
      (q) => q && q.choice && q.choice.length >= 4,
    );
    if (allQuestions.length > 0) {
      loaderEl.style.display = "none";
      quizContainerEl.style.display = "block";
      displayRandomQuestion();
    } else {
      loaderEl.textContent = "Could not find any valid questions.";
    }
  };

  const displayRandomQuestion = () => {
    choicesContainerEl.innerHTML = "";
    skipBtn.disabled = false;

    const questionData =
      allQuestions[Math.floor(Math.random() * allQuestions.length)];
    const correctAnswer = questionData.choice[questionData.answer];
    const incorrectChoices = questionData.choice.filter(
      (_, index) => index !== questionData.answer,
    );
    shuffleArray(incorrectChoices);
    const finalChoices = [correctAnswer, ...incorrectChoices.slice(0, 3)];
    shuffleArray(finalChoices);
    currentCorrectAnswerIndex = finalChoices.findIndex(
      (c) => c === correctAnswer,
    );

    datasetSourceEl.textContent = `from: ${questionData.source}`;
    questionStemEl.innerHTML = `<span class="item-A">${questionData.stem[0]}</span> is to <span class="item-B">${questionData.stem[1]}</span> as`;

    finalChoices.forEach((choicePair, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "choice-wrapper";
      const button = document.createElement("button");
      button.className = "choice-btn";
      button.dataset.index = index;
      button.innerHTML = `<span class="choice-prefix">${String.fromCharCode(
        65 + index,
      )}:</span> <span class="item-C">${choicePair[0]}</span> is to <span class="item-D">${choicePair[1]}</span>`;
      wrapper.appendChild(button);
      wrapper.onclick = handleChoiceSelection;
      choicesContainerEl.appendChild(wrapper);
    });
  };

  const handleChoiceSelection = (event) => {
    const selectedWrapper = event.currentTarget;
    const selectedIndex = parseInt(
      selectedWrapper.querySelector(".choice-btn").dataset.index,
      10,
    );
    const choiceWrappers =
      choicesContainerEl.querySelectorAll(".choice-wrapper");

    choiceWrappers.forEach((w) => {
      w.classList.add("disabled");
      w.onclick = null;
    });
    skipBtn.disabled = true;

    let delay;

    if (selectedIndex === currentCorrectAnswerIndex) {
      scoreCorrect++;
      selectedWrapper.classList.add("correct");
      triggerHaptic();
      delay = POST_CORRECT_ANSWER_DELAY_MS;
    } else {
      scoreIncorrect++;
      selectedWrapper.classList.add("incorrect");
      choiceWrappers[currentCorrectAnswerIndex].classList.add("correct");
      triggerHapticError();
      delay = POST_INCORRECT_ANSWER_DELAY_MS;
    }
    updateScoreDisplay();

    setTimeout(loadNextQuestion, delay);
  };

  const loadNextQuestion = () => {
    quizContainerEl.classList.add("fading");

    setTimeout(() => {
      displayRandomQuestion();
      quizContainerEl.classList.remove("fading");
    }, FADE_DURATION_MS);
  };

  const handleSkip = () => {
    scoreSkipped++;
    updateScoreDisplay();
    triggerHaptic();
    loadNextQuestion();
  };

  const handleRestart = () => {
    scoreCorrect = 0;
    scoreIncorrect = 0;
    scoreSkipped = 0;
    updateScoreDisplay();
    loadNextQuestion();
  };

  const openModal = () => helpModal.classList.add("visible");
  const closeModal = () => helpModal.classList.remove("visible");

  helpBtn.addEventListener("click", openModal);
  modalCloseBtn.addEventListener("click", closeModal);
  helpModal.addEventListener("click", (event) => {
    if (event.target === helpModal) {
      closeModal();
    }
  });

  restartBtn.addEventListener("click", handleRestart);
  skipBtn.addEventListener("click", handleSkip);
  loadAllData();
});
