/**
 * Deno's global `fetch` writes HTTP headers and body as two TCP segments and
 * leaves Nagle on. To us-west-2 that delays the body by one extra RTT (~200ms).
 * This transport is only for api.typesafe.ai: one keep-alive socket, TCP_NODELAY,
 * request written as a single buffer.
 */
const HOST = "api.typesafe.ai";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let conn: Deno.TlsConn | undefined;
let leftover = new Uint8Array(0);
let chain: Promise<unknown> = Promise.resolve();

async function connect(): Promise<Deno.TlsConn> {
  const tcp = await Deno.connect({ hostname: HOST, port: 443 });
  tcp.setNoDelay(true);
  return await Deno.startTls(tcp, { hostname: HOST });
}

function close(): void {
  try {
    conn?.close();
  } catch {
    // already closed
  }
  conn = undefined;
  leftover = new Uint8Array(0);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

async function readMore(): Promise<void> {
  if (!conn) throw new Error("TypeSafe socket is closed");
  const chunk = new Uint8Array(32 * 1024);
  const n = await conn.read(chunk);
  if (n === null) throw new Error("TypeSafe socket closed by peer");
  leftover = concat(leftover, chunk.slice(0, n));
}

async function readAtLeast(n: number): Promise<Uint8Array> {
  while (leftover.length < n) await readMore();
  const out = leftover.slice(0, n);
  leftover = leftover.slice(n);
  return out;
}

async function readHeaders(): Promise<string> {
  for (;;) {
    const text = decoder.decode(leftover);
    const split = text.indexOf("\r\n\r\n");
    if (split >= 0) {
      leftover = leftover.slice(split + 4);
      return text.slice(0, split);
    }
    await readMore();
  }
}

async function readChunked(): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for (;;) {
    const text = decoder.decode(leftover);
    const line = text.indexOf("\r\n");
    if (line < 0) {
      await readMore();
      continue;
    }
    const size = Number.parseInt(text.slice(0, line), 16);
    leftover = leftover.slice(line + 2);
    if (size === 0) {
      if (leftover.length < 2) await readAtLeast(2);
      leftover = leftover.slice(2);
      break;
    }
    parts.push(await readAtLeast(size));
    await readAtLeast(2);
  }
  return parts.reduce(concat, new Uint8Array(0));
}

function encodeBody(body: BodyInit | null | undefined): Uint8Array {
  if (body == null) return new Uint8Array(0);
  if (typeof body === "string") return encoder.encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new Error("Unsupported TypeSafe request body");
}

async function roundTrip(
  input: string,
  init: RequestInit | undefined,
): Promise<Response> {
  const url = new URL(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = encodeBody(init?.body);
  const headers = new Headers(init?.headers);
  headers.set("Host", HOST);
  headers.set("Connection", "keep-alive");
  headers.set("Content-Length", String(body.length));

  let head = `${method} ${url.pathname}${url.search} HTTP/1.1\r\n`;
  for (const [name, value] of headers) head += `${name}: ${value}\r\n`;
  head += "\r\n";

  const request = concat(encoder.encode(head), body);
  const send = async () => {
    if (!conn) conn = await connect();
    let offset = 0;
    while (offset < request.length) {
      offset += await conn.write(request.subarray(offset));
    }
  };

  const signal = init?.signal;
  const onAbort = () => close();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    try {
      await send();
    } catch {
      close();
      await send();
    }

    const headerText = await readHeaders();
    const [statusLine, ...headerLines] = headerText.split("\r\n");
    const status = Number(statusLine.split(" ")[1]);
    const responseHeaders = new Headers();
    for (const line of headerLines) {
      const colon = line.indexOf(":");
      if (colon > 0) {
        responseHeaders.append(
          line.slice(0, colon),
          line.slice(colon + 1).trim(),
        );
      }
    }

    const encoding = responseHeaders.get("transfer-encoding") ?? "";
    const bytes = encoding.includes("chunked")
      ? await readChunked()
      : await readAtLeast(Number(responseHeaders.get("content-length") ?? 0));

    if ((responseHeaders.get("connection") ?? "").toLowerCase() === "close") {
      close();
    }

    return new Response(bytes.slice(), { status, headers: responseHeaders });
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export function typesafeFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (init?.signal?.aborted) {
    return Promise.reject(init.signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  const run = () => {
    if (init?.signal?.aborted) {
      return Promise.reject(
        init.signal.reason ?? new DOMException("Aborted", "AbortError"),
      );
    }
    return roundTrip(input, init);
  };
  const next = chain.then(run, run);
  chain = next.then(() => undefined, () => undefined);
  return next;
}
