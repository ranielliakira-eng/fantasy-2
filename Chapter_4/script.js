const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; 
canvas.height = 450;

// --- CONFIGURAÇÕES GLOBAIS ---
const bgMusic = new Audio('../assets/sounds/346201__levelclearer__phone.wav');
bgMusic.loop = true;
bgMusic.volume = 0.5;

const gravity = 0.8;
const zoom = 2; 
const mapWidth = 7000;
const mapHeight = 450;
let cameraX = 0;
let cameraY = 0;
let gameState = 'loading';
let isPaused = false;
let isMuted = false;
let boss = null;
let projectiles = [];
let screenShakeTimer = 0;

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
        speed: 2, maxHp: 4, jumpForce: -15, attackType: 'melee', damage: 1,
        folder: '../assets/Swordsman'
    },
    Knight: {
        idleFrames: 6, walkFrames: 8, runFrames: 7, jumpFrames: 6, attackFrames: 5, hurtFrames: 3, deadFrames: 4,
        speed: 2, maxHp: 4, jumpForce: -13, attackType: 'melee', damage: 1,
        folder: '../assets/Knight'
    },
    Wizard: {
        idleFrames: 6, walkFrames: 7, runFrames: 8, jumpFrames: 11, attackFrames: 10, hurtFrames: 4, deadFrames: 4,
        speed: 2.5, maxHp: 3, jumpForce: -14, attackType: 'range', damage: 2,
        folder: '../assets/Wizard', projectileColor: '#FFD541'
    },
    Enchantress: {
        idleFrames: 5, walkFrames: 8, runFrames: 8, jumpFrames: 8, attackFrames: 6, hurtFrames: 2, deadFrames: 5,
        speed: 1.8, maxHp: 5, jumpForce: -16, attackType: 'range', damage: 1,
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
    p.damage = stats.damage || 1;
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
    p.state = 'idle'; // Força idle para evitar bugs de animação na troca
    
    console.log(`Personagem trocado para: ${tipo}`);
}

function isEnemy(a, b) {
    if (!a || !b) return false;
    
    // Se forem da mesma facção, não são inimigos
    if (a.faction === b.faction) return false;
    
    // Regra especial: Player e Ally são considerados amigos entre si
    if ((a.faction === 'player' && b.faction === 'ally') || 
        (a.faction === 'ally' && b.faction === 'player')) {
        return false;
    }
    
    // Se não caiu nas regras acima e as facções são diferentes, são inimigos
    return true;
}

function checkHit(attacker) {
    enemies.forEach(target => {
        // Só aplica dano se for inimigo e não estiver morto
        if (target.state !== 'dead' && isEnemy(attacker, target)) {
            // Lógica de colisão (ex: retângulos se sobrepondo)
            if (hitboxCollision(attacker, target)) {
                target.hp -= 1;
            }
        }
    });
}

function triggerShake(duration = 10) {
    screenShakeTimer = duration; //
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
 //   { x: 1550, text: "Você vai ficar bem.", used: false },

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
        owner: p, // ADICIONADO: Salva a referência de quem atirou
        x: p.facing === 'right' ? p.x + p.width - 20 : p.x + 20,
        y: p.y + p.height - 30,
        radius: 10,
        speed: p.facing === 'right' ? 8 : -8, // Velocidade (positiva ou negativa)
        color: cor,
        damage: 1,
        lifeTime: 20 // Dura 60 frames (1 segundo) para não voar pra sempre
    });
}

