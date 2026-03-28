/**
 * ============================================
 * BLOCK PUZZLE MASTER
 * Головоломка с падающими блоками
 * ============================================ 
 * 
 * Версия: 1.0.0
 * Яндекс Игры SDK: Интегрирован
 * 
 */

// ============================================
// КОНСТАНТЫ ИГРЫ
// ============================================

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

// Цвета блоков (геометрический abstract стиль)
const COLORS = {
    I: '#00f5ff',
    O: '#ffd700',
    T: '#ff00ff',
    S: '#00ff00',
    Z: '#ff0000',
    J: '#0066ff',
    L: '#ff8800'
};

// Формы тетрамино
const SHAPES = {
    I: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
    O: [[1,1], [1,1]],
    T: [[0,1,0], [1,1,1], [0,0,0]],
    S: [[0,1,1], [1,1,0], [0,0,0]],
    Z: [[1,1,0], [0,1,1], [0,0,0]],
    J: [[1,0,0], [1,1,1], [0,0,0]],
    L: [[0,0,1], [1,1,1], [0,0,0]]
};

// Режимы сложности
const DIFFICULTY = {
    marathon: { startSpeed: 800, speedDecrement: 25, minSpeed: 100, linesPerLevel: 10 },
    sprint: { startSpeed: 500, speedDecrement: 0, minSpeed: 50, linesPerLevel: 20, targetLines: 40 },
    ultra: { startSpeed: 600, speedDecrement: 0, minSpeed: 50, linesPerLevel: 999, targetTime: 180 }
};

// Параметры DAS (Delayed Auto Shift)
const DAS_DELAY = 170;
const DAS_REPEAT = 50;

// Рекламный cooldown (30 секунд)
const AD_COOLDOWN = 30000;

// ============================================
// СОСТОЯНИЕ ИГРЫ
// ============================================

let board = [];
let currentPiece = null;
let nextPiece = null;
let holdPiece = null;
let canHold = true;
let score = 0;
let level = 1;
let lines = 0;
let combo = 0;
let maxCombo = 0;
let tetrisCount = 0;
let gameOver = false;
let paused = false;
let gameStarted = false;
let difficulty = 'marathon';
let highScore = 0;

let lastDropTime = 0;
let dropInterval = 800;

// DAS переменные
let dasTimeout = null;
let dasInterval = null;
let dasDirection = 0;

let softDropping = false;
let hardDropping = false;

// Клавиши
const keys = {};

// ============================================
// YANDEX GAMES SDK
// ============================================

let ysdk = null;
let player = null;
let lastAdTime = 0;

// Флаг инициализации SDK
let sdkInitialized = false;

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

async function initYandex() {
    const loadingScreen = document.getElementById('loading-screen');
    
    try {
        // Пытаемся инициализировать SDK
        if (typeof YaGames !== 'undefined') {
            ysdk = await YaGames.init();
            await ysdk.features.LoadingAPI.ready();
            
            try {
                player = await ysdk.getPlayer({ scopes: false });
                await player.ready();
                
                // Загружаем облачные данные
                const data = await player.getData();
                if (data && data.highScore) {
                    highScore = data.highScore;
                }
                
                sdkInitialized = true;
                console.log('Yandex SDK инициализирован');
            } catch (playerError) {
                console.warn('Не удалось получить данные игрока, используем localStorage');
                loadLocalScore();
            }
        } else {
            console.warn('SDK недоступен, используем локальное сохранение');
            loadLocalScore();
        }
    } catch (e) {
        console.warn('Ошибка инициализации SDK:', e);
        loadLocalScore();
    }
    
    // Скрываем загрузочный экран
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
    
    // Обновляем отображение рекорда
    updateDisplay();
    
    // Показываем главное меню
    showMainMenu();
}

function loadLocalScore() {
    const localScore = localStorage.getItem('bpmHighScore');
    if (localScore) {
        highScore = parseInt(localScore) || 0;
    }
}

