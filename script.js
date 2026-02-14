

const state = {
    selectedDate: null,
    tasks: [],
    dates: [],
    editingTaskId: null,
    viewStartSunday: null,
    lastNotifiedTime: null
};

function handleTaskCardInteraction(card, taskId) {
    let lastTouchTime = 0;

    card.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTouchTime;

        if (tapLength < 300 && tapLength > 0) {
            e.preventDefault();
            editTask(taskId, e);
        }
        lastTouchTime = currentTime;
    });

    card.addEventListener('dblclick', (e) => {
        editTask(taskId, e);
    });
}

const COLORS = ['#9d8bf4', '#86e3ce', '#78d5d7', '#e0d8cc', '#ff9aa2', '#b5ead7'];
const START_HOUR = 0;
const END_HOUR = 23;

const dateScroller = document.getElementById('date-scroller');
const timeline = document.getElementById('timeline');
const modalOverlay = document.getElementById('modal-overlay');
const createTaskBtn = document.getElementById('create-task-btn');

const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');

const recurringToggle = document.getElementById('recurring-toggle');
const daySelector = document.getElementById('day-selector');
const dayPills = document.querySelectorAll('.day-pill');
const deleteBtn = document.getElementById('delete-btn');

const colorOptionsContainer = document.getElementById('color-options');
const taskNameInput = document.getElementById('task-name');
const taskTimeInput = document.getElementById('task-start-time');

const taskStartTimeInput = document.getElementById('task-start-time');
const taskEndTimeInput = document.getElementById('task-end-time');
const hasEndTimeCheckbox = document.getElementById('has-end-time');
const taskDateInput = document.getElementById('task-date');
const currentMonthDisplay = document.getElementById('current-month');
const summaryTitle = document.getElementById('summary-title');
const summarySubtitle = document.getElementById('summary-subtitle');
const sheetTitle = document.getElementById('sheet-title');



function init() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'create') {
        const hasVisited = localStorage.getItem('ghostplan_onboarding_complete');
        if (hasVisited) {
            setTimeout(() => openModal(), 500);
        }
        window.history.replaceState({}, document.title, "/");
    }

    generateDates();
    loadData();

    if (state.tasks.length === 0) {
        seedSampleTasks();
    }

    const hasVisited = localStorage.getItem('ghostplan_onboarding_complete');
    if (!hasVisited) {
        document.getElementById('home-view').classList.remove('active');
        document.getElementById('onboarding-view').style.display = 'block';
        setTimeout(() => document.getElementById('onboarding-view').classList.add('active'), 10);
    } else {
        document.getElementById('home-view').classList.add('active');

        const today = new Date();
        const offset = today.getTimezoneOffset() * 60000;
        const localToday = new Date(today.getTime() - offset).toISOString().split('T')[0];
        selectDate(localToday);
        scrollToCurrentTime();
    }

    setupEventListeners();
    renderColorOptions();

    startNotificationScheduler();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered!', reg))
            .catch(err => console.error('SW failed', err));
    }
}

window.nextOnboardingStep = function (step) {
    const current = document.querySelector('.onboarding-step.active');
    if (current) current.classList.remove('active');

    const next = document.getElementById(`step-${step}`);
    if (next) next.classList.add('active');
}

window.finishOnboarding = function () {
    localStorage.setItem('ghostplan_onboarding_complete', 'true');

    const view = document.getElementById('onboarding-view');
    view.style.opacity = '0';

    setTimeout(() => {
        view.style.display = 'none';
        document.getElementById('home-view').classList.add('active');

        const today = new Date();
        const offset = today.getTimezoneOffset() * 60000;
        const localToday = new Date(today.getTime() - offset).toISOString().split('T')[0];
        selectDate(localToday);
        scrollToCurrentTime();
    }, 500);
}