// --- INIMIGOS ---
let enemies = [];
function initEnemies() {
    enemies = [
        { type: 'Warrior_1', x: 25, y: 200, faction: 'ally', hp: 4, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },
        { type: 'Warrior_1', x: 100, y: 200, faction: 'ally', hp: 4, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },
        { type: 'Warrior_1', x: 60, y: 200, faction: 'ally', hp: 4, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },
        { type: 'Warrior_1', x: 40, y: 200, faction: 'ally', hp: 4, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },
        { type: 'Warrior_1', x: 130, y: 200, faction: 'ally', hp: 4, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },

        { type: 'Warrior_2', x: 50, y: 200, faction: 'ally', hp: 3, speed: 1.8, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 3, deadFrames: 4 },
        { type: 'Warrior_2', x: 125, y: 200, faction: 'ally', hp: 3, speed: 1.8, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 3, deadFrames: 4 },
        { type: 'Warrior_2', x: 90, y: 200, faction: 'ally', hp: 3, speed: 1.8, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 3, deadFrames: 4 },
        { type: 'Warrior_2', x: 70, y: 200, faction: 'ally', hp: 3, speed: 1.8, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 3, deadFrames: 4 },
        { type: 'Warrior_2', x: 150, y: 200, faction: 'ally', hp: 3, speed: 1.8, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 3, deadFrames: 4 },

        { type: 'Warrior_3', x: 75, y: 200, faction: 'ally', hp: 3, speed: 1.5, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },
        { type: 'Warrior_3', x: 30, y: 200, faction: 'ally', hp: 3, speed: 1.5, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },
        { type: 'Warrior_3', x: 120, y: 200, faction: 'ally', hp: 3, speed: 1.5, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },
        { type: 'Warrior_3', x: 100, y: 200, faction: 'ally', hp: 3, speed: 1.5, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },
        { type: 'Warrior_3', x: 175, y: 200, faction: 'ally', hp: 3, speed: 1.5, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 4, hurtFrames: 2, deadFrames: 4 },

        { type: 'Musketeer', x: 45, y: 200, faction: 'ally', hp: 3, speed: 1.6, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 5, hurtFrames: 2, deadFrames: 4 },
        { type: 'Musketeer', x: 55, y: 200, faction: 'ally', hp: 3, speed: 1.6, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 5, hurtFrames: 2, deadFrames: 4 },
        { type: 'Musketeer', x: 65, y: 200, faction: 'ally', hp: 3, speed: 1.6, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 5, hurtFrames: 2, deadFrames: 4 },
        { type: 'Musketeer', x: 75, y: 200, faction: 'ally', hp: 3, speed: 1.6, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 5, hurtFrames: 2, deadFrames: 4 },
        { type: 'Musketeer', x: 85, y: 200, faction: 'ally', hp: 3, speed: 1.6, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 5, hurtFrames: 2, deadFrames: 4 },
        { type: 'Musketeer', x: 95, y: 200, faction: 'ally', hp: 3, speed: 1.6, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 8, attackFrames: 5, hurtFrames: 2, deadFrames: 4 },

        { type: 'Minotaur_2', x: 1000, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 1025, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 1050, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 1075, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 1100, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 1010, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 1030, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 1060, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 1090, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 1080, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 1040, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 1070, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },

        { type: 'Minotaur_2', x: 2000, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 2025, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 2050, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 2075, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 2100, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 2010, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 2030, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 2060, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },

        { type: 'Minotaur_2', x: 3000, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 3025, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 3050, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 3075, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 3100, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 3010, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 3030, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 3060, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
 
        { type: 'Minotaur_2', x: 4000, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 4025, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 4050, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 4075, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 4100, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 4010, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 4030, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 4060, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },

        { type: 'Minotaur_2', x: 5000, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 5025, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 5050, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 5075, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 5100, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 5010, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_2', x: 5030, y: 200, faction: 'enemy', hp: 5, speed: 2, damage: 1, attackRange: 60, frameInterval: 8, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5 },
        { type: 'Minotaur_3', x: 5060, y: 200, faction: 'enemy', hp: 5, speed: 1.8, damage: 1, attackRange: 70, frameInterval: 8, walkFrames: 12, attackFrames: 4, hurtFrames: 3, deadFrames: 5 },
 ];

    enemies.forEach(en => {
        en.imgIdle = new Image(); en.imgIdle.src = `../assets/enemies/${en.type}/Idle.png`;
        en.imgWalk = new Image(); en.imgWalk.src = `../assets/enemies/${en.type}/Walk.png`;
        en.imgAttack = new Image(); en.imgAttack.src = `../assets/enemies/${en.type}/Attack_1.png`;
        en.imgHurt = new Image(); en.imgHurt.src = `../assets/enemies/${en.type}/Hurt.png`;
        en.imgDead = new Image(); en.imgDead.src = `../assets/enemies/${en.type}/Dead.png`;

     if (en.type === 'Warrior_1' || en.type === 'Warrior_2' || en.type === 'Warrior_3') {
        en.imgIdle = new Image(); en.imgIdle.src = `../assets/${en.type}/Idle.png`;
        en.imgWalk = new Image(); en.imgWalk.src = `../assets/${en.type}/Walk.png`;
        en.imgAttack = new Image(); en.imgAttack.src = `../assets/${en.type}/Attack_1.png`;
        en.imgHurt = new Image(); en.imgHurt.src = `../assets/${en.type}/Hurt.png`;
        en.imgDead = new Image(); en.imgDead.src = `../assets/${en.type}/Dead.png`;
        en.imgProtect = new Image(); en.imgProtect.src = `../assets/${en.type}/Protect.png`;
        
        en.isProtecting = false;
        en.protectTimer = 0;
        en.protectCurrentFrame = 0;
        en.protectFrameTimer = 0;
        en.protectFrames = (en.type === 'Warrior_2') ? 2 : 3;
    }

        en.width = 100; en.height = 100;
        en.currentFrame = 0; en.frameTimer = 0;
        if (en.frameInterval === undefined) en.frameInterval = 8;
        en.state = 'patrol'; en.facing = 'left'; en.attackCooldown = 0;
        en.velY = 0; en.onGround = false;
    });
}

// --- PLATAFORMAS ---
const platforms = [
    { x: 0, y: 300, w: 7000, h: 150, type: 'pattern' },
];

// --- Cenário ---
const fundoImg = new Image();
fundoImg.src = 'fundo.png';

const platformImg = new Image();
platformImg.src = '../assets/Battleground/Platformer/Ground_02.png';

const CityTowerImg = new Image();
CityTowerImg.src = '../assets/Battleground/Casa/CityTower.png';

let platformPattern = null;

platformImg.onload = () => {
    platformPattern = ctx.createPattern(platformImg, 'repeat');
};

let keys = { left: false, right: false };

const backgroundObjects = [
	{ x: 0, y: 0, width: 7000, height: 1000, img: fundoImg },
];

const foregroundObjects = [
//	{ x: 5460, y: 0, width: 350, height: 350, img: CityTowerImg },
];

// --- NPCs ---
const musketeerNpc = {
    x: -200, y: 200, width: 100, height: 100, imgIdle: new Image(), facing: 'left',
    idleFrames: 5, currentFrame: 0, frameTimer: 0, frameInterval: 16,
    activated: false, rangeAtivacao: 300, rangeEsquecimento: 400,
    phrases: [
"Estava esperando por vocês",
],
   dialogueIndex: 0, dialogueTimer: 0
};

musketeerNpc.imgIdle.src = '../assets/Musketeer/Idle.png';

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
    localStorage.setItem('2capitulo_4_vencido', 'true');
    
window.location.href = "cutscene.html";

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
    p.attackCooldown = 25;

    // Se for corpo a corpo, o dano é aplicado via colisão de espada
    let isRange = p.imgIdle.src.includes('Wizard') || p.imgIdle.src.includes('Enchantress');
    if (!isRange) {
        checkMeleeHit(p);
    }
};

// NPCs
function npcSay(npc, index=0, duration=120){ npc.dialogueIndex=index; npc.dialogueTimer=duration; }

function updateNPCs() {
    npcs.forEach(n => {
        // Calculamos a distância entre o Player e o NPC
        const dist = Math.abs(player.x - n.x);
        
        // Regra: Player deve estar à direita do NPC para vir da direita para esquerda
        const playerEstaDireita = player.x > n.x;

        // --- LÓGICA DE ATIVAÇÃO ---
        // Só ativa se não estiver ativo E estiver no range E vier da direita
        if (!n.activated && dist < n.rangeAtivacao && playerEstaDireita) {
            n.activated = true;
            n.dialogueIndex = 0;
            n.dialogueTimer = 80; 
        }

        // --- LÓGICA DE ESQUECIMENTO (RESET) ---
        // Se o player se afastar além do range de esquecimento, resetamos o estado
        if (n.activated && dist > n.rangeEsquecimento) {
            n.activated = false;
            n.dialogueTimer = 0;
            n.dialogueIndex = 0;
        }

        // --- ATUALIZAÇÃO DO DIÁLOGO ---
        if (n.activated && n.dialogueTimer > 0) {
            n.dialogueTimer--;

            // Se a frase atual acabou e ainda há frases na lista, pula para a próxima
            if (n.dialogueTimer <= 0 && n.dialogueIndex < n.phrases.length - 1) {
                n.dialogueIndex++;
                n.dialogueTimer = 180; // Tempo da nova frase
            }
        }

        // --- ANIMAÇÃO (TRAVA) ---
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
    let alcance = p.width * 0.4; 
    let hitboxX = p.facing === 'right' ? p.x + p.width * 0.7 : p.x - alcance + p.width * 0.3;

    enemies.forEach(en => {
        // ADICIONADO: isEnemy(p, en) impede dano em aliados
        if (en.state !== 'dead' && isEnemy(p, en)) { 
            let hitY = en.y + (en.height * 0.3);
            let hitHeight = en.height * 0.7;

            if (hitboxX < en.x + en.width && hitboxX + alcance > en.x &&
                p.y < hitY + hitHeight && p.y + p.height > hitY) {
                en.hp -= (p.damage || 1);
                en.state = 'hurt';
                en.currentFrame = 0;
                if (en.hp <= 0) {
                    en.state = 'dead';
                    en.currentFrame = 0;
                    en.frameTimer = 0;
                }
            }
        }
    });

if (boss && boss.state !== 'dead') {
    if (hitboxX < boss.x + boss.width && hitboxX + alcance > boss.x &&
        p.y < boss.y + boss.height && p.y + p.height > boss.y) {
        
        // 1. Aplica o Dano (Sempre perde vida)
        boss.hp--;

        if (boss.state !== 'attacking' && boss.state !== 'hurt') {
            boss.state = 'hurt';
            boss.currentFrame = 0;
            boss.frameTimer = 0;
        } 

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
        if (en.state !== 'dead' && isEnemy(proj.owner, en)) {
            if (proj.x > en.x && proj.x < en.x + en.width &&
                proj.y > en.y && proj.y < en.y + en.height) {

                // PROBABILIDADE: 40% de chance de ativar proteção ao ser atingido
                if ((en.type === 'Warrior_2' || en.type === 'Warrior_3') && !en.isProtecting) {
                    if (Math.random() < 0.4) { 
                        en.isProtecting = true;
                        en.protectTimer = 60; // Protege por 60 frames (1 segundo)
                    }
                }

                if (en.isProtecting) {
                    console.log(en.type + " bloqueou!");
                } else {
                    en.hp -= proj.damage;
                    en.state = 'hurt';
                    en.currentFrame = 0;
                    if (en.hp <= 0) {
                        en.state = 'dead';
                        en.currentFrame = 0;
                        en.frameTimer = 0;
                    }
                }
                projectiles.splice(index, 1);
            }
        }
    });
    
    // COLISÃO COM BOSS (Se existir)
if (boss && boss.state !== 'dead') {
     if (proj.x > boss.x && proj.x < boss.x + boss.width &&
        proj.y > boss.y && proj.y < boss.y + boss.height) {
            
        boss.hp -= proj.damage;

        if (boss.state !== 'attacking' && boss.state !== 'hurt') {
            boss.state = 'hurt';
            boss.currentFrame = 0;
            boss.frameTimer = 0;
        }

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


    enemies.forEach(en => {
        // 1. Garante facções
        if (!en.faction) en.faction = 'enemy';
        if (!player.faction) player.faction = 'player';
        if (player2.active && !player2.faction) player2.faction = 'player';

        // 2. BUSCA DE ALVOS (QUEM EU DEVO ATACAR?)
        let possibleTargets = [];

        // >>> Lógica para quem é INIMIGO <<<
        if (en.faction === 'enemy') {
            // Ataca Player 1
            if (player.state !== 'dead') possibleTargets.push(player);
            // Ataca Player 2
            if (player2.active && player2.state !== 'dead') possibleTargets.push(player2);
            
            // Ataca NPCs Aliados (Procura na lista de enemies quem é 'ally')
            enemies.forEach(other => {
                if (other !== en && other.state !== 'dead' && other.faction === 'ally') {
                    possibleTargets.push(other);
                }
            });
            // Ataca NPCs de Missão (Musketeer)
            npcs.forEach(npc => {
                if (npc.state !== 'dead') possibleTargets.push(npc); // NPCs são aliados por padrão
            });
        }
        
        // >>> Lógica para quem é ALIADO <<<
        else if (en.faction === 'ally') {
            // Ataca Inimigos comuns
            enemies.forEach(other => {
                if (other !== en && other.state !== 'dead' && other.faction === 'enemy') {
                    possibleTargets.push(other);
                }
            });
            // Ataca o Boss
            if (boss && boss.state !== 'dead') {
                possibleTargets.push(boss);
            }
        }

        // 3. SELEÇÃO DO ALVO MAIS PRÓXIMO
        let alvo = null;
        if (possibleTargets.length > 0) {
            alvo = possibleTargets.reduce((prev, curr) => {
                let distPrev = Math.abs(prev.x - en.x);
                let distCurr = Math.abs(curr.x - en.x);
                return distPrev < distCurr ? prev : curr;
            });
        }

        // --- FÍSICA ---
        if(en.patrolMinX===undefined){ en.patrolMinX=en.x-120; en.patrolMaxX=en.x+120;}
        if(en.facing===undefined) en.facing='left';
 
        en.velY = (en.velY || 0) + gravity;
        en.y += en.velY;
        en.onGround = false;

        platforms.forEach(p=>{
            if(en.x+40 < p.x+p.w && en.x+60 > p.x && en.y+en.height >= p.y && en.y+en.height <= p.y+10){ 
                en.y = p.y - en.height; 
                en.velY = 0; 
                en.onGround = true; 
            }
        });



        if(en.state === 'dead'){ 
            en.frameTimer++; 
            if(en.frameTimer >= en.frameInterval) {
                if(en.currentFrame < en.deadFrames - 1) en.currentFrame++; 
                en.frameTimer = 0;
            }
            return; 
        }

        // Distância para o alvo atual
        let dist = alvo ? Math.abs(alvo.x - en.x) : 9999;

        // --- MÁQUINA DE ESTADOS ---

if (en.type === 'Warrior_2' || en.type === 'Warrior_3') {
        // Se não estiver protegendo, tenta ativar por probabilidade
        if (!en.isProtecting && en.state === 'chase') {
            if (Math.random() < 0.005) { 
                en.isProtecting = true;
                en.protectTimer = 90;
                console.log(en.type + " ativou proteção por sorte!");
            }
        }
        if (en.isProtecting) {
        en.protectTimer--;
          if (en.protectTimer <= 0) {
            en.isProtecting = false;
            en.protectCurrentFrame = 0;
            en.protectFrameTimer = 0;
           }
         }
    }
        // 1. ESTADO DE DANO (HURT)
        if(en.state === 'hurt') {
            en.frameTimer++;
            if(en.frameTimer >= 30) { 
                en.state = alvo ? 'chase' : 'patrol'; 
                en.frameTimer = 0; 
                en.currentFrame = 0;
            }
        } 
        
        // 2. ESTADO DE PATRULHA (Caminhada)
        else if(en.state === 'patrol') {
            // SE FOR ALIADO: Vai para a direita >>>
            if (en.faction === 'ally') {
                en.facing = 'right';
                en.x += en.speed;
                if (alvo && dist < 400) en.state = 'chase'; // Detecta inimigo longe
            } 
            // SE FOR INIMIGO: Ronda esquerda/direita
            else {
                if(en.facing === 'left') {
                    en.x -= en.speed; 
                    if(en.x <= en.patrolMinX) en.facing = 'right'; 
                } else {
                    en.x += en.speed; 
                    if(en.x >= en.patrolMaxX) en.facing = 'left'; 
                }
                if(alvo && dist < 200) en.state = 'chase';
            }
        }
        
        // 3. ESTADO DE PERSEGUIÇÃO
        else if(en.state === 'chase') { 
            if (alvo) {
                // Se estiver longe, anda na direção
                const stopDist = en.attackRange - 10; // Tenta chegar um pouco mais perto que o alcance máximo
                
                if(dist > stopDist) { 
                    if(alvo.x < en.x) { en.x -= en.speed * 1.2; en.facing = 'left'; } 
                    else { en.x += en.speed * 1.2; en.facing = 'right'; }
                }
                
                // Se estiver perto o suficiente, ATACA
                if(dist <= en.attackRange && en.attackCooldown <= 0) { 
                    en.state = 'attacking'; 
                    en.currentFrame = 0; 
                    en.frameTimer = 0;
                } 

                if(dist > 600) en.state = 'patrol'; // Desiste se for muito longe
            } else {
                en.state = 'patrol'; // Sem alvo, volta a andar
            }
        }        
        
        // 4. ESTADO DE ATAQUE (O DANO OCORRE AQUI)
        else if(en.state === 'attacking') {
            const attackHitFrame = 2; // Frame onde a espada bate
            en.frameTimer++;
            
            if(en.frameTimer >= en.frameInterval) {
                en.frameTimer = 0;
                en.currentFrame++;
                
                // --- MOMENTO DO DANO ---
                if(en.currentFrame === attackHitFrame) {
                    if(alvo && dist <= en.attackRange + 40) {
                       alvo.hp -= (en.damage || 1);

	if (alvo.state !== 'attacking' && alvo.state !== 'hurt' && alvo.state !== 'dead') {
                    alvo.state = 'hurt';
                    alvo.currentFrame = 0;
                }
                        
                        // Empurrãozinho (Knockback visual)
                        if(alvo.x < en.x) alvo.x -= 10; else alvo.x += 10;
                        
                        // Se o alvo morrer
                        if(alvo.hp <= 0) {
                            alvo.state = 'dead';
                            alvo.frameTimer = 0;
                        }
                    }
                    en.attackCooldown = 80; // Tempo entre ataques
                }
                
                // Fim da animação
                if(en.currentFrame >= en.attackFrames) {
                    en.currentFrame = 0;
                    en.state = 'chase';
                }
            }
        }

        // Decrementa Cooldown fora do ataque
        if(en.attackCooldown > 0) en.attackCooldown--;

        // Animação genérica (Walk/Idle)
        if(en.state !== 'attacking' && en.state !== 'dead' && en.state !== 'hurt') {
            en.frameTimer++;
            if(en.frameTimer >= en.frameInterval) {
                let totalF = (en.state === 'patrol' || en.state === 'chase') ? en.walkFrames : en.idleFrames;
                en.currentFrame = (en.currentFrame + 1) % totalF;
                en.frameTimer = 0;
            }
        }
    });

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
        width: 200, height: 200,
        hp: 50, maxHp: 50,
        speed: 2,
        state: 'idle',
        facing: 'left',
        damage: 3,
        faction: 'enemy',
        attackRange: 80,
        attackCooldown: 0,
        currentFrame: 0,
        frameTimer: 0,
        frameInterval: 16, fala: "",
        falaTimer: 0,

        idleFrames: 10, walkFrames: 12, attackFrames: 5, hurtFrames: 3, deadFrames: 5,
        
        imgIdle: new Image(), imgWalk: new Image(), imgAttack: new Image(), 
        imgHurt: new Image(), imgDead: new Image()
    };
    
    // Carregamento automático das imagens (ajuste a pasta conforme seu assets)
    const folder = '../assets/enemies/Minotaur_1'; 
    boss.imgIdle.src = `${folder}/Idle.png`;
    boss.imgWalk.src = `${folder}/Walk.png`;
    boss.imgAttack.src = `${folder}/Attack_1.png`;
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

    // 1. Verifica Player 1
    if (player.hp > 0 && player.state !== 'dead') {
        alvos.push(player);
    }

    // 2. Verifica Player 2
    if (player2.active && player2.hp > 0 && player2.state !== 'dead') {
        alvos.push(player2);
    }

    // 3. NOVO: Verifica Aliados na lista de enemies
    enemies.forEach(other => {
        if (other !== en && other.state !== 'dead' && other.faction === 'ally') {
            alvos.push(other);
        }
    });

    // 4. NOVO: Verifica NPCs de missão (como o Musketeer)
    npcs.forEach(npc => {
        if (npc.hp > 0 && npc.state !== 'dead') {
            alvos.push(npc);
        }
    });

    if (alvos.length === 0) return null;

    // Retorna o que estiver mais perto horizontalmente
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

    if (boss.y + boss.height > 300) {
        boss.y = 300 - boss.height;
        boss.velY = 0;
    }

    // 3. ANIMAÇÃO, TIMERS E TREMOR
    if (boss.falaTimer > 0) boss.falaTimer--;
    
    boss.frameTimer++;
    if (boss.frameTimer >= boss.frameInterval) {
        boss.frameTimer = 0;

        // Definir limite de frames
        let maxFrames = 1;
        if (boss.state === 'walking') maxFrames = boss.walkFrames;
        else if (boss.state === 'idle') maxFrames = boss.idleFrames;
        else if (boss.state === 'attacking') maxFrames = boss.attackFrames;
        else if (boss.state === 'hurt') maxFrames = boss.hurtFrames;
        else if (boss.state === 'dead') maxFrames = boss.deadFrames;

        boss.currentFrame++;

        // --- EFEITO DE TREMEDEIRA ---
        if (boss.state === 'walking' && (boss.currentFrame === 2 || boss.currentFrame === 7)) {
            if (typeof triggerShake === "function") triggerShake(12);
        }

        // --- VERIFICAÇÃO DE DANO (Dentro do timer de animação) ---
// Dentro de updateBossLogic, na parte de ataque:
if (boss.state === 'attacking' && boss.currentFrame === 2) {
    if (dist < (boss.attackRange || 80)) {
        alvo.hp -= (boss.damage || 1); // Agora 'alvo' pode ser Player ou Ally
        alvo.state = 'hurt';
        alvo.currentFrame = 0;
        
        // Knockback (empurrão)
        alvo.x += (alvo.x < boss.x) ? -40 : 40;

        // Se o aliado morrer, mudar estado
        if (alvo.hp <= 0) {
            alvo.state = 'dead';
        }
    }
}

        // --- RESET DE ANIMAÇÃO AO FINAL ---
        if (boss.currentFrame >= maxFrames) {
            boss.currentFrame = 0;
            if (boss.state === 'hurt' || boss.state === 'attacking') {
                if (boss.state === 'attacking') {boss.attackCooldown = 90;}
                boss.state = 'idle';
            }
        }
    }

    // 4. GATILHOS DE FALA
    if (dist < 400 && !boss.viuPlayer) {
        bossDiz("Fora daqui. Agora.");
        boss.viuPlayer = true;
    }

    // 5. IA DE MOVIMENTO E ATAQUE
    if (boss.state !== 'hurt' && boss.state !== 'attacking') {
        boss.facing = (alvo.x < boss.x) ? 'left' : 'right';

        if (dist > (boss.attackRange || 80)) {
            boss.state = 'walking';
            boss.x += (alvo.x < boss.x) ? -boss.speed : boss.speed;
        } else {
            if ((boss.attackCooldown || 0) <= 0) {
                boss.state = 'attacking';
                boss.currentFrame = 0;
                if (Math.random() < 0.3) bossDiz("Essa terra não é mais de vocês");
            } else {
                boss.state = 'idle';
            }
        }
    }

    if (boss.attackCooldown > 0) boss.attackCooldown--;
}

function draw() {
    // 1. PRIMEIRO: Limpamos a tela
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState === 'menu') return;


// --- CÁLCULO DO TREMOR ---
    let shakeX = 0;
    let shakeY = 0;

    if (screenShakeTimer > 0) {
        // Gera valores aleatórios entre -5 e 5
        shakeX = (Math.random() - 0.5) * 10;
        shakeY = (Math.random() - 0.5) * 10;
        screenShakeTimer--; 
    }

    // 2. DEPOIS: Desenhamos o mundo (Câmera)
    ctx.save();
    ctx.setTransform(
        zoom, 0, 0, zoom,
        -Math.floor((cameraX + shakeX) * zoom),
        -Math.floor((cameraY + shakeY) * zoom)
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

// DESENHAR O ESCUDO ANIMADO
    if (obj.isProtecting && obj.imgProtect && obj.imgProtect.complete) {
        const pw = obj.imgProtect.width / obj.protectFrames;
        const ph = obj.imgProtect.height;

        // Lógica de animação dos frames do escudo
        obj.protectFrameTimer++;
        if (obj.protectFrameTimer >= 10) {
            obj.protectFrameTimer = 0;
            obj.protectCurrentFrame = (obj.protectCurrentFrame + 1) % obj.protectFrames;
        }

        ctx.save();
        ctx.globalAlpha = 0.8; // Deixa o escudo um pouco transparente
        ctx.drawImage(
            obj.imgProtect,
            obj.protectCurrentFrame * pw, 0, pw, ph,
            obj.x - 10, obj.y - 10, obj.width + 20, obj.height + 20
        );
        ctx.restore();
    }

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
            ctx.fillText("MINOTAUR", canvas.width/2, 35);
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
                if (title) title.innerHTML = "Você derrubou <br> MINOTAUR";
                if (subtitle) subtitle.innerHTML = "Mas... O que é isso que está acontecendo?";
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
    localStorage.setItem('2capitulo_2_vencido', 'true');
    window.location.href = "cutscene.html";
};

// --- INPUTS DO TECLADO ---
window.addEventListener('keydown', (e) => {
    const k = e.key;

    if (k.toLowerCase() === 'q') {
        trocarPersonagem();
    }

    // --- CONTROLES PLAYER 1 ---
    if (k.toLowerCase() === 'a') window.mover(player, keys, 'left', true);
    if (k.toLowerCase() === 'd') window.mover(player, keys, 'right', true);
    if (k.toLowerCase() === 'w') window.pular(player);
    if (k.toLowerCase() === ' ') window.atacar(player);
    
    // --- CONTROLES PLAYER 2 ---
    if (player2.active) {
        if (k === 'ArrowLeft')  window.mover(player2, keysP2, 'left', true);
        if (k === 'ArrowRight') window.mover(player2, keysP2, 'right', true);
        if (k === 'ArrowUp')    window.pular(player2);
        if (k === 'l' || k === 'L') window.atacar(player2);
    }

    // Tecla R (Reiniciar)
    if (k.toLowerCase() === 'r') {
        const p1Morto = player.hp <= 0 || player.state === 'dead';
        const p2Morto = !player2.active || player2.hp <= 0 || player2.state === 'dead';
        if (boss && boss.state === 'dead') window.irParaMenu();
        else if (p1Morto && p2Morto) window.resetGame();
    }
});

window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k.toLowerCase() === 'a') window.mover(player, keys, 'left', false);
    if (k.toLowerCase() === 'd') window.mover(player, keys, 'right', false);
    if (k === 'ArrowLeft')  window.mover(player2, keysP2, 'left', false);
    if (k === 'ArrowRight') window.mover(player2, keysP2, 'right', false);
});

// --- INICIALIZAÇÃO DOS BOTÕES ---
document.addEventListener('DOMContentLoaded', () => {
    const btnReset = document.getElementById('btn-reset');
    const btnNext = document.getElementById('btn-next-chapter');

    if (btnReset) btnReset.onclick = () => window.resetGame();
    if (btnNext) btnNext.onclick = () => window.irParaMenu();
});