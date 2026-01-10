const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; 
canvas.height = 450;

// --- CONFIGURAÇÕES GLOBAIS ---
const bgMusic = new Audio('../assets/sounds/2716__jovica__115-bpm-stab-loop-26-mastered-16-bit.wav');
bgMusic.loop = true;
bgMusic.volume = 0.5;

const gravity = 0.8;
const zoom = 1.6; 
const mapWidth = 8000;
const mapHeight = 450;
let cameraX = 0;
let cameraY = 0;
let gameState = 'loading';
let isPaused = false;
let isMuted = false;
let boss = null;
let projectiles = [];

// --- JOGADOR (ESTRUTURA BASE) ---
const player = {
    x: 120, y: 200, width: 100, height: 100,
    velX: 0, velY: 0, speed: 2, jumpForce: -15, attackFrameInterval: 6, attackCooldownMax: 0, attackCooldown: 0,
    facing: 'right', onGround: false, state: 'idle', walkTimer: 0, runThreshold: 40,
    hp: 3, maxHp: 3, canAirAttack: true, hasFired: false, 
    imgWalk: new Image(), imgRun: new Image(), imgDead: new Image(), imgJump: new Image(), imgHurt: new Image(),
    imgAttack: new Image(), imgIdle: new Image(),
    attackFrames: 6, walkFrames: 8, runFrames: 8, idleFrames: 8, jumpFrames: 8, deadFrames: 4,
    currentFrame: 0, frameTimer: 0, frameInterval: 6, dialogue: "", dialogueTimer: 0,
};

const player2 = {
    ...player, // Copia as propriedades base (x, y, hp, etc)
    x: 160,    // Começa um pouco à frente do P1
    active: false, walkTimer: 0,
    imgWalk: new Image(), imgRun: new Image(), imgDead: new Image(), imgJump: new Image(), 
    imgHurt: new Image(), imgAttack: new Image(), imgIdle: new Image(),
};

let keysP2 = { left: false, right: false };

// --- CONFIGURAÇÃO DOS PERSONAGENS (DATABASE) ---
const characterStats = {
    Swordsman: {
        idleFrames: 8, walkFrames: 8, runFrames: 8, jumpFrames: 8, attackFrames: 6, hurtFrames: 3, deadFrames: 3,
        speed: 2, maxHp: 4, jumpForce: -15, attackType: 'melee',
        folder: '../assets/Swordsman'
    },
    Knight: {
        idleFrames: 6, walkFrames: 8, runFrames: 7, jumpFrames: 6, attackFrames: 5, hurtFrames: 3, deadFrames: 4,
        speed: 2, maxHp: 4, jumpForce: -13, attackType: 'melee',
        folder: '../assets/Knight'
    },
    Wizard: {
        idleFrames: 6, walkFrames: 7, runFrames: 8, jumpFrames: 11, attackFrames: 10, hurtFrames: 4, deadFrames: 4,
        speed: 2.5, maxHp: 3, jumpForce: -14, attackType: 'range',
        folder: '../assets/Wizard', projectileColor: '#FFD541'
    },
    Enchantress: {
        idleFrames: 5, walkFrames: 8, runFrames: 8, jumpFrames: 8, attackFrames: 6, hurtFrames: 2, deadFrames: 5,
        speed: 1.8, maxHp: 5, jumpForce: -16, attackType: 'range',
        folder: '../assets/Enchantress', projectileColor: '#249FDE'
    }
};

// Variáveis de Controle da Equipe
let party = []; // Lista de nomes: ['Swordsman', 'Wizard', 'Enchantress']
let currentPartyIndex = 0;
let switchCooldown = 0; // Para evitar trocas frenéticas

// --- INICIALIZAÇÃO AUTOMÁTICA (PADRÃO SWORDSMAN / KNIGHT) ---
window.onload = function() {
    const numJogadores = parseInt(localStorage.getItem('jogadores_total')) || 1;
    
const btnTroca = document.getElementById('btn-switch-hero');

if (btnTroca) {
    btnTroca.addEventListener('click', () => {
        trocarPersonagem();
    });
}
    // Leitura do LocalStorage (Castanha = Knight, Loiro = Swordsman, conforme seu código)
    const rawChoice = localStorage.getItem('heroi_da_jornada') || 'loiro';
    const heroName = (rawChoice === 'castanha') ? 'Knight' : 'Swordsman';

    // --- MONTAGEM DA EQUIPE ---
    // 1. O Herói escolhido no menu
    party.push(heroName);
    
    // 2. Adiciona os companheiros extras
    party.push('Wizard');
    party.push('Enchantress');

    // Configura o Player 1 com o líder da equipe
    configurarPlayer(player, party[0]);
    currentPartyIndex = 0;

    // Lógica do Player 2 (mantida do seu código original)
    if (numJogadores === 2) {
        const p2Hero = (heroName === 'Swordsman') ? 'Knight' : 'Swordsman';
        player2.active = true;
        configurarPlayer(player2, p2Hero);
        
        // Reset Visual P2
        player2.state = 'idle';
        player2.facing = 'right';
        player2.currentFrame = 0;
        player2.onGround = false;
    }

// Gatilho de início
    player.imgIdle.onload = () => {
        gameState = 'playing'; 
        initEnemies(); 
        if (!isMuted) bgMusic.play().catch(() => {}); 

        // --- CORREÇÃO AQUI ---
        // Removemos o evento para que ele não dispare novamente ao trocar de personagem
        player.imgIdle.onload = null; 
    };

    // Controles Mobile
    const controls = document.getElementById('mobile-controls');
    if(controls) controls.style.display = 'flex';
};

function configurarPlayer(p, tipo) {
    const stats = characterStats[tipo];
    if (!stats) return console.error("Personagem não encontrado:", tipo);

    // Atualiza Frames
    p.idleFrames   = stats.idleFrames;
    p.walkFrames   = stats.walkFrames;
    p.runFrames    = stats.runFrames
    p.jumpFrames   = stats.jumpFrames;
    p.attackFrames = stats.attackFrames;
    p.hurtFrames   = stats.hurtFrames;
    p.deadFrames   = stats.deadFrames;

    // Atualiza Atributos Físicos
    p.speed        = stats.speed;
    p.jumpForce    = stats.jumpForce;
    
    // Atualiza HP (Mantendo a porcentagem atual se estiver no meio do jogo)
    // Se for o início (hp cheio), define para o novo max
    if (p.hp >= p.maxHp) {
        p.maxHp = stats.maxHp;
        p.hp = stats.maxHp;
    } else {
        // Regra de 3 para manter o dano proporcional
        let pct = p.hp / p.maxHp;
        p.maxHp = stats.maxHp;
        p.hp = Math.ceil(p.maxHp * pct);
    }

    // Carrega Imagens
    p.imgIdle.src   = `${stats.folder}/Idle.png`;
    p.imgWalk.src   = `${stats.folder}/Walk.png`;
    p.imgRun.src    = `${stats.folder}/Run.png`;
    p.imgJump.src   = `${stats.folder}/Jump.png`;
    p.imgAttack.src = `${stats.folder}/Attack_1.png`;
    p.imgHurt.src   = `${stats.folder}/Hurt.png`;
    p.imgDead.src   = `${stats.folder}/Dead.png`;

    // Reset visual seguro
    p.currentFrame = 0;
    p.frameTimer = 0;
    p.state = 'idle';
    
    console.log(`Personagem trocado para: ${tipo}`);
}

