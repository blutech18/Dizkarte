import { useSession } from "../../src/providers/SessionProvider";
import { isApprovedTasker } from "../../src/services/session-types";
import { TaskerDiscoveryFeed } from "../../src/components/task/TaskerDiscoveryFeed";
import { TaskerApplicationPrompt } from "../../src/components/task/TaskerApplicationPrompt";

/**
 * Browse tab — the Tasker "find work" surface, always present.
 *
 * An approved Tasker gets the live discovery feed; everyone else is shown the
 * application on-ramp, so the tab doubles as the "become a Tasker" entry point
 * and mirrors Airtasker's always-visible Browse tab. Posting and managing your
 * own tasks lives on the separate "My Tasks" tab.
 */
export default function BrowseScreen() {
  const { session } = useSession();
  if (isApprovedTasker(session)) {
    return <TaskerDiscoveryFeed />;
  }
  return <TaskerApplicationPrompt />;
}
