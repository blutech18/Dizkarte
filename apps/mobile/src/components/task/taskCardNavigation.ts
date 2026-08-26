import type { TaskId } from "@dizkarte/domain";

export type TaskCardDestination = "public" | "owned";

export type OwnedTaskLookup = {
  readonly getOwnedTask: (taskId: TaskId, viewerId: string) => Promise<unknown | null>;
};

/**
 * Resolve the final task-card destination before navigation starts.
 *
 * Ownership is intentionally checked through the authenticated repository
 * rather than inferred from the public feed, whose privacy contract excludes
 * `clientId`. Backend/RLS errors are allowed to propagate so callers can keep
 * the user on the current screen instead of falling into a second redirect.
 */
export async function resolveTaskCardDestination(
  repository: OwnedTaskLookup,
  taskId: TaskId,
  viewerId: string | null,
): Promise<TaskCardDestination> {
  if (!viewerId) return "public";
  const owned = await repository.getOwnedTask(taskId, viewerId);
  return owned ? "owned" : "public";
}