// Versão genérica: adicione o parâmetro 'p' e 'k' (keys)
function processarMovimento(p, k, dir, estado) {
    if(gameState !== 'playing' || p.state === 'dead' || isPaused) return;
    if(dir === 'left') k.left = estado;
    if(dir === 'right') k.right = estado;
    if(estado) p.facing = dir;
}

function processarPulo(p) {
    if(gameState === 'playing' && p.onGround && !isPaused) {
        p.velY = p.jumpForce;
        p.onGround = false;
    }
}

function processarAtaque(p) {
    if(p.state === 'dead') return;
    if(gameState !== 'playing' || isPaused || p.state === 'attacking') return;
    p.state = 'attacking';
    p.currentFrame = 0;
    checkMeleeHit(p); // Passamos o player que atacou para a função de hit
}

// --- SISTEMA DE TROCA (TAG TEAM) ---

function trocarPersonagem() {
    if (gameState !== 'playing' || isPaused || player.state === 'dead') return;
    if (switchCooldown > 0) return; // Evita spam do botão

    // Avança para o próximo personagem da lista
    currentPartyIndex++;
    if (currentPartyIndex >= party.length) {
        currentPartyIndex = 0;
    }

    const nextHero = party[currentPartyIndex];

    // Efeito visual simples (opcional: fumaça ou flash)
    criarEfeitoTroca(player.x, player.y);

    // Aplica a troca no Player 1
    configurarPlayer(player, nextHero);

    // Cooldown
    switchCooldown = 180;
}

// Pequeno efeito visual (placeholder)
function criarEfeitoTroca(x, y) {
    // Você pode desenhar um círculo ou fumaça no draw(), 
    // mas por enquanto vamos apenas logar ou fazer um som se tiver
    console.log("PUFF! Trocando personagem...");
}

const playerDialogTriggers = [
   { x: 4500, text: "Uma casa?", used: false },

];

function dispararProjetil(p) {
    // Descobre qual personagem é para pegar a cor certa
    // (Lógica simplificada: procura o nome da pasta na string src)
    let tipo = 'Wizard'; 
    if (p.imgIdle.src.includes('Enchantress')) tipo = 'Enchantress';
    
    // Se o personagem atual tiver cor definida, usa ela, senão usa amarelo
    const stats = characterStats[tipo];
    const cor = stats ? stats.projectileColor : 'yellow';

    projectiles.push({
        x: p.facing === 'right' ? p.x + p.width - 20 : p.x + 20, // Sai da mão
        y: p.y + p.height - 30,
        radius: 10,
        speed: p.facing === 'right' ? 8 : -8, // Velocidade (positiva ou negativa)
        color: cor,
        damage: 1,
        lifeTime: 30
    });
}

// --- INIMIGOS ---
let enemies = [];
function initEnemies() {
    enemies = [
        { type: 'Black_Werewolf', x: 1200, y: 200, hp: 3, speed: 2, attackRange: 50, specialRange: 250, specialCooldown: 0, specialMaxCooldown: 300,
	frameInterval: 8, walkFrames: 11, attackFrames: 6, runAttackFrames: 7, hurtFrames: 2, deadFrames: 2 },
  
        { type: 'Red_Werewolf', x: 1400, y: 200, hp: 3, speed: 2, attackRange: 50, specialRange: 250, specialCooldown: 0, specialMaxCooldown: 300,
	frameInterval: 8, walkFrames: 11, attackFrames: 6, runAttackFrames: 7, hurtFrames: 2, deadFrames: 2 },

        { type: 'Black_Werewolf', x: 2000, y: 200, hp: 3, speed: 2, attackRange: 50, specialRange: 250, specialCooldown: 0, specialMaxCooldown: 300,
	frameInterval: 8, walkFrames: 11, attackFrames: 6, runAttackFrames: 7, hurtFrames: 2, deadFrames: 2 },
        { type: 'Black_Werewolf', x: 2300, y: 200, hp: 3, speed: 2, attackRange: 50, specialRange: 250, specialCooldown: 0, specialMaxCooldown: 300,
	frameInterval: 8, walkFrames: 11, attackFrames: 6, runAttackFrames: 7, hurtFrames: 2, deadFrames: 2 },
        { type: 'Black_Werewolf', x: 2400, y: 200, hp: 3, speed: 2, attackRange: 50, specialRange: 250, specialCooldown: 0, specialMaxCooldown: 300,
	frameInterval: 8, walkFrames: 11, attackFrames: 6, runAttackFrames: 7, hurtFrames: 2, deadFrames: 2 },
  
        { type: 'Red_Werewolf', x: 3000, y: 200, hp: 3, speed: 2, attackRange: 50, specialRange: 250, specialCooldown: 0, specialMaxCooldown: 300,
	frameInterval: 8, walkFrames: 11, attackFrames: 6, runAttackFrames: 7, hurtFrames: 2, deadFrames: 2 },
        { type: 'Red_Werewolf', x: 3200, y: 200, hp: 3, speed: 2, attackRange: 50, specialRange: 250, specialCooldown: 0, specialMaxCooldown: 300,
	frameInterval: 8, walkFrames: 11, attackFrames: 6, runAttackFrames: 7, hurtFrames: 2, deadFrames: 2 },


 ];

    enemies.forEach(en => {
        en.imgIdle = new Image(); en.imgIdle.src = `../assets/enemies/${en.type}/Idle.png`;
        en.imgWalk = new Image(); en.imgWalk.src = `../assets/enemies/${en.type}/Walk.png`;
        en.imgAttack = new Image(); en.imgAttack.src = `../assets/enemies/${en.type}/Attack_1.png`;
        en.imgRunAttack = new Image(); en.imgRunAttack.src = `../assets/enemies/${en.type}/Run+Attack.png`;
        en.imgHurt = new Image(); en.imgHurt.src = `../assets/enemies/${en.type}/Hurt.png`;
        en.imgDead = new Image(); en.imgDead.src = `../assets/enemies/${en.type}/Dead.png`;

        en.width = 100; en.height = 100;
        en.currentFrame = 0; en.frameTimer = 0;
        if (en.frameInterval === undefined) en.frameInterval = 8;
        en.state = 'patrol'; en.facing = 'left'; en.attackCooldown = 0;
        en.velY = 0; en.onGround = false;
    });
}

// --- PLATAFORMAS ---
const platforms = [
    { x: 0, y: 300, w: 8000, h: 150, type: 'pattern' },

];

// --- Cenário ---
const fundoImg = new Image();
fundoImg.src = 'fundo.png';

const platformImg = new Image();
platformImg.src = '../assets/Battleground/Platformer/Ground_11.png';

const house1Img = new Image();
house1Img.src = '../assets/Battleground/Casa/House1.png';

const birch_2Img = new Image();
birch_2Img.src = '../assets/Battleground/Trees/birch_2.png';
const birch_3Img = new Image();
birch_3Img.src = '../assets/Battleground/Trees/birch_3.png';
const birch_4Img = new Image();
birch_4Img.src = '../assets/Battleground/Trees/birch_4.png';
const birch_5Img = new Image();
birch_5Img.src = '../assets/Battleground/Trees/birch_5.png';
const birch_6Img = new Image();
birch_6Img.src = '../assets/Battleground/Trees/birch_6.png';


let platformPattern = null;

platformImg.onload = () => {
    platformPattern = ctx.createPattern(platformImg, 'repeat');
};

let keys = { left: false, right: false };

