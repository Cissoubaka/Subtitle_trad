const originalFileInput = document.getElementById("originalFile");
const studentFolderInput = document.getElementById("studentFolder");
const clearBtn = document.getElementById("clearBtn");
const saveStateBtn = document.getElementById("saveStateBtn");
const exportReportBtn = document.getElementById("exportReportBtn");
const reconstructSubtitleBtn = document.getElementById("reconstructSubtitleBtn");
const statusMessage = document.getElementById("statusMessage");
const selectionMemory = document.getElementById("selectionMemory");
const selectionPanel = document.getElementById("selectionPanel");
const studentFileList = document.getElementById("studentFileList");
const comparisonPanel = document.getElementById("comparisonPanel");
const comparisonMeta = document.getElementById("comparisonMeta");
const comparisonTable = document.getElementById("comparisonTable");
const comparisonHead = comparisonTable.querySelector("thead");
const comparisonBody = comparisonTable.querySelector("tbody");

const STORAGE_KEY = "subtitle_trad_professeur_state_v1";

const state = {
  originalName: "",
  originalPathHint: "",
  originalSignature: "",
  originalEntries: [],
  studentFiles: [],
  studentFolderHint: "",
  selectedStudentFileNames: [],
  validatedKeys: new Set(),
};

renderSelectionMemory();

originalFileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  state.originalName = file.name;
  state.originalPathHint = file.webkitRelativePath || file.name;
  state.originalEntries = parseSrt(await file.text());
  state.originalSignature = buildOriginalSignature(state.originalEntries);
  state.validatedKeys = new Set();

  if (state.originalEntries.length === 0) {
    setStatus("Le fichier original est vide ou invalide.");
    renderSelectionPanel();
    renderComparison();
    return;
  }

  refreshStudentScores();
  renderSelectionPanel();
  renderComparison();
  restoreValidationState();
  renderSelectionPanel();
  renderComparison();
  persistValidationState();
  renderSelectionMemory();
  setStatus(`Original charge: ${state.originalName} (${state.originalEntries.length} sous-titres).`);
});

studentFolderInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  const srtFiles = files.filter((file) => file.name.toLowerCase().endsWith(".srt"));

  if (srtFiles.length === 0) {
    state.studentFiles = [];
    renderSelectionPanel();
    renderComparison();
    setStatus("Aucun fichier .srt detecte dans ce dossier.");
    return;
  }

  const allStudentFiles = await Promise.all(
    srtFiles.map(async (file, index) => {
      const entries = parseSrt(await file.text());
      return {
        id: `${index}_${file.name}`,
        name: file.name,
        relativePath: file.webkitRelativePath || file.name,
        entries,
        matchRatio: 0,
        matchedCount: 0,
        palette: null,
      };
    })
  );

  state.studentFiles = allStudentFiles.filter(
    (studentFile) => studentFile.name.toLowerCase() !== state.originalName.toLowerCase()
  );
  state.studentFolderHint = getFolderHintFromFiles(srtFiles);
  state.selectedStudentFileNames = state.studentFiles.map((studentFile) => studentFile.name);

  refreshStudentScores();
  assignStudentPalettes();

  renderSelectionPanel();
  renderComparison();
  persistValidationState();
  renderSelectionMemory();
  setStatus(`${state.studentFiles.length} fichier(s) eleve charge(s).`);
});

clearBtn.addEventListener("click", () => {
  originalFileInput.value = "";
  studentFolderInput.value = "";
  state.originalName = "";
  state.originalPathHint = "";
  state.originalEntries = [];
  state.studentFiles = [];
  state.studentFolderHint = "";
  state.selectedStudentFileNames = [];
  state.validatedKeys = new Set();
  renderSelectionPanel();
  renderComparison();
  renderSelectionMemory();
  setStatus("Selection reinitialisee.");
});

