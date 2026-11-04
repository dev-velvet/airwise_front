import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { aqiColor, aqiTextClass } from "@/lib/aqi";

type Station = {
  id: number;
  estacion: string;
  latitud: number;
  longitud: number;
  pm25_ica: number;
  pm25_promedio_24h?: number;
  n_lecturas_24h?: number;
  categoria_ica: string;
  categoria_ica_24h?: string;
  categoria_ica_actual?: string;
};

export function AirMap({
  stations,
  metrica = "24h",
}: {
  stations: Station[];
  metrica?: "24h" | "instantaneo";
}) {
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
        const val = metrica === "24h" ? Number(s.pm25_promedio_24h ?? s.pm25_ica) : Number(s.pm25_ica);
        const catIca = metrica === "24h"
          ? (s.categoria_ica_24h ?? (val <= 12 ? "Buena" : val <= 37 ? "Moderada" : val <= 55 ? "Dañina a grupos sensibles" : val <= 150 ? "Dañina" : "Muy dañina"))
          : (s.categoria_ica_actual ?? s.categoria_ica);

        const color = aqiColor(catIca);
        return (
          <CircleMarker
            key={s.id}
            center={[s.latitud, s.longitud]}
            radius={11}
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
                {metrica === "24h" ? (
                  <>
                    <div className="text-xs">
                      Promedio 24 h (Base): <span className="font-bold text-primary">{val.toFixed(1)}</span> µg/m³
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Lectura en vivo: {Number(s.pm25_ica).toFixed(1)} µg/m³
                    </div>
                    {s.n_lecturas_24h && (
                      <div className="text-[10px] text-muted-foreground/75 mt-0.5">
                        Observaciones: {s.n_lecturas_24h} registros
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-xs">
                      En vivo (Instantáneo): <span className="font-bold text-primary">{Number(s.pm25_ica).toFixed(1)}</span> µg/m³
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Promedio 24 h: {Number(s.pm25_promedio_24h ?? s.pm25_ica).toFixed(1)} µg/m³
                    </div>
                  </>
                )}
                <div className={`text-xs font-semibold mt-1.5 ${aqiTextClass(catIca)}`}>
                  ICA ({metrica === "24h" ? "sobre 24 h" : "instantáneo"}): {catIca}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
