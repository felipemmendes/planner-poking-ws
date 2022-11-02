const express = require("express");
const morgan = require("morgan");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [process.env.APP_URL],
  }
});

io.on("connection", (socket) => {
  socket.on("createUser", ({ roomId, user }) => {
    socket.data[roomId] = { user }
  });

  socket.on("enterRoom", async (roomId) => {
    const redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    let roomConfig = await redisClient.get(roomId);
    if (!roomConfig) {
      socket.emit("forbiddenRoom");
      await redisClient.disconnect();
      return;
    }

    if (!socket.data[roomId]) {
      socket.emit("noUserFound");
      await redisClient.disconnect();
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

    await redisClient.disconnect();
  });

  socket.on("createRoom", async (room) => {
    const redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    redisClient.on("error", (err) => console.error("Redis Client Error", err));

    redisClient.set(room.id, room);

    await redisClient.disconnect();
  });

  socket.on("leaveRoom", async (roomId) => {
    const redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    let roomConfig = await redisClient.get(roomId);
    await redisClient.disconnect();

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
    const redisClient = createClient({
      url: process.env.REDIS_URL,
    });
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
        await redisClient.getDel(roomId);
      }
    }

    await redisClient.disconnect();
  });
});


app.disable("x-powered-by");
app.use(morgan("tiny"));

const port = process.env.PORT || 3000;

httpServer.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});
