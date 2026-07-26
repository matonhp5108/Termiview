const { Server } = require("ws");
const pty = require("node-pty");
const { spawn } = require("child_process");
const url = require("url");
const fs = require("fs");
const path = require("path");
const os = require("os");

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
      localEcho: false,
      inputBuffer: "",
      cwd: process.cwd(),
      bufferedData: [],
      terminalId,
    };

    terminalConnections.set(terminalId, connectionData);
    return connectionData;
  }

  function setupLocalConnection(connectionData) {
    const shell =
      process.platform === "win32"
        ? "powershell.exe"
        : process.env.SHELL ||
          (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
    const shellArgs = process.platform === "win32" ? [] : ["-l"];

    console.log(`Starting terminal with shell: ${shell}`);

    try {
      connectionData.process = pty.spawn(shell, shellArgs, {
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
      connectionData.localEcho = false;
      connectionData.inputBuffer = "";

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
        connectionData.localEcho = false;
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
      setupPipeConnection(connectionData, shell, shellArgs);
    }
  }

  function setupPipeConnection(connectionData, shell, shellArgs) {
    try {
      const child = spawn(
        shell,
        process.platform === "win32" ? [] : [...shellArgs, "-i"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
          },
          detached: process.platform !== "win32",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      connectionData.process = {
        pid: child.pid,

        write: (data) => child.stdin.write(data.replace(/\r/g, "\n")),
        kill: () => child.kill(),
        interrupt: () => {
          if (process.platform !== "win32") {
            process.kill(-child.pid, "SIGINT");
          } else {
            child.kill("SIGINT");
          }
        },
      };

      connectionData.localEcho = true;
      connectionData.inputBuffer = "";
      connectionData.isReady = true;
      child.stdout.on("data", (data) =>
        broadcast(connectionData, normalizePipeOutput(data.toString())),
      );
      child.stderr.on("data", (data) =>
        broadcast(connectionData, normalizePipeOutput(data.toString())),
      );
      child.on("error", (error) => {
        console.error("Terminal fallback process failed:", error);
        broadcast(
          connectionData,
          `\r\n\u001b[31mFailed to start terminal: ${error.message}\u001b[0m\r\n`,
        );
        connectionData.process = null;
        connectionData.isReady = false;
        connectionData.localEcho = false;
        connectionData.localEcho = false;
      });
      child.on("exit", (code, signal) => {
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

  function broadcastControl(connectionData, type, payload) {
    broadcast(connectionData, JSON.stringify({ type, ...payload }));
  }

  function normalizePipeOutput(data) {
    return data.replace(/\r?\n/g, "\r\n");
  }

  function handlePipeInput(connectionData, input) {
    for (const char of input) {
      if (char === "\r" || char === "\n") {
        broadcast(connectionData, "\r\n");
        const command = connectionData.inputBuffer;
        connectionData.process.write(`${command}\n`);
        connectionData.inputBuffer = "";
        syncExplorerPath(connectionData, command);
      } else if (char === "\b" || char === "\x7f") {
        if (connectionData.inputBuffer.length > 0) {
          connectionData.inputBuffer = connectionData.inputBuffer.slice(0, -1);
          broadcast(connectionData, "\b \b");
        }
      } else if (char === "\x03") {
        const hadInput = connectionData.inputBuffer.length > 0;
        connectionData.inputBuffer = "";
        broadcast(connectionData, "^C\r\n");
        if (!hadInput) {
          try {
            connectionData.process.interrupt();
          } catch (error) {
            console.warn(
              "Could not interrupt terminal process:",
              error.message,
            );
          }
        }
      } else if (char === "\x0c") {
        connectionData.inputBuffer = "";
        connectionData.process.write("clear\n");
      } else if (char === "\t") {
        broadcast(connectionData, "\x07");
      } else {
        connectionData.inputBuffer += char;
        broadcast(connectionData, char);
      }
    }
  }

  function syncExplorerPath(connectionData, command) {
    const match = command.trim().match(/^cd(?:\s+--)?(?:\s+(.+))?$/);
    if (!match) return;
    const rawPath = (match[1] || "~").trim().replace(/^['"]|['"]$/g, "");
    if (rawPath === "-") return;
    const expandedPath = rawPath.startsWith("~")
      ? path.join(os.homedir(), rawPath.slice(1))
      : rawPath;
    const nextPath = path.resolve(connectionData.cwd, expandedPath);
    try {
      if (!fs.statSync(nextPath).isDirectory()) return;
      connectionData.cwd = nextPath;
      broadcastControl(connectionData, "termiview-path", { path: nextPath });
    } catch {}
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

    if (!connectionData.process && !connectionData.isReady) {
      setupLocalConnection(connectionData);
    }

    console.log(
      `Terminal ${terminalId} now has ${connectionData.clients.size} client(s)`,
    );

    ws.on("message", (msg) => {
      const input = msg.toString();
      if (connectionData.process && connectionData.isReady) {
        if (connectionData.localEcho) {
          handlePipeInput(connectionData, input);
          return;
        }
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
