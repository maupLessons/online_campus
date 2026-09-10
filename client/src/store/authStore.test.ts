import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../services/api", () => ({
  default: apiMock,
  invalidateApiSession: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function user(id: string): User {
  return {
    id,
    login: `student-${id}`,
    role: "student",
    email: `student-${id}@example.test`,
    firstName: "Test",
    lastName: id,
    status: "active",
  };
}

const userA = user("A");
const userB = user("B");
const coursesKey = ["courses"];

let authStore: typeof import("./authStore").useAuthStore;

async function loginAs(principal: User) {
  apiMock.post.mockResolvedValueOnce({ data: { user: principal } });
  await authStore.getState().login(principal.login, "test-password");
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  ({ useAuthStore: authStore } = await import("./authStore"));
});

afterEach(() => {
  authStore.getState().queryClient.clear();
});

describe("authentication cache isolation", () => {
  it("does not expose user A's cached courses after user B signs in", async () => {
    await loginAs(userA);
    const previous = authStore.getState();
    previous.queryClient.setQueryData(coursesKey, ["private-course-A"]);
    previous.queryClient.getMutationCache().build(previous.queryClient, {
      mutationKey: ["private-material-A"],
      mutationFn: async () => "private-result-A",
    });

    apiMock.post.mockResolvedValueOnce({ data: {} });
    await authStore.getState().logout();
    await loginAs(userB);

    const current = authStore.getState();
    expect(current.user).toEqual(userB);
    expect(current.queryClient).not.toBe(previous.queryClient);
    expect(current.sessionVersion).toBeGreaterThan(previous.sessionVersion);
    expect(current.queryClient.getQueryData(coursesKey)).toBeUndefined();
    expect(previous.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(previous.queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("clears private data immediately even if the logout request fails", async () => {
    await loginAs(userA);
    const previousClient = authStore.getState().queryClient;
    previousClient.setQueryData(coursesKey, ["private-course-A"]);
    const request = deferred<{ data: unknown }>();
    apiMock.post.mockReturnValueOnce(request.promise);

    const logout = authStore.getState().logout();
    const outcome = logout.catch((error: unknown) => error);

    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(authStore.getState().queryClient).not.toBe(previousClient);
    expect(previousClient.getQueryData(coursesKey)).toBeUndefined();

    request.reject(new Error("Network unavailable"));
    await outcome;

    expect(authStore.getState().user).toBeNull();
    expect(
      authStore.getState().queryClient.getQueryData(coursesKey),
    ).toBeUndefined();
  });

  it("replaces private caches when the session expires", async () => {
    await loginAs(userA);
    const previous = authStore.getState();
    previous.queryClient.setQueryData(coursesKey, ["private-course-A"]);

    authStore.getState().expireSession();

    const current = authStore.getState();
    expect(current.user).toBeNull();
    expect(current.isAuthenticated).toBe(false);
    expect(current.queryClient).not.toBe(previous.queryClient);
    expect(current.sessionVersion).toBeGreaterThan(previous.sessionVersion);
    expect(previous.queryClient.getQueryData(coursesKey)).toBeUndefined();
  });

  it("isolates a previous query's late result even if it ignores cancellation", async () => {
    await loginAs(userA);
    const previousClient = authStore.getState().queryClient;
    const request = deferred<string[]>();
    const previousQuery = previousClient.fetchQuery({
      queryKey: coursesKey,
      queryFn: () => request.promise,
      retry: false,
    });
    const outcome = previousQuery.catch(() => undefined);

    apiMock.post.mockResolvedValueOnce({ data: {} });
    await authStore.getState().logout();
    await loginAs(userB);
    const currentClient = authStore.getState().queryClient;
    currentClient.setQueryData(coursesKey, ["private-course-B"]);

    request.resolve(["private-course-A"]);
    await outcome;
    await request.promise;

    expect(currentClient.getQueryData(coursesKey)).toEqual([
      "private-course-B",
    ]);
    expect(previousClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does not reuse caches when login replaces an existing principal", async () => {
    await loginAs(userA);
    const previousClient = authStore.getState().queryClient;
    previousClient.setQueryData(coursesKey, ["private-course-A"]);

    await loginAs(userB);

    expect(authStore.getState().queryClient).not.toBe(previousClient);
    expect(
      authStore.getState().queryClient.getQueryData(coursesKey),
    ).toBeUndefined();
    expect(previousClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("resets private caches when profile loading changes the principal", async () => {
    await loginAs(userA);
    const previous = authStore.getState();
    previous.queryClient.setQueryData(coursesKey, ["private-course-A"]);
    apiMock.get.mockResolvedValueOnce({ data: userB });

    await authStore.getState().loadProfile();

    const current = authStore.getState();
    expect(current.user).toEqual(userB);
    expect(current.queryClient).not.toBe(previous.queryClient);
    expect(current.sessionVersion).toBeGreaterThan(previous.sessionVersion);
    expect(current.queryClient.getQueryData(coursesKey)).toBeUndefined();
  });

  it("resets private caches when the same principal's permissions change", async () => {
    await loginAs({ ...userA, role: "admin" });
    const previous = authStore.getState();
    previous.queryClient.setQueryData(["users"], ["admin-only-data"]);
    apiMock.get.mockResolvedValueOnce({ data: userA });

    await authStore.getState().loadProfile();

    const current = authStore.getState();
    expect(current.user?.role).toBe("student");
    expect(current.queryClient).not.toBe(previous.queryClient);
    expect(current.queryClient.getQueryData(["users"])).toBeUndefined();
    expect(previous.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("clears the session when the current profile request returns unauthorized", async () => {
    await loginAs(userA);
    const previousClient = authStore.getState().queryClient;
    previousClient.setQueryData(coursesKey, ["private-course-A"]);
    apiMock.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    });

    await authStore
      .getState()
      .loadProfile()
      .catch(() => undefined);

    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(previousClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("authentication response races", () => {
  it("does not start profile loading or restore identity during a pending logout", async () => {
    await loginAs(userA);
    const request = deferred<{ data: unknown }>();
    apiMock.post.mockReturnValueOnce(request.promise);
    apiMock.get.mockResolvedValueOnce({ data: userA });
    const logout = authStore.getState().logout();

    await authStore.getState().loadProfile();

    expect(apiMock.get).not.toHaveBeenCalled();
    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().isAuthenticated).toBe(false);
    request.resolve({ data: {} });
    await logout;
    await authStore.getState().loadProfile();
    expect(apiMock.get).not.toHaveBeenCalled();
    expect(authStore.getState().user).toBeNull();
  });

  it("does not start profile loading during a pending explicit login", async () => {
    const request = deferred<{ data: { user: User } }>();
    apiMock.post.mockReturnValueOnce(request.promise);
    const login = authStore.getState().login(userA.login, "test-password");

    await authStore.getState().loadProfile();

    expect(apiMock.get).not.toHaveBeenCalled();
    expect(authStore.getState().user).toBeNull();
    request.resolve({ data: { user: userA } });
    await login;
    expect(authStore.getState().user).toEqual(userA);
  });

  it("ignores an earlier profile response after logout and a new login", async () => {
    await loginAs(userA);
    const request = deferred<{ data: User }>();
    apiMock.get.mockReturnValueOnce(request.promise);
    const profile = authStore.getState().loadProfile();

    apiMock.post.mockResolvedValueOnce({ data: {} });
    await authStore.getState().logout();
    await loginAs(userB);
    const current = authStore.getState();

    request.resolve({ data: userA });
    await profile;

    expect(authStore.getState().user).toEqual(userB);
    expect(authStore.getState().queryClient).toBe(current.queryClient);
    expect(authStore.getState().sessionVersion).toBe(current.sessionVersion);
  });

  it("does not restore a logged-out session from a pending initialization", async () => {
    const request = deferred<{ data: User }>();
    apiMock.get.mockReturnValueOnce(request.promise);
    const initialization = authStore.getState().initializeAuth();

    apiMock.post.mockResolvedValueOnce({ data: {} });
    await authStore.getState().logout();
    const current = authStore.getState();
    request.resolve({ data: userA });
    await initialization;

    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(authStore.getState().queryClient).toBe(current.queryClient);
  });

  it("does not clear a newer session after an earlier initialization fails", async () => {
    const request = deferred<{ data: User }>();
    apiMock.get.mockReturnValueOnce(request.promise);
    const initialization = authStore.getState().initializeAuth();

    await loginAs(userB);
    const current = authStore.getState();
    request.reject(new Error("Stale profile failure"));
    await initialization;

    expect(authStore.getState().user).toEqual(userB);
    expect(authStore.getState().isAuthenticated).toBe(true);
    expect(authStore.getState().queryClient).toBe(current.queryClient);
  });

  it("does not start duplicate initialization requests", async () => {
    const request = deferred<{ data: User }>();
    apiMock.get.mockReturnValueOnce(request.promise);

    const initialization = authStore.getState().initializeAuth();
    await authStore.getState().initializeAuth();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
    request.resolve({ data: userA });
    await initialization;
    await authStore.getState().initializeAuth();

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(authStore.getState().user).toEqual(userA);
  });

  it("accepts only the newest of overlapping profile requests", async () => {
    await loginAs(userA);
    const olderRequest = deferred<{ data: User }>();
    const newerRequest = deferred<{ data: User }>();
    apiMock.get.mockReturnValueOnce(olderRequest.promise);
    apiMock.get.mockReturnValueOnce(newerRequest.promise);
    const olderProfile = authStore.getState().loadProfile();
    const newerProfile = authStore.getState().loadProfile();

    newerRequest.resolve({ data: userB });
    await newerProfile;
    const current = authStore.getState();
    olderRequest.resolve({ data: userA });
    await olderProfile;

    expect(authStore.getState().user).toEqual(userB);
    expect(authStore.getState().queryClient).toBe(current.queryClient);
  });

  it("does not expire a newer session because an old profile request returns unauthorized", async () => {
    await loginAs(userA);
    const request = deferred<{ data: User }>();
    apiMock.get.mockReturnValueOnce(request.promise);
    const profile = authStore
      .getState()
      .loadProfile()
      .catch(() => undefined);

    await loginAs(userB);
    const current = authStore.getState();
    request.reject({ isAxiosError: true, response: { status: 401 } });
    await profile;

    expect(authStore.getState().user).toEqual(userB);
    expect(authStore.getState().isAuthenticated).toBe(true);
    expect(authStore.getState().queryClient).toBe(current.queryClient);
  });

  it("does not restore a session when an earlier login succeeds after logout", async () => {
    const request = deferred<{ data: { user: User } }>();
    apiMock.post.mockReturnValueOnce(request.promise);
    const login = authStore.getState().login(userA.login, "test-password");

    apiMock.post.mockResolvedValueOnce({ data: {} });
    await authStore.getState().logout();
    const current = authStore.getState();
    request.resolve({ data: { user: userA } });
    await login;

    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(authStore.getState().queryClient).toBe(current.queryClient);
  });

  it("does not restore a session when a pending profile returns after expiry", async () => {
    await loginAs(userA);
    const request = deferred<{ data: User }>();
    apiMock.get.mockReturnValueOnce(request.promise);
    const profile = authStore.getState().loadProfile();

    authStore.getState().expireSession();
    request.resolve({ data: userA });
    await profile;

    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().isAuthenticated).toBe(false);
  });

  it("does not let a late logout response clear a newer login", async () => {
    await loginAs(userA);
    const request = deferred<{ data: unknown }>();
    apiMock.post.mockReturnValueOnce(request.promise);
    const logout = authStore.getState().logout();

    await loginAs(userB);
    const current = authStore.getState();
    request.resolve({ data: {} });
    await logout;

    expect(authStore.getState().user).toEqual(userB);
    expect(authStore.getState().isAuthenticated).toBe(true);
    expect(authStore.getState().queryClient).toBe(current.queryClient);
  });

  it("does not overwrite a newer session with an earlier login failure", async () => {
    const request = deferred<{ data: { user: User } }>();
    apiMock.post.mockReturnValueOnce(request.promise);
    const login = authStore.getState().login(userA.login, "test-password");
    const outcome = login.catch((error: unknown) => error);

    await loginAs(userB);
    const current = authStore.getState();
    request.reject(new Error("Stale login failure"));
    await outcome;

    expect(authStore.getState().user).toEqual(userB);
    expect(authStore.getState().error).toBeNull();
    expect(authStore.getState().queryClient).toBe(current.queryClient);
  });
});
