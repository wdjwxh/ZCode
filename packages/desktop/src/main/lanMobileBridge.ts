import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { basename, extname, resolve, sep } from "node:path";
import { app, MessageChannelMain, type BrowserWindow, type UtilityProcess } from "electron";
import { WebSocketServer, type WebSocket } from "ws";
import { Emitter, MessagePortProtocol, SocketProtocol, VSBuffer, type ISocket } from "@zcode/rpc";
import { HostMessageTypes, SERVER_REMOTE_PROTOCOL_VERSION, ZCODE_VERSION } from "@zcode/shared";

const cookieName = "zcode_lan_session";
const maxQueuedBytes = 16 * 1024 * 1024;
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

interface Target {
  windowId: number;
  token: string;
  sockets: Set<WebSocket>;
}

function localIpAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "127.0.0.1";
}

function cookieToken(header: string | undefined): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}

function sameToken(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createSocket(ws: WebSocket): ISocket {
  const data = new Emitter<VSBuffer>();
  const close = new Emitter<void>();
  ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    data.fire(VSBuffer.wrap(new Uint8Array(bytes)));
  });
  ws.once("close", () => close.fire());
  ws.once("error", () => close.fire());
  return {
    onData: data.event,
    onClose: close.event,
    onEnd: close.event,
    write(buffer) {
      if (ws.readyState === ws.OPEN) ws.send(buffer.buffer);
    },
    end() {
      ws.close();
    },
    drain: () => Promise.resolve(),
    dispose() {
      ws.close();
      data.dispose();
      close.dispose();
    },
  };
}

function bridgeSocketToHost(ws: WebSocket, host: UtilityProcess): void {
  const { port1, port2 } = new MessageChannelMain();
  const port = new MessagePortProtocol({
    addEventListener: (_type, listener) => port1.on("message", listener),
    removeEventListener: (_type, listener) => port1.off("message", listener),
    postMessage: (data) => port1.postMessage(data),
    start: () => port1.start(),
    close: () => port1.close(),
  });
  const socket = createSocket(ws);
  const wire = new SocketProtocol(socket);
  const fromPhone = wire.onMessage((buffer) => port.send(buffer));
  const fromHost = port.onMessage((buffer) => {
    if (ws.bufferedAmount > maxQueuedBytes) {
      ws.close(1013, "Client is too slow");
      return;
    }
    wire.send(buffer);
  });
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    fromPhone.dispose();
    fromHost.dispose();
    wire.dispose();
    port.disconnect();
    socket.dispose();
  };
  ws.once("close", cleanup);
  port1.once("close", () => ws.close());
  try {
    host.postMessage(
      {
        type: HostMessageTypes.AttachServicePort,
        requestId: randomUUID(),
        attachmentId: randomUUID(),
        clientMode: "web-remote-replayable",
        scope: { kind: "local" },
      },
      [port2],
    );
  } catch {
    cleanup();
  }
}

