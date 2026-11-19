# Homologaciones editables

Edita únicamente `homologaciones_usuario.json` cuando RMS entregue una nueva
variante de marca, tienda, proveedor, rubro, línea o sublínea.

Ejemplo:

```json
{
  "marcas": {
    "ADIDAS ORIGINALS": "ADIDAS",
    "NIKE INC.": "NIKE"
  },
  "tiendas": {
    "LA MARINA MALL": "MARINA"
  },
  "proveedores": {},
  "rubros": {},
  "lineas": {},
  "sublineas": {}
}
```

- La clave (izquierda) es cómo llega el texto desde RMS.
- El valor (derecha) es el único nombre final que debe aparecer en el dashboard.
- Respeta comas, comillas y llaves del formato JSON.
- Las reglas de este archivo tienen prioridad sobre las reglas incluidas en la
  aplicación y se aplican a ventas, ingresos, transferencias y stock.
- Después de guardar, pulsa **Procesar** de nuevo. No es necesario modificar
  archivos Python ni reinstalar requisitos.

Si el archivo tiene un error de formato, el proceso se detiene antes de publicar
datos y muestra la línea y columna que debes corregir.
