const srtInput = document.getElementById("srtFile");
const translationInput = document.getElementById("translationFile");
const loadTranslationBtn = document.getElementById("loadTranslationBtn");
const downloadBtn = document.getElementById("downloadBtn");
const videoInput = document.getElementById("videoFile");
const playFromFirstBtn = document.getElementById("playFromFirstBtn");
const videoPanel = document.getElementById("videoPanel");
const videoPlayer = document.getElementById("videoPlayer");
const videoSubtitleOverlay = document.getElementById("videoSubtitleOverlay");
const subtitleOriginalBtn = document.getElementById("subtitleOriginalBtn");
const subtitleTranslationBtn = document.getElementById("subtitleTranslationBtn");
const openGuidelinesBtn = document.getElementById("openGuidelinesBtn");
const closeGuidelinesBtn = document.getElementById("closeGuidelinesBtn");
const guidelinesModal = document.getElementById("guidelinesModal");
const statusMessage = document.getElementById("statusMessage");
const emptyState = document.getElementById("emptyState");
const editorLayout = document.getElementById("editorLayout");
const originalList = document.getElementById("originalList");
const translationList = document.getElementById("translationList");
const subtitleRowTemplate = document.getElementById("subtitleRowTemplate");
const scrollTopBtn = document.getElementById("scrollTopBtn");

const MAX_LINES = 2;
const MAX_CHARS_PER_LINE = 37;
const REPORT_LINE_THRESHOLD = 2;
const REPORT_CHAR_THRESHOLD = 37;
const PLAYBACK_PRE_ROLL_SECONDS = 3;

let entries = [];
let sourceFileName = "traduction";
let isSyncingScroll = false;
let videoObjectUrl = null;
let subtitleTimeline = [];
let currentSubtitleMode = "translation";

setupLinkedScrolling();
videoPlayer.addEventListener("timeupdate", updateVideoSubtitleByCurrentTime);
videoPlayer.addEventListener("seeked", updateVideoSubtitleByCurrentTime);
videoPlayer.addEventListener("loadedmetadata", updateVideoSubtitleByCurrentTime);
subtitleOriginalBtn.addEventListener("click", () => {
  currentSubtitleMode = "original";
  updateSubtitleModeButtons();
  updateVideoSubtitleByCurrentTime();
});
subtitleTranslationBtn.addEventListener("click", () => {
  currentSubtitleMode = "translation";
  updateSubtitleModeButtons();
  updateVideoSubtitleByCurrentTime();
});

subtitleOriginalBtn.disabled = true;
subtitleTranslationBtn.disabled = true;

window.addEventListener("resize", () => {
  alignRowHeights();
});

window.addEventListener("scroll", toggleScrollTopButtonVisibility);

scrollTopBtn.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

toggleScrollTopButtonVisibility();

openGuidelinesBtn.addEventListener("click", () => {
  guidelinesModal.classList.remove("hidden");
});

closeGuidelinesBtn.addEventListener("click", () => {
  guidelinesModal.classList.add("hidden");
});

guidelinesModal.addEventListener("click", (event) => {
  if (event.target === guidelinesModal) {
    guidelinesModal.classList.add("hidden");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    guidelinesModal.classList.add("hidden");
  }
});

videoInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  if (videoObjectUrl) {
    URL.revokeObjectURL(videoObjectUrl);
  }

  videoObjectUrl = URL.createObjectURL(file);
  videoPlayer.src = videoObjectUrl;
  videoPanel.classList.remove("hidden");
  playFromFirstBtn.disabled = false;
  subtitleOriginalBtn.disabled = false;
  subtitleTranslationBtn.disabled = false;
  updateSubtitleModeButtons();
  setStatus("Vidéo chargée. Vous pouvez lancer la lecture depuis le premier sous-titre.");
});

playFromFirstBtn.addEventListener("click", async () => {
  if (!videoPlayer.src) {
    setStatus("Chargez une vidéo avant de lancer la lecture.");
    return;
  }

  if (entries.length === 0) {
    setStatus("Chargez un fichier SRT avant de lancer la lecture.");
    return;
  }

  const firstStart = getFirstSubtitleStart(entries);
  if (firstStart === null) {
    setStatus("Impossible de lire le premier timecode du fichier SRT.");
    return;
  }

  const targetTime = Math.max(0, firstStart - PLAYBACK_PRE_ROLL_SECONDS);

  try {
    if (videoPlayer.readyState < 1) {
      await waitForVideoMetadata(videoPlayer);
    }

    videoPlayer.currentTime = targetTime;
    await videoPlayer.play();
    setStatus(
      `Lecture lancée à ${targetTime.toFixed(1)} s (premier sous-titre - ${PLAYBACK_PRE_ROLL_SECONDS} s).`
    );
  } catch {
    setStatus("La lecture vidéo n'a pas pu démarrer automatiquement.");
  }
});

srtInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  sourceFileName = file.name.replace(/\.srt$/i, "") || "traduction";

  const content = await file.text();
  entries = parseSrt(content).map((entry) => ({
    ...entry,
    translation: "",
  }));
  rebuildSubtitleTimeline(entries);

  translationInput.value = "";
  translationInput.disabled = entries.length === 0;
  loadTranslationBtn.setAttribute("aria-disabled", String(entries.length === 0));

  renderEntries(entries);
  updateVideoSubtitleByCurrentTime();
  emptyState.classList.add("hidden");
  editorLayout.classList.remove("hidden");
  downloadBtn.disabled = entries.length === 0;
  setStatus("Fichier original chargé. Vous pouvez reprendre une traduction existante.");
});

translationInput.addEventListener("change", async (event) => {
  if (entries.length === 0) {
    setStatus("Chargez d'abord le fichier original avant la traduction en cours.");
    translationInput.value = "";
    return;
  }

  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const translationContent = await file.text();
  const translatedEntries = parseSrt(translationContent);
  if (translatedEntries.length === 0) {
    setStatus("Le fichier de traduction semble vide ou invalide.");
    return;
  }

  entries = mergeTranslations(entries, translatedEntries);
  rebuildSubtitleTimeline(entries);
  renderEntries(entries);
  updateVideoSubtitleByCurrentTime();
  setStatus(`Traduction chargée (${translatedEntries.length} sous-titres détectés).`);
});

