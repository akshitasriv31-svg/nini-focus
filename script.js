
(() => {
  "use strict";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const STORAGE_KEY = "ninifocus.v1";

  const state = {
    tasks: [],
    filter: "all",
    view: "today",
    selectedMinutes: 25,
    remainingSeconds: 25 * 60,
    timerRunning: false,
    timerEndAt: null,
    focusMinutes: 0,
    sessions: 0,
    completedSessions: 0,
    timerInterval: null,
    editingId: null
  };

  const els = {
    taskList: $("#taskList"),
    allTasksList: $("#allTasksList"),
    emptyState: $("#emptyState"),
    taskDialog: $("#taskDialog"),
    taskForm: $("#taskForm"),
    taskTitle: $("#taskTitle"),
    taskDeadline: $("#taskDeadline"),
    taskDuration: $("#taskDuration"),
    taskImportance: $("#taskImportance"),
    taskCategory: $("#taskCategory"),
    taskNotes: $("#taskNotes"),
    toast: $("#toast"),
    timerValue: $("#timerValue"),
    miniTimer: $("#miniTimer"),
    timerState: $("#timerState")
  };

  // LOAD AND SAVE DATA

  function load() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "{}"
      );

      state.tasks = Array.isArray(saved.tasks)
        ? saved.tasks
        : [];

      state.focusMinutes = Number(saved.focusMinutes) || 0;
      state.sessions = Number(saved.sessions) || 0;
      state.completedSessions =
        Number(saved.completedSessions) || 0;

    } catch {
      state.tasks = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          tasks: state.tasks,
          focusMinutes: state.focusMinutes,
          sessions: state.sessions,
          completedSessions: state.completedSessions
        })
      );
    } catch {
      toast(
        "Couldn't save on this device. Check browser storage settings."
      );
    }
  }

  function uid() {
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // SAFE TEXT DISPLAY

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
    );
  }

  // NOTIFICATIONS

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");

    clearTimeout(toast.timeout);

    toast.timeout = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2600);
  }

  // DATE HELPERS

  function dateLabel(dateString) {
    if (!dateString) return "";

    const date = new Date(`${dateString}T12:00:00`);

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }

  function isOverdue(task) {
    if (!task.deadline || task.completed) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return new Date(`${task.deadline}T00:00:00`) < today;
  }

  // TASK PRIORITY CALCULATION

  function taskScore(task) {
    let score = Number(task.importance || 2) * 10;

    if (task.deadline) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const deadline = new Date(
        `${task.deadline}T00:00:00`
      );

      const days = Math.ceil(
        (deadline - today) / 86400000
      );

      if (days < 0) {
        score += 35;
      } else if (days === 0) {
        score += 30;
      } else if (days <= 2) {
        score += 20;
      } else if (days <= 7) {
        score += 10;
      }
    }

    if (task.completed) score -= 1000;

    return score;
  }

  // DISPLAY TASK CARDS

  function taskMarkup(task) {
    const done = task.completed;

    const todayString = [
      new Date().getFullYear(),
      String(new Date().getMonth() + 1).padStart(2, "0"),
      String(new Date().getDate()).padStart(2, "0")
    ].join("-");

    const deadlineTag = task.deadline
      ? `<span class="tag ${
          isOverdue(task)
            ? "overdue"
            : task.deadline === todayString
              ? "urgent"
              : ""
        }">${
          isOverdue(task) ? "Overdue · " : "Due "
        }${escapeHtml(dateLabel(task.deadline))}</span>`
      : "";

    const priorities = {
      1: "Low",
      2: "Medium",
      3: "High"
    };

    return `
      <article
        class="task-item ${done ? "completed" : ""}"
        data-task-id="${escapeHtml(task.id)}"
      >
        <input
          class="task-check"
          type="checkbox"
          aria-label="Mark task complete"
          ${done ? "checked" : ""}
          data-action="toggle"
        >

        <div class="task-main">
          <div class="task-title">
            ${escapeHtml(task.title)}
          </div>

          <div class="task-meta">
            <span class="tag">
              ${escapeHtml(task.category || "Other")}
            </span>

            <span class="tag">
              ${Number(task.duration || 30)} min
            </span>

            <span class="tag">
              ${priorities[task.importance] || "Medium"} priority
            </span>

            ${deadlineTag}
          </div>

          ${
            task.notes
              ? `<div class="task-note">
                  First step: ${escapeHtml(task.notes)}
                </div>`
              : ""
          }
        </div>

        <div class="task-actions">
          <button
            class="mini-action"
            data-action="edit"
            title="Edit task"
            aria-label="Edit task"
          >✎</button>

          <button
            class="mini-action"
            data-action="delete"
            title="Delete task"
            aria-label="Delete task"
          >×</button>
        </div>
      </article>
    `;
  }

  // TASK FILTERING

  function filteredTasks() {
    let list = [...state.tasks];

    if (state.filter === "open") {
      list = list.filter(task => !task.completed);
    }

    if (state.filter === "done") {
      list = list.filter(task => task.completed);
    }

    return list.sort(
      (a, b) =>
        Number(a.completed) - Number(b.completed) ||
        taskScore(b) - taskScore(a) ||
        (a.createdAt || 0) - (b.createdAt || 0)
    );
  }

  // RENDER TASKS

  function renderTasks() {
    const list = filteredTasks();

    els.taskList.innerHTML = list
      .map(taskMarkup)
      .join("");

    els.allTasksList.innerHTML = [...state.tasks]
      .sort(
        (a, b) =>
          Number(a.completed) - Number(b.completed) ||
          taskScore(b) - taskScore(a)
      )
      .map(taskMarkup)
      .join("");

    els.emptyState.classList.toggle(
      "hidden",
      state.tasks.length > 0
    );

    els.taskList.classList.toggle(
      "hidden",
      state.tasks.length === 0 || list.length === 0
    );

    if (state.tasks.length && list.length === 0) {
      els.taskList.innerHTML = `
        <div class="empty-state">
          <h3>Nothing in this view</h3>
          <p>Try another filter to see your tasks.</p>
        </div>
      `;

      els.taskList.classList.remove("hidden");
    }

    updateProgress();
  }

  // PROGRESS AND ACHIEVEMENTS

  function updateProgress() {
    const total = state.tasks.length;

    const completed = state.tasks.filter(
      task => task.completed
    ).length;

    const percent = total
      ? Math.round((completed / total) * 100)
      : 0;

    $("#progressPercent").textContent = `${percent}%`;

    $("#progressCount").textContent =
      `${completed} of ${total} tasks`;

    $("#progressRing").style.background =
      `conic-gradient(var(--orange) ${
        percent * 3.6
      }deg, #f4eee8 0deg)`;

    $("#progressTitle").textContent =
      percent === 100 && total
        ? "You did it. Lovely work!"
        : completed
          ? "Look at you making progress"
          : "You're getting there";

    $("#statCompleted").textContent = completed;
    $("#statMinutes").textContent = state.focusMinutes;
    $("#statSessions").textContent = state.sessions;

    const milestones = [
      [
        "🌱",
        "First step",
        "Add your first task",
        state.tasks.length >= 1
      ],
      [
        "✓",
        "Little win",
        "Complete a task",
        completed >= 1
      ],
      [
        "✦",
        "Focus friend",
        "Finish a focus session",
        state.completedSessions >= 1
      ],
      [
        "🌼",
        "Growing steadily",
        "Complete five tasks",
        completed >= 5
      ],
      [
        "☀",
        "In your rhythm",
        "Complete three sessions",
        state.completedSessions >= 3
      ],
      [
        "🏆",
        "Look how far",
        "Complete ten tasks",
        completed >= 10
      ]
    ];

    $("#achievementList").innerHTML = milestones
      .map(
        milestone => `
          <div class="achievement ${
            milestone[3] ? "" : "locked"
          }">
            <div class="medal">${milestone[0]}</div>

            <div>
              <strong>${milestone[1]}</strong>
              <small>${milestone[2]}</small>
            </div>
          </div>
        `
      )
      .join("");
  }

  // ADD AND EDIT TASKS

  function openTaskDialog(task = null) {
    state.editingId = task?.id || null;

    $("#dialogTitle").textContent = task
      ? "Edit your task"
      : "Add a task";

    els.taskTitle.value = task?.title || "";
    els.taskDeadline.value = task?.deadline || "";

    els.taskDuration.value = String(
      task?.duration || 30
    );

    els.taskImportance.value = String(
      task?.importance || 2
    );

    els.taskCategory.value =
      task?.category || "Study";

    els.taskNotes.value = task?.notes || "";

    els.taskDialog.showModal();

    setTimeout(() => els.taskTitle.focus(), 30);
  }

  function closeDialog() {
    els.taskDialog.close();
    state.editingId = null;
  }

  els.taskForm.addEventListener("submit", event => {
    event.preventDefault();

    const title = els.taskTitle.value.trim();

    if (!title) {
      els.taskTitle.focus();
      return;
    }

    const data = {
      title,
      deadline: els.taskDeadline.value,
      duration: Number(els.taskDuration.value),
      importance: Number(els.taskImportance.value),
      category: els.taskCategory.value,
      notes: els.taskNotes.value.trim()
    };

    if (state.editingId) {
      const task = state.tasks.find(
        item => item.id === state.editingId
      );

      if (task) Object.assign(task, data);

      toast("Task updated. You've got this.");
    } else {
      state.tasks.push({
        id: uid(),
        ...data,
        completed: false,
        createdAt: Date.now()
      });

      toast("Task added. One step at a time.");
    }

    save();
    renderTasks();
    closeDialog();
  });

  $("#closeDialog").addEventListener(
    "click",
    closeDialog
  );

  $("#cancelDialog").addEventListener(
    "click",
    closeDialog
  );

  els.taskDialog.addEventListener("click", event => {
    if (event.target === els.taskDialog) {
      closeDialog();
    }
  });

  // COMPLETE, EDIT, OR DELETE TASKS

  function handleTaskAction(event) {
    const actionElement = event.target.closest(
      "[data-action]"
    );

    if (!actionElement) return;

    const article = actionElement.closest(
      "[data-task-id]"
    );

    const task = state.tasks.find(
      item => item.id === article?.dataset.taskId
    );

    if (!task) return;

    const action = actionElement.dataset.action;

    if (action === "toggle") {
      task.completed = actionElement.checked;

      if (task.completed) {
        toast("A little win! Take that in.");
      }

      save();
      renderTasks();

    } else if (action === "delete") {
      state.tasks = state.tasks.filter(
        item => item.id !== task.id
      );

      save();
      renderTasks();
      toast("Task removed.");

    } else if (action === "edit") {
      openTaskDialog(task);
    }
  }

  els.taskList.addEventListener(
    "click",
    handleTaskAction
  );

  els.taskList.addEventListener(
    "change",
    handleTaskAction
  );

  els.allTasksList.addEventListener(
    "click",
    handleTaskAction
  );

  els.allTasksList.addEventListener(
    "change",
    handleTaskAction
  );

  // OPEN TASK FORM

  function addOpeners() {
    $("#quickAddBtn").addEventListener(
      "click",
      () => openTaskDialog()
    );

    $("#emptyAddBtn").addEventListener(
      "click",
      () => openTaskDialog()
    );

    $$("[data-add-task]").forEach(button => {
      button.addEventListener(
        "click",
        () => openTaskDialog()
      );
    });
  }

  // NAVIGATION

  function setView(view) {
    state.view = view;

    const labels = {
      today: "Today",
      tasks: "All tasks",
      focus: "Focus room",
      progress: "Progress"
    };

    Object.keys(labels).forEach(key => {
      const panel = $(`#${key}View`);

      if (panel) {
        panel.classList.toggle(
          "hidden",
          key !== view
        );
      }
    });

    $$(".nav-item").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.view === view
      );
    });

    $("#breadcrumbPage").textContent =
      labels[view] || "Today";

    $("#headingSub").textContent = ({
      today: "Let's make today feel manageable.",
      tasks: "Everything you're carrying, gathered in one place.",
      focus: "A gentle space to give one thing your attention.",
      progress: "Every little step is worth noticing."
    })[view];

    $("#greeting").textContent = ({
      today: "A little progress goes a long way.",
      tasks: "Let's get it out of your head.",
      focus: "Make space for one thing.",
      progress: "Look how far you've come."
    })[view];

    $(".sidebar").classList.remove("open");
  }

  $$(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
    });
  });

  $$("[data-goto]").forEach(button => {
    button.addEventListener("click", () => {
      setView(button.dataset.goto);
    });
  });

  $("#mobileMenu").addEventListener("click", () => {
    $(".sidebar").classList.toggle("open");
  });

  // RESET AND REFOCUS

  $("#resetFocusBtn").addEventListener("click", () => {
    setView("focus");

    showReset(
      "Take a slow breath in, then let it out gently. You can begin again with one small step."
    );
  });

  $$(".filter-pill").forEach(button => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;

      $$(".filter-pill").forEach(pill => {
        pill.classList.toggle(
          "active",
          pill === button
        );
      });

      renderTasks();
    });
  });

  // TASK RECOMMENDATIONS

  $("#recommendBtn").addEventListener("click", () => {
    const available = Number(
      $("#availableTime").value
    );

    const candidate = state.tasks
      .filter(
        task =>
          !task.completed &&
          Number(task.duration || 30) <= available
      )
      .sort(
        (a, b) => taskScore(b) - taskScore(a)
      )[0];

    const box = $("#recommendation");

    box.classList.remove("hidden");

    if (candidate) {
      box.innerHTML = `
        <strong>
          Try this next: ${escapeHtml(candidate.title)}
        </strong>

        <p>
          ${
            candidate.notes
              ? `Start with: ${escapeHtml(candidate.notes)}`
              : `Give it ${candidate.duration} minutes. Just focus on the next manageable step.`
          }
        </p>
      `;
    } else {
      const shorter = state.tasks
        .filter(task => !task.completed)
        .sort(
          (a, b) =>
            Number(a.duration || 30) -
            Number(b.duration || 30)
        )[0];

      box.innerHTML = shorter
        ? `
          <strong>Try a tiny first step</strong>
          <p>
            ${escapeHtml(
              shorter.notes ||
              `Spend ${available} minutes getting started on ${shorter.title}`
            )}
            You don't have to finish the whole task now.
          </p>
        `
        : `
          <strong>You're clear to choose</strong>
          <p>
            Add a task with a deadline and time estimate,
            and I'll help you pick a next step.
          </p>
        `;
    }
  });

  // FOCUS TIMER

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, seconds);

    const minutes = Math.floor(
      safeSeconds / 60
    );

    const remaining = safeSeconds % 60;

    return (
      String(minutes).padStart(2, "0") +
      ":" +
      String(remaining).padStart(2, "0")
    );
  }

  function paintTimer() {
    const value = formatTime(
      state.remainingSeconds
    );

    els.timerValue.textContent = value;
    els.miniTimer.textContent = value;
  }

  function stopInterval() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }

    state.timerInterval = null;
  }

  function startTimer() {
    if (state.timerRunning) return;

    state.timerRunning = true;

    state.timerEndAt =
      Date.now() +
      state.remainingSeconds * 1000;

    $("#timerStart").textContent = "Ⅱ Pause focus";

    els.timerState.textContent =
      "YOU'RE IN YOUR FOCUS TIME";

    $("#timerHelp").textContent =
      "Stay with one thing. Pausing is always allowed.";

    state.sessions += 1;

    save();

    state.timerInterval = setInterval(() => {
      state.remainingSeconds = Math.max(
        0,
        Math.ceil(
          (state.timerEndAt - Date.now()) / 1000
        )
      );

      paintTimer();

      if (state.remainingSeconds <= 0) {
        finishTimer();
      }
    }, 250);
  }

  function pauseTimer() {
    state.timerRunning = false;

    stopInterval();

    $("#timerStart").textContent =
      "▶ Resume focus";

    els.timerState.textContent =
      "PAUSED — TAKE YOUR TIME";

    save();
  }

  function finishTimer() {
    const completed =
      state.remainingSeconds <= 0;

    state.timerRunning = false;

    stopInterval();

    if (completed) {
      state.focusMinutes +=
        state.selectedMinutes;

      state.completedSessions += 1;

      toast(
        "Focus session complete. Lovely work!"
      );

      els.timerState.textContent =
        "SESSION COMPLETE · WELL DONE";

    } else {
      els.timerState.textContent =
        "READY WHEN YOU ARE";
    }

    $("#timerStart").textContent =
      "▶ Start focus";

    state.remainingSeconds =
      state.selectedMinutes * 60;

    paintTimer();
    save();
    updateProgress();
  }

  $("#timerStart").addEventListener("click", () => {
    if (state.timerRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  $("#timerReset").addEventListener("click", () => {
    state.timerRunning = false;

    stopInterval();

    state.remainingSeconds =
      state.selectedMinutes * 60;

    $("#timerStart").textContent =
      "▶ Start focus";

    els.timerState.textContent =
      "READY WHEN YOU ARE";

    paintTimer();
  });

  $$(".preset").forEach(button => {
    button.addEventListener("click", () => {
      if (state.timerRunning) {
        pauseTimer();
      }

      state.selectedMinutes = Number(
        button.dataset.minutes
      );

      state.remainingSeconds =
        state.selectedMinutes * 60;

      $$(".preset").forEach(preset => {
        preset.classList.toggle(
          "active",
          preset === button
        );
      });

      paintTimer();

      $("#timerStart").textContent =
        "▶ Start focus";

      els.timerState.textContent =
        "READY WHEN YOU ARE";
    });
  });

  // BREATHING AND REFocusing OPTIONS

  function showReset(message) {
    const box = $("#resetMessage");

    box.textContent = message;
    box.classList.remove("hidden");
  }

  const resetMessages = {
    breath:
      "Breathe in gently for 4, pause if comfortable, then breathe out slowly for 6. Repeat three times at your own pace. If this feels uncomfortable, return to your normal breathing.",

    stretch:
      "Let your shoulders drop. Unclench your jaw, stretch your hands, and look away from your screen for a moment. No rush.",

    step:
      "Pick one action that takes less than two minutes: open the file, write a heading, or read one paragraph. Starting is enough for now."
  };

  $$(".reset-option").forEach(button => {
    button.addEventListener("click", () => {
      showReset(
        resetMessages[button.dataset.reset]
      );
    });
  });

  // INITIALIZE APP

  $("#todayDate").textContent =
    new Date().toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });

  load();
  addOpeners();
  renderTasks();
  paintTimer();

})();