// Secciones disponibles por rol. Los permisos por cuenta solo pueden reducir esta lista.
const catalog = {
  "gerencia_general": [
    {
      "id": "dashboard",
      "label": "Resumen comercial",
      "icon": "BarChart3"
    },
    {
      "id": "usuarios",
      "label": "Usuarios",
      "icon": "Users"
    },
    {
      "id": "clusters",
      "label": "Clústeres",
      "icon": "Building2"
    },
    {
      "id": "tiendas",
      "label": "Tiendas",
      "icon": "Building2"
    },
    {
      "id": "zonal-supervisiones",
      "label": "Auditorías",
      "icon": "ClipboardCheck"
    },
    {
      "id": "capacitaciones",
      "label": "Capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "gestion",
      "label": "Gestión operativa",
      "icon": "AlertTriangle"
    },
    {
      "id": "reportes",
      "label": "Reportes",
      "icon": "FileSpreadsheet"
    },
    {
      "id": "historial",
      "label": "Historial",
      "icon": "History"
    },
    {
      "id": "ajustes-zonal",
      "label": "Ajustes",
      "hidden": true
    },
    {
      "id": "documentos",
      "label": "Documentos",
      "hidden": true
    },
    {
      "id": "coberturas",
      "label": "Coberturas especiales",
      "hidden": true
    }
  ],
  "gerente_comercial": [
    {
      "id": "dashboard",
      "label": "Resumen comercial",
      "icon": "BarChart3"
    },
    {
      "id": "transferencia",
      "label": "Transferencia",
      "icon": "Truck"
    },
    {
      "id": "metas-comerciales",
      "label": "Metas comerciales",
      "icon": "Target"
    },
    {
      "id": "tiendas",
      "label": "Tiendas y clústeres",
      "icon": "Building2"
    },
    {
      "id": "usuarios",
      "label": "Personal",
      "icon": "Users"
    },
    {
      "id": "capacitaciones",
      "label": "Capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "reportes",
      "label": "Reportes",
      "icon": "FileSpreadsheet"
    },
    {
      "id": "historial",
      "label": "Historial",
      "icon": "History"
    },
    {
      "id": "ajustes-zonal",
      "label": "Ajustes",
      "hidden": true
    }
  ],
  "marketing": [
    {
      "id": "marketing-inicio",
      "label": "Inicio",
      "icon": "BarChart3"
    },
    {
      "id": "marketing-personal",
      "label": "Personal",
      "icon": "Users"
    },
    {
      "id": "marketing-asistencia",
      "label": "Asistencia",
      "icon": "CalendarCheck2"
    },
    {
      "id": "marketing-validacion",
      "label": "Validación",
      "icon": "ClipboardCheck"
    },
    {
      "id": "marketing-campanas",
      "label": "Campaña",
      "icon": "FileSpreadsheet"
    },
    {
      "id": "marketing-incidencias",
      "label": "Incidencias",
      "icon": "AlertTriangle"
    },
    {
      "id": "marketing-capacitaciones",
      "label": "Capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "marketing-seguidores",
      "label": "Seguidores por redes",
      "icon": "Users"
    }
  ],
  "coach": [
    {
      "id": "dashboard",
      "label": "Resumen comercial",
      "icon": "BarChart3"
    },
    {
      "id": "cursos",
      "label": "Crear capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "capacitaciones",
      "label": "Asignar y seguimiento",
      "icon": "BarChart3"
    },
    {
      "id": "reportes",
      "label": "Reportes de ventas",
      "icon": "FileSpreadsheet"
    }
  ],
  "jefe_zonal": [
    {
      "id": "transferencia",
      "label": "Transferencia",
      "icon": "Truck"
    },
    {
      "id": "dashboard",
      "label": "Resumen comercial",
      "icon": "BarChart3"
    },
    {
      "id": "asiste-operativo",
      "label": "Resumen",
      "icon": "ClipboardCheck"
    },
    {
      "id": "tiendas",
      "label": "Mis tiendas",
      "icon": "Building2"
    },
    {
      "id": "zonal-personal",
      "label": "Mis equipos",
      "icon": "Users"
    },
    {
      "id": "zonal-supervisiones",
      "label": "Auditorías",
      "icon": "ClipboardCheck"
    },
    {
      "id": "zonal-incidencias",
      "label": "Incidencias",
      "icon": "AlertTriangle"
    },
    {
      "id": "capacitaciones",
      "label": "Capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "reportes",
      "label": "Reportes",
      "icon": "FileSpreadsheet"
    },
    {
      "id": "historial",
      "label": "Historial",
      "icon": "History"
    },
    {
      "id": "ajustes-zonal",
      "label": "Ajustes",
      "hidden": true
    },
    {
      "id": "zonal-asistencia",
      "label": "Asistencia de la zona",
      "hidden": true
    }
  ],
  "jefe_tienda": [
    {
      "id": "dashboard",
      "label": "Resumen comercial",
      "icon": "BarChart3"
    },
    {
      "id": "mi-tienda-gestion",
      "label": "Mi tienda",
      "icon": "Building2"
    },
    {
      "id": "transferencia",
      "label": "Transferencia",
      "icon": "Truck"
    },
    {
      "id": "usuarios",
      "label": "Personal",
      "icon": "Users"
    },
    {
      "id": "asistencias",
      "label": "Asistencias",
      "icon": "CalendarCheck2"
    },
    {
      "id": "capacitaciones",
      "label": "Capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "reportes",
      "label": "Reportes",
      "icon": "FileSpreadsheet"
    },
    {
      "id": "historial",
      "label": "Historial",
      "icon": "History"
    },
    {
      "id": "mi-tienda",
      "label": "Resumen operativo",
      "hidden": true
    },
    {
      "id": "incidencias-tienda",
      "label": "Incidencias de la tienda",
      "hidden": true
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "hidden": true
    },
    {
      "id": "coberturas",
      "label": "Coberturas especiales",
      "hidden": true
    }
  ],
  "trabajador": [
    {
      "id": "mi-asistencia",
      "label": "Mi asistencia",
      "icon": "CalendarCheck2"
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "profile",
      "label": "Mi perfil",
      "icon": "UserCircle2"
    }
  ],
  "seguridad": [
    {
      "id": "seguridad-trafico",
      "label": "Tráfico",
      "icon": "Users"
    },
    {
      "id": "seguridad-incidencias",
      "label": "Incidencias",
      "icon": "ShieldCheck"
    }
  ],
  "administrador_seguridad": [
    {
      "id": "seguridad-central",
      "label": "Control de seguridad",
      "icon": "ShieldCheck"
    }
  ],
  "sistemas": [
    {
      "id": "sistemas",
      "label": "Carga de datos",
      "icon": "FileSpreadsheet"
    },
    {
      "id": "sistemas-credenciales",
      "label": "Acceso y credenciales",
      "icon": "KeyRound"
    },
    {
      "id": "sistemas-registros",
      "label": "Gestión de registros",
      "icon": "Users"
    }
  ],
  "asistente_tienda": [
    {
      "id": "dashboard",
      "label": "Resumen comercial",
      "icon": "BarChart3"
    },
    {
      "id": "mi-tienda-gestion",
      "label": "Mi tienda",
      "icon": "Building2"
    },
    {
      "id": "transferencia",
      "label": "Transferencia",
      "icon": "Truck"
    },
    {
      "id": "usuarios",
      "label": "Personal",
      "icon": "Users"
    },
    {
      "id": "asistencias",
      "label": "Asistencias",
      "icon": "CalendarCheck2"
    },
    {
      "id": "capacitaciones",
      "label": "Capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "reportes",
      "label": "Reportes",
      "icon": "FileSpreadsheet"
    },
    {
      "id": "historial",
      "label": "Historial",
      "icon": "History"
    },
    {
      "id": "mi-tienda",
      "label": "Resumen operativo",
      "hidden": true
    },
    {
      "id": "incidencias-tienda",
      "label": "Incidencias de la tienda",
      "hidden": true
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "hidden": true
    },
    {
      "id": "coberturas",
      "label": "Coberturas especiales",
      "hidden": true
    }
  ],
  "jefe_seguridad": [
    {
      "id": "seguridad-trafico",
      "label": "Tráfico",
      "icon": "Users"
    },
    {
      "id": "seguridad-incidencias",
      "label": "Incidencias",
      "icon": "ShieldCheck"
    }
  ],
  "vendedor": [
    {
      "id": "mi-asistencia",
      "label": "Mi asistencia",
      "icon": "CalendarCheck2"
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "profile",
      "label": "Mi perfil",
      "icon": "UserCircle2"
    }
  ],
  "asistente": [
    {
      "id": "mi-asistencia",
      "label": "Mi asistencia",
      "icon": "CalendarCheck2"
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "profile",
      "label": "Mi perfil",
      "icon": "UserCircle2"
    }
  ],
  "caja": [
    {
      "id": "mi-asistencia",
      "label": "Mi asistencia",
      "icon": "CalendarCheck2"
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "profile",
      "label": "Mi perfil",
      "icon": "UserCircle2"
    }
  ],
  "almacenero": [
    {
      "id": "mi-asistencia",
      "label": "Mi asistencia",
      "icon": "CalendarCheck2"
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "profile",
      "label": "Mi perfil",
      "icon": "UserCircle2"
    }
  ],
  "jefe_area": [
    {
      "id": "mi-asistencia",
      "label": "Mi asistencia",
      "icon": "CalendarCheck2"
    },
    {
      "id": "mis-capacitaciones",
      "label": "Mis capacitaciones",
      "icon": "GraduationCap"
    },
    {
      "id": "profile",
      "label": "Mi perfil",
      "icon": "UserCircle2"
    }
  ],
  "asistente_comercial": [
    {
      "id": "sistemas",
      "label": "Carga de archivos",
      "icon": "FileSpreadsheet"
    }
  ]
};

export function sectionsForRole(role) {
  return (catalog[role] || []).map(section => ({ ...section }));
}

export function allowedSections(user) {
  const defaults = sectionsForRole(user?.rol).map(section => section.id);
  if (Array.isArray(user?.secciones_permitidas)) {
    const selected = new Set(user.secciones_permitidas);
    return defaults.filter(id => selected.has(id));
  }
  if (user?.acceso_solo_resumen_comercial === true) return defaults.includes('dashboard') ? ['dashboard'] : [];
  return defaults;
}

export function canAccessSection(user, id) {
  return allowedSections(user).includes(id);
}

export function firstAllowedSection(user) {
  const allowed = allowedSections(user);
  if (allowed.includes('dashboard')) return 'dashboard';
  const visible = sectionsForRole(user?.rol).find(section => !section.hidden && allowed.includes(section.id));
  return visible?.id || allowed[0] || null;
}
