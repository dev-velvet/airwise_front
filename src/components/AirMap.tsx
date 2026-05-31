import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { aqiColor, aqiTextClass } from "@/lib/aqi";

type Station = {
  id: number;
  estacion: string;
  latitud: number;
  longitud: number;
  pm25_ica: number;
  categoria_ica: string;
};

export function AirMap({ stations }: { stations: Station[] }) {
  return (
    <MapContainer
      center={[6.244, -75.575]}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%", minHeight: 420 }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stations.map((s) => {
        const color = aqiColor(s.categoria_ica);
        return (
          <CircleMarker
            key={s.id}
            center={[s.latitud, s.longitud]}
            radius={10}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: color as string,
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <div className="font-sans">
                <div className="text-sm font-semibold mb-1">{s.estacion}</div>
                <div className="text-xs">
                  PM2.5 <span className="font-bold">{Number(s.pm25_ica).toFixed(1)}</span> µg/m³
                </div>
                <div className={`text-xs font-semibold ${aqiTextClass(s.categoria_ica)}`}>
                  {s.categoria_ica}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