async function saveHighScore() {
    if (score > highScore) {
        highScore = score;
        
        // Пытаемся сохранить в облако
        if (sdkInitialized && player) {
            try {
                await player.setData({ highScore: highScore });
                console.log('Рекорд сохранён в облако');
            } catch (e) {
                console.warn('Не удалось сохранить в облако:', e);
                saveLocalScore();
            }
        } else {
            saveLocalScore();
        }
    }
}

function saveLocalScore() {
    localStorage.setItem('bpmHighScore', highScore.toString());
}

// ============================================
// РЕКЛАМА
// ============================================

async function showInterstitialAd() {
    const now = Date.now();
    
    // Проверяем cooldown
    if (now - lastAdTime < AD_COOLDOWN) {
        console.log('Реклама на cooldown');
        showGameOverScreen();
        return;
    }
    
    try {
        if (sdkInitialized && ysdk) {
            await ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onClose: (wasShown) => {
                        lastAdTime = Date.now();
                        showGameOverScreen();
                    },
                    onError: (error) => {
                        console.warn('Ошибка рекламы:', error);
                        showGameOverScreen();
                    }
                }
            });
        } else {
            showGameOverScreen();
        }
    } catch (e) {
        console.warn('Реклама недоступна:', e);
        showGameOverScreen();
    }
}

async function showRewardedAd(callback) {
    try {
        if (sdkInitialized && ysdk) {
            const rewarded = await ysdk.adv.showRewardedVideo({
                callbacks: {
                    onRewarded: () => {
                        callback(true);
                    },
                    onClose: () => {
                        // Пользователь закрыл рекламу без просмотра
                    },
                    onError: (error) => {
                        console.warn('Ошибка rewarded рекламы:', error);
                        callback(false);
                    }
                }
            });
        } else {
            // SDK недоступен - просто вызываем колбэк
            callback(true);
        }
    } catch (e) {
        console.warn('Rewarded реклама недоступна:', e);
        callback(false);
    }
}

// ============================================
// ИГРОВАЯ ЛОГИКА
// ============================================

function init() {
    // Создаём пустое поле
    board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    
    currentPiece = null;
    nextPiece = createPiece();
    holdPiece = null;
    canHold = true;
    score = 0;
    level = 1;
    lines = 0;
    combo = 0;
    maxCombo = 0;
    tetrisCount = 0;
    gameOver = false;
    paused = false;
    gameStarted = true;
    hardDropping = false;
    softDropping = false;
    
    // Устанавливаем скорость в зависимости от сложности
    const diff = DIFFICULTY[difficulty];
    dropInterval = diff.startSpeed;
    
    updateDisplay();
    spawnPiece();
    lastDropTime = performance.now();
    
    // Запускаем игровой цикл
    requestAnimationFrame(gameLoop);
}

function createPiece() {
    const types = Object.keys(SHAPES);
    const type = types[Math.floor(Math.random() * types.length)];
    return {
        type: type,
        shape: SHAPES[type].map(row => [...row]),
        color: COLORS[type],
        x: Math.floor(COLS / 2) - Math.ceil(SHAPES[type][0].length / 2),
        y: 0,
        rotation: 0
    };
}

function spawnPiece() {
    currentPiece = nextPiece;
    nextPiece = createPiece();
    canHold = true;
    
    // Центрируем новую фигуру
    currentPiece.x = Math.floor(COLS / 2) - Math.ceil(currentPiece.shape[0].length / 2);
    currentPiece.y = 0;
    
    // Проверяем Game Over
    if (checkCollision(currentPiece, 0, 0)) {
        gameOver = true;
        saveHighScore();
        showInterstitialAd();
    }
    
    drawNextPiece();
}

function checkCollision(piece, offsetX, offsetY, testShape = null) {
    const shape = testShape || piece.shape;
    
    for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
            if (shape[y][x]) {
                const newX = piece.x + x + offsetX;
                const newY = piece.y + y + offsetY;
                
                // Проверка границ
                if (newX < 0 || newX >= COLS || newY >= ROWS) {
                    return true;
                }
                // Проверка столкновения с другими блоками
                if (newY >= 0 && board[newY][newX]) {
                    return true;
                }
            }
        }
    }
    return false;
}