const backgroundObjects = [
	{ x: 0, y: 0, width: 8000, height: 1000, img: fundoImg },
	{ x: 4900, y: 100, width: 250, height: 200, img: house1Img },

	{ x: 400, y: 100, width: 200, height: 200, img: birch_2Img },
	{ x: 500, y: 100, width: 200, height: 200, img: birch_3Img },
	{ x: 700, y: 100, width: 200, height: 200, img: birch_4Img },
	{ x: 900, y: 100, width: 200, height: 200, img: birch_5Img },
	{ x: 1000, y: 100, width: 200, height: 200, img: birch_2Img },
	{ x: 1100, y: 100, width: 200, height: 200, img: birch_6Img },

	{ x: 1200, y: 100, width: 200, height: 200, img: birch_2Img },
	{ x: 1300, y: 100, width: 200, height: 200, img: birch_4Img },
	{ x: 1400, y: 100, width: 200, height: 200, img: birch_3Img },
	{ x: 1600, y: 100, width: 200, height: 200, img: birch_4Img },
	{ x: 1800, y: 100, width: 200, height: 200, img: birch_5Img },
	{ x: 2000, y: 100, width: 200, height: 200, img: birch_6Img },

	{ x: 2200, y: 100, width: 200, height: 200, img: birch_2Img },
	{ x: 2400, y: 100, width: 200, height: 200, img: birch_3Img },
	{ x: 2600, y: 100, width: 200, height: 200, img: birch_4Img },
	{ x: 2800, y: 100, width: 200, height: 200, img: birch_5Img },
	{ x: 3000, y: 100, width: 200, height: 200, img: birch_6Img },

	{ x: 3200, y: 100, width: 200, height: 200, img: birch_2Img },
	{ x: 3400, y: 100, width: 200, height: 200, img: birch_3Img },
	{ x: 3600, y: 100, width: 200, height: 200, img: birch_4Img },
	{ x: 3800, y: 100, width: 200, height: 200, img: birch_5Img },
	{ x: 4000, y: 100, width: 200, height: 200, img: birch_6Img },


	{ x: 5200, y: 100, width: 200, height: 200, img: birch_2Img },
	{ x: 5400, y: 100, width: 200, height: 200, img: birch_3Img },
	{ x: 5600, y: 100, width: 200, height: 200, img: birch_4Img },
	{ x: 5800, y: 100, width: 200, height: 200, img: birch_5Img },
	{ x: 6000, y: 100, width: 200, height: 200, img: birch_6Img },
];

const foregroundObjects = [
	{ x: 600, y: 100, width: 200, height: 200, img: birch_2Img },
	{ x: 800, y: 100, width: 200, height: 200, img: birch_2Img },

	{ x: 1700, y: 100, width: 200, height: 200, img: birch_3Img },
	{ x: 2100, y: 100, width: 200, height: 200, img: birch_2Img },


	{ x: 5300, y: 100, width: 200, height: 200, img: birch_2Img },
	{ x: 5500, y: 100, width: 200, height: 200, img: birch_3Img },
	{ x: 5700, y: 100, width: 200, height: 200, img: birch_4Img },
	{ x: 5900, y: 100, width: 200, height: 200, img: birch_5Img },
	{ x: 6100, y: 100, width: 200, height: 200, img: birch_6Img },
];

// --- NPCs ---
const musketeerNpc = {
    x: 5000, y: 200, width: 80, height: 100, imgIdle: new Image(), facing: 'left',
    idleFrames: 3, currentFrame: 0, frameTimer: 0, frameInterval: 16,
    activated: false, rangeAtivacao: 300, rangeEsquecimento: 400,
    phrases: [
"Há coisas que deveriam permanecer enterradas…",
"O Norte nunca foi silencioso.",
"Se os selos estão falhando...",
"Então o tempo está se repetindo.",
"Mais à frente há o lugar de onde estão vindo essas criaturas."
],
    dialogueIndex: 0, dialogueTimer: 0
};

musketeerNpc.imgIdle.src = '../assets/Farmer/OldMan.png';

const npcs = [musketeerNpc];

// --- FUNÇÃO GLOBAL PARA FALA DO PLAYER ---
window.playerSay = function(text, duration = 120) {
    player.dialogue = text;
    player.dialogueTimer = duration;
};

function resetPlayer(p, xInicial) {
    p.hp = p.maxHp;
    p.x = xInicial;
    p.y = 100;
    p.velX = 0;
    p.velY = 0;
    p.state = 'idle';
    p.currentFrame = 0;
    p.frameTimer = 0;
    p.onGround = false;
    p.canAirAttack = true;
}


// --- FUNÇÕES DO SISTEMA ---
window.togglePause = function() { if (gameState !== 'playing') return; isPaused = !isPaused; if (isPaused) bgMusic.pause(); else if (!isMuted) bgMusic.play().catch(() => {}); };
window.toggleSom = function() { isMuted = !isMuted; bgMusic.muted = isMuted; const btn = document.getElementById('btn-audio'); if(btn) btn.innerText = isMuted ? "Mudo" : "Som"; };
window.resetGame = function () {
    const screen = document.getElementById('game-over-screen');
    if (screen) screen.style.display = 'none';

    resetPlayer(player, 120);

    if (player2 && player2.active) {
        resetPlayer(player2, 160);
    }

    cameraX = 0;
    isPaused = false;
    gameState = 'playing';

    boss = null;
    initEnemies();
};

// Função para salvar o progresso e voltar ao menu raiz

window.concluirCapituloEVoutar = function() {
    localStorage.setItem('2capitulo_3_vencido', 'true');
    
window.location.href = "../index.html";

};

// Movimentação
window.mover = function(p, kObj, dir, estado) {
    if (gameState !== 'playing' || p.state === 'dead' || isPaused) return;
    if (dir === 'left') kObj.left = estado;
    if (dir === 'right') kObj.right = estado;
    if (estado) p.facing = dir;
};

// Pulo
window.pular = function(p) {
    if (gameState === 'playing' && p.onGround && !isPaused && p.state !== 'dead') {
        p.velY = p.jumpForce;
        p.onGround = false;
        p.state = 'jump';
    }
};

// Ataque (usando a função checkMeleeHit que já ajustamos)
window.atacar = function(p) {
    if (p.state === 'dead' || p.state === 'attacking' || p.attackCooldown > 0 || isPaused) return;

    p.state = 'attacking';
    p.currentFrame = 0;
    p.frameTimer = 0;
    p.hasFired = false; 
    p.attackCooldown = 25; // Ajuste conforme necessário

    // Se for corpo a corpo, o dano é aplicado via colisão de espada
    let isRange = p.imgIdle.src.includes('Wizard') || p.imgIdle.src.includes('Enchantress');
    if (!isRange) {
        checkMeleeHit(p);
    }
};

// NPCs
function npcSay(npc, index=0, duration=60){ npc.dialogueIndex=index; npc.dialogueTimer=duration; }

function updateNPCs() {
    npcs.forEach(n => {
        const dist = Math.abs(player.x - n.x);
        
        // CORREÇÃO: Player vindo da esquerda (X do player é menor que o do NPC)
        const playerEstaEsquerda = player.x < n.x;

        // --- LÓGICA DE ATIVAÇÃO ---
        // Ativa se: não está ativo + está no range + está do lado ESQUERDO
        if (!n.activated && dist < n.rangeAtivacao && playerEstaEsquerda) {
            n.activated = true;
            n.dialogueIndex = 0;
            n.dialogueTimer = 80; 
        }

        // --- LÓGICA DE ESQUECIMENTO (RESET) ---
        // Reseta se: já está ativo E (se afastou demais OU passou para o lado direito)
        // Se você quiser que o NPC continue falando mesmo depois que o player passar por ele, 
        // remova o "|| !playerEstaEsquerda" abaixo.
        if (n.activated && (dist > n.rangeEsquecimento || !playerEstaEsquerda)) {
            n.activated = false;
            n.dialogueTimer = 0;
            n.dialogueIndex = 0;
        }

        // --- ATUALIZAÇÃO DO DIÁLOGO ---
        if (n.activated && n.dialogueTimer > 0) {
            n.dialogueTimer--;

            if (n.dialogueTimer <= 0 && n.dialogueIndex < n.phrases.length - 1) {
                n.dialogueIndex++;
                n.dialogueTimer = 180; 
            }
        }

        // --- ANIMAÇÃO ---
        if (n.frameTimer !== -999999) {
            n.frameTimer++;
            if (n.frameTimer >= n.frameInterval) {
                n.frameTimer = 0;
                n.currentFrame = (n.currentFrame + 1) % n.idleFrames;
            }
        }
    });
}

