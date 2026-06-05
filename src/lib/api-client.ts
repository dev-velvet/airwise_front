export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export type Station = {
  id: number;
  estacion: string;
  latitud: number;
  longitud: number;
  pm25_ica: number;
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

export type CalculoRiesgo = {
  enfermedad: string;
  beta_historico: number;
  incremento_riesgo_porcentaje_actual: number;
  incremento_historico_base: number;
};

export type RiesgoCruzadoResult = {
  municipio: string;
  estacion_monitoreo: string;
  pm25_ica_actual: number;
  categoria_ica: string;
  sexo_filtro: string;
  grupo_edad_filtro: string;
  calculos_riesgo: CalculoRiesgo[];
};

export async function fetchMunicipios(): Promise<Municipio[]> {
  const res = await fetch(`${API_BASE_URL}/api/municipios`);
  if (!res.ok) throw new Error("Error al obtener municipios");
  return res.json();
}

export async function fetchEstaciones(): Promise<Station[]> {
  const res = await fetch(`${API_BASE_URL}/api/siata/actual`);
  if (!res.ok) throw new Error("Error al obtener estaciones");
  return res.json();
}

export async function fetchEnfermedades(): Promise<EnfermedadData[]> {
  const res = await fetch(`${API_BASE_URL}/api/salud/historico/enfermedades`);
  if (!res.ok) throw new Error("Error al obtener histórico de enfermedades");
  return res.json();
}

export async function fetchDefunciones(): Promise<DefuncionData[]> {
  const res = await fetch(`${API_BASE_URL}/api/salud/historico/defunciones`);
  if (!res.ok) throw new Error("Error al obtener histórico de defunciones");
  return res.json();
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
