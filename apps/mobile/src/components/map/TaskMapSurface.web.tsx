/// <reference lib="dom" />
import { type ElementRef, useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { Asset } from "expo-asset";
import taskMarkerImage from "../../../assets/app-icon-square.png";
import type {
  Map as LeafletMap,
  LayerGroup,
  PopupEvent,
  Marker,
  DivIcon,
  DivIconOptions,
  TileLayer,
  TileLayerOptions,
  MapOptions,
  MarkerOptions,
  LatLngExpression,
} from "leaflet";
import type { PublicTaskFeedItem } from "@dizkarte/domain";
import { TaskMapPreviewCard } from "./TaskMapPreviewCard";
import type { TaskMapSurfaceProps } from "./TaskMapSurface";

const LEAFLET_VERSION = "1.9.4";
/** Metro Manila fallback centre when no task has coordinates yet. */
const MANILA: [number, number] = [14.5995, 120.9842];
const TASK_MARKER_WIDTH = 44;
const TASK_MARKER_HEIGHT = 64;
const TASK_MARKER_ANCHOR_Y = 63;

/** The subset of the Leaflet module surface this component actually calls. */
interface LeafletGlobal {
  map(element: HTMLElement, options?: MapOptions): LeafletMap;
  tileLayer(urlTemplate: string, options?: TileLayerOptions): TileLayer;
  layerGroup(): LayerGroup;
  marker(latlng: LatLngExpression, options?: MarkerOptions): Marker;
  divIcon(options?: DivIconOptions): DivIcon;
}

let leafletPromise: Promise<LeafletGlobal> | null = null;

/**
 * Load Leaflet from the CDN on demand (web only).
 *
 * Leaflet is intentionally never bundled: it is a browser DOM library, so it is
 * pulled in at runtime through a `<script>` tag rather than imported, keeping it
 * out of the native bundle entirely (this file is a `.web` override).
 */
function loadLeaflet(): Promise<LeafletGlobal> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Leaflet requires a browser environment."));
  }
  const existing = (window as unknown as { L?: LeafletGlobal }).L;
  if (existing) return Promise.resolve(existing);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise<LeafletGlobal>((resolve, reject) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { L?: LeafletGlobal }).L;
      if (loaded) resolve(loaded);
      else reject(new Error("Leaflet failed to initialize."));
    };
    script.onerror = () => reject(new Error("Failed to load Leaflet."));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

/** Task titles/landmarks are user content, so every value in popup HTML is escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/** Circular brand logo on a long tapered needle, matching a map pushpin. */
function taskMarkerHtml(imageUri: string): string {
  const safeImageUri = escapeHtml(imageUri);
  return (
    `<div aria-hidden="true" style="position:relative;width:${TASK_MARKER_WIDTH}px;height:${TASK_MARKER_HEIGHT}px;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(15,23,42,0.28))">` +
    `<svg width="14" height="30" viewBox="0 0 14 30" style="position:absolute;z-index:0;left:15px;top:34px;display:block;overflow:visible">` +
    `<path d="M1.5 1H12.5L8.5 27C8.3 29 5.7 29 5.5 27Z" fill="${theme.disabledForeground}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" />` +
    `<path d="M5.5 5L6.8 23" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0.32" />` +
    `</svg>` +
    `<div style="position:absolute;z-index:1;top:1px;left:1px;width:42px;height:42px;box-sizing:border-box;overflow:hidden;border:2.5px solid #fff;border-radius:50%;background:${theme.primary}">` +
    `<img src="${safeImageUri}" alt="" draggable="false" style="width:100%;height:100%;display:block;object-fit:cover;border-radius:50%;user-select:none" />` +
    `</div>` +
    `</div>`
  );
}

/**
 * Interactive web task map.
 *
 * Renders the same public-safe `PublicTaskFeedItem`s the list/schematic use, as
 * pins on an OpenStreetMap surface. Only the feed's rounded `approximate`
 * coordinates are ever plotted — exact addresses never reach this component.
 */
