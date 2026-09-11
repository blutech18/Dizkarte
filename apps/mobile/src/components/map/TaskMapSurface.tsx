import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import taskMarkerImage from "../../../assets/app-icon-square.png";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import Svg, { Path } from "react-native-svg";
import type { PublicTaskFeedItem } from "@dizkarte/domain";
import { fontSize, radii, spacing, theme } from "../../theme";
import { Icon } from "../ui/Icon";
import { TaskMapPreviewCard } from "./TaskMapPreviewCard";

export type TaskMapSurfaceProps = {
  readonly items: ReadonlyArray<PublicTaskFeedItem>;
  readonly onSelectTask: (taskId: string) => void;
  /**
   * The viewer's own approximate location, when they have opted in. Rendered as
   * a distinct "you are here" marker and included when framing the map.
   */
  readonly origin?: { readonly lat: number; readonly lng: number } | null;
};

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Metro Manila fallback view when nothing has coordinates yet. */
const FALLBACK_REGION: MapRegion = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.6,
  longitudeDelta: 0.6,
};

const TASK_MARKER_WIDTH = 44;
const TASK_MARKER_HEIGHT = 64;
const TASK_MARKER_NEEDLE_PATH = "M1.5 1H12.5L8.5 27C8.3 29 5.7 29 5.5 27Z";

/**
 * Native (Android/iOS) task map.
 *
 * A real `MapView` (react-native-maps: Apple Maps on iOS, Google Maps on
 * Android) with one marker per task at its PUBLIC `approximate` point — never an
 * exact address — plus an optional "you are here" marker. On layout it frames
 * every marker; tapping a marker opens a minimalist preview card or navigates
 * to the task details. The web build renders the equivalent view with
 * Leaflet/OpenStreetMap (`TaskMapSurface.web.tsx`) using the same shape.
 *
 * Provider notes: iOS uses Apple Maps and needs no key. Android uses Google
 * Maps, which needs the Client's Google Maps API key wired into a dev/production
 * build (the documented maps blocker); Expo Go supplies a dev key for testing.
 * No key is ever hard-coded here.
 */