function lockPiece() {
    // Фиксируем фигуру на доске
    for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
            if (currentPiece.shape[y][x]) {
                const boardY = currentPiece.y + y;
                const boardX = currentPiece.x + x;
                if (boardY >= 0) {
                    board[boardY][boardX] = currentPiece.color;
                }
            }
        }
    }
    
    // Создаём частицы блокировки
    createLockParticles(currentPiece);
    
    // Очищаем линии
    clearLines();
    
    // Спавним новую фигуру
    spawnPiece();
}

function clearLines() {
    let cleared = 0;
    
    // Проверяем каждую строку
    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== null)) {
            // Удаляем заполненную строку
            board.splice(y, 1);
            // Добавляем пустую строку сверху
            board.unshift(Array(COLS).fill(null));
            cleared++;
            y++; // Проверяем ту же строку ещё раз
        }
    }
    
    if (cleared > 0) {
        // Начисляем очки
        const points = calculatePoints(cleared);
        score += points;
        lines += cleared;
        
        // Проверяем особые события
        if (cleared >= 4) {
            tetrisCount++;
            showCombo(`${cleared} ЛИНИЙ!`, '#ffd700');
        } else if (combo > 1) {
            showCombo(`${combo}x КОМБО!`, '#00f5ff');
        }
        
        // Создаём частицы очистки
        createClearParticles(cleared);
        
        // Обновляем уровень
        updateLevel();
        
        // Увеличиваем комбо
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        
        // Проверяем условия победы
        checkWinCondition();
    } else {
        combo = 0;
    }
    
    updateDisplay();
}

function calculatePoints(linesCleared) {
    // Очки за линии с множителем уровня
    const linePoints = [0, 100, 300, 500, 800];
    return (linePoints[linesCleared] || 800) * level;
}

function updateLevel() {
    const diff = DIFFICULTY[difficulty];
    const newLevel = Math.floor(lines / diff.linesPerLevel) + 1;
    
    if (newLevel > level) {
        level = newLevel;
        // Увеличиваем скорость
        dropInterval = Math.max(
            diff.minSpeed, 
            diff.startSpeed - (level - 1) * diff.speedDecrement
        );
        showLevelUp();
    }
}

function checkWinCondition() {
    if (difficulty === 'sprint' && lines >= DIFFICULTY.sprint.targetLines) {
        gameOver = true;
        saveHighScore();
        showWinScreen();
    } else if (difficulty === 'ultra' && score >= 100000) {
        gameOver = true;
        saveHighScore();
        showWinScreen();
    }
}

// ============================================
// УПРАВЛЕНИЕ ФИГУРАМИ
// ============================================

function movePiece(dx) {
    if (!checkCollision(currentPiece, dx, 0)) {
        currentPiece.x += dx;
    }
}

function rotatePiece(direction = 1) {
    const originalShape = currentPiece.shape.map(row => [...row]);
    const size = currentPiece.shape.length;
    const rotated = Array(size).fill(null).map(() => Array(size).fill(0));
    
    // Поворачиваем матрицу
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (direction === 1) {
                rotated[x][size - 1 - y] = currentPiece.shape[y][x];
            } else {
                rotated[size - 1 - x][y] = currentPiece.shape[y][x];
            }
        }
    }
    
    // Система киков (wall kicks)
    const kicks = [
        [0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]
    ];
    
    for (const [kickX, kickY] of kicks) {
        if (!checkCollision(currentPiece, kickX, kickY, rotated)) {
            currentPiece.shape = rotated;
            currentPiece.x += kickX;
            currentPiece.y += kickY;
            return;
        }
    }
}

function softDrop() {
    if (!checkCollision(currentPiece, 0, 1)) {
        currentPiece.y++;
        score += 1;
    } else {
        lockPiece();
    }
}

function hardDrop() {
    hardDropping = true;
    while (!checkCollision(currentPiece, 0, 1)) {
        currentPiece.y++;
        score += 2;
    }
    lockPiece();
    hardDropping = false;
}

