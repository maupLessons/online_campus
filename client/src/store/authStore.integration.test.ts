import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";

type Request = {
  config: InternalAxiosRequestConfig;
  resolve: (response: AxiosResponse) => void;
  reject: (error: unknown) => void;
};

let api: typeof import("../services/api").default;
let store: typeof import("./authStore").useAuthStore;
let requests: Request[];

function principal(id: string): User {
  return {
    id,
    login: id,
    firstName: "Test",
    lastName: id,
    email: `${id}@example.test`,
    role: "student",
    status: "active",
  };
}

function reply(request: Request, data: unknown = {}, status = 200) {
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
  } else request.resolve(response);
}

async function countRequests(count: number) {
  await vi.waitFor(() => expect(requests).toHaveLength(count), { interval: 1 });
}

beforeEach(async () => {
  vi.resetModules();
  requests = [];
  ({ default: api } = await import("../services/api"));
  ({ useAuthStore: store } = await import("./authStore"));
  api.defaults.adapter = (config) =>
    new Promise<AxiosResponse>((resolve, reject) => {
      requests.push({ config, resolve, reject });
    });
});

afterEach(() => store.getState().expireSession());

describe("auth store and HTTP session integration", () => {
  it("releases bootstrap loading and private state when the profile request times out", async () => {
    const previousClient = store.getState().queryClient;
    previousClient.setQueryData(["courses"], ["outdated-private-data"]);
    const initialization = store.getState().initializeAuth();
    await countRequests(1);
    expect(store.getState().isLoading).toBe(true);
    expect(requests[0].config.url).toBe("/auth/profile");
    expect(requests[0].config.timeout).toBe(20_000);

    requests[0].reject(
      new AxiosError("Transport timeout", "ECONNABORTED", requests[0].config),
    );
    await initialization;

    expect(store.getState().isLoading).toBe(false);
    expect(store.getState().isAuthChecked).toBe(true);
    expect(store.getState().user).toBeNull();
    expect(store.getState().isAuthenticated).toBe(false);
    expect(previousClient.getQueryCache().getAll()).toHaveLength(0);
    const login = store.getState().login("A", "test-password");
    await countRequests(2);
    reply(requests[1], { user: principal("A") });
    await login;
    expect(store.getState().user).toEqual(principal("A"));
  });

  it("isolates a complete A to B transition while old requests and logout settle", async () => {
    const userA = principal("A");
    const userB = principal("B");
    const loginA = store.getState().login(userA.login, "test-password");
    await countRequests(1);
    reply(requests[0], { user: userA });
    await loginA;
    const previousClient = store.getState().queryClient;
    previousClient.setQueryData(["courses"], ["private-course-A"]);
    const oldRequest = api.get("/courses").catch((error: unknown) => error);
    await countRequests(2);
    const oldSignal = requests[1].config.signal;

    const logout = store
      .getState()
      .logout()
      .catch((error: unknown) => error);
    expect(store.getState().user).toBeNull();
    expect(oldSignal?.aborted).toBe(true);
    const loginB = store.getState().login(userB.login, "test-password");
    await countRequests(3);
    expect(requests[2].config.url).toBe("/auth/logout");
    reply(requests[1], ["private-course-A"]);
    reply(requests[2]);
    await countRequests(4);
    expect(requests[3].config.url).toBe("/auth/login");
    reply(requests[3], { user: userB });
    await loginB;
    await logout;

    expect(axios.isCancel(await oldRequest)).toBe(true);
    expect(store.getState().user).toEqual(userB);
    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().queryClient).not.toBe(previousClient);
    expect(
      store.getState().queryClient.getQueryData(["courses"]),
    ).toBeUndefined();
    expect(previousClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("completes logout after an obsolete pending login without restoring authentication", async () => {
    const login = store
      .getState()
      .login("A", "test-password")
      .catch((error: unknown) => error);
    await countRequests(1);
    const logout = store.getState().logout();
    expect(requests).toHaveLength(1);

    reply(requests[0], { user: principal("A") });
    await countRequests(2);
    expect(requests[1].config.url).toBe("/auth/logout");
    reply(requests[1]);
    await logout;

    expect(axios.isCancel(await login)).toBe(true);
    expect(store.getState().user).toBeNull();
    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().isLoading).toBe(false);
  });

  it("allows same-session refresh and retry after a successful store login", async () => {
    const userA = principal("A");
    const login = store.getState().login(userA.login, "test-password");
    await countRequests(1);
    reply(requests[0], { user: userA });
    await login;
    const currentClient = store.getState().queryClient;

    const courses = api.get("/courses");
    await countRequests(2);
    reply(requests[1], {}, 401);
    await countRequests(3);
    expect(requests[2].config.url).toBe("/auth/refresh");
    reply(requests[2]);
    await countRequests(4);
    reply(requests[3], ["private-course-A"]);

    expect((await courses).data).toEqual(["private-course-A"]);
    expect(store.getState().user).toEqual(userA);
    expect(store.getState().queryClient).toBe(currentClient);
  });
});
