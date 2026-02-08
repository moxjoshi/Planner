

const state = {
    selectedDate: null,
    tasks: [],
    dates: [],
    editingTaskId: null,
    viewStartSunday: null, // Tracks the Sunday of the currently visible week
    lastNotifiedTime: null // Tracks the last minute we notified to avoid dupes
    // user: {} // Removed
};

// Custom Double Tap Handler to prevent Zoom
function handleTaskCardInteraction(card, taskId) {
    let lastTouchTime = 0;

    card.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTouchTime;

        if (tapLength < 300 && tapLength > 0) {
            // Double Tap Detected
            e.preventDefault(); // Prevent zoom
            editTask(taskId, e);
        }
        lastTouchTime = currentTime;
    });

    // Provide standard click for desktop/single tap actions if needed, 
    // but here we just need double click to edit.
    // For desktop double click:
    card.addEventListener('dblclick', (e) => {
        editTask(taskId, e);
    });
}

// Config
const COLORS = ['#9d8bf4', '#86e3ce', '#78d5d7', '#e0d8cc', '#ff9aa2', '#b5ead7'];
const START_HOUR = 0;
const END_HOUR = 23;

// DOM Elements
const dateScroller = document.getElementById('date-scroller');
const timeline = document.getElementById('timeline');
const modalOverlay = document.getElementById('modal-overlay');
const createTaskBtn = document.getElementById('create-task-btn');
// Updated buttons for Bottom Sheet
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
// Recurring UI
const recurringToggle = document.getElementById('recurring-toggle');
const daySelector = document.getElementById('day-selector');
const dayPills = document.querySelectorAll('.day-pill');
const deleteBtn = document.getElementById('delete-btn');

const colorOptionsContainer = document.getElementById('color-options');
const taskNameInput = document.getElementById('task-name');
const taskTimeInput = document.getElementById('task-start-time'); // Renamed var to match ID for clarity, though original was 'taskTimeInput' mapped to? Wait, original: const taskTimeInput = document.getElementById('task-time'); BUT HTML ID is 'task-start-time'. Checked line 131 in HTML: id="task-start-time". 
// Line 56 in script said: const taskTimeInput = document.getElementById('task-time'); 
// This seems to be a bug in original code or dead code if it wasn't used correctly. 
// Let's look at openModal line 512: taskTimeInput.value = task.startHour; -> This suggests it might have been expecting a select or input.
// Actually, let's look at `saveOrUpdateTask`: const mkStartTime = document.getElementById('task-start-time').value;
// So the variable `taskTimeInput` might be mis-assigned or unused in save.
// Let's correct the references properly.

const taskStartTimeInput = document.getElementById('task-start-time');
const taskEndTimeInput = document.getElementById('task-end-time');
const hasEndTimeCheckbox = document.getElementById('has-end-time');
const taskDateInput = document.getElementById('task-date');
const currentMonthDisplay = document.getElementById('current-month');
const summaryTitle = document.getElementById('summary-title');
const summarySubtitle = document.getElementById('summary-subtitle');
// const modalTitle = document.querySelector('.modal h2'); // Changed to sheet-title
const sheetTitle = document.getElementById('sheet-title');


// Profile Elements
// Profile Elements Removed


// Initialization
function init() {
    // Check for shortcuts (e.g. from Android Home Screen)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'create') {
        const hasVisited = localStorage.getItem('ghostplan_onboarding_complete');
        if (hasVisited) {
            setTimeout(() => openModal(), 500);
        }
        window.history.replaceState({}, document.title, "/");
    }

    generateDates();
    loadData(); // Load first

    if (state.tasks.length === 0) {
        seedSampleTasks();
    }

    // Onboarding Check
    const hasVisited = localStorage.getItem('ghostplan_onboarding_complete');
    if (!hasVisited) {
        // Show Onboarding
        document.getElementById('home-view').classList.remove('active');
        document.getElementById('onboarding-view').style.display = 'block';
        setTimeout(() => document.getElementById('onboarding-view').classList.add('active'), 10);
    } else {
        // Show Home (Default)
        // Ensure home is valid
        document.getElementById('home-view').classList.add('active');

        const today = new Date();
        const offset = today.getTimezoneOffset() * 60000;
        const localToday = new Date(today.getTime() - offset).toISOString().split('T')[0];
        selectDate(localToday);
        scrollToCurrentTime();
    }

    setupEventListeners();
    renderColorOptions();

    // Start Notification Scheduler
    startNotificationScheduler();

    // Register Service Worker for PWA/Notifications
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered!', reg))
            .catch(err => console.error('SW failed', err));
    }
}