function hold() {
    if (!canHold) return;
    
    canHold = false;
    const currentType = currentPiece.type;
    
    if (holdPiece) {
        // Подменяем текущую фигуру на удержанную
        currentPiece = {
            type: holdPiece.type,
            shape: SHAPES[holdPiece.type].map(row => [...row]),
            color: COLORS[holdPiece.type],
            x: Math.floor(COLS / 2) - Math.ceil(SHAPES[holdPiece.type][0].length / 2),
            y: 0
        };
    } else {
        // Если ещё не было удержанной - создаём новую
        spawnPiece();
    }
    
    holdPiece = { type: currentType };
    drawHoldPiece();
}

// ============================================
// GHOST БЛОК (тень падения)
// ============================================

function getGhostY() {
    let ghostY = currentPiece.y;
    while (!checkCollision(currentPiece, 0, ghostY - currentPiece.y + 1)) {
        ghostY++;
    }
    return ghostY;
}

// ============================================
// ОТРИСОВКА
// ============================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');

function draw() {
    // Guard clause: если игра не инициализирована — выходим
    if (!board || !Array.isArray(board) || board.length === 0 || !board[0]) {
        return;
    }
    
    // Очищаем canvas
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем сетку
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.1)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * BLOCK_SIZE, 0);
        ctx.lineTo(x * BLOCK_SIZE, canvas.height);
        ctx.stroke();
    }
    
    for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * BLOCK_SIZE);
        ctx.lineTo(canvas.width, y * BLOCK_SIZE);
        ctx.stroke();
    }
    
    // Рисуем зафиксированные блоки
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (board[y][x]) {
                drawBlock(x, y, board[y][x], 0.8);
            }
        }
    }
    
    // Рисуем ghost-блок и текущую фигуру
    if (currentPiece && !gameOver) {
        const ghostY = getGhostY();
        
        // Ghost блок
        for (let y = 0; y < currentPiece.shape.length; y++) {
            for (let x = 0; x < currentPiece.shape[y].length; x++) {
                if (currentPiece.shape[y][x]) {
                    drawGhostBlock(currentPiece.x + x, ghostY + y, currentPiece.color);
                }
            }
        }
        
        // Активная фигура
        for (let y = 0; y < currentPiece.shape.length; y++) {
            for (let x = 0; x < currentPiece.shape[y].length; x++) {
                if (currentPiece.shape[y][x]) {
                    const isTop = !currentPiece.shape[y - 1] || !currentPiece.shape[y - 1][x];
                    drawBlock(
                        currentPiece.x + x, 
                        currentPiece.y + y, 
                        currentPiece.color, 
                        1, 
                        isTop
                    );
                }
            }
        }
    }
}

function drawBlock(x, y, color, alpha = 1, isTop = false) {
    const bx = x * BLOCK_SIZE;
    const by = y * BLOCK_SIZE;
    
    // Основной цвет блока
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(bx + 1, by + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
    
    if (alpha === 1) {
        // Градиент для объёма
        const gradient = ctx.createLinearGradient(bx, by, bx + BLOCK_SIZE, by + BLOCK_SIZE);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = gradient;
        ctx.fillRect(bx + 1, by + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
        
        // Светлая обводка
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx + 2, by + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
        
        // Свечение для активной фигуры
        if (isTop) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(bx + 3, by + 3, BLOCK_SIZE - 6, BLOCK_SIZE - 6);
            ctx.shadowBlur = 0;
        }
    }
    
    ctx.globalAlpha = 1;
}

function drawGhostBlock(x, y, color) {
    const bx = x * BLOCK_SIZE;
    const by = y * BLOCK_SIZE;
    
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(bx + 2, by + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
}

function drawNextPiece() {
    nextCtx.fillStyle = '#0a0a1a';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    
    if (!nextPiece) return;
    
    const shape = SHAPES[nextPiece.type];
    const blockSize = 18;
    const offsetX = (nextCanvas.width - shape[0].length * blockSize) / 2;
    const offsetY = (nextCanvas.height - shape.length * blockSize) / 2;
    
    for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
            if (shape[y][x]) {
                const bx = offsetX + x * blockSize;
                const by = offsetY + y * blockSize;
                
                nextCtx.fillStyle = nextPiece.color;
                nextCtx.fillRect(bx + 1, by + 1, blockSize - 2, blockSize - 2);
                
                nextCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                nextCtx.lineWidth = 1;
                nextCtx.strokeRect(bx + 1, by + 1, blockSize - 2, blockSize - 2);
            }
        }
    }
}