function scrollToCurrentTime() {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const localToday = new Date(today.getTime() - offset).toISOString().split('T')[0];

    if (state.selectedDate === localToday) {
        const currentHour = new Date().getHours();
        const slot = document.querySelector(`.time-slot[data-hour="${currentHour}"]`);
        if (slot) {
            slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function generateDates() {
    state.dates = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    let startDate = new Date(currentYear, 0, 1);

    let endDate = new Date(currentYear, 11, 31);

    const last7DaysCheck = new Date(currentYear, 11, 24);
    if (today >= last7DaysCheck) {
        endDate = new Date(currentYear + 1, 11, 31);
    }

    let loopDate = new Date(startDate);
    while (loopDate <= endDate) {
        const dayName = days[loopDate.getDay()];
        const dateNum = loopDate.getDate();

        const year = loopDate.getFullYear();
        const month = String(loopDate.getMonth() + 1).padStart(2, '0');
        const day = String(loopDate.getDate()).padStart(2, '0');
        const fullDate = `${year}-${month}-${day}`;

        state.dates.push({
            dayName,
            dateNum,
            fullDate,
            rawDate: new Date(loopDate)
        });

        loopDate.setDate(loopDate.getDate() + 1);
    }
}

function seedSampleTasks() {
    if (state.tasks.length === 0) {
        state.tasks = [];
    }
}

function selectDate(fullDate) {
    state.selectedDate = fullDate;

    if (fullDate) {
        syncViewToSelectedDate(fullDate);
    }

    updateHeaderMonth();
    renderDates();
    renderTimeline();
    updateSummaryCard();
}

function syncViewToSelectedDate(fullDate) {
    const targetDateObj = state.dates.find(d => d.fullDate === fullDate);
    if (!targetDateObj) return;
    let needsUpdate = false;

    if (!state.viewStartSunday) {
        needsUpdate = true;
    } else {
        const startIndex = state.dates.findIndex(d => d.fullDate === state.viewStartSunday);
        const targetIndex = state.dates.findIndex(d => d.fullDate === fullDate);

        if (targetIndex < startIndex || targetIndex > startIndex + 6) {
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        const targetIndex = state.dates.findIndex(d => d.fullDate === fullDate);
        const raw = targetDateObj.rawDate;
        const dayOfWeek = raw.getDay();
        const sundayIndex = targetIndex - dayOfWeek;

        if (sundayIndex >= 0 && sundayIndex < state.dates.length) {
            state.viewStartSunday = state.dates[sundayIndex].fullDate;
        } else {
            state.viewStartSunday = state.dates[0].fullDate;
        }
    }
}

function updateHeaderMonth() {
    if (!state.selectedDate) return;

    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);

    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    currentMonthDisplay.textContent = dateObj.toLocaleDateString('en-GB', options);
}

function updateSummaryCard() {
    if (!summaryTitle || !summarySubtitle) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const selected = new Date(y, m - 1, d);
    selected.setHours(0, 0, 0, 0);

    const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const utcSelected = Date.UTC(selected.getFullYear(), selected.getMonth(), selected.getDate());
    const diffDays = Math.floor((utcSelected - utcToday) / (1000 * 60 * 60 * 24));

    let titleText = "";

    if (diffDays === 0) {
        titleText = "Today's Task";
    } else if (diffDays === -1) {
        titleText = "Yesterday's Task";
    } else if (diffDays === 1) {
        titleText = "Tomorrow's Task";
    } else {
        const options = { month: 'short', day: 'numeric' };
        titleText = selected.toLocaleDateString('en-US', options) + " Tasks";
    }

    const dayNameMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const selectedDayName = dayNameMap[selected.getDay()];

    const tasksCount = state.tasks.filter(t => {
        const isExactDate = t.date === state.selectedDate;
        const isRecurringMatch = t.isRecurring && t.recurringDays.includes(selectedDayName) && t.date <= state.selectedDate;

        return isExactDate || isRecurringMatch;
    });

    const totalTasks = tasksCount.length;
    const remainingTasks = tasksCount.filter(t => {
        if (t.isRecurring) {
            return !(t.completedDates && t.completedDates.includes(state.selectedDate));
        } else {
            return !t.completed;
        }
    }).length;

    summaryTitle.textContent = titleText;
    summarySubtitle.textContent = `${totalTasks} Task${totalTasks !== 1 ? 's' : ''} · ${remainingTasks} Remaining`;
}

function renderDates() {
    dateScroller.innerHTML = '';

    if (!state.viewStartSunday) return;

    const startIndex = state.dates.findIndex(d => d.fullDate === state.viewStartSunday);
    if (startIndex === -1) return;

    const windowDates = state.dates.slice(startIndex, startIndex + 7);

    windowDates.forEach(dateObj => {
        const el = document.createElement('button');
        el.className = `date-pill ${dateObj.fullDate === state.selectedDate ? 'active' : ''}`;
        el.innerHTML = `
            <span class="day">${dateObj.dayName.toUpperCase()}</span>
            <span class="date">${dateObj.dateNum}</span>
        `;
        el.onclick = () => selectDate(dateObj.fullDate);
        dateScroller.appendChild(el);
    });
}

function renderTimeline() {
    timeline.innerHTML = '';

    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const selectedDateObj = new Date(y, m - 1, d);
    const dayNameMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const selectedDayName = dayNameMap[selectedDateObj.getDay()];

    const daysTasks = state.tasks.filter(t => {
        const isExactDate = t.date === state.selectedDate;

        const isRecurringMatch = t.isRecurring && t.recurringDays.includes(selectedDayName) && t.date <= state.selectedDate;

        return isExactDate || isRecurringMatch;
    });

    if (daysTasks.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.style.padding = '40px 20px';
        emptyState.style.textAlign = 'center';
        emptyState.style.color = 'var(--text-secondary)';
        emptyState.innerHTML = `
            <div style="opacity: 0.5; margin-bottom: 10px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </div>
            <p>No tasks for this day</p>
            <p style="font-size: 12px; margin-top: 8px;">Tap '+' to create one</p>
            <p style="font-size: 12px; margin-top: 8px;">Tap '+' to create one</p>
        `;
        timeline.appendChild(emptyState);
        document.body.classList.add('no-scroll');
        return;
    }

    document.body.classList.remove('no-scroll');

    daysTasks.sort((a, b) => {
        return a.startTime.localeCompare(b.startTime);
    });

    const uniqueHours = [...new Set(daysTasks.map(t => t.startHour))].sort((a, b) => a - b);

    uniqueHours.forEach(h => {
        const row = document.createElement('div');
        row.className = 'time-slot';
        row.dataset.hour = h;

        const label = document.createElement('div');
        label.className = 'time-label';

        let period = h >= 12 ? 'PM' : 'AM';
        let hour12 = h % 12;
        if (hour12 === 0) hour12 = 12;

        label.textContent = `${hour12} ${period}`;

        const tasksContainer = document.createElement('div');
        tasksContainer.className = 'tasks-container';

        const tasksInHour = daysTasks.filter(t => t.startHour === h);

        tasksInHour.forEach(task => {
            let isCompleted = false;
            if (task.isRecurring) {
                isCompleted = task.completedDates ? task.completedDates.includes(state.selectedDate) : false;
            } else {
                isCompleted = task.completed;
            }

            const card = document.createElement('div');
            card.className = `task-card ${isCompleted ? 'completed' : ''}`;
            card.style.backgroundColor = isCompleted ? '' : task.color;

            handleTaskCardInteraction(card, task.id);

            const recurringIcon = task.isRecurring ? '<i class="fa-solid fa-repeat" style="font-size: 10px; margin-right: 4px; opacity: 0.7;"></i>' : '';

            const startFormatted = formatTime(task.startTime);
            const endFormatted = task.endTime ? ` - ${formatTime(task.endTime)}` : '';
            const timeRangeStr = `${startFormatted}${endFormatted}`;

            card.innerHTML = `
                <div class="task-content" style="flex-direction: column; align-items: flex-start; gap: 2px;">
                    <div style="font-size: 11px; opacity: 0.8; font-weight: 500;">
                        ${recurringIcon}${timeRangeStr}
                    </div>
                    <span class="task-name" style="font-size: 14px;">${task.name}</span>
                </div>
                <button class="check-btn" onclick="toggleTask('${task.id}', event)" aria-label="Toggle task completion">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
            `;
            tasksContainer.appendChild(card);
        });

        row.appendChild(label);
        row.appendChild(tasksContainer);
        timeline.appendChild(row);
    });
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    const minStr = m < 10 ? `0${m}` : m;
    return `${hour12}:${minStr} ${period}`;
}

function renderTimeOptionsInModal() {
    taskTimeInput.innerHTML = '';
    for (let h = 0; h <= 23; h++) {
        let period = h >= 12 ? 'PM' : 'AM';
        let hour12 = h % 12;
        if (hour12 === 0) hour12 = 12;

        const option = document.createElement('option');
        option.value = h;
        option.textContent = `${hour12} ${period}`;
        taskTimeInput.appendChild(option);
    }
}


function renderColorOptions() {
    colorOptionsContainer.innerHTML = '';
    COLORS.forEach((color, index) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;

        swatch.onclick = () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        };

        colorOptionsContainer.appendChild(swatch);
    });
}

function saveData() {
    try {
        localStorage.setItem('ghostplan_tasks', JSON.stringify(state.tasks));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            alert('Storage full!');
        }
    }
}