// HIT MELEE
function checkMeleeHit(p) {
    // Usamos 'p' para calcular o alcance e a posição da batida
    let alcance = p.width * 0.4; 
    let hitboxX = p.facing === 'right' ? p.x + p.width * 0.7 : p.x - alcance + p.width * 0.3;

    // 1. Dano nos inimigos comuns (Trocamos 'player' por 'p')
    enemies.forEach(en => {
        if (en.state === 'dead') return;
        let hitY = en.y + (en.height * 0.3);
        let hitHeight = en.height * 0.7;

        if (hitboxX < en.x + en.width && hitboxX + alcance > en.x &&
            p.y < hitY + hitHeight && p.y + p.height > hitY) {
            en.hp--;
            en.state = 'hurt';
            en.currentFrame = 0;
           if (en.hp <= 0) {
    en.state = 'dead';
    en.currentFrame = 0;
    en.frameTimer = 0;
}
        }
    });

    // 2. Dano no Boss (Trocamos 'player' por 'p')
    if (boss && boss.state !== 'dead') {
        if (hitboxX < boss.x + boss.width && hitboxX + alcance > boss.x &&
            p.y < boss.y + boss.height && p.y + p.height > boss.y) {
            
            boss.hp--;
            boss.state = 'hurt';
            boss.currentFrame = 0;
            boss.frameTimer = 0;

            if (boss.hp <= 0) {
                boss.state = 'dead';
                boss.currentFrame = 0;
                boss.dialogue = "O equilíbrio...";
                boss.dialogueTimer = 180;
            }
        }
    }
}

function atualizarAnimacaoPlayer(p) {
    // ⛔ Se morreu, só anima Dead
    if (p.state === 'dead') {
        p.frameTimer++;
        if (p.frameTimer >= p.frameInterval) {
            p.frameTimer = 0;
            if (p.currentFrame < p.deadFrames - 1) {
                p.currentFrame++;
            }
        }
        return; 
    }

    // ⚔️ LÓGICA DE ATAQUE
    if (p.state === 'attacking') {
        p.frameTimer++;
        const intervalo = p.attackFrameInterval || 6; 

        // --- DISPARAR MAGIA NO FRAME ESPECÍFICO ---
        if (p.currentFrame === 5 && !p.hasFired) {
            let isRange = p.imgIdle.src.includes('Wizard') || p.imgIdle.src.includes('Enchantress');
            if (isRange) {
                dispararProjetil(p);
            }
            p.hasFired = true; 
        }

        if (p.frameTimer >= intervalo) {
            p.frameTimer = 0;
            p.currentFrame++;

            if (p.currentFrame >= p.attackFrames) {
                p.currentFrame = 0;
                p.state = p.onGround ? 'idle' : 'jumping';
                p.hasFired = false; 
            }
        }
        return; // Impede outras animações enquanto ataca
    }

    // ===== ANIMAÇÕES NORMAIS (IDLE, WALK, RUN, JUMP) =====
    p.frameTimer++;
    if (p.frameTimer >= p.frameInterval) {
        p.frameTimer = 0;

        if (!p.onGround) {
            // PULO
            p.state = 'jumping';
            p.currentFrame = (p.currentFrame + 1) % (p.jumpFrames || 8);
        } else if (Math.abs(p.velX) > 0.1) {
            // MOVIMENTO (Verifica se está correndo baseado na velocidade)
            // Se a velocidade absoluta for maior que a velocidade base + margem, considera corrida
            if (Math.abs(p.velX) > p.speed * 1.1) {
                p.state = 'running';
                p.currentFrame = (p.currentFrame + 1) % (p.runFrames || 8);
            } else {
                p.state = 'walking';
                p.currentFrame = (p.currentFrame + 1) % (p.walkFrames || 8);
            }
        } else {
            // PARADO
            p.state = 'idle';
            p.currentFrame = (p.currentFrame + 1) % (p.idleFrames || 8);
        }
    }
}


