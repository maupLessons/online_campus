import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PendingRequest = {
  config: InternalAxiosRequestConfig;
  resolve: (response: AxiosResponse) => void;
  reject: (error: unknown) => void;
};

let api: typeof import("./api").default;
let invalidateApiSession: typeof import("./api").invalidateApiSession;
let requests: PendingRequest[];
let dispatchEvent: ReturnType<typeof vi.fn>;
let locationReplace: ReturnType<typeof vi.fn>;
let cookieDocument: { cookie: string };

beforeEach(async () => {
  vi.resetModules();
  requests = [];
  dispatchEvent = vi.fn();
  locationReplace = vi.fn();
  cookieDocument = { cookie: "campus_csrf_token=initial-token" };
  vi.stubGlobal("document", cookieDocument);
  vi.stubGlobal("window", {
    location: {
      origin: "https://campus.example.test",
      pathname: "/dashboard",
      replace: locationReplace,
    },
    dispatchEvent,
  });
  vi.stubGlobal("localStorage", { removeItem: vi.fn() });
  ({ default: api, invalidateApiSession } = await import("./api"));
  // The real Axios request/response pipeline remains active. Only transport is
  // replaced, intentionally allowing late replies from an abort-ignoring server.
  api.defaults.adapter = (config) =>
    new Promise<AxiosResponse>((resolve, reject) => {
      requests.push({ config, resolve, reject });
    });
});

