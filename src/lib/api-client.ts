export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const CACHE_PREFIX = "airwise_cache_";
const CACHE_TTL: Record<string, number> = {
  estaciones: 1000 * 60 * 15,      // 15 min
  municipios: 1000 * 60 * 60 * 24,  // 24 h
  enfermedades: 1000 * 60 * 60 * 24,
  defunciones: 1000 * 60 * 60 * 24,
};

function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    return data as T;
  } catch { return null; }
}

function setCache<T>(key: string, data: T, ttl: number): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, expiry: Date.now() + ttl }));
  } catch { /* quota exceeded, ignore */ }
}

async function fetchWithCache<T>(key: string, url: string, ttl: number): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as T;
    setCache(key, data, ttl);
    return data;
  } catch (err) {
    const cached = getCache<T>(key);
    if (cached) return cached;
    throw err;
  }
}

export type Station = {
  id: number;
  estacion: string;
  latitud: number;
  longitud: number;
  pm25_ica: number;
  pm25_promedio_24h?: number;
  n_lecturas_24h?: number;
  categoria_ica: string;
  municipio_id: number | null;
};

export type Municipio = {
  id: number;
  nombre: string;
  nombre_normalizado: string;
};

export type TrendData = {
  periodo: number;
  casos: number;
  muertes: number;
};

export type EnfermedadData = {
  anio: number;
  municipio: string;
  grupo_diagnostico: string;
  sexo: string;
  grupo_edad: string;
  casos: number;
};

export type DefuncionData = {
  anio: number;
  municipio: string;
  grupo_diagnostico: string;
  sexo: string;
  grupo_edad: string;
  muertes: number;
};

export type TasaMortalidadMunicipio = {
  municipio: string;
  tasa_ajustada_promedio: number;
};

export type SusceptibilidadItem = {
  grupo_edad: string;
  grupo_diagnostico: string;
  incremento_riesgo_pct: number;
  limite_inferior: number;
  limite_superior: number;
};

export type CalculoRiesgo = {
  enfermedad: string;
  beta_historico: number;
  incremento_riesgo_porcentaje_actual: number;
  incremento_riesgo_porcentaje_24h?: number;
  incremento_riesgo_porcentaje_instantaneo?: number;
  incremento_riesgo_inf?: number | null;
  incremento_riesgo_sup?: number | null;
  incremento_historico_base: number;
};

export type RiesgoCruzadoResult = {
  municipio: string;
  estacion_monitoreo: string;
  pm25_ica_actual: number;
  pm25_promedio_24h?: number;
  n_lecturas_24h?: number;
  metrica_exposicion?: string;
  categoria_ica: string;
  categoria_ica_actual?: string;
  sexo_filtro: string;
  grupo_edad_filtro: string;
  calculos_riesgo: CalculoRiesgo[];
  nota_estimacion?: string;
};

export async function fetchMunicipios(): Promise<Municipio[]> {
  return fetchWithCache("municipios", `${API_BASE_URL}/api/municipios`, CACHE_TTL.municipios);
}

export async function fetchEstaciones(): Promise<Station[]> {
  return fetchWithCache("estaciones", `${API_BASE_URL}/api/siata/actual`, CACHE_TTL.estaciones);
}

export async function fetchEnfermedades(): Promise<EnfermedadData[]> {
  return fetchWithCache("enfermedades", `${API_BASE_URL}/api/salud/historico/enfermedades`, CACHE_TTL.enfermedades);
}

export async function fetchDefunciones(): Promise<DefuncionData[]> {
  return fetchWithCache("defunciones", `${API_BASE_URL}/api/salud/historico/defunciones`, CACHE_TTL.defunciones);
}

export async function fetchTasasMortalidad(): Promise<TasaMortalidadMunicipio[]> {
  return fetchWithCache("tasas_mortalidad", `${API_BASE_URL}/api/salud/tasas-mortalidad`, CACHE_TTL.defunciones);
}

export async function fetchSusceptibilidad(): Promise<SusceptibilidadItem[]> {
  return fetchWithCache("susceptibilidad", `${API_BASE_URL}/api/salud/susceptibilidad`, CACHE_TTL.defunciones);
}

export async function fetchRiesgoCruzado(
  municipioId: number,
  sexo: string,
  grupoEdad: string
): Promise<RiesgoCruzadoResult> {
  const params = new URLSearchParams({
    municipio_id: String(municipioId),
    sexo,
    grupo_edad: grupoEdad,
  });
  const res = await fetch(`${API_BASE_URL}/api/salud/riesgo-cruzado?${params.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Error al calcular riesgo cruzado");
  }
  return res.json();
}