// --- UPDATE ---
function update(){
    if(gameState !== 'playing' || isPaused) return;

// --- CÓDIGO NOVO: Diminuir o Cooldown dos Players ---
    if (player.attackCooldown > 0) {
        player.attackCooldown--;
    }
    
    if (player2.active && player2.attackCooldown > 0) {
        player2.attackCooldown--;
    }

    // --- CÓDIGO NOVO: Diminuir o Cooldown da Troca de Personagem ---
    if (switchCooldown > 0) switchCooldown--;

    // Marca Player 1 como morto (sem parar o jogo)
    if (player.hp <= 0 && player.state !== 'dead') {
        player.state = 'dead';
    }

    // Marca Player 2 como morto (se ativo)
    if (player2.active && player2.hp <= 0 && player2.state !== 'dead') {
        player2.state = 'dead';
    }

    updateNPCs();

// ATUALIZAR PROJÉTEIS
projectiles.forEach((proj, index) => {
    proj.x += proj.speed;
    proj.lifeTime--;

    // Remove se o tempo acabou ou saiu da tela
    if (proj.lifeTime <= 0 || proj.x < cameraX - 100 || proj.x > cameraX + canvas.width + 100) {
        projectiles.splice(index, 1);
        return;
    }

    // COLISÃO COM INIMIGOS
    enemies.forEach(en => {
        if (en.state !== 'dead') {
            // Colisão simples Retângulo x Círculo (aproximada)
            if (
                proj.x > en.x && 
                proj.x < en.x + en.width &&
                proj.y > en.y && 
                proj.y < en.y + en.height
            ) {
                en.hp -= proj.damage;
                en.state = 'hurt';
                en.currentFrame = 0;
                if (en.hp <= 0) {
    en.state = 'dead';
    en.currentFrame = 0;
    en.frameTimer = 0;
}
                
                // Remove o projétil ao acertar
                projectiles.splice(index, 1);
            }
        }
    });
    
    // COLISÃO COM BOSS (Se existir)
    if (boss && boss.state !== 'dead') {
         if (
            proj.x > boss.x && 
            proj.x < boss.x + boss.width &&
            proj.y > boss.y && 
            proj.y < boss.y + boss.height
        ) {
            boss.hp -= proj.damage;
            boss.state = 'hurt';
            if (boss.hp <= 0) boss.state = 'dead';
            projectiles.splice(index, 1);
        }
    }
});

aplicarFisicaCompleta(player, keys);

if (player2.active) {
    aplicarFisicaCompleta(player2, keysP2);
}

atualizarAnimacaoPlayer(player);
if (player2.active) atualizarAnimacaoPlayer(player2);

if (todosPlayersMortos()) {
    resetGame();
}

if(Math.abs(player.x - musketeerNpc.x) < 150 && musketeerNpc.dialogueTimer <= 0){ 
    npcSay(musketeerNpc, 0, 60); 
}
    if(player.y>=450){ player.hp=0; player.state='dead'; return;}

    if(player.state!=='attacking'){ if(keys.left) player.velX=-player.speed; else if(keys.right) player.velX=player.speed; else player.velX*=0.7; } else player.velX=0;

    if(player.dialogueTimer>0){ player.dialogueTimer--; if(player.dialogueTimer<=0) player.dialogue=""; }


// limites do mapa
if (player.x < 0) player.x = 0;
if (player.x + player.width > mapWidth)
    player.x = mapWidth - player.width; 

    if(player.onGround) player.canAirAttack=true;

// 1. Determina o alvo da câmera (Média entre P1 e P2)
let alvoX, alvoY;

if (player2.active && player.state !== 'dead' && player2.state !== 'dead') {
    // Se ambos estão vivos, tira a média
    alvoX = (player.x + player2.x) / 2;
    alvoY = (player.y + player2.y) / 2;
} else if (player.state !== 'dead') {
    // Se só o P1 está vivo
    alvoX = player.x;
    alvoY = player.y;
} else {
    // Se o P1 morreu, foca no P2
    alvoX = player2.x;
    alvoY = player2.y;
}

// 2. Calcula onde a câmera deveria estar (Target)
let targetX = (alvoX + player.width / 2) - (canvas.width / (2 * zoom));
let targetY = (alvoY + player.height / 2) - (canvas.height / (2 * zoom));

// 3. Suavização (Interpolação)
cameraX += (targetX - cameraX) * 0.1;
cameraY += (targetY - cameraY) * 0.1;

// 4. Limites da câmera para não sair do mapa
cameraX = Math.max(0, Math.min(cameraX, mapWidth - canvas.width / zoom));
cameraY = Math.max(0, Math.min(cameraY, mapHeight - canvas.height / zoom));

// INIMIGOS
    enemies.forEach(en=>{

    const alvo = obterAlvoMaisProximo(en);
    if (!alvo) return;

    const dist = Math.abs(alvo.x - en.x);

        if(en.patrolMinX===undefined){ en.patrolMinX=en.x-120; en.patrolMaxX=en.x+120;}
        if(en.facing===undefined) en.facing='left';
 
        en.velY+=gravity; en.y+=en.velY; en.onGround=false;

        platforms.forEach(p=>{
            if(en.x+40<p.x+p.w && en.x+60>p.x && en.y+en.height>=p.y && en.y+en.height<=p.y+10){ en.y=p.y-en.height; en.velY=0; en.onGround=true; }
        });

// --- NOVO BLOCO DE MORTE ---
if(en.state === 'dead'){ 
    en.frameTimer++; 
    if(en.frameTimer >= en.frameInterval) {
        if(en.currentFrame < en.deadFrames - 1){ 
            en.currentFrame++; 
        }
        en.frameTimer = 0;
    }
    return; 
}
        

// --- LÓGICA DE ESTADOS ---
if (en.state === 'hurt') {
    en.frameTimer++;
    if (en.frameTimer >= 30) {
        en.state = 'patrol';
        en.frameTimer = 0;
        en.currentFrame = 0;
    }
} 
// 1. COMPORTAMENTO DE RECUO (Exclusivo Werewolves)
else if (en.type.includes('Werewolf') && (en.specialCooldown || 0) > 0) {
    if (dist < 300) { 
        // Foge do player se ele chegar perto durante o cooldown
        if (alvo.x < en.x) { en.x += en.speed; en.facing = 'right'; } 
        else { en.x -= en.speed; en.facing = 'left'; }
        en.state = 'chase'; 
    }
}
else if (en.state === 'patrol') {
    if (en.facing === 'left') {
        en.x -= en.speed;
        if (en.x <= en.patrolMinX) en.facing = 'right';
    } else {
        en.x += en.speed;
        if (en.x >= en.patrolMaxX) en.facing = 'left';
    }
    // Aumentado para 250 para ele ver o player de longe e ter espaço para correr
    if (dist < 200) en.state = 'chase';
}
else if (en.state === 'chase') {
    // 2. TENTAR INVESTIDA (Run+Attack)
    // Só acontece se for Werewolf e estiver na distância certa (120 a 300px)
    if (en.type.includes('Werewolf') && dist > 120 && dist < 300 && (en.specialCooldown || 0) <= 0) {
        en.state = 'charging';
        en.currentFrame = 0;
        en.frameTimer = 0;
    } 
    // 3. ATAQUE NORMAL (Corpo a corpo)
    else if (dist <= en.attackRange && en.attackCooldown <= 0) {
        en.state = 'attacking';
        en.currentFrame = 0;
        en.frameTimer = 0;
    }
    else {
        // Perseguição normal
        const minDist = 30;
        if (dist > minDist) {
            if (alvo.x < en.x) { en.x -= en.speed * 1.2; en.facing = 'left'; }
            else { en.x += en.speed * 1.2; en.facing = 'right'; }
        }
        if (dist > 400) en.state = 'patrol';
    }
}
else if (en.state === 'attacking') {
    const attackFrame = 2; 
    en.frameTimer++;
    if (en.frameTimer >= en.frameInterval) {
        en.frameTimer = 0;
        en.currentFrame++;
        if (en.currentFrame === attackFrame && dist <= en.attackRange) {
            alvo.hp -= 1;
            alvo.state = 'hurt';
            alvo.currentFrame = 0;
            en.attackCooldown = 80;
        }
        if (en.currentFrame >= en.attackFrames) {
            en.currentFrame = 0;
            en.state = 'chase';
        }
    }
}
// 4. LÓGICA DA INVESTIDA (Estado 'charging')
else if (en.state === 'charging') {
    const chargeSpeed = en.speed * 1.8; 
    if (en.facing === 'left') en.x -= chargeSpeed;
    else en.x += chargeSpeed;

    en.frameTimer++;
    // Animação levemente mais rápida na corrida
    if (en.frameTimer >= en.frameInterval - 2) {
        en.frameTimer = 0;
        en.currentFrame++;

        // Dano por contato durante a corrida
        if (dist < 50) {
            alvo.hp -= 1;
            alvo.state = 'hurt';
            alvo.currentFrame = 0;
            alvo.x += (en.facing === 'left') ? -40 : 40; // Knockback
            en.state = 'chase';
            en.specialCooldown = 300; 
        }

        if (en.currentFrame >= (en.runAttackFrames || 7)) {
            en.currentFrame = 0;
            en.state = 'chase';
            en.specialCooldown = 300; 
        }
    }
}

// Cooldowns e Animação Final
if (en.attackCooldown > 0) en.attackCooldown--;
if (en.specialCooldown > 0) en.specialCooldown--;

if (en.state !== 'attacking' && en.state !== 'charging' && en.state !== 'dead' && en.state !== 'hurt') {
    en.frameTimer++;
    if (en.frameTimer >= en.frameInterval) {
        let totalF = (en.state === 'patrol' || en.state === 'chase') ? en.walkFrames : en.idleFrames;
        en.currentFrame = (en.currentFrame + 1) % totalF;
        en.frameTimer = 0;
    }
}
    }); // Fim do forEach

    // PLAYER DIALOG
    playerDialogTriggers.forEach(trigger=>{
        if(!trigger.used && player.x>trigger.x){ playerSay(trigger.text,180); trigger.used=true;}
    });
const gatilhoX = 6000;
const p1Ativou = player.x > gatilhoX;
const p2Ativou = player2.active && player2.x > gatilhoX;

if ((p1Ativou || p2Ativou) && !boss) {
    boss = {
        type: 'Boss',
        x: 6600,
        y: 200, 
        width: 150, height: 150,
        hp: 4, maxHp: 4,
        speed: 3,
        state: 'idle',
        facing: 'left',
        damage: 1,
        attackRange: 60,
        specialCooldown: 0,
        attackCooldown: 0,
        currentFrame: 0,
        frameTimer: 0,
        frameInterval: 8,fala: "",
        falaTimer: 0,

        idleFrames: 8, walkFrames: 11, attackFrames: 6, runAttackFrames: 7, hurtFrames: 2, deadFrames: 2,
        
        imgIdle: new Image(), imgWalk: new Image(), imgAttack: new Image(), imgRunAttack: new Image(),
        imgHurt: new Image(), imgDead: new Image()
    };
    
    // Carregamento automático das imagens (ajuste a pasta conforme seu assets)
    const folder = '../assets/enemies/White_Werewolf'; 
    boss.imgIdle.src = `${folder}/Idle.png`;
    boss.imgWalk.src = `${folder}/Walk.png`;
    boss.imgAttack.src = `${folder}/Attack_1.png`;
    boss.imgRunAttack.src = `${folder}/Run+Attack.png`;
    boss.imgHurt.src = `${folder}/Hurt.png`;
    boss.imgDead.src = `${folder}/Dead.png`;
}

// Se o Boss existir, rodar a lógica dele
if (boss) {
    updateBossLogic(); 
}
}

