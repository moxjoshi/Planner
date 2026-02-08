const timeDisplay = document.getElementById('time-display');
const startPauseBtn = document.getElementById('start-pause-btn');
const resetBtn = document.getElementById('reset-btn');
const modeCheckbox = document.getElementById('mode-checkbox');
const focusInput = document.getElementById('focus-time');
const breakInput = document.getElementById('break-time');
let timeLeft;
let isRunning = false;
let timerId = null;
let mode = 'focus';
function init() {
    updateDurationFromInputs();
    resetTimer();
    updateUI();
}

function updateDurationFromInputs() {
    let focusVal = parseInt(focusInput.value);
    let breakVal = parseInt(breakInput.value);

    if (focusVal < 1) focusVal = 1;
    if (focusVal > 60) focusVal = 60;
    if (breakVal < 1) breakVal = 1;
    if (breakVal > 30) breakVal = 30;

    focusInput.value = focusVal;
    breakInput.value = breakVal;
}

function getDurationInSeconds() {
    const minutes = mode === 'focus' ? parseInt(focusInput.value) : parseInt(breakInput.value);
    return minutes * 60;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateUI() {
    timeDisplay.textContent = formatTime(timeLeft);
    startPauseBtn.textContent = isRunning ? 'Pause' : 'Start';

    const isBreak = mode === 'break';
    if (modeCheckbox.checked !== isBreak) {
        modeCheckbox.checked = isBreak;
    }
}

function toggleTimer() {
    if (isRunning) {
        pauseTimer();
        stopMusic();
    } else {
        startTimer();
        if (mode === 'focus') {
            playMusic();
        }
    }
}

function startTimer() {
    if (isRunning) return;

    isRunning = true;
    updateUI();

    timerId = setInterval(() => {
        timeLeft--;
        updateUI();

        if (timeLeft <= 0) {
            switchMode();
        }
    }, 1000);
}

function pauseTimer() {
    if (!isRunning) return;

    isRunning = false;
    clearInterval(timerId);
    updateUI();
}

function resetTimer() {
    pauseTimer();
    stopMusic();
    timeLeft = getDurationInSeconds();
    updateUI();
}

function switchMode() {
    pauseTimer();
    stopMusic();
    playBellSound();

    mode = mode === 'focus' ? 'break' : 'focus';

    timeLeft = getDurationInSeconds();

    startTimer();

    if (mode === 'focus') {
        playMusic();
    }
}

startPauseBtn.addEventListener('click', () => {
    playClickSound();
    toggleTimer();
});

resetBtn.addEventListener('click', () => {
    playClickSound();
    resetTimer();
});

modeCheckbox.addEventListener('change', () => {
    if (modeCheckbox.checked) {
        mode = 'break';
    } else {
        mode = 'focus';
    }
    resetTimer();
});

[focusInput, breakInput].forEach(input => {
    input.addEventListener('change', () => {
        updateDurationFromInputs();
        if (!isRunning) {
            const targetMode = input === focusInput ? 'focus' : 'break';
            if (mode === targetMode) {
                timeLeft = getDurationInSeconds();
                updateUI();
            }
        }
    });
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        if (document.activeElement.tagName === 'INPUT') return;

        toggleTimer();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
    }
});

const musicSelect = document.getElementById('music-select');
let audio = new Audio();
let isMusicPlaying = false;

function playMusic() {
    const selectedMusic = musicSelect.value;
    if (selectedMusic === 'none' || mode === 'break') {
        stopMusic();
        return;
    }

    const currentSrc = audio.src;
    const musicMap = {
        'beta_waves': 'beta waves.mp3',
        'december_rain': 'December rain.mp3',
        'gentle_rain': 'lo-fi-ambient-music-with-gentle-rain-sounds-377059.mp3',
        'lofi_music': 'Lofi Music.mp3'
    };

    const filename = musicMap[selectedMusic];
    if (!filename) {
        console.error("Music file not found in map");
        return;
    }

    const newSrc = `Music/${filename}`;

    if (!audio.src || !audio.src.endsWith(newSrc)) {
        audio.src = newSrc;
        audio.loop = true;
    }

    audio.play().then(() => {
        isMusicPlaying = true;
    }).catch(e => {
        console.log("Audio play failed (interaction needed?):", e);
    });
}