function loadData() {
    const tasksParams = localStorage.getItem('ghostplan_tasks');
    const userParams = localStorage.getItem('ghostplan_user');

    if (tasksParams) {
        try {
            state.tasks = JSON.parse(tasksParams);
        } catch (e) {
            console.error('Corrupt task data', e);
            state.tasks = [];
        }
    }

}

function showToast(message) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-message');
    if (toast && msg) {
        msg.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }
}


window.toggleTask = function (id, event) {
    if (event) event.stopPropagation();
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        if (task.isRecurring) {
            if (!task.completedDates) task.completedDates = [];

            const dateStr = state.selectedDate;
            if (task.completedDates.includes(dateStr)) {
                task.completedDates = task.completedDates.filter(d => d !== dateStr);
            } else {
                task.completedDates.push(dateStr);
            }
        } else {
            task.completed = !task.completed;
        }

        saveData();
        renderTimeline();
        updateSummaryCard();
    }
};

function openModal(editingId = null) {
    modalOverlay.classList.add('active');

    if (editingId) {
        state.editingTaskId = editingId;
        const task = state.tasks.find(t => t.id === editingId);

        sheetTitle.textContent = "Edit Task";
        deleteBtn.style.display = "flex";

        taskNameInput.value = task.name;
        taskStartTimeInput.value = task.startTime;
        taskDateInput.value = task.date;

        if (task.endTime) {
            hasEndTimeCheckbox.checked = true;
            taskEndTimeInput.value = task.endTime;
            taskEndTimeInput.disabled = false;
        } else {
            hasEndTimeCheckbox.checked = false;
            taskEndTimeInput.value = '';
            taskEndTimeInput.disabled = true;
        }

        renderColorOptions();
        const swatches = document.querySelectorAll('.color-swatch');
        swatches.forEach(s => {
            s.classList.toggle('active', s.dataset.color === task.color);
        });

        if (task.isRecurring) {
            recurringToggle.checked = true;
            daySelector.style.display = 'block';
            dayPills.forEach(p => p.classList.remove('selected'));
            task.recurringDays.forEach(day => {
                const pill = document.querySelector(`.day-pill[data-day="${day}"]`);
                if (pill) pill.classList.add('selected');
            });
        } else {
            recurringToggle.checked = false;
            daySelector.style.display = 'none';
        }

    } else {
        state.editingTaskId = null;
        sheetTitle.textContent = "New Task";
        deleteBtn.style.display = "none";

        taskNameInput.value = '';
        taskStartTimeInput.value = '';

        hasEndTimeCheckbox.checked = false;
        taskEndTimeInput.value = '';
        taskEndTimeInput.disabled = true;

        const isValid = state.dates.some(d => d.fullDate === state.selectedDate);
        if (isValid) {
            taskDateInput.value = state.selectedDate;
        } else {
            const today = new Date();
            const offset = today.getTimezoneOffset() * 60000;
            const todayStr = new Date(today.getTime() - offset).toISOString().split('T')[0];
            taskDateInput.value = todayStr;
        }

        renderColorOptions();
        document.querySelectorAll('.color-swatch')[0].classList.add('active');

        recurringToggle.checked = false;
        daySelector.style.display = 'none';
        dayPills.forEach(p => p.classList.remove('selected'));
    }

}