function aplicarFisicaCompleta(p, k) {
    if (p.state === 'dead') return;

    // --- LÓGICA DE CORRIDA AUTOMÁTICA ---
    let velocidadeAtual = p.speed;

    // Se estiver se movendo (Esquerda ou Direita)
    if (k.left || k.right) {
        p.walkTimer++; // Aumenta o contador
        
        // Se já estiver andando há tempo suficiente, ativa a velocidade de corrida
        if (p.walkTimer > p.runThreshold) {
            velocidadeAtual = p.speed * 1.8; // Aumenta 80% a velocidade
        }
    } else {
        // Se soltou os botões, reseta o timer e a velocidade
        p.walkTimer = 0;
    }

    // Se mudar de direção bruscamente, zera o impulso (opcional, mas melhora o game feel)
    if ((k.left && p.facing === 'right') || (k.right && p.facing === 'left')) {
        p.walkTimer = 0;
    }

    // --- APLICAÇÃO DO MOVIMENTO HORIZONTAL ---
    if (p.state !== 'attacking') {
        if (k.left) {
            p.velX = -velocidadeAtual;
        } else if (k.right) {
            p.velX = velocidadeAtual;
        } else {
            p.velX *= 0.7; // Fricção quando solta a tecla
        }
    } else {
        p.velX = 0; // Para ao atacar
        p.walkTimer = 0; // Reseta a corrida se atacar
    }

    p.x += p.velX;

    // LIMITES DO MAPA
    if (p.x < 0) p.x = 0;
    if (p.x + p.width > mapWidth) p.x = mapWidth - p.width;

    // ===== FÍSICA VERTICAL =====
    p.onGround = false;
    p.velY += gravity;
    if (p.velY > 20) p.velY = 20;
    p.y += p.velY;

    // COLISÃO COM PLATAFORMAS
    platforms.forEach(pl => {
        if (pl.type === 'sloped') return;

        const bottom = p.y + p.height;
        const prevBottom = bottom - p.velY;

        const overlapX =
            p.x + p.width > pl.x &&
            p.x < pl.x + pl.w;

        if (overlapX && prevBottom <= pl.y && bottom >= pl.y) {
            p.y = pl.y - p.height;
            p.velY = 0;
            p.onGround = true;
        }
    });
}

function obterAlvoMaisProximo(en) {
    let alvos = [];

    if (player.hp > 0 && player.state !== 'dead') {
        alvos.push(player);
    }

    if (player2.active && player2.hp > 0 && player2.state !== 'dead') {
        alvos.push(player2);
    }

    if (alvos.length === 0) return null;

    return alvos.reduce((a, b) => {
        return Math.abs(a.x - en.x) < Math.abs(b.x - en.x) ? a : b;
    });
}


function bossDiz(texto, tempo = 120) {
boss.dialogue = texto; // Use 'dialogue' em vez de 'fala'
    boss.dialogueTimer = tempo;
}

// --- OUTRAS FUNÇÕES ---
function enemySay(en, type) {
    const list = en.phrases[type];
    en.dialogue = list[Math.floor(Math.random() * list.length)];
    en.dialogueTimer = 120;
}

// --- LÓGICA DO BOSS ---
function updateBossLogic() {
    if (!boss) return;

    const alvo = obterAlvoMaisProximo(boss);
    if (!alvo) return;

    const dist = Math.abs(alvo.x - boss.x);

    // 1. ESTADO DE MORTE
    if (boss.state === 'dead') {
        boss.frameTimer++;
        if (boss.frameTimer >= boss.frameInterval) {
            boss.frameTimer = 0;
            if (boss.currentFrame < boss.deadFrames - 1) {
                boss.currentFrame++;
            }
        }
        return; 
    }

    // 2. GRAVIDADE E CHÃO
    boss.velY = (boss.velY || 0) + gravity;
    boss.y += boss.velY;

    // Colisão com o chão (ajustado para a altura do boss)
    if (boss.y + boss.height > 300) {
        boss.y = 300 - boss.height;
        boss.velY = 0;
    }

    if (boss.x < 6000) { 
        boss.x = 6000;
    }
    if (boss.x + boss.width > 8000) { 
        boss.x = 8000 - boss.width;
    }

    // 3. ANIMAÇÃO E TIMERS
    if (boss.falaTimer > 0) boss.falaTimer--;
    if (boss.attackCooldown > 0) boss.attackCooldown--;
    if (boss.specialCooldown > 0) boss.specialCooldown--;
    
    boss.frameTimer++;
    if (boss.frameTimer >= (boss.state === 'charging' ? 5 : boss.frameInterval)) {
        boss.frameTimer = 0;
        
        let maxFrames = 1;
        if (boss.state === 'idle') maxFrames = boss.idleFrames;
        else if (boss.state === 'walking') maxFrames = boss.walkFrames;
        else if (boss.state === 'attacking') maxFrames = boss.attackFrames;
        else if (boss.state === 'charging') maxFrames = boss.runAttackFrames || 7;
        else if (boss.state === 'hurt') maxFrames = boss.hurtFrames;

        boss.currentFrame++;

        // VERIFICAÇÃO DE DANO NO ATAQUE NORMAL (Frame de impacto)
        if (boss.state === 'attacking' && boss.currentFrame === 3) {
            if (dist < boss.attackRange + 20) {
                aplicarDanoAoPlayer(alvo, boss.damage || 1, boss.x);
            }
        }

        // RESET DE ESTADOS APÓS ANIMAÇÃO
        if (boss.currentFrame >= maxFrames) {
            boss.currentFrame = 0;
            if (boss.state === 'hurt' || boss.state === 'attacking' || boss.state === 'charging') {
                if (boss.state === 'attacking') boss.attackCooldown = 60;
                if (boss.state === 'charging') boss.specialCooldown = 180; // Boss recarrega mais rápido
                boss.state = 'idle';
            }
        }
    }

    // 4. GATILHOS DE FALA
    if (dist < 500 && !boss.viuPlayer) {
        bossDiz("AAAUUUUUU!!");
        boss.viuPlayer = true;
    }

// 5. IA DE COMBATE (LÓGICA CORRIGIDA)
    if (boss.state !== 'hurt' && boss.state !== 'attacking' && boss.state !== 'charging') {
        
        // --- COMPORTAMENTO A: BOSS ESTÁ CANSADO (COOLDOWN) ---
        if (boss.specialCooldown > 0) {
            // Se estiver cansado e o player estiver perto (aumentei para 300 para ele fugir com vontade)
            if (dist < 300) {
                boss.state = 'walking';
                // Foge do player
                boss.x += (alvo.x < boss.x) ? boss.speed : -boss.speed; 
                // Opcional: Faz ele virar as costas para fugir
                boss.facing = (alvo.x < boss.x) ? 'right' : 'left';
            } else {
                // Se já está longe, fica parado recuperando fôlego e encarando o player
                boss.state = 'idle';
                boss.facing = (alvo.x < boss.x) ? 'left' : 'right';
            }
        } 
        // --- COMPORTAMENTO B: BOSS ESTÁ AGRESSIVO ---
        else {
            // Sempre encara o player quando está pronto para brigar
            boss.facing = (alvo.x < boss.x) ? 'left' : 'right';

            // B. MECÂNICA DE INVESTIDA (Run+Attack)
            if (dist > 180 && dist < 450) {
                boss.state = 'charging';
                boss.currentFrame = 0;
                if (Math.random() < 0.5) bossDiz("VOCÊ NÃO VAI ESCAPAR!");
            }
            // C. ATAQUE NORMAL
            else if (dist <= (boss.attackRange || 80)) {
                if (boss.attackCooldown <= 0) {
                    boss.state = 'attacking';
                    boss.currentFrame = 0;
                    if (Math.random() < 0.3) bossDiz("Sinta a fúria da alcateia!");
                } else {
                    boss.state = 'idle';
                }
            } 
            // D. PERSEGUIÇÃO NORMAL
            else {
                boss.state = 'walking';
                boss.x += (alvo.x < boss.x) ? -boss.speed : boss.speed;
            }
        }
    }

    // 6. MOVIMENTO DURANTE A INVESTIDA (Charging)
    if (boss.state === 'charging') {
        const bossChargeSpeed = boss.speed * 1.8; // Boss é muito rápido
        if (boss.facing === 'left') boss.x -= bossChargeSpeed;
        else boss.x += bossChargeSpeed;

        // Dano por contato durante a corrida
        if (dist < 60) {
            aplicarDanoAoPlayer(alvo, (boss.damage || 1) + 1, boss.x);
            boss.state = 'idle';
            boss.currentFrame = 0;
            boss.specialCooldown = 180;
        }
    }
}

