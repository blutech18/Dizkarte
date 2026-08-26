import { ClientMyTasks } from "../../src/components/task/ClientMyTasks";

/**
 * My Tasks tab — the Client's own posted tasks and their status.
 *
 * Every registered, verified user can post tasks, so this tab is always present
 * regardless of Tasker approval. Finding work to do lives on the separate
 * "Browse" tab.
 */
export default function MyTasksScreen() {
  return <ClientMyTasks />;
}