function editTask(id, event) {
    if (event) event.stopPropagation();
    openModal(id);
}

function closeModal() {
    modalOverlay.classList.remove('active');
    state.editingTaskId = null;
}

function saveOrUpdateTask() {
    const name = taskNameInput.value.trim();
    if (!name) return;

    const mkStartTime = taskStartTimeInput.value;
    let mkEndTime = "";

    if (hasEndTimeCheckbox.checked) {
        mkEndTime = taskEndTimeInput.value;
    }

    const date = taskDateInput.value;
    const activeColor = document.querySelector('.color-swatch.active');
    const color = activeColor ? activeColor.dataset.color : COLORS[0];

    if (!mkStartTime) {
        alert('Please select a start time');
        return;
    }
    if (hasEndTimeCheckbox.checked) {
        if (!mkEndTime) {
            alert('Please select an end time or uncheck the box');
            return;
        }
        if (mkEndTime <= mkStartTime) {
            showToast('End time must be after start time');
            return;
        }
    }

    const isRecurring = recurringToggle.checked;
    let recurringDays = [];
    if (isRecurring) {
        recurringDays = Array.from(document.querySelectorAll('.day-pill.selected'))
            .map(p => p.dataset.day);
    }

    const taskData = {
        name,
        date,
        startTime: mkStartTime,
        endTime: mkEndTime,
        startHour: parseInt(mkStartTime.split(':')[0]),
        color,
        isRecurring,
        recurringDays
    };

    if (state.editingTaskId) {
        const taskIndex = state.tasks.findIndex(t => t.id === state.editingTaskId);
        if (taskIndex !== -1) {
            state.tasks[taskIndex] = {
                ...state.tasks[taskIndex],
                ...taskData
            };
        }
    } else {
        const newTask = {
            id: Date.now().toString(),
            ...taskData,
            completed: false,
            completedDates: []
        };
        state.tasks.push(newTask);
    }

    saveData();
    closeModal();
    renderTimeline();
    updateSummaryCard();
}