function stopMusic() {
    audio.pause();
    audio.currentTime = 0;
    isMusicPlaying = false;
}



musicSelect.addEventListener('change', () => {
    if (isRunning && mode === 'focus') {
        playMusic();
    }
});

const taskList = document.getElementById('task-list');
const addTaskBtn = document.getElementById('add-task-btn');
const taskModal = document.getElementById('task-modal');
const newTaskInput = document.getElementById('new-task-input');
const saveTaskBtn = document.getElementById('save-task-btn');
const cancelTaskBtn = document.getElementById('cancel-task-btn');

let tasks = [];
let editingTaskId = null;

if (localStorage.getItem('pomodoroTasks')) {
    tasks = JSON.parse(localStorage.getItem('pomodoroTasks'));
    renderTasks();
}

function renderTasks() {
    taskList.innerHTML = '';
    tasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${task.completed ? 'completed' : ''}`;
        taskItem.innerHTML = `
            <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleTask(${task.id})"></div>
            <div class="task-text" ondblclick="editTask(${task.id})">${task.text}</div>
            <div class="delete-btn" style="color: #444; cursor: pointer; font-size: 0.8rem; margin-left: 10px;" onclick="deleteTask(${task.id})">✕</div>
        `;
        taskList.appendChild(taskItem);
    });
    localStorage.setItem('pomodoroTasks', JSON.stringify(tasks));
}

function toggleTask(id) {
    tasks = tasks.map(t => {
        if (t.id === id) {
            return { ...t, completed: !t.completed };
        }
        return t;
    });
    renderTasks();
}

function deleteTask(id) {
    if (confirm('Delete this task?')) {
        tasks = tasks.filter(t => t.id !== id);
        renderTasks();
    }
}

function openModal(isEdit = false) {
    taskModal.classList.add('show');
    newTaskInput.focus();
    if (!isEdit) newTaskInput.value = '';
}

function closeModal() {
    taskModal.classList.remove('show');
    editingTaskId = null;
    newTaskInput.value = '';
}

function saveTask() {
    const text = newTaskInput.value.trim();
    if (!text) return;

    if (editingTaskId) {
        tasks = tasks.map(t => t.id === editingTaskId ? { ...t, text } : t);
    } else {
        const newTask = {
            id: Date.now(),
            text,
            completed: false
        };
        tasks.push(newTask);
    }

    renderTasks();
    closeModal();
}

function editTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        editingTaskId = id;
        newTaskInput.value = task.text;
        openModal(true);
    }
}

addTaskBtn.addEventListener('click', () => {
    openModal();
});

cancelTaskBtn.addEventListener('click', closeModal);
saveTaskBtn.addEventListener('click', saveTask);

taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) closeModal();
});

newTaskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveTask();
});

const soundToggleBtn = document.getElementById('sound-toggle-btn');
const clickSound = new Audio('sounds/click sound.mp3');
const bellSound = new Audio('sounds/bell ring.mp3');
let isMuted = false;

function playClickSound() {
    if (!isMuted) {
        clickSound.currentTime = 0;
        clickSound.play().catch(e => console.log("Click sound failed:", e));
    }
}

function playBellSound() {
    if (!isMuted) {
        bellSound.currentTime = 0;
        bellSound.play().catch(e => console.log("Bell sound failed:", e));
    }
}

function toggleMute() {
    isMuted = !isMuted;
    updateSoundIcon();
}

function updateSoundIcon() {
    if (isMuted) {
        soundToggleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
        `;
        soundToggleBtn.style.opacity = '0.5';
    } else {
        soundToggleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
        soundToggleBtn.style.opacity = '1';
    }
}

soundToggleBtn.addEventListener('click', () => {
    toggleMute();
    playClickSound();
});

init();