function drawHoldPiece() {
    holdCtx.fillStyle = '#0a0a1a';
    holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
    
    if (!holdPiece) return;
    
    const shape = SHAPES[holdPiece.type];
    const blockSize = 18;
    const offsetX = (holdCanvas.width - shape[0].length * blockSize) / 2;
    const offsetY = (holdCanvas.height - shape.length * blockSize) / 2;
    
    holdCtx.globalAlpha = canHold ? 1 : 0.4;
    
    for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
            if (shape[y][x]) {
                const bx = offsetX + x * blockSize;
                const by = offsetY + y * blockSize;
                
                holdCtx.fillStyle = COLORS[holdPiece.type];
                holdCtx.fillRect(bx + 1, by + 1, blockSize - 2, blockSize - 2);
                
                holdCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                holdCtx.lineWidth = 1;
                holdCtx.strokeRect(bx + 1, by + 1, blockSize - 2, blockSize - 2);
            }
        }
    }
    
    holdCtx.globalAlpha = 1;
}

// ============================================
// UI И ОБНОВЛЕНИЕ
// ============================================

function updateDisplay() {
    document.getElementById('score').textContent = score.toLocaleString();
    document.getElementById('level').textContent = level;
    document.getElementById('lines').textContent = lines;
    document.getElementById('high-score-display').textContent = highScore.toLocaleString();
    document.getElementById('max-combo').textContent = maxCombo;
    document.getElementById('tetris-count').textContent = tetrisCount;
    
    const diff = DIFFICULTY[difficulty];
    document.getElementById('target').textContent = 
        diff.targetLines || (level * diff.linesPerLevel);
}

function showCombo(text, color) {
    const display = document.getElementById('combo-display');
    display.textContent = text;
    display.style.color = color;
    display.style.textShadow = `0 0 20px ${color}`;
    display.classList.remove('show');
    void display.offsetWidth; // Триггер reflow
    display.classList.add('show');
}

function showLevelUp() {
    const display = document.getElementById('level-up');
    display.textContent = `УРОВЕНЬ ${level}!`;
    display.classList.remove('show');
    void display.offsetWidth;
    display.classList.add('show');
}

// ============================================
// ЧАСТИЦЫ
// ============================================

function createLockParticles(piece) {
    const container = document.getElementById('particles');
    
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                const bx = (piece.x + x) * BLOCK_SIZE + BLOCK_SIZE / 2;
                const by = (piece.y + y) * BLOCK_SIZE + BLOCK_SIZE / 2;
                
                for (let i = 0; i < 3; i++) {
                    createParticle(container, bx, by, piece.color);
                }
            }
        }
    }
}

function createClearParticles(cleared) {
    const container = document.getElementById('particles');
    const count = cleared * 20;
    
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            const colors = ['#00f5ff', '#ff00ff', '#ffd700', '#00ff00'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            particle.style.left = Math.random() * canvas.width + 'px';
            particle.style.top = (ROWS - Math.random() * cleared * 4) * BLOCK_SIZE + 'px';
            particle.style.width = '4px';
            particle.style.height = '4px';
            particle.style.background = color;
            particle.style.boxShadow = `0 0 10px ${color}`;
            
            container.appendChild(particle);
            
            const vx = (Math.random() - 0.5) * 8;
            const vy = -Math.random() * 8 - 2;
            let px = parseFloat(particle.style.left);
            let py = parseFloat(particle.style.top);
            let life = 1;
            
            function animate() {
                life -= 0.03;
                px += vx;
                py += vy;
                particle.style.left = px + 'px';
                particle.style.top = py + 'px';
                particle.style.opacity = life;
                
                if (life > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            }
            
            requestAnimationFrame(animate);
        }, i * 20);
    }
}