function deleteTask() {
    if (state.editingTaskId) {
        if (confirm('Are you sure you want to delete this task?')) {
            state.tasks = state.tasks.filter(t => t.id !== state.editingTaskId);
            saveData();
            closeModal();
            renderTimeline();
            updateSummaryCard();
        }
    }
}

function setupEventListeners() {
    createTaskBtn.addEventListener('click', () => openModal());

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    cancelBtn.addEventListener('click', closeModal);
    saveBtn.addEventListener('click', saveOrUpdateTask);
    deleteBtn.addEventListener('click', deleteTask);

    recurringToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            daySelector.style.display = 'block';
            const selectedCount = document.querySelectorAll('.day-pill.selected').length;
            if (selectedCount === 0) {
                dayPills.forEach(p => p.classList.add('selected'));
            }
        } else {
            daySelector.style.display = 'none';
        }
    });

    dayPills.forEach(pill => {
        pill.addEventListener('click', () => {
            pill.classList.toggle('selected');
        });
    });

    const moreOptionsBtn = document.getElementById('more-options-btn');
    const headerDropdown = document.getElementById('header-dropdown');
    const clearTasksBtn = document.getElementById('clear-tasks-btn');

    function startNotificationScheduler() {
        setInterval(checkDueTasks, 60000);
        setTimeout(checkDueTasks, 2000);
    }

    function checkDueTasks() {
        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();

        const timeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;

        if (state.lastNotifiedTime === timeStr) return;

        const offset = now.getTimezoneOffset() * 60000;
        const localToday = new Date(now.getTime() - offset).toISOString().split('T')[0];
        const dayNameMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const currentDayName = dayNameMap[now.getDay()];

        const dueTasks = state.tasks.filter(t => {
            if (t.startTime !== timeStr) return false;

            if (t.isRecurring) {
                if (t.completedDates && t.completedDates.includes(localToday)) return false;
            } else {
                if (t.completed) return false;
            }

            const isExactDate = t.date === localToday;
            const isRecurringMatch = t.isRecurring && t.recurringDays.includes(currentDayName) && t.date <= localToday;

            return isExactDate || isRecurringMatch;
        });

        if (dueTasks.length > 0) {
            state.lastNotifiedTime = timeStr;

            dueTasks.forEach(task => {
                showInAppNotification(task);

                if ("Notification" in window && Notification.permission === "granted") {
                    try {
                        new Notification("GhostPlan", {
                            body: `${task.name} is starting now!`,
                            icon: "another logo.png",
                            tag: task.id
                        });
                    } catch (e) {
                        console.error("System notification failed", e);
                    }
                }
            });
        }
    }

    function showInAppNotification(task) {
        const banner = document.getElementById('notification-banner');
        const title = document.getElementById('banner-title');
        const msg = document.getElementById('banner-message');

        if (banner && title && msg) {
            title.textContent = task.name;
            msg.textContent = `Starting at ${task.startTime}`;

            banner.classList.add('show');

            setTimeout(() => {
                banner.classList.remove('show');
            }, 5000);
        }

    }
    moreOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        headerDropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (headerDropdown && headerDropdown.classList.contains('active')) {
            if (!headerDropdown.contains(e.target) && e.target !== moreOptionsBtn) {
                headerDropdown.classList.remove('active');
            }
        }
    });

    const bannerCloseBtn = document.getElementById('banner-close');
    if (bannerCloseBtn) {
        bannerCloseBtn.addEventListener('click', () => {
            document.getElementById('notification-banner').classList.remove('show');
        });
    }

    clearTasksBtn.addEventListener('click', () => {
        if (confirm('Delete all tasks for the selected date?')) {
            state.tasks = state.tasks.filter(t => t.date !== state.selectedDate);
            saveData();
            renderTimeline();
            updateSummaryCard();
            headerDropdown.classList.remove('active');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
            closeModal();
        }
    });

    if (hasEndTimeCheckbox) {
        hasEndTimeCheckbox.addEventListener('change', (e) => {
            taskEndTimeInput.disabled = !e.target.checked;
            if (!e.target.checked) {
                taskEndTimeInput.value = '';
            }
        });
    }

    setupSwipeGestures();
}