downloadBtn.addEventListener("click", () => {
  if (entries.length === 0) {
    return;
  }

  const srt = buildSrt(entries);
  const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sourceFileName}_traduit.srt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

function parseSrt(content) {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const blocks = normalized.split(/\n\s*\n/);
  const parsed = [];

  blocks.forEach((block, i) => {
    const lines = block.split("\n");
    if (lines.length < 2) {
      return;
    }

    let linePointer = 0;
    let index = Number.parseInt(lines[linePointer], 10);

    if (Number.isNaN(index)) {
      index = i + 1;
    } else {
      linePointer += 1;
    }

    const time = lines[linePointer]?.trim();
    if (!time || !time.includes("-->") ) {
      return;
    }

    const text = lines.slice(linePointer + 1).join("\n").trim();

    parsed.push({
      index,
      time,
      text,
    });
  });

  return parsed;
}

function renderEntries(subtitles) {
  originalList.textContent = "";
  translationList.textContent = "";

  const originalRows = [];
  const translationRows = [];

  subtitles.forEach((entry, idx) => {
    const originalRow = subtitleRowTemplate.content.firstElementChild.cloneNode(true);
    originalRow.querySelector(".subtitle-index").textContent = `#${entry.index}`;
    originalRow.querySelector(".subtitle-time").textContent = entry.time;
    originalRow.querySelector(".subtitle-content").textContent = entry.text;
    originalList.appendChild(originalRow);
    originalRows.push(originalRow);

    const translationRow = subtitleRowTemplate.content.firstElementChild.cloneNode(true);
    translationRow.querySelector(".subtitle-index").textContent = `#${entry.index}`;
    translationRow.querySelector(".subtitle-time").textContent = entry.time;

    const editor = document.createElement("textarea");
    editor.className = "translation-input";
    editor.value = entry.translation;
    editor.setAttribute("aria-label", `Traduction du sous-titre ${entry.index}`);

    const counter = document.createElement("p");
    counter.className = "subtitle-counter";

    const helpButton = document.createElement("button");
    helpButton.type = "button";
    helpButton.className = "format-help-btn";
    helpButton.textContent = "Aide";
    helpButton.setAttribute("aria-expanded", "false");

    const helpBox = document.createElement("pre");
    helpBox.className = "format-help-box hidden";
    helpBox.textContent = "<i>Texte en italique</i>\n<b>Texte en gras</b>\n<u>Texte souligné</u>";

    helpButton.addEventListener("click", () => {
      const isHidden = helpBox.classList.toggle("hidden");
      helpButton.setAttribute("aria-expanded", String(!isHidden));
    });

    editor.addEventListener("input", (event) => {
      const value = event.target.value;
      entries[idx].translation = value;
      updateValidationState(translationRow, counter, value);
      updateVideoSubtitleByCurrentTime();
    });

    const subtitleContent = translationRow.querySelector(".subtitle-content");
    const toolsRow = document.createElement("div");
    toolsRow.className = "subtitle-tools";
    toolsRow.appendChild(counter);
    toolsRow.appendChild(helpButton);

    subtitleContent.appendChild(editor);
    subtitleContent.appendChild(toolsRow);
    subtitleContent.appendChild(helpBox);
    updateValidationState(translationRow, counter, entry.translation);
    translationList.appendChild(translationRow);
    translationRows.push(translationRow);
  });

  alignRowHeights(originalRows, translationRows);
}

function buildSrt(subtitles) {
  const stats = computeExportStats(subtitles);
  const reportHeader = [
    "# Statistiques traduction",
    `# nb >${REPORT_LINE_THRESHOLD} lignes : ${stats.overLineThreshold} sur ${stats.totalSubtitles}`,
    `# nb >${REPORT_CHAR_THRESHOLD} caracteres : ${stats.overCharThreshold} sur ${stats.totalSubtitles}`,
  ].join("\n");

  const body = subtitles
    .map((entry, i) => {
      const text = entry.translation?.trim() || "";
      return `${i + 1}\n${entry.time}\n${text}`;
    })
    .join("\n\n");

  return `${reportHeader}\n\n${body}`;
}

function computeExportStats(subtitles) {
  let overLineThreshold = 0;
  let overCharThreshold = 0;

  subtitles.forEach((entry) => {
    const text = entry.translation || "";
    const metrics = getSubtitleMetrics(text);

    if (metrics.lineCount > REPORT_LINE_THRESHOLD) {
      overLineThreshold += 1;
    }

    const hasLongLine = metrics.lineLengths.some((lineLength) => lineLength > REPORT_CHAR_THRESHOLD);
    if (hasLongLine) {
      overCharThreshold += 1;
    }
  });

  return {
    totalSubtitles: subtitles.length,
    overLineThreshold,
    overCharThreshold,
  };
}

function mergeTranslations(originalEntries, translatedEntries) {
  const byTime = new Map(translatedEntries.map((entry) => [entry.time, entry.text]));
  const byIndex = new Map(translatedEntries.map((entry) => [entry.index, entry.text]));

  return originalEntries.map((entry) => {
    const translatedText = byTime.get(entry.time) ?? byIndex.get(entry.index);
    return {
      ...entry,
      translation: translatedText ?? entry.translation,
    };
  });
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function isSubtitleValid(text) {
  const metrics = getSubtitleMetrics(text);

  if (metrics.lineCount > MAX_LINES) {
    return false;
  }

  if (hasTopHeavyLineBreak(metrics)) {
    return false;
  }

  return metrics.lineLengths.every((lineLength) => lineLength <= MAX_CHARS_PER_LINE);
}

function hasTopHeavyLineBreak(metrics) {
  if (metrics.lineCount !== 2) {
    return false;
  }

  if (startsWithDialogueDash(metrics)) {
    return false;
  }

  const line1Length = metrics.lineLengths[0] ?? 0;
  const line2Length = metrics.lineLengths[1] ?? 0;
  return line1Length > line2Length;
}

function startsWithDialogueDash(metrics) {
  if (metrics.lineCount !== 2) {
    return false;
  }

  return (metrics.lines[0] ?? "").trimStart().startsWith("-");
}

function getSubtitleMetrics(text) {
  const lines = text.split("\n");

  if (lines.length === 1 && lines[0] === "") {
    return {
      lines,
      lineCount: 1,
      lineLengths: [0],
    };
  }

  return {
    lines,
    lineCount: lines.length,
    lineLengths: lines.map((line) => line.length),
  };
}

function updateValidationState(rowElement, counterElement, text) {
  const isValid = isSubtitleValid(text);
  const metrics = getSubtitleMetrics(text);

  rowElement.classList.toggle("subtitle-invalid", !isValid);

  const line1Length = metrics.lineLengths[0] ?? 0;
  const line2Length = metrics.lineLengths[1] ?? 0;
  const validationIssues = getValidationIssues(metrics);
  const statusSuffix = validationIssues.length > 0 ? ` | ${validationIssues.join(" | ")}` : "";
  counterElement.textContent = `Lignes: ${metrics.lineCount}/${MAX_LINES} | L1: ${line1Length}/${MAX_CHARS_PER_LINE} | L2: ${line2Length}/${MAX_CHARS_PER_LINE}${statusSuffix}`;
  counterElement.classList.toggle("counter-invalid", !isValid);
}

function getValidationIssues(metrics) {
  const issues = [];

  if (metrics.lineCount > MAX_LINES) {
    issues.push(`>${MAX_LINES} lignes`);
  }

  if (metrics.lineLengths.some((lineLength) => lineLength > MAX_CHARS_PER_LINE)) {
    issues.push(`>${MAX_CHARS_PER_LINE} caracteres`);
  }

  if (hasTopHeavyLineBreak(metrics)) {
    issues.push("L1 > L2");
  }

  return issues;
}

function setupLinkedScrolling() {
  originalList.addEventListener("scroll", () => {
    syncScroll(originalList, translationList);
  });

  translationList.addEventListener("scroll", () => {
    syncScroll(translationList, originalList);
  });
}

function syncScroll(sourceElement, targetElement) {
  if (isSyncingScroll) {
    return;
  }

  isSyncingScroll = true;
  targetElement.scrollTop = sourceElement.scrollTop;
  isSyncingScroll = false;
}

function alignRowHeights(originalRowsArg, translationRowsArg) {
  const originalRows = originalRowsArg ?? Array.from(originalList.children);
  const translationRows = translationRowsArg ?? Array.from(translationList.children);
  const totalRows = Math.min(originalRows.length, translationRows.length);

  for (let i = 0; i < totalRows; i += 1) {
    originalRows[i].style.minHeight = "";
    translationRows[i].style.minHeight = "";
  }

  requestAnimationFrame(() => {
    for (let i = 0; i < totalRows; i += 1) {
      const maxHeight = Math.max(originalRows[i].offsetHeight, translationRows[i].offsetHeight);
      originalRows[i].style.minHeight = `${maxHeight}px`;
      translationRows[i].style.minHeight = `${maxHeight}px`;
    }
  });
}

function getFirstSubtitleStart(subtitles) {
  if (!subtitles.length) {
    return null;
  }

  const firstTimecode = subtitles[0].time || "";
  return parseTimecodeStartToSeconds(firstTimecode);
}

function parseTimecodeStartToSeconds(timecodeLine) {
  const startPart = timecodeLine.split("-->")[0]?.trim();
  if (!startPart) {
    return null;
  }

  const match = startPart.match(/^(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})$/);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const milliseconds = Number.parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function waitForVideoMetadata(videoElement) {
  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("metadata_error"));
    };

    const cleanup = () => {
      videoElement.removeEventListener("loadedmetadata", onLoaded);
      videoElement.removeEventListener("error", onError);
    };

    videoElement.addEventListener("loadedmetadata", onLoaded, { once: true });
    videoElement.addEventListener("error", onError, { once: true });
  });
}

