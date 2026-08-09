"use client";

import type { WaterSpot } from "@/lib/types";
import L from "leaflet";
import { useEffect } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const userIcon = L.divIcon({
  className: "fw-user-marker",
  html: `<span class="fw-user-dot"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const waterIcon = L.divIcon({
  className: "fw-water-marker",
  html: `<span class="fw-water-pin"></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function MapController({
  center,
  selectedId,
  spots,
}: {
  center: [number, number];
  selectedId: string | null;
  spots: WaterSpot[];
}) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  useEffect(() => {
    if (!selectedId) return;
    const spot = spots.find((s) => s.id === selectedId);
    if (!spot) return;
    map.flyTo([spot.latitude, spot.longitude], Math.max(map.getZoom(), 16), {
      duration: 0.6,
    });
  }, [selectedId, spots, map]);

  return null;
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

type WaterMapProps = {
  center: [number, number];
  radius: number;
  spots: WaterSpot[];
  selectedId: string | null;
  hintLoadingId?: string | null;
  onSelect: (id: string) => void;
  onMapClick: (latitude: number, longitude: number) => void;
};

export default function WaterMap({
  center,
  radius,
  spots,
  selectedId,
  hintLoadingId = null,
  onSelect,
  onMapClick,
}: WaterMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={15}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController center={center} selectedId={selectedId} spots={spots} />
      <MapClickHandler onMapClick={onMapClick} />
      <Circle
        center={center}
        radius={radius}
        pathOptions={{
          color: "#0d9488",
          fillColor: "#14b8a6",
          fillOpacity: 0.08,
          weight: 1.5,
        }}
      />
      <Marker position={center} icon={userIcon}>
        <Popup>You are here (or pinned location)</Popup>
      </Marker>
      {spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.latitude, spot.longitude]}
          icon={waterIcon}
          eventHandlers={{
            click: () => onSelect(spot.id),
          }}
        >
          <Popup>
            <strong>{spot.displayName}</strong>
            <br />
            {hintLoadingId === spot.id ? (
              <>
                Finding nearby…
                <br />
              </>
            ) : spot.locationHint ? (
              <>
                {spot.locationHint}
                <br />
              </>
            ) : null}
            {spot.distanceMeters} m away
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
