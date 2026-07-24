const { Server } = require("ws");
const pty = require("node-pty");
const { spawn } = require("child_process");
const url = require("url");

function terminal(server) {
  const wss = new Server({ noServer: true });
  const terminalConnections = new Map();

  function getOrCreateConnection(terminalId) {
    if (terminalConnections.has(terminalId)) {
      return terminalConnections.get(terminalId);
    }

    const connectionData = {
      process: null,
      clients: new Set(),
      isReady: false,
      bufferedData: [],
      terminalId,
    };

    terminalConnections.set(terminalId, connectionData);
    setupLocalConnection(connectionData);
    return connectionData;
  }

  function setupLocalConnection(connectionData) {
    const shell =
      process.platform === "win32"
        ? "powershell.exe"
        : process.env.SHELL || "/bin/bash";

    console.log(`Starting terminal with shell: ${shell}`);

    try {
      connectionData.process = pty.spawn(shell, [], {
        name: "xterm-color",
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });

      console.log(
        `Terminal process started with PID: ${connectionData.process.pid}`,
      );
      connectionData.isReady = true;

      connectionData.process.onData((data) => {
        broadcast(connectionData, data);
      });

      connectionData.process.onExit(({ exitCode, signal }) => {
        console.log(
          `Terminal exited with code: ${exitCode}, signal: ${signal}`,
        );
        broadcast(
          connectionData,
          `\r\n\u001b[31m[Terminal exited with code ${exitCode}]\u001b[0m\r\n`,
        );
        connectionData.process = null;
        connectionData.isReady = false;
      });

      if (connectionData.bufferedData.length > 0) {
        connectionData.bufferedData.forEach((msg) =>
          connectionData.process.write(msg),
        );
        connectionData.bufferedData = [];
      }
    } catch (err) {
      console.warn(
        "PTY unavailable; using shell-stream fallback:",
        err.message,
      );
      setupPipeConnection(connectionData, shell);
    }
  }

  function setupPipeConnection(connectionData, shell) {
    try {
      const child = spawn(shell, ["-i"], {
        cwd: process.cwd(),
        env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
        stdio: ["pipe", "pipe", "pipe"],
      });

      connectionData.process = {
        pid: child.pid,

        write: (data) => child.stdin.write(data.replace(/\r/g, "\n")),
        kill: () => child.kill(),
      };
      connectionData.isReady = true;
      child.stdout.on("data", (data) =>
        broadcast(connectionData, data.toString()),
      );
      child.stderr.on("data", (data) =>
        broadcast(connectionData, data.toString()),
      );
      child.on("exit", ({ code, signal }) => {
        broadcast(
          connectionData,
          `\r\n\u001b[31m[Terminal exited with code ${code ?? signal}]\u001b[0m\r\n`,
        );
        connectionData.process = null;
        connectionData.isReady = false;
      });
      connectionData.bufferedData.forEach((msg) =>
        connectionData.process.write(msg),
      );
      connectionData.bufferedData = [];
    } catch (error) {
      console.error("Failed to start terminal fallback:", error);
      broadcast(
        connectionData,
        `\u001b[31mFailed to start terminal: ${error.message}\u001b[0m\r\n`,
      );
      connectionData.isReady = false;
    }
  }

  function broadcast(connectionData, data) {
    connectionData.clients.forEach((ws) => {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    });
  }

  server.on("upgrade", (req, socket, head) => {
    if (!req.url.startsWith("/terminal")) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const urlParts = url.parse(req.url, true);
    const terminalId = urlParts.query.terminal || "default";

    console.log(
      `New terminal connection: ${terminalId} from ${req.socket.remoteAddress}`,
    );

    const connectionData = getOrCreateConnection(terminalId);
    connectionData.clients.add(ws);

    console.log(
      `Terminal ${terminalId} now has ${connectionData.clients.size} client(s)`,
    );

    ws.on("message", (msg) => {
      const input = msg.toString();
      if (connectionData.process && connectionData.isReady) {
        connectionData.process.write(input);
      } else {
        connectionData.bufferedData.push(input);
      }
    });

    ws.on("close", () => {
      connectionData.clients.delete(ws);

      if (connectionData.clients.size === 0) {
        setTimeout(() => {
          if (connectionData.clients.size === 0) {
            if (connectionData.process) {
              connectionData.process.kill();
            }
            terminalConnections.delete(terminalId);
            console.log(`Cleaned up terminal connection: ${terminalId}`);
          }
        }, 30000);
      }
    });
  });
}

module.exports = terminal;
