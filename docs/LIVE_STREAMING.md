# 🎥 Funcionalidade de Live Streaming

## Visão Geral

A aplicação agora suporta transmissão ao vivo durante as partidas de bingo! Os administradores podem transmitir vídeo e áudio ao vivo, e todos os usuários logados podem assistir em tempo real.

## 🚀 Como Funciona

### Para Administradores
1. **Acesse uma partida** em andamento
2. **Clique em "Iniciar Live"** no painel de controles
3. **Permita acesso** à câmera e microfone quando solicitado
4. **Controle a transmissão** com botões de vídeo/áudio
5. **Finalize** clicando em "Parar Live"

### Para Usuários
1. **Entre em uma partida** que está ao vivo
2. **Assista automaticamente** ao vídeo da transmissão
3. **Aproveite** o bingo com transmissão ao vivo!

## 🛠️ Arquitetura Técnica

### Backend (Socket.IO Server)

- **Servidor**: `server.js` (porta 8082)
- **WebRTC**: Transmissão peer-to-peer
- **Socket.IO**: Sinalização e controle de estado
- **Estado por partida**: Controle de lives ativas

### Frontend (React)

- **LiveBroadcaster**: Componente para transmissão (admin)
- **LiveViewer**: Componente para visualização (usuários)
- **useLiveStatus**: Hook para gerenciar estado da live

## 📋 Pré-requisitos

### Dependências Instaladas

```bash
npm install socket.io socket.io-client
```

### Servidor de Live

```bash
# Terminal 1: Iniciar servidor de live
npm run server

# Terminal 2: Iniciar aplicação React
npm run dev
```

## 🔧 Configuração

### Servidor Socket.IO

- **Porta**: 8082
- **CORS**: Habilitado para todas as origens
- **STUN Servers**: Google STUN para WebRTC

### Limitações Atuais
- **Escalabilidade**: Recomendado até 10 espectadores simultâneos
- **Para mais usuários**: Considerar migração para LiveKit ou Agora

## 🎯 Funcionalidades

### ✅ Implementadas
- [x] Transmissão ao vivo com WebRTC
- [x] Controle de câmera/microfone
- [x] Visualização para múltiplos usuários
- [x] Integração com sistema de partidas
- [x] Controle de permissões (apenas admin transmite)
- [x] Feedback visual (badges, animações)

### 🔄 Estados da Live
- **Aguardando**: Sem transmissão ativa
- **Ao Vivo**: Transmissão em andamento
- **Conectando**: Estabelecendo conexão WebRTC

## 🐛 Troubleshooting

### Problemas Comuns

1. **Câmera/Microfone não funciona**
   - Verifique permissões do navegador
   - Certifique-se de que não há outras aplicações usando os dispositivos

2. **Vídeo não carrega**
   - Verifique se o servidor Socket.IO está rodando
   - Confirme conexão com `http://localhost:8082`

3. **Lag/Qualidade ruim**
   - WebRTC depende da conexão de internet
   - Considere usar wired connection para melhor qualidade

## 🚀 Próximos Passos

### Melhorias Planejadas
- **Chat integrado** durante a transmissão
- **Gravação** das transmissões
- **Notificações push** quando live começa
- **Estatísticas** de visualização
- **Moderação** de conteúdo

### Escalabilidade
- **LiveKit**: Para transmissões com muitos espectadores
- **CDN**: Para distribuição global
- **Load Balancing**: Múltiplas instâncias do servidor

## 📚 Referências

- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Socket.IO](https://socket.io/)
- [LiveKit](https://livekit.io/)
- [Agora.io](https://www.agora.io/)

---

**🎉 Aproveite as transmissões ao vivo no seu bingo!**