export function TaskMapSurface({ items, onSelectTask, origin }: TaskMapSurfaceProps) {
  const mapRef = useRef<MapView | null>(null);
  const [selectedTask, setSelectedTask] = useState<PublicTaskFeedItem | null>(null);
  const selectedTaskRef = useRef<PublicTaskFeedItem | null>(null);
  selectedTaskRef.current = selectedTask;

  // Let custom marker images render before disabling view tracking for performance.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  const lastMarkerEventRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const points = useMemo(
    () =>
      items.filter(
        (task) => Number.isFinite(task.approximateLat) && Number.isFinite(task.approximateLng),
      ),
    [items],
  );

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 800);
    return () => clearTimeout(timer);
  }, [points]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const hasOrigin = !!origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng);
  const originLat = hasOrigin && origin ? origin.lat : null;
  const originLng = hasOrigin && origin ? origin.lng : null;

  const initialRegion = useMemo<MapRegion>(() => {
    if (originLat !== null && originLng !== null) {
      return { latitude: originLat, longitude: originLng, latitudeDelta: 0.2, longitudeDelta: 0.2 };
    }
    const first = points[0];
    if (first) {
      return {
        latitude: first.approximateLat,
        longitude: first.approximateLng,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      };
    }
    return FALLBACK_REGION;
  }, [originLat, originLng, points]);

  // Frame every marker (and the viewer) once the map is laid out, and again if
  // the set of points or the viewer origin changes.
  const fitToMarkers = useCallback(() => {
    const coords = points.map((task) => ({
      latitude: task.approximateLat,
      longitude: task.approximateLng,
    }));
    if (originLat !== null && originLng !== null) {
      coords.push({ latitude: originLat, longitude: originLng });
    }
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: {
          top: TASK_MARKER_HEIGHT + 16,
          right: TASK_MARKER_WIDTH + 8,
          bottom: TASK_MARKER_WIDTH + 8,
          left: TASK_MARKER_WIDTH + 8,
        },
        animated: false,
      });
    }
  }, [points, originLat, originLng]);

  useEffect(() => {
    fitToMarkers();
  }, [fitToMarkers]);

  const handleSelectTask = useCallback(
    (taskOrId: PublicTaskFeedItem | string) => {
      // Cancel any pending map tap dismiss
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }

      const taskId = typeof taskOrId === "string" ? taskOrId : taskOrId.id;
      const now = Date.now();
      const prev = lastMarkerEventRef.current;

      // Debounce duplicate events fired in rapid succession for the same tap
      // (e.g. MapView.onMarkerPress + Marker.onPress + onSelect firing within 350ms)
      if (prev.id === taskId && now - prev.time < 350) {
        return;
      }
      lastMarkerEventRef.current = { id: taskId, time: now };

      // If already selected, tapping again navigates to task details
      if (selectedTaskRef.current?.id === taskId) {
        onSelectTask(taskId);
        return;
      }

      const task =
        typeof taskOrId === "string" ? points.find((p) => p.id === taskId) : taskOrId;
      if (!task) return;

      setSelectedTask(task);
      mapRef.current?.animateToRegion(
        {
          latitude: task.approximateLat,
          longitude: task.approximateLng,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        300,
      );
    },
    [points, onSelectTask],
  );

  const handleMapPress = useCallback(() => {
    // If a marker was tapped within the last 400ms, ignore this map tap event!
    // On iOS Apple Maps, tapping an annotation also fires the map tap recognizer.
    if (Date.now() - lastMarkerEventRef.current.time < 400) {
      return;
    }

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }

    // Delay dismiss slightly in case the marker event delivers right after the map tap
    dismissTimerRef.current = setTimeout(() => {
      setSelectedTask(null);
      dismissTimerRef.current = null;
    }, 150);
  }, []);

  const isFarFromTasks = useMemo(() => {
    if (originLat === null || originLng === null || points.length === 0) return false;
    // Check distance to the first task roughly (> ~100 km away)
    const first = points[0]!;
    const dLat = Math.abs(first.approximateLat - originLat);
    const dLng = Math.abs(first.approximateLng - originLng);
    return dLat > 1 || dLng > 1;
  }, [originLat, originLng, points]);

  const handleJumpToTasks = useCallback(() => {
    if (points.length === 0) return;
    const coords = points.map((p) => ({
      latitude: p.approximateLat,
      longitude: p.approximateLng,
    }));
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: {
        top: TASK_MARKER_HEIGHT + 32,
        right: TASK_MARKER_WIDTH + 16,
        bottom: TASK_MARKER_WIDTH + 16,
        left: TASK_MARKER_WIDTH + 16,
      },
      animated: true,
    });
  }, [points]);

  return (
    <View style={styles.wrapper}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        onMapReady={fitToMarkers}
        onPress={handleMapPress}
        onMarkerPress={(e) => {
          const id = e.nativeEvent?.id;
          if (id) handleSelectTask(id);
        }}
        onMarkerSelect={(e) => {
          const id = e.nativeEvent?.id;
          if (id) handleSelectTask(id);
        }}
        accessibilityLabel="Task locations map"
      >
        {points.map((task) => {
          const isSelected = selectedTask?.id === task.id;
          return (
            <Marker
              key={task.id}
              identifier={task.id}
              coordinate={{ latitude: task.approximateLat, longitude: task.approximateLng }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={tracksViewChanges || isSelected}
              stopPropagation={true}
              accessibilityLabel={`${task.title}, approximate task location`}
              onPress={(e) => {
                e?.stopPropagation?.();
                handleSelectTask(task);
              }}
              onSelect={(e) => {
                e?.stopPropagation?.();
                handleSelectTask(task);
              }}
            >
              <View
                pointerEvents="none"
                style={[styles.taskMarker, isSelected ? styles.taskMarkerSelected : null]}
              >
                <Svg width={14} height={30} viewBox="0 0 14 30" style={styles.taskMarkerNeedle}>
                  <Path
                    d={TASK_MARKER_NEEDLE_PATH}
                    fill={isSelected ? theme.primary : theme.disabledForeground}
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M5.5 5L6.8 23"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    opacity={0.32}
                  />
                </Svg>
                <View
                  style={[
                    styles.taskMarkerImageFrame,
                    isSelected ? styles.taskMarkerImageFrameSelected : null,
                  ]}
                >
                  <Image source={taskMarkerImage} style={styles.taskMarkerImage} resizeMode="cover" />
                </View>
              </View>
            </Marker>
          );
        })}
        {originLat !== null && originLng !== null ? (
          <Marker
            coordinate={{ latitude: originLat, longitude: originLng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            accessibilityLabel="Your current location"
          >
            <View style={styles.userLocationOuter}>
              <View style={styles.userLocationHalo} />
              <View style={styles.userLocationDot} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {isFarFromTasks && !selectedTask ? (
        <Pressable
          style={({ pressed }) => [
            styles.jumpToTasksPill,
            pressed ? styles.jumpToTasksPillPressed : null,
          ]}
          onPress={handleJumpToTasks}
          accessibilityRole="button"
          accessibilityLabel={`View ${points.length} tasks in Metro Manila`}
        >
          <Icon name="map-pin" size={13} color={theme.primary} />
          <Text style={styles.jumpToTasksText} numberOfLines={1}>
            View tasks in Manila ({points.length})
          </Text>
          <Icon name="arrow-right" size={11} color={theme.primary} />
        </Pressable>
      ) : null}

      {selectedTask ? (
        <TaskMapPreviewCard
          task={selectedTask}
          onOpen={onSelectTask}
          onClose={() => {
            if (dismissTimerRef.current) {
              clearTimeout(dismissTimerRef.current);
              dismissTimerRef.current = null;
            }
            setSelectedTask(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.surfaceSubtle,
  },
  map: {
    flex: 1,
  },
  taskMarker: {
    width: TASK_MARKER_WIDTH,
    height: TASK_MARKER_HEIGHT,
    alignItems: "center",
  },
  taskMarkerNeedle: {
    position: "absolute",
    zIndex: 0,
    top: 34,
    left: 15,
  },
  taskMarkerImageFrame: {
    position: "absolute",
    zIndex: 1,
    top: 1,
    left: 1,
    width: 42,
    height: 42,
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    borderRadius: 21,
    backgroundColor: theme.primary,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    elevation: 5,
  },
  taskMarkerSelected: {
    transform: [{ scale: 1.12 }],
    zIndex: 999,
  },
  taskMarkerImageFrameSelected: {
    borderColor: theme.primary,
    borderWidth: 3,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  taskMarkerImage: {
    width: "100%",
    height: "100%",
  },
  userLocationOuter: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  userLocationHalo: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(59, 130, 246, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.4)",
  },
  userLocationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.infoSolid,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  jumpToTasksPill: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: 120,
    zIndex: 1100,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.surface,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  jumpToTasksPillPressed: {
    backgroundColor: theme.surfaceSubtle,
    transform: [{ scale: 0.98 }],
  },
  jumpToTasksText: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
  },
});