// Função auxiliar para evitar repetição de código de dano
function aplicarDanoAoPlayer(alvo, dano, bossX) {
    alvo.hp -= dano;
    alvo.state = 'hurt';
    alvo.currentFrame = 0;
    // Knockback forte do Boss
    alvo.x += (alvo.x < bossX) ? -30 : 30;
}

function draw() {
    // 1. PRIMEIRO: Limpamos a tela
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState === 'menu') return;

    // 2. DEPOIS: Desenhamos o mundo (Câmera)
    ctx.save();
    ctx.setTransform(
        zoom, 0, 0, zoom,
        -Math.floor(cameraX * zoom),
        -Math.floor(cameraY * zoom)
    );

    // Background
    backgroundObjects.forEach(d => {
        if (d.img.complete) ctx.drawImage(d.img, d.x, d.y, d.width, d.height);
    });

    // Plataformas
    platforms.forEach(p => {
        ctx.save();
        if (p.alpha !== undefined) ctx.globalAlpha = p.alpha;
        if (p.type === 'stretch') {
            ctx.drawImage(platformImg, p.x, p.y, p.w, p.h);
        } else if (p.type === 'pattern') {
            if (platformPattern) {
                ctx.translate(p.x, p.y);
                ctx.fillStyle = platformPattern;
                ctx.fillRect(0, 0, p.w, p.h);
            }
        } else if (p.type === 'sloped') {
            ctx.fillStyle = "brown";
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.w, p.y + p.w * p.slope);
            ctx.lineTo(p.x + p.w, p.y + p.w * p.slope + p.h);
            ctx.lineTo(p.x, p.y + p.h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    });

// DESENHAR PROJÉTEIS
projectiles.forEach(proj => {
    ctx.save();
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Brilho simples (opcional)
    ctx.shadowBlur = 10;
    ctx.shadowColor = proj.color;
    ctx.fill();
    ctx.restore();
});

    // --- ENTIDADES (Inimigos, Players e Boss) ---
    // Inserimos o Player 2 no array de desenho se ele estiver ativo
    const allEntities = [...enemies, player];
    if (player2 && player2.active) allEntities.push(player2); 
    if (boss) allEntities.push(boss);

    allEntities.forEach(obj => {
    let img = obj.imgIdle;
    let totalF = obj.idleFrames || 8;

    if (obj.state === 'walking' || obj.state === 'walk' || obj.state === 'patrol' || obj.state === 'chase') { 
    img = obj.imgWalk; 
    totalF = obj.walkFrames; 
}
        else if (obj.state === 'running') { img = obj.imgRun; totalF = obj.runFrames; }
        else if (obj.state === 'attacking') { img = obj.imgAttack; totalF = obj.attackFrames; }
        else if (obj.state === 'charging') { img = obj.imgRunAttack; totalF = obj.runAttackFrames; }
        else if (obj.state === 'jumping' || obj.state === 'jump') { img = obj.imgJump; totalF = obj.jumpFrames || 8; }
        else if (obj.state === 'hurt') { img = obj.imgHurt; totalF = obj.hurtFrames; }
        else if (obj.state === 'dead') { img = obj.imgDead; totalF = obj.deadFrames; }

        if (img && img.complete && img.width > 0) {
            const fw = img.width / totalF;
            const fh = img.height;
            ctx.save();
            if (obj.facing === 'left') {
                ctx.translate(obj.x + obj.width, obj.y); ctx.scale(-1, 1);
                ctx.drawImage(img, (obj.currentFrame % totalF) * fw, 0, fw, fh, 0, 0, obj.width, obj.height);
            } else {
                ctx.drawImage(img, (obj.currentFrame % totalF) * fw, 0, fw, fh, obj.x, obj.y, obj.width, obj.height);
            }
            ctx.restore();

            // Balão de fala das entidades
            if (obj.state !== 'dead' && obj.dialogue && obj.dialogueTimer > 0) {
                ctx.font = "bold 16px Arial"; ctx.textAlign = "center";
                let textWidth = ctx.measureText(obj.dialogue).width;
                ctx.fillStyle = "white"; ctx.fillRect(obj.x + obj.width / 2 - textWidth / 2 - 5, obj.y - 35, textWidth + 10, 20);
                ctx.strokeStyle = "black"; ctx.strokeRect(obj.x + obj.width / 2 - textWidth / 2 - 5, obj.y - 35, textWidth + 10, 20);
                ctx.fillStyle = "black"; ctx.fillText(obj.dialogue, obj.x + obj.width / 2, obj.y - 20);
            }
        }
    });

    // NPCs
   npcs.forEach(n => {
    if (!n.imgIdle.complete) return;

    const fw = n.imgIdle.width / n.idleFrames;
    const fh = n.imgIdle.height;

    ctx.save(); // 1. SALVA o estado atual (Essencial!)

    if (n.facing === 'left') {
        // 2. Move para a posição do NPC e inverte o eixo X
        ctx.translate(n.x + n.width, 0);
        ctx.scale(-1, 1);
        
        // 3. Ao desenhar após o scale(-1), o X deve ser 0
        ctx.drawImage(
            n.imgIdle, 
            n.currentFrame * fw, 0, fw, fh, 
            0, n.y, n.width, n.height
        );
    } else {
        // Desenho normal para a direita
        ctx.drawImage(
            n.imgIdle, 
            n.currentFrame * fw, 0, fw, fh, 
            n.x, n.y, n.width, n.height
        );
    }

    ctx.restore(); 

    // --- BALÃO DE DIÁLOGO (Sempre desenhado normal, fora do scale) ---
    if (n.dialogueTimer > 0) {
        const text = n.phrases[n.dialogueIndex];
        ctx.font = "bold 14px Arial"; 
        ctx.textAlign = "center";
        const textWidth = ctx.measureText(text).width;
        
        ctx.fillStyle = "white"; 
        ctx.fillRect(n.x + n.width/2 - textWidth/2 - 5, n.y - 25, textWidth + 10, 20);
        ctx.fillStyle = "black"; 
        ctx.fillText(text, n.x + n.width/2, n.y - 10);
    }
});

    // Foreground
    foregroundObjects.forEach(d => {
        if (d.img.complete) ctx.drawImage(d.img, d.x, d.y, d.width, d.height);
    });

    ctx.restore(); // Fecha Câmera

    // 3. UI (Fixo na tela)
    if (gameState === 'playing') {
        // Vida Player 1
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(20, 20, 150, 15);
        ctx.fillStyle = "red"; ctx.fillRect(20, 20, (player.hp / player.maxHp) * 150, 15);
        ctx.strokeStyle = "white"; ctx.strokeRect(20, 20, 150, 15);

        // VIDA PLAYER 2 (Lado direito)
        if (player2 && player2.active) {
            ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(canvas.width - 170, 20, 150, 15);
            ctx.fillStyle = "blue"; ctx.fillRect(canvas.width - 170, 20, (player2.hp / player2.maxHp) * 150, 15);
            ctx.strokeStyle = "white"; ctx.strokeRect(canvas.width - 170, 20, 150, 15);
        }

        // Vida Boss
        if (boss && boss.hp > 0) {
            ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(canvas.width/2 - 200, 40, 400, 20);
            ctx.fillStyle = "purple"; ctx.fillRect(canvas.width/2 - 200, 40, (boss.hp / boss.maxHp) * 400, 20);
            ctx.strokeStyle = "white"; ctx.strokeRect(canvas.width/2 - 200, 40, 400, 20);
            ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
            ctx.fillText("WHITE WEREWOLF", canvas.width/2, 35);
        }
    }

    // --- 4. TELAS FINAIS ---
    const screen = document.getElementById('game-over-screen');
    const title = screen ? screen.querySelector('h1') : null;
    const subtitle = screen ? screen.querySelector('p') : null;
    const btnReset = document.getElementById('btn-reset');
    const btnNext = document.getElementById('btn-next-chapter');

    if (screen) {
        // Lógica de Derrota: Só morre se ambos estiverem mortos (ou se o P1 morrer sozinho no modo 1P)
        const p1Morto = (player.hp <= 0 || player.state === 'dead');
        const p2Morto = (!player2.active || player2.hp <= 0 || player2.state === 'dead');

        if (p1Morto && p2Morto) {
            screen.style.display = 'flex';
            screen.style.backgroundColor = "rgba(139, 0, 0, 0.8)"; 
            if (title) title.innerText = "VOCÊS CAÍRAM...";
            if (subtitle) subtitle.innerText = "Tente novamente para prosseguir";
            if (btnReset) btnReset.style.display = 'block';
            if (btnNext) btnNext.style.display = 'none';
        } 
        // CASO B: VITÓRIA (Boss morreu)
        else if (boss && boss.state === 'dead' && boss.hp <= 0) {
            if (screen.style.display !== 'flex') {
                screen.style.display = 'flex';
                screen.style.backgroundColor = "rgba(0, 0, 0, 0.8)"; 
                if (title) title.innerHTML = "Você derrubou <br> WHITE WEREWOLF";
                if (subtitle) subtitle.innerHTML = "O lugar de onde estão saindo as criaturas fica perto, <br> e vocês pedem para que alguém avise o Rei Anão para vir com as tropas.";
                if (btnReset) btnReset.style.display = 'none';
                if (btnNext) btnNext.style.display = 'block';
            }
        }
    }

    // Balão de fala do Boss (mantendo sua lógica original)
    if (boss && boss.falaTimer > 0) {
        ctx.save();
        ctx.font = "italic bold 16px 'Segoe UI', Arial";
        let textWidth = ctx.measureText(boss.fala).width;
        let bx = boss.x - cameraX + (boss.width / 2) - (textWidth / 2);
        let by = boss.y - 30;
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(bx - 10, by - 20, textWidth + 20, 30);
        ctx.fillStyle = "#dfa9ff"; 
        ctx.fillText(boss.fala, bx, by);
        ctx.restore();
    }
}

