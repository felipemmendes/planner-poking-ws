const express = require("express");
const morgan = require("morgan");
const { createServer } = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [process.env.APP_URL],
  }
});

const redisClient = new Redis(process.env.REDIS_URL, {
  lazyConnect: true
});



io.on("connection", (socket) => {
  socket.on("createUser", ({ roomId, user }) => {
    socket.data[roomId] = { user }
  });

  socket.on("enterRoom", async (roomId) => {
    await redisClient.connect();
    let roomConfig = await redisClient.get(roomId);
    await redisClient.quit();

    if (!roomConfig) {
      socket.emit("forbiddenRoom");
      return;
    }

    if (!socket.data[roomId]) {
      socket.emit("noUserFound");
      return;
    }

    socket.join(roomId);

    const users = [];
    const sockets = await io.in(roomId).fetchSockets();
    for (const socket of sockets) {
      users.push(socket.data[roomId].user);
    }

    io.to(roomId).emit("updateUsers", users);

    roomConfig = JSON.parse(roomConfig);
    socket.emit("getRoom", { room: roomConfig, users, user: socket.data[roomId] });
  });

  socket.on("createRoom", async (room) => {
    await redisClient.connect();
    await redisClient.set(room.id, JSON.stringify(room));
    await redisClient.quit();
  });

  socket.on("leaveRoom", async (roomId) => {
    await redisClient.connect();
    let roomConfig = await redisClient.get(roomId);
    await redisClient.quit();

    if (!roomConfig) {
      return;
    }

    const users = [];
    const sockets = await io.in(roomId).fetchSockets();
    for (const socket of sockets) {
      users.push(socket.data[roomId].user);
    }

    io.to(roomId).emit("updateUsers", users);
  });

  socket.on("sendVote", async ({ roomId, vote }) => {
    socket.data[roomId].vote = vote;
    socket.data[roomId].user.isReady = true;

    const users = [];
    const sockets = await io.in(roomId).fetchSockets();
    for (const socket of sockets) {
      users.push(socket.data[roomId].user);
    }

    io.to(roomId).emit("updateUsers", users);
  });

  socket.on("clearVote", async ({ roomId }) => {
    delete socket.data[roomId].vote;
    socket.data[roomId].user.isReady = false;

    const users = [];
    const sockets = await io.in(roomId).fetchSockets();
    for (const socket of sockets) {
      users.push(socket.data[roomId].user);
    }

    io.to(roomId).emit("updateUsers", users);
  });

  socket.on("getVotes", async (roomId) => {
    const votes = {};
    const sockets = await io.in(roomId).fetchSockets();
    for (const socket of sockets) {
      if (!socket.data[roomId] || typeof socket.data[roomId].vote !== 'number') {
        continue;
      }
      votes[socket.data[roomId].vote] = [...(votes[socket.data[roomId].vote] ?? []), socket.data[roomId].user];
    }
    io.to(roomId).emit("showVotes", votes);
  });

  socket.on("resetVotes", async (roomId) => {
    const sockets = await io.in(roomId).fetchSockets();
    const users = []
    for (const socket of sockets) {
      if (!socket.data[roomId]) {
        continue;
      }

      if (socket.data[roomId].vote) {
        delete socket.data[roomId].vote;
      }

      socket.data[roomId].user.isReady = false;
      users.push(socket.data[roomId].user);
    }
    
    io.to(roomId).emit("clearVotes", users);
  });

  socket.on("disconnecting", async () => {
    await redisClient.connect();
    for (const roomId of socket.rooms) {

      let roomConfig = await redisClient.get(roomId);
      if (!roomConfig) {
        continue;
      }

      const users = [];
      const sockets = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        if (socket.data[roomId].user.id === s.data[roomId].user.id) {
          continue;
        }
        users.push(s.data[roomId].user);
      }
      io.to(roomId).emit("updateUsers", users);

      if (users.length === 0) {
        await redisClient.del(roomId);
      }
    }
    await redisClient.quit();
  });
});


app.disable("x-powered-by");
app.use(morgan("tiny"));

const port = process.env.PORT || 3000;

httpServer.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});