function createParticle(container, x, y, color) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.width = '6px';
    particle.style.height = '6px';
    particle.style.background = color;
    particle.style.boxShadow = `0 0 10px ${color}`;
    
    container.appendChild(particle);
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 3;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    
    let px = x, py = y, life = 1;
    
    function animate() {
        life -= 0.05;
        px += vx;
        py += vy + 1;
        particle.style.left = px + 'px';
        particle.style.top = py + 'px';
        particle.style.opacity = life;
        
        if (life > 0) {
            requestAnimationFrame(animate);
        } else {
            particle.remove();
        }
    }
    
    requestAnimationFrame(animate);
}

// ============================================
// ЭКРАНЫ
// ============================================

function showMainMenu() {
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('game-over').classList.add('hidden');
}

function showGameOverScreen() {
    document.getElementById('game-over').classList.remove('hidden');
    document.getElementById('final-score').textContent = score.toLocaleString();
    document.getElementById('high-score').textContent = highScore.toLocaleString();
    document.getElementById('final-lines').textContent = lines;
    document.getElementById('final-combo').textContent = maxCombo;
    document.getElementById('final-tetris').textContent = tetrisCount;
    document.getElementById('final-level').textContent = level;
    
    // Показываем кнопку rewarded если реклама доступна
    const rewardedBtn = document.getElementById('rewarded-btn');
    if (rewardedBtn && sdkInitialized) {
        rewardedBtn.style.display = 'block';
        rewardedBtn.disabled = false;
    }
}

function showWinScreen() {
    document.getElementById('game-over').classList.remove('hidden');
    document.getElementById('final-score').textContent = score.toLocaleString() + ' WIN!';
    document.getElementById('high-score').textContent = highScore.toLocaleString();
    
    const rewardedBtn = document.getElementById('rewarded-btn');
    if (rewardedBtn) {
        rewardedBtn.style.display = 'none';
    }
}

function continueGame() {
    // Возвращаем игру после просмотра rewarded
    document.getElementById('game-over').classList.add('hidden');
    
    // Очищаем поле и начинаем заново
    board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    currentPiece = null;
    nextPiece = createPiece();
    holdPiece = null;
    canHold = true;
    gameOver = false;
    paused = false;
    
    spawnPiece();
    lastDropTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// ============================================
// УПРАВЛЕНИЕ (КЛАВИАТУРА)
// ============================================

function handleKeyDown(e) {
    if (e.repeat) return;
    
    keys[e.code] = true;
    
    // Пауза
    if (e.code === 'KeyP') {
        togglePause();
        return;
    }
    
    // Рестарт
    if (e.code === 'KeyR' && gameStarted && !paused) {
        restart();
        return;
    }
    
    if (paused || gameOver) return;
    
    switch (e.code) {
        case 'ArrowLeft':
            movePiece(-1);
            startDAS(-1);
            break;
        case 'ArrowRight':
            movePiece(1);
            startDAS(1);
            break;
        case 'ArrowUp':
            rotatePiece(1);
            break;
        case 'ArrowDown':
            softDropping = true;
            break;
        case 'Space':
            e.preventDefault();
            hardDrop();
            break;
        case 'KeyC':
        case 'ShiftLeft':
        case 'ShiftRight':
            hold();
            break;
    }
}

function handleKeyUp(e) {
    keys[e.code] = false;
    
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        stopDAS();
    }
    if (e.code === 'ArrowDown') {
        softDropping = false;
    }
}

function startDAS(direction) {
    stopDAS();
    dasDirection = direction;
    
    dasTimeout = setTimeout(() => {
        movePiece(dasDirection);
        dasInterval = setInterval(() => {
            if (!paused && !gameOver) {
                movePiece(dasDirection);
            }
        }, DAS_REPEAT);
    }, DAS_DELAY);
}