// Onboarding Functions
window.nextOnboardingStep = function (step) {
    // Hide current
    const current = document.querySelector('.onboarding-step.active');
    if (current) current.classList.remove('active');

    // Show next
    const next = document.getElementById(`step-${step}`);
    if (next) next.classList.add('active');
}

window.finishOnboarding = function () {
    localStorage.setItem('ghostplan_onboarding_complete', 'true');

    // Fade out onboarding
    const view = document.getElementById('onboarding-view');
    view.style.opacity = '0';

    setTimeout(() => {
        view.style.display = 'none';
        document.getElementById('home-view').classList.add('active');

        // Initialize Home View properly
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

    // Only scroll if selected date is today
    if (state.selectedDate === localToday) {
        const currentHour = new Date().getHours();
        // Find the slot. Note: slots are rendered only if tasks exist in range
        const slot = document.querySelector(`.time-slot[data-hour="${currentHour}"]`);
        if (slot) {
            slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// Helpers
function generateDates() {
    state.dates = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    // Start from Jan 1 of current year
    let startDate = new Date(currentYear, 0, 1);

    // Default End: Dec 31 of current year
    let endDate = new Date(currentYear, 11, 31);

    // Check if today is within the last 7 days of the year
    const last7DaysCheck = new Date(currentYear, 11, 24); // Dec 24
    if (today >= last7DaysCheck) {
        // Extend to end of NEXT year
        endDate = new Date(currentYear + 1, 11, 31);
    }

    // Loop from start to end
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
            rawDate: new Date(loopDate) // Copy
        });

        // Next day
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

    // Ensure state.viewStartSunday is set correctly
    if (fullDate) {
        syncViewToSelectedDate(fullDate);
    }

    updateHeaderMonth();
    renderDates();
    renderTimeline();
    updateSummaryCard();
}

function syncViewToSelectedDate(fullDate) {
    // Find the date object
    const targetDateObj = state.dates.find(d => d.fullDate === fullDate);
    if (!targetDateObj) return;

    // If viewStartSunday is not set, or selected date is outside current view (0 to 6 days after start)
    // Update viewStartSunday to the Sunday of that week
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
        // Find the sunday for this date
        const targetIndex = state.dates.findIndex(d => d.fullDate === fullDate);
        // We know our array is continuous days.
        // We can just iterate back to find 'sun' or calculate offset
        // But since state.dates is all generated in order...
        // Let's just use the rawDate object to find the previous sunday
        const raw = targetDateObj.rawDate;
        const dayOfWeek = raw.getDay(); // 0 is Sunday
        const sundayIndex = targetIndex - dayOfWeek;

        if (sundayIndex >= 0 && sundayIndex < state.dates.length) {
            state.viewStartSunday = state.dates[sundayIndex].fullDate;
        } else {
            // Fallback if at very start of array and Sunday is missing (shouldn't happen with Jan 1 logic unless year starts mid-week, but array covers it)
            // If Jan 1 is Tuesday, index 0 is Jan 1. Sunday index would be negative.
            // In that case, just show from index 0? Or we generated dates from Jan 1.
            // Actually generateDates starts Jan 1. If Jan 1 is not Sunday, we might miss the Sunday of that first partial week.
            // But standard behavior: valid dates are within available range.
            state.viewStartSunday = state.dates[0].fullDate;
        }
    }
}

function updateHeaderMonth() {
    if (!state.selectedDate) return;

    // Parse selected string YYYY-MM-DD
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);

    // Format: "2 Feb, 2026"
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

    // Calculate difference in days correctly
    // Use UTC to avoid DST issues
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

    // Filter tasks based on recurrence logic for Count
    const dayNameMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const selectedDayName = dayNameMap[selected.getDay()];

    const tasksCount = state.tasks.filter(t => {
        // Logic match: Exact Date OR (Recurring AND Day Match AND Created Before/On Selected)
        const isExactDate = t.date === state.selectedDate;
        const isRecurringMatch = t.isRecurring && t.recurringDays.includes(selectedDayName) && t.date <= state.selectedDate;

        return isExactDate || isRecurringMatch;
    });

    const totalTasks = tasksCount.length;
    const remainingTasks = tasksCount.filter(t => {
        if (t.isRecurring) {
            // Check if completedDates key exists, if not assume incomplete for this day
            return !(t.completedDates && t.completedDates.includes(state.selectedDate));
        } else {
            return !t.completed;
        }
    }).length;

    summaryTitle.textContent = titleText;
    summarySubtitle.textContent = `${totalTasks} Task${totalTasks !== 1 ? 's' : ''} · ${remainingTasks} Remaining`;
}

// Rendering
function renderDates() {
    dateScroller.innerHTML = '';

    if (!state.viewStartSunday) return;

    const startIndex = state.dates.findIndex(d => d.fullDate === state.viewStartSunday);
    if (startIndex === -1) return;

    // Show exactly 7 days from viewStartSunday
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

    // Determine current day-of-week for selected date
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const selectedDateObj = new Date(y, m - 1, d);
    const dayNameMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const selectedDayName = dayNameMap[selectedDateObj.getDay()];

    const daysTasks = state.tasks.filter(t => {
        // Logic match: Exact Date OR (Recurring AND Day Match AND Created Before/On Selected)
        const isExactDate = t.date === state.selectedDate;

        // Only show recurring if the task's start date is BEFORE or ON currently selected date
        // String comparison works for YYYY-MM-DD
        const isRecurringMatch = t.isRecurring && t.recurringDays.includes(selectedDayName) && t.date <= state.selectedDate;

        return isExactDate || isRecurringMatch;
    });

    if (daysTasks.length === 0) {
        // Show empty state
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
        document.body.classList.add('no-scroll'); // Disable scrolling
        return;
    }

    // Allow scrolling if tasks exist
    document.body.classList.remove('no-scroll');

    // Sort day's tasks by start time
    daysTasks.sort((a, b) => {
        return a.startTime.localeCompare(b.startTime);
    });

    // Get unique start hours from the tasks
    const uniqueHours = [...new Set(daysTasks.map(t => t.startHour))].sort((a, b) => a - b);

    uniqueHours.forEach(h => {
        const row = document.createElement('div');
        row.className = 'time-slot';
        row.dataset.hour = h; // Enable auto-scroll finding

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
            // Determine completed status for this specific day
            let isCompleted = false;
            if (task.isRecurring) {
                isCompleted = task.completedDates ? task.completedDates.includes(state.selectedDate) : false;
            } else {
                isCompleted = task.completed;
            }

            const card = document.createElement('div');
            card.className = `task-card ${isCompleted ? 'completed' : ''}`;
            card.style.backgroundColor = isCompleted ? '' : task.color;

            // Attach interaction handler
            handleTaskCardInteraction(card, task.id);

            // Icon to show recurring
            const recurringIcon = task.isRecurring ? '<i class="fa-solid fa-repeat" style="font-size: 10px; margin-right: 4px; opacity: 0.7;"></i>' : '';

            // Format Time Range
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
    // Pad minutes if needed, e.g. 12:05
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

// function renderDateOptionsInModal() removed

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

// Profile Functions
// Profile Functions Removed

// Persistance Helpers
function saveData() {
    try {
        localStorage.setItem('ghostplan_tasks', JSON.stringify(state.tasks));
        // localStorage.setItem('ghostplan_user', JSON.stringify(state.user)); // Removed
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
            state.tasks = []; // Reset if corrupt
        }
    }

    // User Data loading removed
}

// Toast Helper
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


// Actions
window.toggleTask = function (id, event) {
    if (event) event.stopPropagation();
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        if (task.isRecurring) {
            // Initialize if missing (migration)
            if (!task.completedDates) task.completedDates = [];

            const dateStr = state.selectedDate;
            if (task.completedDates.includes(dateStr)) {
                // Mark incomplete
                task.completedDates = task.completedDates.filter(d => d !== dateStr);
            } else {
                // Mark complete
                task.completedDates.push(dateStr);
            }
        } else {
            // Single task
            task.completed = !task.completed;
        }

        saveData(); // Persist
        renderTimeline();
        updateSummaryCard();
    }
};

function openModal(editingId = null) {
    modalOverlay.classList.add('active');

    if (editingId) {
        // Edit Mode
        state.editingTaskId = editingId;
        const task = state.tasks.find(t => t.id === editingId);

        sheetTitle.textContent = "Edit Task";
        // saveBtn.textContent = "Update Task"; // Button is now Icon
        deleteBtn.style.display = "flex"; // Changed from block to flex for icon align

        taskNameInput.value = task.name;
        taskStartTimeInput.value = task.startTime;
        taskDateInput.value = task.date;

        // End Time formatting
        if (task.endTime) {
            hasEndTimeCheckbox.checked = true;
            taskEndTimeInput.value = task.endTime;
            taskEndTimeInput.disabled = false;
        } else {
            hasEndTimeCheckbox.checked = false;
            taskEndTimeInput.value = '';
            taskEndTimeInput.disabled = true;
        }

        // Color
        renderColorOptions(); // reset
        const swatches = document.querySelectorAll('.color-swatch');
        swatches.forEach(s => {
            s.classList.toggle('active', s.dataset.color === task.color);
        });

        // Recurring State
        if (task.isRecurring) {
            recurringToggle.checked = true;
            daySelector.style.display = 'block';
            // Reset pills
            dayPills.forEach(p => p.classList.remove('selected'));
            // Select appropriate
            task.recurringDays.forEach(day => {
                const pill = document.querySelector(`.day-pill[data-day="${day}"]`);
                if (pill) pill.classList.add('selected');
            });
        } else {
            recurringToggle.checked = false;
            daySelector.style.display = 'none';
        }

    } else {
        // Create Mode
        state.editingTaskId = null;
        sheetTitle.textContent = "New Task";
        // saveBtn.textContent = "Save Task";
        deleteBtn.style.display = "none";

        taskNameInput.value = '';
        taskStartTimeInput.value = '';

        // Default: No end time
        hasEndTimeCheckbox.checked = false;
        taskEndTimeInput.value = '';
        taskEndTimeInput.disabled = true;

        // Date Logic (Default to selected, or Today)
        const isValid = state.dates.some(d => d.fullDate === state.selectedDate);
        if (isValid) {
            taskDateInput.value = state.selectedDate;
        } else {
            const today = new Date();
            const offset = today.getTimezoneOffset() * 60000;
            const todayStr = new Date(today.getTime() - offset).toISOString().split('T')[0];
            taskDateInput.value = todayStr;
        }

        // reset colors
        renderColorOptions();
        document.querySelectorAll('.color-swatch')[0].classList.add('active');

        // Reset recurring
        recurringToggle.checked = false;
        daySelector.style.display = 'none';
        dayPills.forEach(p => p.classList.remove('selected'));
    }

    // taskNameInput.focus(); // Disable auto-focus to prevent mobile keyboard jump
}

function editTask(id, event) {
    if (event) event.stopPropagation();
    openModal(id);
}

function closeModal() {
    modalOverlay.classList.remove('active');
    state.editingTaskId = null; // Reset
}

function saveOrUpdateTask() {
    const name = taskNameInput.value.trim();
    if (!name) return;

    const mkStartTime = taskStartTimeInput.value; // "HH:MM"
    let mkEndTime = "";

    if (hasEndTimeCheckbox.checked) {
        mkEndTime = taskEndTimeInput.value;
    }

    const date = taskDateInput.value;
    const activeColor = document.querySelector('.color-swatch.active');
    const color = activeColor ? activeColor.dataset.color : COLORS[0];

    // Validation
    if (!mkStartTime) {
        alert('Please select a start time');
        return;
    }

    // Only validate end time if it is enabled/checked. 
    // If checked but empty, maybe alert? Or assume valid?
    // User said "if the ending time is not selected, don't show it".
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

    // Recurring Data
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
        endTime: mkEndTime, // Can be empty
        startHour: parseInt(mkStartTime.split(':')[0]), // Keep for sorting/grid
        color,
        isRecurring,
        recurringDays
    };

    if (state.editingTaskId) {
        // Update existing
        const taskIndex = state.tasks.findIndex(t => t.id === state.editingTaskId);
        if (taskIndex !== -1) {
            state.tasks[taskIndex] = {
                ...state.tasks[taskIndex],
                ...taskData
            };
        }
    } else {
        // Create New
        const newTask = {
            id: Date.now().toString(),
            ...taskData,
            completed: false,
            completedDates: [] // For recurring tasks
        };
        state.tasks.push(newTask);
    }

    saveData(); // Persist
    closeModal();
    renderTimeline();
    updateSummaryCard();
}

function deleteTask() {
    if (state.editingTaskId) {
        if (confirm('Are you sure you want to delete this task?')) {
            state.tasks = state.tasks.filter(t => t.id !== state.editingTaskId);
            saveData(); // Persist
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

    // Recurring Toggle
    recurringToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            daySelector.style.display = 'block';
            // "By default, every day is selected"
            // Only if we are not editing an existing task that already has days
            // We can check if any are selected, if 0, select all.
            const selectedCount = document.querySelectorAll('.day-pill.selected').length;
            if (selectedCount === 0) {
                dayPills.forEach(p => p.classList.add('selected'));
            }
        } else {
            daySelector.style.display = 'none';
        }
    });

    // Day Pills
    dayPills.forEach(pill => {
        pill.addEventListener('click', () => {
            pill.classList.toggle('selected');
        });
    });

    // Profile Handling Removed

    // Dropdown Handling
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const headerDropdown = document.getElementById('header-dropdown');
    const clearTasksBtn = document.getElementById('clear-tasks-btn');
    // Notification System
    // Notification System - Permission Seeker Removed

    function startNotificationScheduler() {
        // Check every 60 seconds
        setInterval(checkDueTasks, 60000);
        // Also check immediately on load/func call? Maybe wait 2s
        setTimeout(checkDueTasks, 2000);
    }

    function checkDueTasks() {
        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();

        // Format "HH:MM"
        const timeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;

        if (state.lastNotifiedTime === timeStr) return;

        // Get Today's Date String YYYY-MM-DD
        const offset = now.getTimezoneOffset() * 60000;
        const localToday = new Date(now.getTime() - offset).toISOString().split('T')[0];
        const dayNameMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const currentDayName = dayNameMap[now.getDay()];

        const dueTasks = state.tasks.filter(t => {
            if (t.startTime !== timeStr) return false;

            // Check completion
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
                // ALWAYS trigger In-App Notification (Reliable)
                showInAppNotification(task);

                // Try System Notification (If permitted)
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

            // Auto hide after 5 seconds
            setTimeout(() => {
                banner.classList.remove('show');
            }, 5000);
        }

        // Optional: Play sound
        // const audio = new Audio('notification.mp3');
        // audio.play().catch(e => console.log('Audio play failed', e));
    }
    // enableNotificationsBtn logic removed

    // Restore More Options Listener
    moreOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        headerDropdown.classList.toggle('active');
    });

    // Close dropdown when interacting outside
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
            // Filter OUT tasks that match the selected date
            // For recurring tasks, we might need nuanced logic (delete recurrence instance vs all?)
            // For now, simple: delete objects that created on this date or matching
            // Implementation choice: Remove exact date matches. 
            // If recurring shows up today, user might want to delete THIS instance or ALL.
            // Simplified: Just clear explicit date matches for now.
            state.tasks = state.tasks.filter(t => t.date !== state.selectedDate);
            saveData(); // Persist
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

    // Checkbox listener
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
    // 1. Timeline Swipe (Day Change)
    setupSwipeForElement(timeline, (direction) => {
        if (direction === 'left') {
            // Swipe Left -> Next Day
            changeDate(1);
        } else {
            // Swipe Right -> Prev Day
            changeDate(-1);
        }
    });

    // 2. Date Scroller Swipe (Week Change)
    setupSwipeForElement(dateScroller, (direction) => {
        if (direction === 'left') {
            // Swipe Left -> Next Week
            changeWeek(1);
        } else {
            // Swipe Right -> Prev Week
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
    // direction: 1 for next week, -1 for prev week
    const startIndex = state.dates.findIndex(d => d.fullDate === state.viewStartSunday);
    if (startIndex === -1) return;

    const newIndex = startIndex + (direction * 7);

    // Bounds check
    if (newIndex >= 0 && newIndex < state.dates.length) {
        state.viewStartSunday = state.dates[newIndex].fullDate;

        // Animation for scroller
        dateScroller.classList.remove('anim-slide-left', 'anim-slide-right');
        void dateScroller.offsetWidth; // trigger reflow
        const animClass = direction === 1 ? 'anim-slide-left' : 'anim-slide-right';
        dateScroller.classList.add(animClass);

        renderDates();

        // Optional: If we want to change selection to the matching day in new week?
        // Requirement says "next week should be opened". Usually implies just viewing.
        // Keeping selection as is unless user clicks. 
        // BUT if selection is now out of view, it might be confusing.
        // Standard pattern: Don't change selection on scroll, only on click.
    }
}

function changeDate(offset) {
    const currentIndex = state.dates.findIndex(d => d.fullDate === state.selectedDate);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + offset;
    if (newIndex >= 0 && newIndex < state.dates.length) {
        const direction = offset > 0 ? 'left' : 'right';

        // Add animation class before render
        timeline.classList.remove('anim-slide-left', 'anim-slide-right');
        void timeline.offsetWidth; // trigger reflow
        timeline.classList.add(direction === 'left' ? 'anim-slide-left' : 'anim-slide-right');

        selectDate(state.dates[newIndex].fullDate);
    }
}

// Run
init();