export function TaskMapSurface({ items, onSelectTask, origin }: TaskMapSurfaceProps) {
  const containerRef = useRef<ElementRef<typeof View> | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<LeafletGlobal | null>(null);
  const onSelectRef = useRef(onSelectTask);
  onSelectRef.current = onSelectTask;
  const [selectedTask, setSelectedTask] = useState<PublicTaskFeedItem | null>(null);
  const selectedTaskRef = useRef<PublicTaskFeedItem | null>(null);
  selectedTaskRef.current = selectedTask;
  // Primitive coords so the marker effect depends on values, not object identity.
  const originLat = origin && Number.isFinite(origin.lat) ? origin.lat : null;
  const originLng = origin && Number.isFinite(origin.lng) ? origin.lng : null;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled) return;
        const node = containerRef.current as unknown as HTMLElement | null;
        if (!node || mapRef.current) return;
        const map = L.map(node, { scrollWheelZoom: true }).setView(MANILA, 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);
        map.on("click", () => {
          setSelectedTask(null);
        });
        leafletRef.current = L;
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        setStatus("ready");
        // Guard against a zero-height first paint under react-native-web layout.
        setTimeout(() => map.invalidateSize(), 0);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const markerImageUri = Asset.fromModule(taskMarkerImage).uri;
    const pin = L.divIcon({
      className: "dz-task-logo-marker",
      html: taskMarkerHtml(markerImageUri),
      iconSize: [TASK_MARKER_WIDTH, TASK_MARKER_HEIGHT],
      iconAnchor: [TASK_MARKER_WIDTH / 2, TASK_MARKER_ANCHOR_Y],
      popupAnchor: [0, -TASK_MARKER_ANCHOR_Y],
    });
    const bounds: [number, number][] = [];
    for (const task of items) {
      const lat = task.approximateLat;
      const lng = task.approximateLng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      bounds.push([lat, lng]);
      const marker = L.marker([lat, lng], { icon: pin, title: task.title }).addTo(layer);
      marker.on("click", (e) => {
        // Stop propagation so map click handler doesn't immediately dismiss
        if (e && typeof (e as { originalEvent?: Event }).originalEvent?.stopPropagation === "function") {
          (e as { originalEvent: Event }).originalEvent.stopPropagation();
        }
        if (selectedTaskRef.current?.id === task.id) {
          onSelectRef.current(task.id);
          return;
        }
        setSelectedTask(task);
        map.panTo([lat, lng]);
      });
    }
    // The viewer's own approximate location, when they have opted in. A distinct
    // dot (never the task pin) so it is unmistakably "you", and it joins the
    // bounds so the initial view frames both the viewer and nearby tasks.
    if (originLat !== null && originLng !== null) {
      const userIcon = L.divIcon({
        className: "dz-user-pin",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${theme.infoSolid};border:3px solid #fff;box-shadow:0 0 0 2px ${theme.infoSolid}"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8],
      });
      L.marker([originLat, originLng], { icon: userIcon, title: "Your location" })
        .addTo(layer);
      bounds.push([originLat, originLng]);
    }
    const first = bounds[0];
    if (bounds.length === 1 && first) map.setView(first, 14);
    else if (bounds.length > 1)
      map.fitBounds(bounds, { padding: [TASK_MARKER_WIDTH, TASK_MARKER_HEIGHT] });
  }, [items, status, originLat, originLng]);

  useEffect(() => {
    const map = mapRef.current;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!map || !node || typeof ResizeObserver === "undefined") return;
    // The container is now flex-sized, so its height changes with the window.
    // Leaflet does not track that on its own, so tell it to recompute its size
    // (and re-fit the framed markers) whenever the container is resized —
    // keeps the map crisp and correctly framed responsively.
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [status]);

  return (
    <View style={styles.wrapper}>
      <View ref={containerRef} style={styles.map} />
      {status !== "ready" ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>
            {status === "error" ? "Map could not load — use the list view." : "Loading map…"}
          </Text>
        </View>
      ) : null}

      {selectedTask ? (
        <TaskMapPreviewCard
          task={selectedTask}
          onOpen={onSelectTask}
          onClose={() => setSelectedTask(null)}
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
    position: "relative",
    overflow: "hidden",
    backgroundColor: theme.surfaceSubtle,
  },
  map: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    width: "100%",
    backgroundColor: theme.surfaceSubtle,
  },
  overlay: {
    position: "absolute",
    pointerEvents: "none",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    backgroundColor: theme.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
  },
});
