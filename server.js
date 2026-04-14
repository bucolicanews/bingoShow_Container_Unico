import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Block access to sensitive paths
app.use((req, res, next) => {
  const blocked = /^\/(\.git|\.env|\.ssh|\.npmrc|node_modules)(\/|$)/i;
  if (blocked.test(req.path)) {
    return res.status(404).end();
  }
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");
const hasBuiltFrontend = existsSync(distPath);

if (hasBuiltFrontend) {
  // Do not auto-serve directory index files (e.g. /admin/index.html)
  // because it can shadow SPA routes like /admin.
  app.use(express.static(distPath, { index: false }));
}

const activeLives = new Map();

function getLiveStatus(matchId) {
  const live = activeLives.get(matchId);
  if (!live) {
    return {
      isLive: false,
      viewerCount: 0
    };
  }

  return {
    isLive: live.isLive,
    viewerCount: live.viewers.size,
    broadcaster: live.broadcaster
  };
}

function ensureMatch(matchId) {
  if (!activeLives.has(matchId)) {
    activeLives.set(matchId, {
      isLive: false,
      broadcaster: null,
      viewers: new Set()
    });
  }
  return activeLives.get(matchId);
}

function emitViewerCount(matchId) {
  const live = activeLives.get(matchId);
  io.to(`match:${matchId}`).emit("viewer-count", {
    matchId,
    viewerCount: live ? live.viewers.size : 0
  });
}

function stopLive(matchId, broadcasterId = null) {
  const live = activeLives.get(matchId);
  if (!live) {
    return;
  }

  live.isLive = false;
  live.broadcaster = null;
  live.viewers.clear();

  io.to(`match:${matchId}`).emit("live-stopped", {
    matchId,
    broadcaster: broadcasterId
  });
}

io.on("connection", (socket) => {
  socket.on("join-match", (matchId) => {
    socket.join(`match:${matchId}`);
  });

  socket.on("start-live", (matchId) => {
    const live = ensureMatch(matchId);
    live.isLive = true;
    live.broadcaster = socket.id;

    io.to(`match:${matchId}`).emit("live-started", {
      matchId,
      broadcaster: socket.id
    });
  });

  socket.on("broadcaster", (matchId) => {
    const live = ensureMatch(matchId);
    live.isLive = true;
    live.broadcaster = socket.id;
  });

  socket.on("watch-live", (matchId) => {
    const live = activeLives.get(matchId);
    if (live && live.isLive && live.broadcaster) {
      live.viewers.add(socket.id);
      socket.emit("can-watch", {
        matchId,
        broadcaster: live.broadcaster
      });
      emitViewerCount(matchId);
      return;
    }

    socket.emit("live-not-available", { matchId });
  });

  socket.on("watcher", (matchId) => {
    const live = activeLives.get(matchId);
    if (!live || !live.broadcaster) {
      return;
    }
    io.to(live.broadcaster).emit("watcher", socket.id);
  });

  socket.on("offer", (targetId, description) => {
    io.to(targetId).emit("offer", socket.id, description);
  });

  socket.on("answer", (targetId, description) => {
    io.to(targetId).emit("answer", socket.id, description);
  });

  socket.on("candidate", (targetId, candidate) => {
    io.to(targetId).emit("candidate", socket.id, candidate);
  });

  socket.on("stop-live", (matchId) => {
    stopLive(matchId, socket.id);
  });

  socket.on("disconnect", () => {
    for (const [matchId, live] of activeLives.entries()) {
      if (live.broadcaster === socket.id) {
        stopLive(matchId, socket.id);
        continue;
      }

      if (live.viewers.has(socket.id)) {
        live.viewers.delete(socket.id);
        emitViewerCount(matchId);
      }
    }
  });
});

app.get("/api/live-status", (req, res) => {
  const allStatuses = {};
  for (const [matchId] of activeLives.entries()) {
    allStatuses[matchId] = getLiveStatus(matchId);
  }
  res.json(allStatuses);
});

app.get("/api/live-status/:matchId", (req, res) => {
  res.json(getLiveStatus(req.params.matchId));
});

if (hasBuiltFrontend) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      return next();
    }

    return res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = Number(process.env.PORT || 8082);
server.listen(PORT, () => {
  console.log(`Servidor de live rodando na porta ${PORT}`);
});
