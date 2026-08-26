import { describe, expect, it } from "vitest";
import type { TaskId } from "@dizkarte/domain";
import { resolveTaskCardDestination, type OwnedTaskLookup } from "./taskCardNavigation";

const TASK_ID = "10000000-0000-4000-8000-000000000001" as TaskId;
const VIEWER_ID = "20000000-0000-4000-8000-000000000001";

describe("resolveTaskCardDestination", () => {
  it("opens the public route immediately when there is no signed-in viewer", async () => {
    let lookupCount = 0;
    const repository: OwnedTaskLookup = {
      getOwnedTask: async () => {
        lookupCount += 1;
        return { id: TASK_ID };
      },
    };

    await expect(resolveTaskCardDestination(repository, TASK_ID, null)).resolves.toBe("public");
    expect(lookupCount).toBe(0);
  });

  it("opens the owned workspace when the protected lookup finds the task", async () => {
    const repository: OwnedTaskLookup = {
      getOwnedTask: async (taskId, viewerId) => {
        expect(taskId).toBe(TASK_ID);
        expect(viewerId).toBe(VIEWER_ID);
        return { id: taskId };
      },
    };

    await expect(resolveTaskCardDestination(repository, TASK_ID, VIEWER_ID)).resolves.toBe("owned");
  });

  it("opens the public detail when the viewer does not own the task", async () => {
    const repository: OwnedTaskLookup = {
      getOwnedTask: async () => null,
    };

    await expect(resolveTaskCardDestination(repository, TASK_ID, VIEWER_ID)).resolves.toBe(
      "public",
    );
  });

  it("propagates lookup failures so navigation does not start on an unknown route", async () => {
    const repository: OwnedTaskLookup = {
      getOwnedTask: async () => {
        throw new Error("offline");
      },
    };

    await expect(resolveTaskCardDestination(repository, TASK_ID, VIEWER_ID)).rejects.toThrow(
      "offline",
    );
  });
});