afterEach(() => {
  invalidateApiSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function reply(request: PendingRequest, data: unknown = {}, status = 200) {
  const response: AxiosResponse = {
    config: request.config,
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    headers: new AxiosHeaders(),
    data,
  };
  if (status >= 400) {
    request.reject(
      new AxiosError(
        "Request rejected",
        "ERR_BAD_RESPONSE",
        request.config,
        undefined,
        response,
      ),
    );
  } else {
    request.resolve(response);
  }
}

async function waitForRequests(count: number) {
  await vi.waitFor(() => expect(requests).toHaveLength(count), { interval: 1 });
}

describe("session-scoped API requests", () => {
  it("aborts protected requests and rejects late success from a previous session", async () => {
    const outcome = api.get("/courses").catch((error: unknown) => error);
    await waitForRequests(1);
    const signal = requests[0].config.signal;

    invalidateApiSession();
    expect(signal?.aborted).toBe(true);
    reply(requests[0], ["private-course-A"]);

    expect(axios.isCancel(await outcome)).toBe(true);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("does not refresh or expire a new session for a stale unauthorized response", async () => {
    const outcome = api.get("/courses").catch((error: unknown) => error);
    await waitForRequests(1);

    invalidateApiSession();
    reply(requests[0], {}, 401);

    expect(axios.isCancel(await outcome)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
  });

  it("captures the session synchronously before a same-tick transition", async () => {
    const outcome = api.get("/courses").catch((error: unknown) => error);
    invalidateApiSession();
    await waitForRequests(1);
    reply(requests[0], ["private-course-A"]);

    expect(axios.isCancel(await outcome)).toBe(true);
  });

  it("preserves caller cancellation while adding session cancellation", async () => {
    const controller = new AbortController();
    const outcome = api
      .get("/courses", { signal: controller.signal })
      .catch((error: unknown) => error);
    await waitForRequests(1);
    const transportSignal = requests[0].config.signal;

    controller.abort();
    expect(transportSignal?.aborted).toBe(true);
    reply(requests[0]);

    expect(axios.isCancel(await outcome)).toBe(true);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("coalesces concurrent unauthorized requests into one refresh and retries both", async () => {
    const courses = api.get("/courses");
    const users = api.get("/users");
    await waitForRequests(2);
    reply(requests[0], {}, 401);
    reply(requests[1], {}, 401);
    await waitForRequests(3);
    expect(requests[2].config.url).toBe("/auth/refresh");
    reply(requests[2]);
    await waitForRequests(5);
    expect(
      requests
        .slice(3)
        .map(({ config }) => config.url)
        .sort(),
    ).toEqual(["/courses", "/users"]);

    for (const request of requests.slice(3))
      reply(request, { path: request.config.url });

    expect((await courses).data).toEqual({ path: "/courses" });
    expect((await users).data).toEqual({ path: "/users" });
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(requests[2].config.timeout).toBe(20_000);
    expect(
      requests
        .filter(({ config }) => config.url !== "/auth/refresh")
        .every(({ config }) => config.timeout === 0),
    ).toBe(true);
  });

  it("does not replay an old request or expire a new login after an old refresh fails", async () => {
    const oldRequest = api.get("/courses").catch((error: unknown) => error);
    await waitForRequests(1);
    reply(requests[0], {}, 401);
    await waitForRequests(2);
    expect(requests[1].config.url).toBe("/auth/refresh");

    invalidateApiSession();
    const login = api.post("/auth/login", {
      login: "B",
      password: "test-password",
    });
    reply(requests[1], {}, 401);
    await waitForRequests(3);
    expect(requests[2].config.url).toBe("/auth/login");
    reply(requests[2], { user: { id: "B" } });

    expect(axios.isCancel(await oldRequest)).toBe(true);
    expect((await login).data).toEqual({ user: { id: "B" } });
    expect(requests).toHaveLength(3);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
  });

  it("expires the current session once when refresh is unauthorized", async () => {
    const outcome = api.get("/courses").catch((error: unknown) => error);
    await waitForRequests(1);
    reply(requests[0], {}, 401);
    await waitForRequests(2);
    reply(requests[1], {}, 401);
    await outcome;

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(locationReplace).toHaveBeenCalledWith("/login");
    expect(requests).toHaveLength(2);
  });

  it("keeps a new refresh single-flight when an obsolete refresh settles", async () => {
    const oldRequest = api.get("/old-courses").catch((error: unknown) => error);
    await waitForRequests(1);
    reply(requests[0], {}, 401);
    await waitForRequests(2);

    invalidateApiSession();
    const newRequest = api.get("/new-courses");
    await waitForRequests(3);
    reply(requests[2], {}, 401);
    reply(requests[1], {}, 401);
    await waitForRequests(4);
    expect(requests[3].config.url).toBe("/auth/refresh");
    expect(axios.isCancel(await oldRequest)).toBe(true);

    const otherRequest = api.get("/users");
    await waitForRequests(5);
    reply(requests[4], {}, 401);
    reply(requests[3]);
    await waitForRequests(7);
    expect(
      requests.filter(({ config }) => config.url === "/auth/refresh"),
    ).toHaveLength(2);
    for (const request of requests.slice(5)) reply(request);
    await Promise.all([newRequest, otherRequest]);

    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});

describe("cookie-writing authentication requests", () => {
  it("executes login A, logout and login B in order without aborting cookie writers", async () => {
    const loginA = api
      .post("/auth/login", { login: "A" })
      .catch((error: unknown) => error);
    await waitForRequests(1);

    invalidateApiSession();
    const logout = api
      .post("/auth/logout", {})
      .catch((error: unknown) => error);
    invalidateApiSession();
    const loginB = api.post("/auth/login", { login: "B" }, { timeout: 5_000 });
    expect(requests).toHaveLength(1);
    expect(requests[0].config.signal?.aborted).not.toBe(true);
    expect(requests[0].config.timeout).toBe(20_000);

    cookieDocument.cookie = "campus_csrf_token=token-from-A";
    reply(requests[0], { user: { id: "A" } });
    await waitForRequests(2);
    expect(requests[1].config.url).toBe("/auth/logout");
    expect(requests[1].config.headers.get("X-CSRF-Token")).toBe("token-from-A");

    cookieDocument.cookie = "";
    reply(requests[1]);
    await waitForRequests(3);
    expect(requests[2].config.url).toBe("/auth/login");
    expect(requests[2].config.timeout).toBe(5_000);
    expect(requests[2].config.headers.has("X-CSRF-Token")).toBe(false);
    reply(requests[2], { user: { id: "B" } });

    expect(axios.isCancel(await loginA)).toBe(true);
    expect(axios.isCancel(await logout)).toBe(true);
    expect((await loginB).data).toEqual({ user: { id: "B" } });
  });

  it("releases the cookie queue after a failed authentication request", async () => {
    const login = api
      .post("/auth/login", { login: "A" })
      .catch((error: unknown) => error);
    const logout = api.post("/auth/logout", {});
    await waitForRequests(1);
    requests[0].reject(
      new AxiosError("Transport timeout", "ECONNABORTED", requests[0].config),
    );
    await waitForRequests(2);
    expect(requests[1].config.url).toBe("/auth/logout");
    reply(requests[1]);

    expect(await login).toBeInstanceOf(Error);
    expect((await logout).status).toBe(200);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("discards an obsolete queued refresh without blocking the next logout", async () => {
    const post = vi.spyOn(api, "post");
    const login = api
      .post("/auth/login", { login: "A" })
      .catch((error: unknown) => error);
    await waitForRequests(1);
    const protectedRequest = api
      .get("/courses")
      .catch((error: unknown) => error);
    await waitForRequests(2);
    reply(requests[1], {}, 401);
    await vi.waitFor(
      () => expect(post).toHaveBeenCalledWith("/auth/refresh", {}),
      { interval: 1 },
    );

    invalidateApiSession();
    const logout = api.post("/auth/logout", {});
    reply(requests[0]);
    await waitForRequests(3);
    expect(requests[2].config.url).toBe("/auth/logout");
    reply(requests[2]);

    expect(axios.isCancel(await login)).toBe(true);
    expect(axios.isCancel(await protectedRequest)).toBe(true);
    await logout;
    expect(requests.some(({ config }) => config.url === "/auth/refresh")).toBe(
      false,
    );
  });
});
