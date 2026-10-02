import { todayISO } from "../lib/api";
export const weekDays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const blankSchedule = () => weekDays.map((_, index) => ({ dia_semana: index + 1, trabaja: false, hora_entrada: "", hora_salida: "" }));
export const blankMarketingStaff = {
  nombres: "", apellidos: "", dni: "", tipo_documento: "dni", usuario: "", password: "",
  telefono: "", email: "", rol: "analista_marketing", tienda_id: "", tienda_ids: [], estado: "activo", fecha_ingreso: todayISO(), fecha_salida: "",
  cluster_id: "", fecha_nacimiento: "", sueldo: "", sexo: "", nacionalidad: "", direccion: "", distrito: "", area_laboral: "", carrera: "", grado_academico: "",
  ciclo_semestre: "", estado_civil: "", numero_hijos: "", talla_zapatillas: "", talla_polo: "",
  contacto_emergencia: "", telefono_emergencia: "", alergia: "", condicion_salud: "", motivo_salida: "",
  regimen_jornada: "", tipo_turno: "", tiene_parentesco: false, tipo_parentesco: "", familiar_vinculo: "", horarios: blankSchedule(),
};