function setupSwipeGestures() {
    setupSwipeForElement(timeline, (direction) => {
        if (direction === 'left') {
            changeDate(1);
        } else {
            changeDate(-1);
        }
    });

    setupSwipeForElement(dateScroller, (direction) => {
        if (direction === 'left') {
            changeWeek(1);
        } else {
            changeWeek(-1);
        }
    });
}

function setupSwipeForElement(element, onSwipe) {
    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;

    element.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diffX = touchEndX - touchStartX;

        if (Math.abs(diffX) > minSwipeDistance) {
            if (diffX < 0) {
                onSwipe('left');
            } else {
                onSwipe('right');
            }
        }
    }, { passive: true });
}

function changeWeek(direction) {
    const startIndex = state.dates.findIndex(d => d.fullDate === state.viewStartSunday);
    if (startIndex === -1) return;

    const newIndex = startIndex + (direction * 7);

    if (newIndex >= 0 && newIndex < state.dates.length) {
        state.viewStartSunday = state.dates[newIndex].fullDate;

        dateScroller.classList.remove('anim-slide-left', 'anim-slide-right');
        void dateScroller.offsetWidth;
        const animClass = direction === 1 ? 'anim-slide-left' : 'anim-slide-right';
        dateScroller.classList.add(animClass);

        renderDates();
    }
}

function changeDate(offset) {
    const currentIndex = state.dates.findIndex(d => d.fullDate === state.selectedDate);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + offset;
    if (newIndex >= 0 && newIndex < state.dates.length) {
        const direction = offset > 0 ? 'left' : 'right';

        timeline.classList.remove('anim-slide-left', 'anim-slide-right');
        void timeline.offsetWidth;
        timeline.classList.add(direction === 'left' ? 'anim-slide-left' : 'anim-slide-right');

        selectDate(state.dates[newIndex].fullDate);
    }
}

init();
