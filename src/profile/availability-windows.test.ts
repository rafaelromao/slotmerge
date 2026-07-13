import { afterEach, describe, expect, it } from "vitest";

import {
  addWeeklyAvailabilityWindow,
  clearWeeklyAvailabilityWindowOverride,
  listWeeklyAvailabilityWindowsByUserId,
  removeWeeklyAvailabilityWindowById,
  setWeeklyAvailabilityWindowRepositoryForTests,
  type WeeklyAvailabilityWindow,
  type WeeklyAvailabilityWindowRepository,
  type CreateWeeklyAvailabilityWindow,
  type WeeklyAvailabilityWindowUpdate,
  updateWeeklyAvailabilityWindowById,
} from "./availability-windows";

class InMemoryWeeklyAvailabilityWindowRepository implements WeeklyAvailabilityWindowRepository {
  private readonly state = new Map<string, WeeklyAvailabilityWindow>();
  private nextId = 1;

  async add(
    userId: string,
    window: CreateWeeklyAvailabilityWindow,
    profileTimezone: string,
  ): Promise<WeeklyAvailabilityWindow> {
    await Promise.resolve();
    const id = `window-${this.nextId++}`;
    const now = new Date("2026-07-12T12:00:00.000Z");
    const record: WeeklyAvailabilityWindow = {
      id,
      userId,
      dayOfWeek: window.dayOfWeek,
      startTime: window.startTime,
      endTime: window.endTime,
      profileTimezone,
      createdAt: now,
      updatedAt: now,
    };
    this.state.set(id, record);
    return record;
  }

  async listByUserId(userId: string): Promise<WeeklyAvailabilityWindow[]> {
    await Promise.resolve();
    return [...this.state.values()].filter((w) => w.userId === userId);
  }

  async findById(
    id: string,
    userId: string,
  ): Promise<WeeklyAvailabilityWindow | null> {
    await Promise.resolve();
    const existing = this.state.get(id);
    if (!existing || existing.userId !== userId) {
      return null;
    }
    return existing;
  }

  async updateById(
    id: string,
    userId: string,
    updates: WeeklyAvailabilityWindowUpdate,
  ): Promise<WeeklyAvailabilityWindow | null> {
    await Promise.resolve();
    const existing = this.state.get(id);
    if (!existing || existing.userId !== userId) {
      return null;
    }
    const updated: WeeklyAvailabilityWindow = {
      ...existing,
      ...(updates.dayOfWeek !== undefined && { dayOfWeek: updates.dayOfWeek }),
      ...(updates.startTime !== undefined && { startTime: updates.startTime }),
      ...(updates.endTime !== undefined && { endTime: updates.endTime }),
      updatedAt: new Date("2026-07-12T12:00:00.000Z"),
    };
    this.state.set(id, updated);
    return updated;
  }

  async removeById(id: string, userId: string): Promise<boolean> {
    await Promise.resolve();
    const existing = this.state.get(id);
    if (!existing || existing.userId !== userId) {
      return false;
    }
    this.state.delete(id);
    return true;
  }
}