saveStateBtn.addEventListener("click", () => {
  if (!state.originalName || state.originalEntries.length === 0) {
    setStatus("Chargez d'abord un fichier original pour sauvegarder l'etat.");
    return;
  }

  persistValidationState();
  setStatus("Etat sauvegarde localement (validations, chemins, fichiers, calculs et notes). ");
});

exportReportBtn.addEventListener("click", () => {
  if (state.studentFiles.length === 0) {
    setStatus("Chargez des fichiers eleves avant d'exporter le bilan.");
    return;
  }

  const csv = buildCsvReport();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const fileBase = state.originalName ? state.originalName.replace(/\.srt$/i, "") : "bilan";
  link.download = `${fileBase}_bilan_professeur.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Bilan CSV exporte.");
});

reconstructSubtitleBtn.addEventListener("click", () => {
  if (state.studentFiles.length === 0) {
    setStatus("Chargez des fichiers eleves avant de reconstruire le sous-titre.");
    return;
  }

  if (state.originalEntries.length === 0) {
    setStatus("Chargez d'abord un fichier original pour reconstruire le sous-titre.");
    return;
  }

  reconstructAndDownloadSubtitle();
});

function getEntryKey(entry) {
  return `${entry.index}|${entry.time}`;
}

function getFolderHintFromFiles(files) {
  if (!files || files.length === 0) {
    return "";
  }

  const sample = files.find((file) => file.webkitRelativePath)?.webkitRelativePath || "";
  if (!sample) {
    return "";
  }

  const parts = sample.split("/");
  return parts[0] || "";
}

function buildOriginalSignature(entries) {
  return entries.map((entry) => `${entry.index}|${entry.time}`).join(";;");
}

function getSessionKey() {
  if (!state.originalName || !state.originalSignature) {
    return "";
  }

  return `${state.originalName}::${state.originalSignature}`;
}

function readPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { sessions: {} };
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.sessions || typeof parsed.sessions !== "object") {
      return { sessions: {} };
    }

    return parsed;
  } catch {
    return { sessions: {} };
  }
}

function writePersistedState(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function persistValidationState() {
  const sessionKey = getSessionKey();
  if (!sessionKey) {
    return false;
  }

  const data = readPersistedState();
  data.sessions[sessionKey] = {
    originalName: state.originalName,
    originalPathHint: state.originalPathHint,
    studentFolderHint: state.studentFolderHint,
    selectedStudentFileNames: state.selectedStudentFileNames,
    originalCount: state.originalEntries.length,
    validatedKeys: Array.from(state.validatedKeys),
    updatedAt: new Date().toISOString(),
  };

  return writePersistedState(data);
}

function restoreValidationState() {
  const sessionKey = getSessionKey();
  if (!sessionKey) {
    return;
  }

  const data = readPersistedState();
  const session = data.sessions[sessionKey];
  if (!session || !Array.isArray(session.validatedKeys)) {
    return;
  }

  state.validatedKeys = new Set(session.validatedKeys);
  state.originalPathHint = session.originalPathHint || state.originalPathHint;
  state.studentFolderHint = session.studentFolderHint || state.studentFolderHint;
  state.selectedStudentFileNames = Array.isArray(session.selectedStudentFileNames)
    ? session.selectedStudentFileNames
    : state.selectedStudentFileNames;
  renderSelectionMemory();
}

function renderSelectionMemory() {
  if (!selectionMemory) {
    return;
  }

  const hasOriginal = Boolean(state.originalName);
  const hasFolder = Boolean(state.studentFolderHint);
  const selectedCount = state.selectedStudentFileNames.length;

  if (!hasOriginal && !hasFolder && selectedCount === 0) {
    selectionMemory.textContent = "";
    return;
  }

  const parts = [];
  if (hasOriginal) {
    parts.push(`Original: ${state.originalPathHint || state.originalName}`);
  }
  if (hasFolder) {
    parts.push(`Dossier eleves: ${state.studentFolderHint}`);
  }
  if (selectedCount > 0) {
    parts.push(`Fichiers selectionnes: ${selectedCount}`);
  }

  selectionMemory.textContent = `Selection sauvegardee: ${parts.join(" | ")}`;
}

function buildCsvReport() {
  const header = [
    "fichier_eleve",
    "total_sous_titres",
    "valides",
    "pourcentage_match",
    "note_sur_20",
  ];

  const rows = state.studentFiles.map((studentFile) => {
    const validatedCount = getValidatedCountForStudent(studentFile);
    const matchPercent = Math.round(studentFile.matchRatio * 1000) / 10;
    const note = formatNoteOn20(validatedCount, studentFile.entries.length);

    return [
      studentFile.name,
      String(studentFile.entries.length),
      String(validatedCount),
      `${matchPercent}%`,
      note,
    ];
  });

  return [header, ...rows].map((line) => line.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

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

    let pointer = 0;
    let index = Number.parseInt(lines[pointer], 10);

    if (Number.isNaN(index)) {
      index = i + 1;
    } else {
      pointer += 1;
    }

    const time = lines[pointer]?.trim();
    if (!time || !time.includes("-->")) {
      return;
    }

    const text = lines.slice(pointer + 1).join("\n").trim();

    parsed.push({
      index,
      time,
      text,
    });
  });

  return parsed;
}

function refreshStudentScores() {
  state.studentFiles.forEach((studentFile) => {
    const { ratio, matchedCount } = computeMatchRatio(state.originalEntries, studentFile.entries);
    studentFile.matchRatio = ratio;
    studentFile.matchedCount = matchedCount;
  });

  state.studentFiles.sort((a, b) => {
    return a.name.localeCompare(b.name, "fr", {
      sensitivity: "base",
      numeric: true,
      ignorePunctuation: true,
    });
  });
}

function assignStudentPalettes() {
  const total = Math.max(state.studentFiles.length, 1);

  state.studentFiles.forEach((studentFile, index) => {
    const hue = Math.round((index * 360) / total);
    studentFile.palette = {
      bg: `hsl(${hue} 86% 92%)`,
      border: `hsl(${hue} 56% 70%)`,
      badge: `hsl(${hue} 64% 28%)`,
    };
  });
}

function getValidatedCountForStudent(studentFile) {
  if (state.validatedKeys.size === 0 || studentFile.entries.length === 0) {
    return 0;
  }

  const byTime = new Set(studentFile.entries.map((entry) => entry.time));
  const byIndex = new Set(studentFile.entries.map((entry) => entry.index));
  let validatedCount = 0;

  state.originalEntries.forEach((entry) => {
    const entryKey = getEntryKey(entry);
    if (!state.validatedKeys.has(entryKey)) {
      return;
    }

    if (byTime.has(entry.time) || byIndex.has(entry.index)) {
      validatedCount += 1;
    }
  });

  return validatedCount;
}

function formatNoteOn20(validatedCount, totalCount) {
  if (!totalCount) {
    return "0/20";
  }

  const rawScore = (validatedCount / totalCount) * 20;
  const rounded = Math.round(rawScore * 10) / 10;
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display}/20`;
}

function computeMatchRatio(originalEntries, studentEntries) {
  if (originalEntries.length === 0 || studentEntries.length === 0) {
    return { ratio: 0, matchedCount: 0 };
  }

  const byTime = new Set(studentEntries.map((entry) => entry.time));
  let matchedCount = 0;

  originalEntries.forEach((entry) => {
    if (byTime.has(entry.time)) {
      matchedCount += 1;
    }
  });

  const ratio = matchedCount / originalEntries.length;
  return { ratio, matchedCount };
}

function renderSelectionPanel() {
  studentFileList.textContent = "";

  if (state.studentFiles.length === 0) {
    selectionPanel.classList.add("hidden");
    return;
  }

  selectionPanel.classList.remove("hidden");

  state.studentFiles.forEach((studentFile) => {
    const item = document.createElement("div");
    item.className = "student-item";

    const left = document.createElement("div");
    left.className = "student-left";

    const swatch = document.createElement("span");
    swatch.className = "student-swatch";
    swatch.style.background = studentFile.palette?.bg || "#eef2f7";
    swatch.style.borderColor = studentFile.palette?.border || "#cbd5e1";

    const name = document.createElement("span");
    name.className = "student-name";
    name.textContent = studentFile.name;

    left.appendChild(swatch);
    left.appendChild(name);

    const score = document.createElement("span");
    score.className = "student-score";
    score.textContent = `${Math.round(studentFile.matchRatio * 100)}% match`;

    const validatedCount = getValidatedCountForStudent(studentFile);
    const validatedStat = document.createElement("span");
    validatedStat.className = "student-score";
    validatedStat.textContent = `${validatedCount}/${studentFile.entries.length} valides`;

    const noteStat = document.createElement("span");
    noteStat.className = "student-score student-score-note";
    noteStat.textContent = `NOTE: ${formatNoteOn20(validatedCount, studentFile.entries.length)}`;

    item.appendChild(left);
    const right = document.createElement("div");
    right.className = "student-right";
    right.appendChild(score);
    right.appendChild(validatedStat);
    right.appendChild(noteStat);
    item.appendChild(right);
    studentFileList.appendChild(item);
  });
}

function renderComparison() {
  comparisonHead.textContent = "";
  comparisonBody.textContent = "";

  if (state.originalEntries.length === 0 || state.studentFiles.length === 0) {
    comparisonPanel.classList.add("hidden");
    if (state.originalEntries.length === 0) {
      comparisonMeta.textContent = "";
    }
    return;
  }

  comparisonPanel.classList.remove("hidden");

  const headRow = document.createElement("tr");
  appendHeaderCell(headRow, "#");
  appendHeaderCell(headRow, "Timecode");
  appendHeaderCell(headRow, "Original");
  appendHeaderCell(headRow, "Valide", "valid-col");
  appendHeaderCell(headRow, "Eleves", "student-col");

  comparisonHead.appendChild(headRow);

  const studentMaps = state.studentFiles.map((studentFile) => ({
    name: studentFile.name,
    palette: studentFile.palette,
    byTime: new Map(studentFile.entries.map((entry) => [entry.time, entry.text])),
    byIndex: new Map(studentFile.entries.map((entry) => [entry.index, entry.text])),
    matchedCount: studentFile.matchedCount,
  }));

  state.originalEntries.forEach((entry, rowIndex) => {
    const row = document.createElement("tr");

    const numberCell = document.createElement("td");
    numberCell.textContent = String(rowIndex + 1);
    row.appendChild(numberCell);

    const timeCell = document.createElement("td");
    timeCell.textContent = entry.time;
    row.appendChild(timeCell);

    const originalCell = document.createElement("td");
    originalCell.className = "original-cell";
    originalCell.textContent = entry.text;
    row.appendChild(originalCell);

    const validCell = document.createElement("td");
    validCell.className = "valid-col";

    const validLabel = document.createElement("label");
    validLabel.className = "valid-toggle";

    const validCheckbox = document.createElement("input");
    validCheckbox.type = "checkbox";
    validCheckbox.setAttribute("aria-label", `Valider le sous-titre ${entry.index}`);
    const entryKey = getEntryKey(entry);
    validCheckbox.checked = state.validatedKeys.has(entryKey);

    validCheckbox.addEventListener("change", (event) => {
      if (event.target.checked) {
        state.validatedKeys.add(entryKey);
      } else {
        state.validatedKeys.delete(entryKey);
      }
      row.classList.toggle("row-validated", event.target.checked);
      persistValidationState();
      renderSelectionPanel();
      updateComparisonMeta();
    });

    validLabel.appendChild(validCheckbox);
    validCell.appendChild(validLabel);
    row.classList.toggle("row-validated", validCheckbox.checked);
    row.appendChild(validCell);

    const studentsCell = document.createElement("td");
    studentsCell.className = "student-col";
    const stack = document.createElement("div");
    stack.className = "student-stack";
    let hasAnyMatch = false;

    studentMaps.forEach((studentMap) => {
      const studentText = studentMap.byTime.get(entry.time) ?? studentMap.byIndex.get(entry.index) ?? "";
      if (!studentText) {
        return;
      }

      hasAnyMatch = true;

      const studentEntry = document.createElement("article");
      studentEntry.className = "student-entry";
      studentEntry.style.background = studentMap.palette?.bg || "#f8fafc";
      studentEntry.style.borderColor = studentMap.palette?.border || "#d2dae5";

      const entryHead = document.createElement("header");
      entryHead.className = "student-entry-head";

      const entryName = document.createElement("span");
      entryName.className = "student-entry-name";
      entryName.textContent = studentMap.name;
      entryName.style.color = studentMap.palette?.badge || "#334155";

      entryHead.appendChild(entryName);

      const entryText = document.createElement("p");
      entryText.className = "student-entry-text";
      entryText.textContent = studentText;

      studentEntry.appendChild(entryHead);
      studentEntry.appendChild(entryText);
      stack.appendChild(studentEntry);
    });

    if (!hasAnyMatch) {
      return;
    }

    studentsCell.appendChild(stack);
    row.appendChild(studentsCell);

    comparisonBody.appendChild(row);
  });

  updateComparisonMeta();
}

function updateComparisonMeta() {
  const metaParts = [
    `${state.originalEntries.length} sous-titres originaux`,
    `${state.studentFiles.length} fichier(s) eleve affiche(s)`,
    `${state.validatedKeys.size} valide(s)`,
  ];

  comparisonMeta.textContent = metaParts.join(" | ");
}

function appendHeaderCell(row, text, className) {
  const cell = document.createElement("th");
  if (className) {
    cell.className = className;
  }
  cell.textContent = text;
  row.appendChild(cell);
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function reconstructAndDownloadSubtitle() {
  // Créer un tableau pour stocker tous les blocs SRT dans l'ordre
  const allEntries = [];

  // Parcourir tous les fichiers élèves
  state.studentFiles.forEach((studentFile) => {
    // Parcourir chaque entrée du fichier élève
    studentFile.entries.forEach((entry) => {
      allEntries.push({
        time: entry.time,
        text: entry.text,
      });
    });
  });

  // Trier les entrées par timecode pour assurer l'ordre
  allEntries.sort((a, b) => {
    const timeA = parseFloat(a.time.split(" --> ")[0].replace(/:/g, ""));
    const timeB = parseFloat(b.time.split(" --> ")[0].replace(/:/g, ""));
    return timeA - timeB;
  });

  // Formater en SRT avec numérotation appropriée
  const srtContent = allEntries
    .map((entry, index) => {
      return `${index + 1}\n${entry.time}\n${entry.text}`;
    })
    .join("\n\n");

  // Créer et télécharger le fichier
  const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const fileBase = state.originalName ? state.originalName.replace(/\.srt$/i, "") : "sous-titre_complet";
  link.download = `${fileBase}_complet.srt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  setStatus(
    `Sous-titre complet reconstruire (${allEntries.length} blocs concatenes et tries par timecode).`
  );
}

// Bouton retour en haut
const scrollTopBtn = document.getElementById("scrollTopBtn");

function toggleScrollTopButtonVisibility() {
  const shouldShow = window.scrollY > 260;
  scrollTopBtn.classList.toggle("hidden", !shouldShow);
}

window.addEventListener("scroll", toggleScrollTopButtonVisibility);

scrollTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

toggleScrollTopButtonVisibility();