function stopDAS() {
    if (dasTimeout) {
        clearTimeout(dasTimeout);
        dasTimeout = null;
    }
    if (dasInterval) {
        clearInterval(dasInterval);
        dasInterval = null;
    }
}

// ============================================
// УПРАВЛЕНИЕ (МОБИЛЬНОЕ)
// ============================================

function setupMobileControls() {
    const buttons = document.querySelectorAll('.mobile-btn');
    
    buttons.forEach(btn => {
        const action = btn.dataset.action;
        
        // Touch события
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            btn.classList.add('pressed');
            handleMobileAction(action, true);
        }, { passive: false });
        
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            btn.classList.remove('pressed');
            handleMobileAction(action, false);
        }, { passive: false });
        
        btn.addEventListener('touchcancel', (e) => {
            btn.classList.remove('pressed');
        });
    });
}

function handleMobileAction(action, isStart) {
    if (gameOver) return;
    
    switch (action) {
        case 'left':
            if (isStart) {
                movePiece(-1);
                startDAS(-1);
            } else {
                stopDAS();
            }
            break;
        case 'right':
            if (isStart) {
                movePiece(1);
                startDAS(1);
            } else {
                stopDAS();
            }
            break;
        case 'rotate':
            if (isStart) rotatePiece(1);
            break;
        case 'down':
            softDropping = isStart;
            break;
        case 'hard':
            if (isStart) hardDrop();
            break;
        case 'hold':
            if (isStart) hold();
            break;
        case 'pause':
            if (isStart) togglePause();
            break;
    }
}

// ============================================
// ПАУЗА И РЕСТАРТ
// ============================================

function togglePause() {
    if (gameOver) return;
    
    paused = !paused;
    document.getElementById('pause-overlay').classList.toggle('hidden', !paused);
    
    if (!paused) {
        lastDropTime = performance.now();
        requestAnimationFrame(gameLoop);
    }
}

function restart() {
    document.getElementById('game-over').classList.add('hidden');
    init();
}

// ============================================
// ИГРОВОЙ ЦИКЛ
// ============================================

function gameLoop(timestamp) {
    if (paused || gameOver) return;
    
    // Мягкое падение
    if (softDropping) {
        const actualInterval = Math.min(dropInterval, 50);
        if (timestamp - lastDropTime >= actualInterval) {
            softDrop();
            lastDropTime = timestamp;
        }
    } else {
        // Обычное падение
        if (timestamp - lastDropTime >= dropInterval) {
            if (!checkCollision(currentPiece, 0, 1)) {
                currentPiece.y++;
            } else {
                lockPiece();
            }
            lastDropTime = timestamp;
        }
    }
    
    // Отрисовка
    draw();
    
    if (gameStarted && !gameOver) {
        requestAnimationFrame(gameLoop);
    }
}

// ============================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================

function setupEventListeners() {
    // Выбор сложности
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            difficulty = btn.dataset.difficulty;
        });
    });
    
    // Кнопка старта
    document.getElementById('start-btn').addEventListener('click', () => {
        document.getElementById('menu').classList.add('hidden');
        init();
    });
    
    // Кнопка рестарта
    document.getElementById('restart-btn').addEventListener('click', () => {
        restart();
    });
    
    // Кнопка меню
    document.getElementById('menu-btn').addEventListener('click', () => {
        document.getElementById('game-over').classList.add('hidden');
        showMainMenu();
        gameStarted = false;
    });
    
    // Rewarded кнопка
    document.getElementById('rewarded-btn')?.addEventListener('click', () => {
        showRewardedAd((success) => {
            if (success) {
                continueGame();
            }
        });
    });
    
    // Клавиатура
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    // Мобильное управление
    setupMobileControls();
}

// ============================================
// ЗАПУСК
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Инициализируем Yandex SDK
    await initYandex();
    
    // Настраиваем обработчики
    setupEventListeners();
    
    // Отрисовка начнётся автоматически в gameLoop() после старта игры
});
