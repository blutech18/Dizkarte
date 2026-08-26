import { useCallback, useEffect, useMemo, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import taskMarkerImage from "../../../assets/app-icon-square.png";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import Svg, { Path } from "react-native-svg";
import type { PublicTaskFeedItem } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { theme } from "../../theme";

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
 * every marker; tapping a marker's callout opens that task. The web build
 * renders the equivalent view with Leaflet/OpenStreetMap
 * (`TaskMapSurface.web.tsx`) using the same `PublicTaskFeedItem` shape.
 *
 * Provider notes: iOS uses Apple Maps and needs no key. Android uses Google
 * Maps, which needs the Client's Google Maps API key wired into a dev/production
 * build (the documented maps blocker); Expo Go supplies a dev key for testing.
 * No key is ever hard-coded here.
 */
export function TaskMapSurface({ items, onSelectTask, origin }: TaskMapSurfaceProps) {
  const mapRef = useRef<MapView | null>(null);

  const points = useMemo(
    () =>
      items.filter(
        (task) => Number.isFinite(task.approximateLat) && Number.isFinite(task.approximateLng),
      ),
    [items],
  );

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

  return (
    <View style={styles.wrapper}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        onMapReady={fitToMarkers}
        accessibilityLabel="Task locations map"
      >
        {points.map((task) => (
          <Marker
            key={task.id}
            coordinate={{ latitude: task.approximateLat, longitude: task.approximateLng }}
            title={task.title}
            description={markerSubtitle(task)}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            accessibilityLabel={`${task.title}, approximate task location`}
            onCalloutPress={() => onSelectTask(task.id)}
          >
            <View style={styles.taskMarker}>
              <Svg width={14} height={30} viewBox="0 0 14 30" style={styles.taskMarkerNeedle}>
                <Path
                  d={TASK_MARKER_NEEDLE_PATH}
                  fill={theme.disabledForeground}
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
              <View style={styles.taskMarkerImageFrame}>
                <Image source={taskMarkerImage} style={styles.taskMarkerImage} resizeMode="cover" />
              </View>
            </View>
          </Marker>
        ))}
        {originLat !== null && originLng !== null ? (
          <Marker
            coordinate={{ latitude: originLat, longitude: originLng }}
            title="Your location"
            pinColor={theme.infoSolid}
          />
        ) : null}
      </MapView>
    </View>
  );
}

/** Callout subtitle: approximate landmark, optional distance, and budget. */
function markerSubtitle(task: PublicTaskFeedItem): string {
  const budget = formatPhp(task.budgetCentavos);
  if (task.distanceMeters === null) return `${task.landmark} · ${budget}`;
  const distance =
    task.distanceMeters < 1000
      ? `${task.distanceMeters} m away`
      : `${(task.distanceMeters / 1000).toFixed(1)} km away`;
  return `${task.landmark} · ${distance} · ${budget}`;
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
  taskMarkerImage: {
    width: "100%",
    height: "100%",
  },
});