export function createLanMobileBridge(options: {
  getWindow: (windowId: number) => BrowserWindow | undefined;
  getHost: (webContentsId: number) => UtilityProcess | undefined;
  getWorkspacePaths: (windowId: number) => string[];
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}) {
  const targets = new Map<string, Target>();
  let server: Server | undefined;
  let port = 0;
  let staticRoot = "";
  const webSockets = new WebSocketServer({ noServer: true });

  function findTarget(token: string | undefined): Target | undefined {
    if (!token) return undefined;
    return [...targets.values()].find(
      (target) => sameToken(token, target.token) && options.getWindow(target.windowId),
    );
  }

  async function handleHttp(
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    const linkToken = url.searchParams.get("token");
    if (linkToken) {
      if (!findTarget(linkToken)) {
        response.writeHead(401).end("Invalid link");
        return;
      }
      response
        .writeHead(302, {
          "Cache-Control": "no-store",
          "Set-Cookie": `${cookieName}=${linkToken}; HttpOnly; SameSite=Strict; Path=/`,
          Location: "/",
        })
        .end();
      return;
    }
    const target = findTarget(cookieToken(request.headers.cookie));
    if (!target) {
      response.writeHead(401).end("Open a link copied from ZCode Desktop");
      return;
    }
    if (url.pathname === "/api/server-info") {
      const workspaces = options.getWorkspacePaths(target.windowId).map((path) => ({
        path,
        label: basename(path) || path,
      }));
      response
        .writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        })
        .end(
          JSON.stringify({
            serverId: `desktop-window-${target.windowId}`,
            version: ZCODE_VERSION,
            protocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
            authRequired: true,
            workspaces,
            capabilities: { desktopContinuous: true, websocketRpc: true },
          }),
        );
      return;
    }
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const file = resolve(staticRoot, `.${decodedPath === "/" ? "/index.html" : decodedPath}`);
    if (file !== staticRoot && !file.startsWith(`${staticRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response
        .writeHead(200, {
          "Cache-Control": file.endsWith("index.html")
            ? "no-store"
            : "public, max-age=31536000, immutable",
          "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
        })
        .end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  }

  async function start(): Promise<void> {
    if (server) return;
    staticRoot = resolve(
      app.isPackaged ? process.resourcesPath : resolve(import.meta.dirname, "../../../.."),
      app.isPackaged ? "mobile-web" : "packages/web/dist",
    );
    const next = createServer((request, response) => {
      void handleHttp(request, response).catch((error: unknown) => {
        options.logger.warn("[lan-mobile] HTTP failed", error);
        if (!response.headersSent) response.writeHead(500).end();
      });
    });
    next.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const origin = request.headers.origin;
      const expectedOrigin = `http://${request.headers.host}`;
      const target = findTarget(cookieToken(request.headers.cookie));
      if (url.pathname !== "/ws" || origin !== expectedOrigin || !target) {
        socket.destroy();
        return;
      }
      const win = options.getWindow(target.windowId);
      const host = win && options.getHost(win.webContents.id);
      if (!host) {
        socket.destroy();
        return;
      }
      webSockets.handleUpgrade(request, socket, head, (ws) => {
        target.sockets.add(ws);
        ws.once("close", () => target.sockets.delete(ws));
        bridgeSocketToHost(ws, host);
      });
    });
    try {
      await new Promise<void>((resolveListen, reject) => {
        next.once("error", reject);
        next.listen(0, "0.0.0.0", () => resolveListen());
      });
      server = next;
      const address = next.address();
      port = typeof address === "object" && address ? address.port : 0;
      options.logger.info(`[lan-mobile] listening on port ${port}`);
    } catch (error) {
      next.close();
      throw error;
    }
  }

  return {
    async linkForWindow(windowId: number): Promise<string> {
      const win = options.getWindow(windowId);
      if (!win || !options.getHost(win.webContents.id)) {
        throw new Error("请先打开桌面工作区，等待加载完成");
      }
      if (options.getWorkspacePaths(windowId).length === 0) {
        throw new Error("请先在桌面窗口中打开工作区");
      }
      await start();
      let target = targets.get(String(windowId));
      if (!target) {
        target = { windowId, token: randomBytes(32).toString("hex"), sockets: new Set() };
        targets.set(String(windowId), target);
      }
      return `http://${localIpAddress()}:${port}/?token=${target.token}`;
    },
    revokeWindow(windowId: number): void {
      const target = targets.get(String(windowId));
      if (!target) return;
      targets.delete(String(windowId));
      for (const ws of target.sockets) ws.close(1001, "Desktop window closed");
      target.sockets.clear();
    },
    close(): void {
      for (const target of targets.values()) {
        for (const ws of target.sockets) ws.close(1001, "Desktop closed");
      }
      targets.clear();
      webSockets.close();
      server?.close();
      server = undefined;
    },
  };
}
