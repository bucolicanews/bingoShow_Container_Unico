// Conexão Socket.IO
const socket = io();

// Elementos DOM
const elementos = {
    status: document.getElementById('status'),
    cronometro: document.getElementById('cronometro'),
    progresso: document.getElementById('progresso'),
    ultimoNumero: document.getElementById('ultimoNumero'),
    btnIniciar: document.getElementById('btnIniciar'),
    btnPausar: document.getElementById('btnPausar'),
    btnContinuar: document.getElementById('btnContinuar'),
    btnResetar: document.getElementById('btnResetar'),
    btnSortearManual: document.getElementById('btnSortearManual'),
    numerosSorteados: document.getElementById('numerosSorteados'),
    totalNumeros: document.getElementById('totalNumeros'),
    numerosPares: document.getElementById('numerosPares'),
    numerosImpares: document.getElementById('numerosImpares'),
    primeiraMetade: document.getElementById('primeiraMetade'),
    segundaMetade: document.getElementById('segundaMetade')
};

// Estado do jogo
let estadoJogo = {
    numerosSorteados: [],
    jogoAtivo: false,
    tempoRestante: 0
};

// Event Listeners
elementos.btnIniciar.addEventListener('click', iniciarJogo);
elementos.btnPausar.addEventListener('click', pausarJogo);
elementos.btnContinuar.addEventListener('click', continuarJogo);
elementos.btnResetar.addEventListener('click', resetarJogo);
elementos.btnSortearManual.addEventListener('click', sortearManual);

// Eventos Socket.IO
socket.on('connect', () => {
    console.log('Conectado ao servidor');
    atualizarInterface();
});

socket.on('estado-inicial', (estado) => {
    estadoJogo = estado;
    atualizarInterface();
});

socket.on('jogo-iniciado', (dados) => {
    estadoJogo.jogoAtivo = true;
    estadoJogo.tempoRestante = dados.tempoRestante;
    atualizarStatus('ativo');
    atualizarInterface();
});

socket.on('jogo-pausado', () => {
    estadoJogo.jogoAtivo = false;
    atualizarStatus('pausado');
    atualizarInterface();
});

socket.on('jogo-continuado', (dados) => {
    estadoJogo.jogoAtivo = true;
    estadoJogo.tempoRestante = dados.tempoRestante;
    atualizarStatus('ativo');
    atualizarInterface();
});

socket.on('jogo-resetado', () => {
    estadoJogo = {
        numerosSorteados: [],
        jogoAtivo: false,
        tempoRestante: 0
    };
    atualizarStatus('aguardando');
    limparInterface();
    atualizarInterface();
});

socket.on('numero-sorteado', (dados) => {
    estadoJogo.numerosSorteados = dados.numerosSorteados;
    adicionarNumeroSorteado(dados.numero);
    atualizarUltimoNumero(dados.numero);
    atualizarEstatisticas();
    atualizarInterface();
});

socket.on('cronometro-atualizado', (dados) => {
    estadoJogo.tempoRestante = dados.tempoRestante;
    atualizarCronometro(dados.tempoRestante);
});

socket.on('jogo-finalizado', (dados) => {
    estadoJogo.jogoAtivo = false;
    atualizarStatus('finalizado');
    alert(dados.mensagem);
    atualizarInterface();
});

// Funções de controle
function iniciarJogo() {
    socket.emit('iniciar-jogo');
}

function pausarJogo() {
    socket.emit('pausar-jogo');
}

function continuarJogo() {
    socket.emit('continuar-jogo');
}

function resetarJogo() {
    if (confirm('Tem certeza que deseja resetar o jogo? Todos os números sorteados serão perdidos.')) {
        socket.emit('resetar-jogo');
    }
}

function sortearManual() {
    socket.emit('sortear-numero-manual');
}

// Funções de atualização da interface
function atualizarInterface() {
    atualizarCronometro(estadoJogo.tempoRestante);
    atualizarBotoes();
    atualizarNumerosSorteados();
    atualizarEstatisticas();
    
    if (estadoJogo.numerosSorteados.length > 0) {
        atualizarUltimoNumero(estadoJogo.numerosSorteados[estadoJogo.numerosSorteados.length - 1]);
    }
}

function atualizarStatus(status) {
    const statusElement = elementos.status;
    statusElement.className = `status ${status}`;
    
    switch(status) {
        case 'aguardando':
            statusElement.textContent = 'Aguardando início';
            break;
        case 'ativo':
            statusElement.textContent = 'Jogo em andamento';
            break;
        case 'pausado':
            statusElement.textContent = 'Jogo pausado';
            break;
        case 'finalizado':
            statusElement.textContent = 'Jogo finalizado';
            break;
    }
}

function atualizarCronometro(segundos) {
    const minutos = Math.floor(segundos / 60);
    const segundosRestantes = segundos % 60;
    const tempoFormatado = `${minutos.toString().padStart(2, '0')}:${segundosRestantes.toString().padStart(2, '0')}`;
    
    elementos.cronometro.textContent = tempoFormatado;
    
    // Atualizar barra de progresso
    const progresso = (segundos / 10) * 100; // 10 segundos é o tempo máximo
    elementos.progresso.style.width = `${progresso}%`;
}

function atualizarUltimoNumero(numero) {
    elementos.ultimoNumero.textContent = numero.toString().padStart(2, '0');
    
    // Animação do número
    elementos.ultimoNumero.style.transform = 'scale(1.2)';
    setTimeout(() => {
        elementos.ultimoNumero.style.transform = 'scale(1)';
    }, 300);
}

function atualizarBotoes() {
    elementos.btnIniciar.disabled = estadoJogo.jogoAtivo || estadoJogo.numerosSorteados.length > 0;
    elementos.btnPausar.disabled = !estadoJogo.jogoAtivo;
    elementos.btnContinuar.disabled = estadoJogo.jogoAtivo || estadoJogo.numerosSorteados.length === 0;
    elementos.btnSortearManual.disabled = !estadoJogo.jogoAtivo;
}

function adicionarNumeroSorteado(numero) {
    const numeroElement = document.createElement('div');
    numeroElement.className = 'numero-sorteado';
    numeroElement.textContent = numero.toString().padStart(2, '0');
    elementos.numerosSorteados.insertBefore(numeroElement, elementos.numerosSorteados.firstChild);
}

function atualizarNumerosSorteados() {
    elementos.totalNumeros.textContent = estadoJogo.numerosSorteados.length;
}

function atualizarEstatisticas() {
    const numeros = estadoJogo.numerosSorteados;
    
    // Contar pares e ímpares
    const pares = numeros.filter(n => n % 2 === 0).length;
    const impares = numeros.filter(n => n % 2 !== 0).length;
    
    // Contar primeira e segunda metade
    const primeiraMetade = numeros.filter(n => n <= 37).length;
    const segundaMetade = numeros.filter(n => n > 37).length;
    
    elementos.numerosPares.textContent = pares;
    elementos.numerosImpares.textContent = impares;
    elementos.primeiraMetade.textContent = primeiraMetade;
    elementos.segundaMetade.textContent = segundaMetade;
}

function limparInterface() {
    elementos.numerosSorteados.innerHTML = '';
    elementos.ultimoNumero.textContent = '--';
    elementos.numerosPares.textContent = '0';
    elementos.numerosImpares.textContent = '0';
    elementos.primeiraMetade.textContent = '0';
    elementos.segundaMetade.textContent = '0';
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    atualizarInterface();
});