function rebuildSubtitleTimeline(subtitles) {
  subtitleTimeline = subtitles
    .map((entry) => {
      const range = parseTimecodeRangeToSeconds(entry.time);
      if (!range) {
        return null;
      }

      return {
        start: range.start,
        end: range.end,
        entry,
      };
    })
    .filter(Boolean);
}

function parseTimecodeRangeToSeconds(timecodeLine) {
  const parts = timecodeLine.split("-->").map((part) => part.trim());
  if (parts.length !== 2) {
    return null;
  }

  const start = parseSingleTimecodeToSeconds(parts[0]);
  const end = parseSingleTimecodeToSeconds(parts[1]);
  if (start === null || end === null) {
    return null;
  }

  return { start, end };
}

function parseSingleTimecodeToSeconds(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})$/);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const milliseconds = Number.parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function updateVideoSubtitleByCurrentTime() {
  if (!videoSubtitleOverlay || subtitleTimeline.length === 0) {
    showVideoSubtitle("");
    return;
  }

  const currentTime = videoPlayer.currentTime || 0;
  const currentSubtitle = subtitleTimeline.find(
    (item) => currentTime >= item.start && currentTime < item.end
  );

  if (!currentSubtitle) {
    showVideoSubtitle("");
    return;
  }

  let displayText = "";
  if (currentSubtitleMode === "original") {
    displayText = (currentSubtitle.entry.text || "").trim();
  } else {
    displayText = (currentSubtitle.entry.translation || "").trim();
  }

  showVideoSubtitle(displayText);
}

function showVideoSubtitle(text) {
  videoSubtitleOverlay.textContent = text;
  videoSubtitleOverlay.classList.toggle("visible", text.length > 0);
}

function toggleScrollTopButtonVisibility() {
  const shouldShow = window.scrollY > 260;
  scrollTopBtn.classList.toggle("hidden", !shouldShow);
}

function updateSubtitleModeButtons() {
  subtitleOriginalBtn.classList.toggle("active", currentSubtitleMode === "original");
  subtitleTranslationBtn.classList.toggle("active", currentSubtitleMode === "translation");
}
