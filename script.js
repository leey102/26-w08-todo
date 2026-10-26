"use strict";

const STORAGE_KEY = "todo-list-v1";
const LEGACY_STORAGE_KEY = "todo-list-bootstrap-v1";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DEFAULT_CATEGORIES = [
  { id: "category-study", name: "공부", color: "#5b7cfa" },
  { id: "category-assignment", name: "과제", color: "#f2a541" },
  { id: "category-exam", name: "시험", color: "#eb6b6b" },
  { id: "category-daily", name: "일상", color: "#40a982" },
  { id: "category-other", name: "기타", color: "#9775df" }
];

const elements = {
  feedback: document.getElementById("feedback"),
  todayLabel: document.getElementById("today-label"),
  taskTotal: document.getElementById("total-tasks"),
  taskCompleted: document.getElementById("completed-tasks"),
  taskForm: document.getElementById("todo-form"),
  taskTitle: document.getElementById("task-title"),
  taskDate: document.getElementById("task-date"),
  taskDueDate: document.getElementById("task-due-date"),
  taskCategory: document.getElementById("task-category"),
  taskRepeat: document.getElementById("task-repeat"),
  weeklyDaysField: document.getElementById("weekly-days-field"),
  weeklyDays: document.getElementById("weekly-days"),
  taskSubmit: document.getElementById("submit-task"),
  cancelTaskEdit: document.getElementById("cancel-edit"),
  formHeading: document.getElementById("form-heading"),
  taskFilter: document.getElementById("task-filter"),
  resetFilters: document.getElementById("reset-filters"),
  activeFilterLabel: document.getElementById("active-filter-label"),
  taskList: document.getElementById("task-list"),
  progressPercent: document.getElementById("progress-percent"),
  progressBar: document.getElementById("overall-progress-bar"),
  progressTrack: document.querySelector(".progress-track"),
  progressCount: document.getElementById("progress-count"),
  categoryProgress: document.getElementById("category-progress"),
  categoryList: document.getElementById("category-list"),
  categoryForm: document.getElementById("category-form"),
  categoryName: document.getElementById("category-name"),
  categoryColor: document.getElementById("category-color"),
  categorySubmit: document.getElementById("submit-category"),
  cancelCategoryEdit: document.getElementById("cancel-category-edit"),
  confirmationDialog: document.getElementById("confirmation-dialog"),
  confirmationTitle: document.getElementById("confirmation-title"),
  confirmationMessage: document.getElementById("confirmation-message"),
  confirmationCancel: document.getElementById("confirmation-cancel"),
  confirmationConfirm: document.getElementById("confirmation-confirm")
};

let state = createInitialState();
let selectedCategoryId = "";
let editingTaskId = "";
let editingCategoryId = "";
let weeklyDaysCustomized = false;
let pendingConfirmation = null;

function createInitialState() {
  return { tasks: [], categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })), recurrenceCompletions: {} };
}

function todayISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function shiftDate(dateValue, days) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayFor(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function dateLabel(dateValue) {
  if (!isValidDate(dateValue)) return dateValue;
  const [year, month, day] = dateValue.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일 (${WEEKDAYS[weekdayFor(dateValue)]})`;
}

function makeId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function showMessage(message, type = "danger") {
  elements.feedback.textContent = message;
  elements.feedback.className = `feedback-message feedback-${type === "warning" ? "warning" : "error"}`;
}

function clearMessage() {
  elements.feedback.textContent = "";
  elements.feedback.className = "feedback-message hidden";
}

function getSafeColor(value) {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : "#a1a5b5";
}

function normalizeLoadedState(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.tasks) || !Array.isArray(value.categories)) {
    throw new Error("저장 데이터의 형식이 올바르지 않습니다.");
  }

  const categories = [];
  const categoryIds = new Set();
  for (const item of value.categories) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      categoryIds.has(item.id) ||
      typeof item.name !== "string" ||
      !item.name.trim()
    ) {
      continue;
    }
    categoryIds.add(item.id);
    categories.push({
      id: item.id,
      name: item.name.trim().slice(0, 30),
      color: getSafeColor(item.color)
    });
  }

  const tasks = [];
  const taskIds = new Set();
  for (const item of value.tasks) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      taskIds.has(item.id) ||
      typeof item.text !== "string" ||
      !item.text.trim() ||
      item.text.trim().length > 100 ||
      !isValidDate(item.date)
    ) {
      continue;
    }
    taskIds.add(item.id);
    const repeatType = ["none", "daily", "weekly"].includes(item.repeatType) ? item.repeatType : "none";
    const repeatDays = Array.isArray(item.repeatDays)
      ? [...new Set(item.repeatDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [];
    if (repeatType === "weekly" && repeatDays.length === 0) repeatDays.push(weekdayFor(item.date));
    tasks.push({
      id: item.id,
      text: item.text.trim(),
      date: item.date,
      dueDate: isValidDate(item.dueDate) && item.dueDate >= item.date ? item.dueDate : "",
      categoryId: categoryIds.has(item.categoryId) ? item.categoryId : "",
      completed: item.completed === true,
      repeatType,
      repeatDays,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString()
    });
  }

  const recurrenceCompletions = {};
  if (value.recurrenceCompletions && typeof value.recurrenceCompletions === "object") {
    for (const task of tasks) {
      const records = value.recurrenceCompletions[task.id];
      if (!records || typeof records !== "object" || Array.isArray(records)) continue;
      const validRecords = {};
      for (const [date, completed] of Object.entries(records)) {
        if (isValidDate(date) && typeof completed === "boolean") validRecords[date] = completed;
      }
      if (Object.keys(validRecords).length > 0) recurrenceCompletions[task.id] = validRecords;
    }
  }

  return { tasks, categories, recurrenceCompletions };
}

function loadState() {
  let raw;
  let legacyData = false;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      legacyData = raw !== null;
    }
  } catch {
    showMessage("브라우저 저장 공간을 읽을 수 없습니다. 이번 세션의 변경 사항은 저장되지 않을 수 있어요.");
    return createInitialState();
  }

  if (raw === null) {
    const initial = createInitialState();
    state = initial;
    saveState();
    return initial;
  }

  try {
    const loaded = normalizeLoadedState(JSON.parse(raw));
    if (legacyData) {
      state = loaded;
      saveState();
    }
    return loaded;
  } catch (error) {
    showMessage(`저장된 데이터를 읽을 수 없어 기본 카테고리로 시작합니다. (${error.message})`);
    return createInitialState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    clearMessage();
    return true;
  } catch {
    showMessage("저장 공간에 기록하지 못했습니다. 이 변경 사항은 브라우저를 닫으면 사라질 수 있어요.");
    return false;
  }
}

function isRecurring(task) {
  return task.repeatType === "daily" || task.repeatType === "weekly";
}

function isOccurrenceOn(task, dateValue) {
  if (!isValidDate(dateValue) || dateValue < task.date) return false;
  if (task.repeatType === "daily") return true;
  if (task.repeatType === "weekly") return task.repeatDays.includes(weekdayFor(dateValue));
  return dateValue === task.date;
}

function isCompletedOn(task, dateValue) {
  if (!isRecurring(task)) return task.completed;
  return state.recurrenceCompletions[task.id]?.[dateValue] === true;
}

function nextOccurrenceOnOrAfter(task, startDate) {
  if (!isRecurring(task)) return task.date >= startDate ? task.date : "";
  let candidate = startDate < task.date ? task.date : startDate;
  for (let offset = 0; offset < 8; offset += 1) {
    const dateValue = shiftDate(candidate, offset);
    if (isOccurrenceOn(task, dateValue)) return dateValue;
  }
  return "";
}

function mostRecentCompletedOccurrence(task, endDate) {
  const records = state.recurrenceCompletions[task.id];
  if (!records) return "";
  return Object.keys(records)
    .filter((dateValue) => dateValue <= endDate && records[dateValue] && isOccurrenceOn(task, dateValue))
    .sort((a, b) => b.localeCompare(a))[0] || "";
}

function getTaskOccurrence(task, filter, today) {
  if (filter === "today") return isOccurrenceOn(task, today) ? today : "";

  if (filter === "upcoming") {
    if (isRecurring(task)) return nextOccurrenceOnOrAfter(task, shiftDate(today, 1));
    return task.date > today ? task.date : "";
  }

  if (filter === "overdue") {
    return !isRecurring(task) && !task.completed && task.dueDate && task.dueDate < today ? task.date : "";
  }

  if (filter === "completed") {
    if (!isRecurring(task)) return task.completed ? task.date : "";
    return mostRecentCompletedOccurrence(task, today);
  }

  if (filter === "incomplete") {
    if (!isRecurring(task)) return !task.completed ? task.date : "";
    if (isOccurrenceOn(task, today) && !isCompletedOn(task, today)) return today;
    const next = nextOccurrenceOnOrAfter(task, shiftDate(today, 1));
    return next && !isCompletedOn(task, next) ? next : "";
  }

  if (!isRecurring(task)) return task.date;
  return nextOccurrenceOnOrAfter(task, today);
}

function setProgress(element, value, label) {
  element.setAttribute("aria-valuenow", String(value));
  element.setAttribute("aria-label", label);
}

function renderProgress(today) {
  const completedByDefinition = (task) => (
    isRecurring(task)
      ? isOccurrenceOn(task, today) && isCompletedOn(task, today)
      : task.completed
  );
  const completedCount = state.tasks.filter(completedByDefinition).length;
  const percent = state.tasks.length === 0 ? 0 : Math.round((completedCount / state.tasks.length) * 100);
  elements.taskTotal.textContent = String(state.tasks.length);
  elements.taskCompleted.textContent = String(completedCount);
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressCount.textContent = `${completedCount} / ${state.tasks.length}개 완료`;
  setProgress(elements.progressTrack, percent, `전체 일정 진행률 ${percent}%`);

  const unclassified = state.tasks.filter((task) => !task.categoryId);
  const categories = unclassified.length > 0
    ? [...state.categories, { id: "", name: "미분류", color: "#a1a5b5" }]
    : state.categories;
  const rows = categories.map((category) => {
    const tasks = state.tasks.filter((task) => task.categoryId === category.id);
    const completed = tasks.filter(completedByDefinition).length;
    const categoryPercent = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);
    return { category, tasks, completed, percent: categoryPercent };
  });
  elements.categoryProgress.replaceChildren();
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "category-progress-row";
    const label = document.createElement("div");
    label.className = "category-progress-label";
    const name = document.createElement("span");
    name.textContent = row.category.name;
    const count = document.createElement("span");
    count.textContent = `${row.completed}/${row.tasks.length} · ${row.percent}%`;
    label.append(name, count);

    const track = document.createElement("div");
    track.className = "category-progress-bar";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(row.percent));
    track.setAttribute("aria-label", `${row.category.name} 진행률 ${row.percent}%`);
    const bar = document.createElement("span");
    bar.style.width = `${row.percent}%`;
    bar.style.setProperty("--category-color", row.category.color);
    track.append(bar);
    item.append(label, track);
    elements.categoryProgress.append(item);
  }
}

function renderCategorySelect() {
  const selectedValue = elements.taskCategory.value;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "미분류";
  const options = state.categories.map((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    return option;
  });
  elements.taskCategory.replaceChildren(placeholder, ...options);
  if (state.categories.some((category) => category.id === selectedValue)) {
    elements.taskCategory.value = selectedValue;
  } else {
    elements.taskCategory.value = "";
  }
}

function renderCategoryList(today) {
  elements.categoryList.replaceChildren();
  const allRow = document.createElement("div");
  allRow.className = "category-row";
  allRow.append(createCategoryFilterButton("", "모든 카테고리", "#a1a5b5"));
  elements.categoryList.append(allRow);

  for (const category of state.categories) {
    const row = document.createElement("div");
    row.className = "category-row";
    row.append(createCategoryFilterButton(category.id, category.name, category.color));

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "category-edit-button";
    editButton.textContent = "관리";
    editButton.setAttribute("aria-label", `${category.name} 카테고리 수정 또는 삭제`);
    editButton.addEventListener("click", () => startCategoryEditWithActions(category));
    row.append(editButton);
    elements.categoryList.append(row);
  }

  renderProgress(today);
}

function createCategoryFilterButton(id, name, color) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `category-filter-button${selectedCategoryId === id ? " active" : ""}`;
  button.setAttribute("aria-pressed", selectedCategoryId === id ? "true" : "false");
  const dot = document.createElement("span");
  dot.className = "category-dot";
  dot.style.setProperty("--category-color", color);
  const label = document.createElement("span");
  label.className = "category-filter-name";
  label.textContent = name;
  button.append(dot, label);
  button.addEventListener("click", () => {
    selectedCategoryId = id;
    render();
  });
  return button;
}

function createEmptyState(noTasks) {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const illustration = document.createElement("div");
  illustration.className = "empty-illustration";
  illustration.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 72 72");
  svg.setAttribute("fill", "none");
  const page = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  page.setAttribute("x", "15");
  page.setAttribute("y", "14");
  page.setAttribute("width", "42");
  page.setAttribute("height", "48");
  page.setAttribute("rx", "8");
  page.setAttribute("stroke", "currentColor");
  page.setAttribute("stroke-width", "3");
  const lines = document.createElementNS("http://www.w3.org/2000/svg", "path");
  lines.setAttribute("d", "M26 14v-3a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v3M25 30h22M25 41h12M25 52h17");
  lines.setAttribute("stroke", "currentColor");
  lines.setAttribute("stroke-width", "3");
  lines.setAttribute("stroke-linecap", "round");
  const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
  check.setAttribute("d", "m46 46 4 4 8-10");
  check.setAttribute("stroke", "#43A878");
  check.setAttribute("stroke-width", "3.5");
  check.setAttribute("stroke-linecap", "round");
  check.setAttribute("stroke-linejoin", "round");
  svg.append(page, lines, check);
  illustration.append(svg);

  const heading = document.createElement("h3");
  heading.textContent = noTasks ? "아직 등록된 일정이 없어요" : "조건에 맞는 일정이 없어요";
  const description = document.createElement("p");
  description.textContent = noTasks
    ? "작은 할 일부터 추가하고 오늘의 계획을 시작해 보세요."
    : "다른 필터를 선택하거나 새로운 일정을 추가해 보세요.";
  empty.append(illustration, heading, description);

  if (noTasks) {
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "button button-primary";
    addButton.textContent = "첫 일정 추가하기";
    addButton.addEventListener("click", () => elements.taskTitle.focus());
    empty.append(addButton);
  }
  return empty;
}

function renderTasks(today) {
  const filter = elements.taskFilter.value;
  const visible = state.tasks
    .map((task) => ({ task, occurrence: getTaskOccurrence(task, filter, today) }))
    .filter(({ task, occurrence }) => {
      if (!occurrence) return false;
      if (selectedCategoryId && task.categoryId !== selectedCategoryId) return false;
      if (filter === "completed" && !isCompletedOn(task, occurrence)) return false;
      if (filter === "incomplete" && isCompletedOn(task, occurrence)) return false;
      return true;
    })
    .sort((a, b) => a.occurrence.localeCompare(b.occurrence) || a.task.text.localeCompare(b.task.text, "ko"));

  elements.taskList.replaceChildren();
  if (visible.length === 0) {
    elements.taskList.append(createEmptyState(state.tasks.length === 0));
  } else {
    for (const item of visible) elements.taskList.append(createTaskElement(item.task, item.occurrence, today));
  }

  const filterNames = {
    all: "모든 카테고리",
    today: "오늘의 일정",
    upcoming: "예정된 일정",
    overdue: "기한 초과",
    completed: "완료된 일정",
    incomplete: "미완료 일정"
  };
  const category = state.categories.find((item) => item.id === selectedCategoryId);
  elements.activeFilterLabel.textContent = `${category ? category.name : "모든 카테고리"} · ${filterNames[filter]}`;
}

function createTaskElement(task, occurrence, today) {
  const completed = isCompletedOn(task, occurrence);
  const overdue = !isRecurring(task) && !completed && task.dueDate && task.dueDate < today;
  const item = document.createElement("article");
  item.className = `task-item${completed ? " completed" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-check";
  checkbox.checked = completed;
  checkbox.setAttribute("aria-label", `${task.text} ${completed ? "완료 취소" : "완료"}`);
  checkbox.addEventListener("change", () => toggleTask(task, occurrence, checkbox.checked, checkbox));

  const main = document.createElement("div");
  main.className = "task-main";
  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.text;
  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.append(createBadge(`일정 ${dateLabel(occurrence)}`));
  if (task.dueDate) meta.append(createBadge(`마감 ${dateLabel(task.dueDate)}`, overdue ? "overdue" : ""));
  if (task.categoryId) {
    const category = state.categories.find((item) => item.id === task.categoryId);
    if (category) meta.append(createCategoryTag(category));
  } else {
    meta.append(createBadge("미분류"));
  }
  if (task.repeatType === "daily") meta.append(createBadge("매일 반복", "repeat"));
  if (task.repeatType === "weekly") {
    const days = task.repeatDays.map((day) => WEEKDAYS[day]).join("·");
    meta.append(createBadge(`매주 ${days}`, "repeat"));
  }
  if (overdue) meta.append(createBadge("기한 초과", "overdue"));
  main.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "task-action";
  edit.textContent = "수정";
  edit.setAttribute("aria-label", `${task.text} 수정`);
  edit.addEventListener("click", () => startTaskEdit(task));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "task-action delete";
  remove.textContent = "삭제";
  remove.setAttribute("aria-label", `${task.text} 삭제`);
  remove.addEventListener("click", () => deleteTask(task));
  actions.append(edit, remove);
  item.append(checkbox, main, actions);
  return item;
}

function createBadge(text, modifier = "") {
  const badge = document.createElement("span");
  badge.className = `task-badge${modifier ? ` ${modifier}` : ""}`;
  badge.textContent = text;
  return badge;
}

function createCategoryTag(category) {
  const tag = document.createElement("span");
  tag.className = "category-tag";
  const dot = document.createElement("span");
  dot.className = "category-tag-dot";
  dot.style.setProperty("--category-color", category.color);
  const label = document.createElement("span");
  label.textContent = category.name;
  tag.append(dot, label);
  return tag;
}

function render() {
  const today = todayISO();
  elements.todayLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());
  renderCategorySelect();
  renderCategoryList(today);
  renderTasks(today);
}

function setWeeklyDays(dayValues, customized = false) {
  weeklyDaysCustomized = customized;
  elements.weeklyDays.replaceChildren();
  WEEKDAYS.forEach((day, index) => {
    const label = document.createElement("label");
    label.className = "weekday-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "repeatDays";
    input.value = String(index);
    input.checked = dayValues.includes(index);
    const text = document.createElement("span");
    text.textContent = day;
    label.append(input, text);
    elements.weeklyDays.append(label);
  });
}

function getSelectedWeekdays() {
  return [...elements.weeklyDays.querySelectorAll('input[name="repeatDays"]:checked')]
    .map((input) => Number(input.value));
}

function handleRepeatChange() {
  const weekly = elements.taskRepeat.value === "weekly";
  elements.weeklyDaysField.classList.toggle("hidden", !weekly);
  if (weekly && !weeklyDaysCustomized && isValidDate(elements.taskDate.value)) {
    setWeeklyDays([weekdayFor(elements.taskDate.value)]);
  }
}

function handleTaskDateChange() {
  if (
    elements.taskRepeat.value === "weekly" &&
    !weeklyDaysCustomized &&
    isValidDate(elements.taskDate.value)
  ) {
    setWeeklyDays([weekdayFor(elements.taskDate.value)]);
  }
}

function resetTaskForm() {
  editingTaskId = "";
  elements.taskForm.reset();
  elements.taskDate.value = todayISO();
  elements.taskRepeat.value = "none";
  setWeeklyDays([weekdayFor(elements.taskDate.value)]);
  elements.weeklyDaysField.classList.add("hidden");
  elements.taskSubmit.textContent = "일정 추가";
  elements.cancelTaskEdit.classList.add("hidden");
  elements.formHeading.textContent = "할 일 추가";
  renderCategorySelect();
}

function startTaskEdit(task) {
  editingTaskId = task.id;
  elements.taskTitle.value = task.text;
  elements.taskDate.value = task.date;
  elements.taskDueDate.value = task.dueDate;
  elements.taskCategory.value = task.categoryId;
  elements.taskRepeat.value = task.repeatType;
  setWeeklyDays(task.repeatDays, task.repeatType === "weekly");
  elements.weeklyDaysField.classList.toggle("hidden", task.repeatType !== "weekly");
  elements.taskSubmit.textContent = "수정 저장";
  elements.cancelTaskEdit.classList.remove("hidden");
  elements.formHeading.textContent = "할 일 수정";
  elements.taskTitle.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleTaskSubmit(event) {
  event.preventDefault();
  const text = elements.taskTitle.value.trim();
  const date = elements.taskDate.value;
  const dueDate = elements.taskDueDate.value;
  const repeatType = elements.taskRepeat.value;
  const repeatDays = repeatType === "weekly" ? getSelectedWeekdays() : [];
  let categoryId = elements.taskCategory.value;

  if (!text) {
    showMessage("할 일 제목을 입력해 주세요.", "warning");
    elements.taskTitle.focus();
    return;
  }
  if (text.length > 100) {
    showMessage("할 일 제목은 최대 100자까지 입력할 수 있어요.", "warning");
    elements.taskTitle.focus();
    return;
  }
  if (!isValidDate(date)) {
    showMessage("올바른 일정 날짜를 선택해 주세요.", "warning");
    elements.taskDate.focus();
    return;
  }
  if (dueDate && (!isValidDate(dueDate) || dueDate < date)) {
    showMessage("마감 기한은 일정 날짜와 같거나 이후 날짜로 선택해 주세요.", "warning");
    elements.taskDueDate.focus();
    return;
  }
  if (!["none", "daily", "weekly"].includes(repeatType)) {
    showMessage("올바른 반복 유형을 선택해 주세요.", "warning");
    return;
  }
  if (repeatType === "weekly" && repeatDays.length === 0) {
    showMessage("매주 반복할 요일을 하나 이상 선택해 주세요.", "warning");
    return;
  }
  const invalidCategory = Boolean(categoryId && !state.categories.some((category) => category.id === categoryId));
  if (invalidCategory) {
    categoryId = "";
  }
  clearMessage();

  const now = new Date().toISOString();
  if (editingTaskId) {
    const task = state.tasks.find((item) => item.id === editingTaskId);
    if (!task) {
      showMessage("수정할 일정을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
      resetTaskForm();
      return;
    }
    task.text = text;
    task.date = date;
    task.dueDate = dueDate;
    task.categoryId = categoryId;
    task.repeatType = repeatType;
    task.repeatDays = repeatDays;
    task.updatedAt = now;
  } else {
    state.tasks.push({
      id: makeId("task"),
      text,
      date,
      dueDate,
      categoryId,
      completed: false,
      repeatType,
      repeatDays,
      createdAt: now,
      updatedAt: now
    });
  }

  const saved = saveState();
  resetTaskForm();
  render();
  if (invalidCategory && saved) {
    showMessage("선택한 카테고리를 찾을 수 없어 미분류 일정으로 저장했습니다.", "warning");
  }
}

function toggleTask(task, dateValue, completed, checkbox) {
  task.updatedAt = new Date().toISOString();
  if (isRecurring(task)) {
    if (!state.recurrenceCompletions[task.id]) state.recurrenceCompletions[task.id] = {};
    state.recurrenceCompletions[task.id][dateValue] = completed;
  } else {
    task.completed = completed;
  }
  if (completed) showPetalEffect(checkbox);
  saveState();
  render();
}

function showPetalEffect(source) {
  if (!source || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bounds = source.getBoundingClientRect();
  const burst = document.createElement("span");
  burst.className = "petal-burst";
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = `${bounds.left + bounds.width / 2}px`;
  burst.style.top = `${bounds.top + bounds.height / 2}px`;
  const petals = [
    ["-28px", "-20px", "#f5a3c7"],
    ["0px", "-34px", "#f7d36e"],
    ["28px", "-20px", "#a9d99f"],
    ["34px", "8px", "#f5a3c7"],
    ["14px", "30px", "#c2a8f4"],
    ["-14px", "30px", "#f7d36e"],
    ["-34px", "8px", "#a9d99f"]
  ];
  for (const [x, y, color] of petals) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.setProperty("--petal-x", x);
    petal.style.setProperty("--petal-y", y);
    petal.style.setProperty("--petal-color", color);
    burst.append(petal);
  }
  document.body.append(burst);
  window.setTimeout(() => burst.remove(), 1000);
}

function openConfirmation({ title, message, confirmLabel = "삭제할게요", onConfirm }) {
  pendingConfirmation = onConfirm;
  elements.confirmationTitle.textContent = title;
  elements.confirmationMessage.textContent = message;
  elements.confirmationConfirm.textContent = confirmLabel;
  elements.confirmationDialog.showModal();
}

function closeConfirmation() {
  pendingConfirmation = null;
  elements.confirmationDialog.close();
}

function deleteTask(task) {
  const message = isRecurring(task)
    ? `‘${task.text}’ 반복 일정 전체와 날짜별 완료 기록을 모두 삭제할까요?`
    : `‘${task.text}’ 일정을 삭제할까요?`;
  openConfirmation({
    title: isRecurring(task) ? "반복 일정을 삭제할까요?" : "일정을 삭제할까요?",
    message,
    onConfirm: () => {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      delete state.recurrenceCompletions[task.id];
      if (editingTaskId === task.id) resetTaskForm();
      saveState();
      render();
    }
  });
}

function resetCategoryForm() {
  editingCategoryId = "";
  elements.categoryForm.reset();
  document.getElementById("category-edit-actions")?.remove();
  elements.categoryColor.value = "#6c63ff";
  elements.categorySubmit.textContent = "카테고리 추가";
  elements.cancelCategoryEdit.classList.add("hidden");
}

function startCategoryEdit(category) {
  editingCategoryId = category.id;
  elements.categoryName.value = category.name;
  elements.categoryColor.value = category.color;
  elements.categorySubmit.textContent = "수정 저장";
  elements.cancelCategoryEdit.classList.remove("hidden");
  elements.categoryName.focus();
  elements.categoryForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handleCategorySubmit(event) {
  event.preventDefault();
  const name = elements.categoryName.value.trim();
  if (!name) {
    showMessage("카테고리 이름을 입력해 주세요.", "warning");
    elements.categoryName.focus();
    return;
  }
  if (name.length > 30) {
    showMessage("카테고리 이름은 최대 30자까지 입력할 수 있어요.", "warning");
    elements.categoryName.focus();
    return;
  }
  if (state.categories.some((category) => category.name.toLocaleLowerCase() === name.toLocaleLowerCase() && category.id !== editingCategoryId)) {
    showMessage("이미 사용 중인 카테고리 이름이에요.", "warning");
    elements.categoryName.focus();
    return;
  }

  if (editingCategoryId) {
    const category = state.categories.find((item) => item.id === editingCategoryId);
    if (!category) {
      showMessage("수정할 카테고리를 찾을 수 없습니다.");
      resetCategoryForm();
      return;
    }
    category.name = name;
    category.color = getSafeColor(elements.categoryColor.value);
  } else {
    state.categories.push({
      id: makeId("category"),
      name,
      color: getSafeColor(elements.categoryColor.value)
    });
  }
  resetCategoryForm();
  saveState();
  render();
}

function deleteCategory(category) {
  openConfirmation({
    title: "카테고리를 삭제할까요?",
    message: `‘${category.name}’ 카테고리를 삭제할까요? 해당 일정은 삭제되지 않고 미분류로 이동합니다.`,
    onConfirm: () => {
      state.categories = state.categories.filter((item) => item.id !== category.id);
      for (const task of state.tasks) {
        if (task.categoryId === category.id) {
          task.categoryId = "";
          task.updatedAt = new Date().toISOString();
        }
      }
      if (selectedCategoryId === category.id) selectedCategoryId = "";
      if (editingCategoryId === category.id) resetCategoryForm();
      saveState();
      render();
    }
  });
}

function startCategoryEditWithActions(category) {
  startCategoryEdit(category);
  const existingActions = document.getElementById("category-edit-actions");
  existingActions?.remove();

  const actions = document.createElement("div");
  actions.id = "category-edit-actions";
  actions.className = "mt-2 flex items-center justify-between gap-2";
  const message = document.createElement("span");
  message.className = "muted-copy text-sm";
  message.textContent = "카테고리 이름과 색상을 수정하거나 삭제할 수 있어요.";
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button button-small border-red-200 text-red-700 hover:bg-red-50";
  deleteButton.textContent = "카테고리 삭제";
  deleteButton.addEventListener("click", () => deleteCategory(category));
  actions.append(message, deleteButton);
  elements.categoryForm.append(actions);
}

function wireEvents() {
  elements.taskForm.addEventListener("submit", handleTaskSubmit);
  elements.taskRepeat.addEventListener("change", handleRepeatChange);
  elements.taskDate.addEventListener("change", handleTaskDateChange);
  elements.weeklyDays.addEventListener("change", () => {
    weeklyDaysCustomized = true;
  });
  elements.cancelTaskEdit.addEventListener("click", () => {
    resetTaskForm();
    clearMessage();
  });
  elements.taskFilter.addEventListener("change", render);
  elements.resetFilters.addEventListener("click", () => {
    elements.taskFilter.value = "all";
    selectedCategoryId = "";
    render();
  });
  elements.categoryForm.addEventListener("submit", handleCategorySubmit);
  elements.cancelCategoryEdit.addEventListener("click", () => {
    resetCategoryForm();
    clearMessage();
    render();
  });
  elements.confirmationCancel.addEventListener("click", closeConfirmation);
  elements.confirmationDialog.addEventListener("cancel", () => {
    pendingConfirmation = null;
  });
  elements.confirmationDialog.addEventListener("click", (event) => {
    if (event.target === elements.confirmationDialog) closeConfirmation();
  });
  elements.confirmationConfirm.addEventListener("click", () => {
    const confirm = pendingConfirmation;
    closeConfirmation();
    if (confirm) confirm();
  });
}

function initialize() {
  state = loadState();
  elements.taskDate.value = todayISO();
  setWeeklyDays([weekdayFor(todayISO())]);
  wireEvents();
  render();
}

initialize();
