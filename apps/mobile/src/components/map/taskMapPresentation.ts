import type { PublicTaskFeedItem } from "@dizkarte/domain";

export function taskTimingLabel(task: PublicTaskFeedItem): string {
  if (task.sameDay) return "Needed today";
  if (!task.scheduledFor) return "Flexible schedule";
  const scheduled = new Date(task.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) return "Flexible schedule";
  const weekday = scheduled.toLocaleDateString("en-US", { weekday: "short" });
  const datePart = scheduled.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${weekday}, ${datePart}`;
}

export function distanceLabel(distanceMeters: number | null): string | null {
  if (distanceMeters === null) return null;
  if (distanceMeters < 1000) return `${Math.max(100, distanceMeters)} m away`;
  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}