function todosPlayersMortos() {
    let mortos = 0;
    let ativos = 1; // Player 1 sempre existe

    if (player.hp <= 0 || player.state === 'dead') mortos++;

    if (player2.active) {
        ativos++;
        if (player2.hp <= 0 || player2.state === 'dead') mortos++;
    }

    return mortos === ativos;
}

// --- LOOP PRINCIPAL ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
gameLoop(); // Inicia o loop

// --- FUNÇÃO PARA SALVAR E VOLTAR AO MENU ---
window.irParaMenu = function() {
    localStorage.setItem('2capitulo_3_vencido', 'true');
    window.location.href = "../index.html";
};

// --- INPUTS DO TECLADO ---
window.addEventListener('keydown', (e) => {
    const k = e.key; // Usamos e.key para detectar setas corretamente

if (k.toLowerCase() === 'q') {
        trocarPersonagem();
    }

    // --- CONTROLES PLAYER 1 (WASD + K) ---
    if (k.toLowerCase() === 'a') window.mover(player, keys, 'left', true);
    if (k.toLowerCase() === 'd') window.mover(player, keys, 'right', true);
    if (k.toLowerCase() === 'w') window.pular(player);
    if (k.toLowerCase() === ' ') window.atacar(player);
    
    // --- CONTROLES PLAYER 2 (SETAS + L) ---
    if (player2.active) {
        if (k === 'ArrowLeft')  window.mover(player2, keysP2, 'left', true);
        if (k === 'ArrowRight') window.mover(player2, keysP2, 'right', true);
        if (k === 'ArrowUp')    window.pular(player2);
        if (k === 'l' || k === 'L') window.atacar(player2);
    }

    // Tecla R (Reiniciar)
    if (k.toLowerCase() === 'r') {
        const p1Morto = player.hp <= 0;
        const p2Morto = !player2.active || player2.hp <= 0;
        if (boss && boss.state === 'dead') window.irParaMenu();
        else if (p1Morto && p2Morto) window.resetGame();
    }
});

window.addEventListener('keyup', (e) => {
    const k = e.key;
    // P1
    if (k.toLowerCase() === 'a') window.mover(player, keys, 'left', false);
    if (k.toLowerCase() === 'd') window.mover(player, keys, 'right', false);
    // P2
    if (k === 'ArrowLeft')  window.mover(player2, keysP2, 'left', false);
    if (k === 'ArrowRight') window.mover(player2, keysP2, 'right', false);
});

// --- LÓGICA DOS BOTÕES DA TELA FINAL ---
document.addEventListener('DOMContentLoaded', () => {
    const btnReset = document.getElementById('btn-reset');
    const btnNext = document.getElementById('btn-next-chapter');

    if (btnReset) {
        btnReset.onclick = () => window.resetGame();
    }

    if (btnNext) {
        btnNext.onclick = () => window.irParaMenu();
    }

});