describe("weekly availability window repository", () => {
  afterEach(() => {
    clearWeeklyAvailabilityWindowOverride();
  });

  describe("add", () => {
    it("returns the created window with an id", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      const window = await addWeeklyAvailabilityWindow(
        "user-1",
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        },
        "America/New_York",
      );

      expect(window.id).toBeTruthy();
      expect(window.userId).toBe("user-1");
      expect(window.dayOfWeek).toBe(1);
      expect(window.startTime).toBe("09:00");
      expect(window.endTime).toBe("10:00");
      expect(window.profileTimezone).toBe("America/New_York");
      expect(window.createdAt).toBeInstanceOf(Date);
      expect(window.updatedAt).toBeInstanceOf(Date);
    });

    it("persists the window so it can be listed", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      await addWeeklyAvailabilityWindow(
        "user-1",
        {
          dayOfWeek: 2,
          startTime: "14:00",
          endTime: "15:30",
        },
        "Europe/Lisbon",
      );

      const windows = await listWeeklyAvailabilityWindowsByUserId("user-1");

      expect(windows).toHaveLength(1);
      expect(windows[0].dayOfWeek).toBe(2);
      expect(windows[0].startTime).toBe("14:00");
      expect(windows[0].endTime).toBe("15:30");
      expect(windows[0].profileTimezone).toBe("Europe/Lisbon");
    });
  });

  describe("listByUserId", () => {
    it("returns an empty list for a user with no windows", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      const windows =
        await listWeeklyAvailabilityWindowsByUserId("user-with-none");

      expect(windows).toHaveLength(0);
    });

    it("returns only windows belonging to the requested user", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      await addWeeklyAvailabilityWindow(
        "user-1",
        {
          dayOfWeek: 3,
          startTime: "08:00",
          endTime: "09:00",
        },
        "UTC",
      );
      await addWeeklyAvailabilityWindow(
        "user-2",
        {
          dayOfWeek: 4,
          startTime: "10:00",
          endTime: "11:00",
        },
        "UTC",
      );

      const user1Windows =
        await listWeeklyAvailabilityWindowsByUserId("user-1");
      const user2Windows =
        await listWeeklyAvailabilityWindowsByUserId("user-2");

      expect(user1Windows).toHaveLength(1);
      expect(user1Windows[0].dayOfWeek).toBe(3);
      expect(user2Windows).toHaveLength(1);
      expect(user2Windows[0].dayOfWeek).toBe(4);
    });
  });

  describe("updateById", () => {
    it("returns the updated window and reflects the changes", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      const created = await addWeeklyAvailabilityWindow(
        "user-1",
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        },
        "America/New_York",
      );

      const updated = await updateWeeklyAvailabilityWindowById(
        created.id,
        "user-1",
        {
          dayOfWeek: 5,
          startTime: "16:00",
          endTime: "17:00",
        },
      );

      expect(updated).not.toBeNull();
      expect(updated!.dayOfWeek).toBe(5);
      expect(updated!.startTime).toBe("16:00");
      expect(updated!.endTime).toBe("17:00");
      expect(updated!.profileTimezone).toBe("America/New_York");
    });

    it("returns null when window does not exist", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      const result = await updateWeeklyAvailabilityWindowById(
        "nonexistent-id",
        "user-1",
        {
          dayOfWeek: 3,
        },
      );

      expect(result).toBeNull();
    });

    it("returns null when window belongs to a different user", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      const created = await addWeeklyAvailabilityWindow(
        "user-1",
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        },
        "UTC",
      );

      const result = await updateWeeklyAvailabilityWindowById(
        created.id,
        "user-2",
        {
          dayOfWeek: 3,
        },
      );

      expect(result).toBeNull();
    });
  });

  describe("removeById", () => {
    it("returns true when the window is deleted", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      const created = await addWeeklyAvailabilityWindow(
        "user-1",
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        },
        "UTC",
      );

      const removed = await removeWeeklyAvailabilityWindowById(
        created.id,
        "user-1",
      );

      expect(removed).toBe(true);
      const windows = await listWeeklyAvailabilityWindowsByUserId("user-1");
      expect(windows).toHaveLength(0);
    });

    it("returns false when window does not exist", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      const removed = await removeWeeklyAvailabilityWindowById(
        "nonexistent-id",
        "user-1",
      );

      expect(removed).toBe(false);
    });

    it("returns false when window belongs to a different user", async () => {
      const repo = new InMemoryWeeklyAvailabilityWindowRepository();
      setWeeklyAvailabilityWindowRepositoryForTests(repo);

      const created = await addWeeklyAvailabilityWindow(
        "user-1",
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        },
        "UTC",
      );

      const removed = await removeWeeklyAvailabilityWindowById(
        created.id,
        "user-2",
      );

      expect(removed).toBe(false);
      const windows = await listWeeklyAvailabilityWindowsByUserId("user-1");
      expect(windows).toHaveLength(1);
    });
  });
});
