# Solución del Reto 3

La analista necesita preparar órdenes con evidencia verificable y evitar que una aprobación de otro centro o una discrepancia se traduzcan en gasto no autorizado.

## Ejecución

Chat React → API Next.js → aplicación y herramientas → motor RC1–RC10 → SAP simulado en archivos. La demo entra directamente por aplicación y herramientas. El comportamiento conversacional está en `agent/prompt.md`, el conocimiento en `src/knowledge/` y los cinco contratos públicos en `src/tools/oc.ts`. TypeScript, Zod y decimal.js sirven para tipar, validar fronteras y comparar cantidades con aritmética decimal.

El chat distingue comandos explícitos de procesamiento y consultas de lenguaje natural. Para consultas el proveedor pide herramientas por nombre y expediente. El ejecutor enlaza sus argumentos con los documentos canónicos. Los mensajes financieros muestran valores efectivos de herramientas. La pregunta de excepción conserva sesión, mensaje, huella del payload, hechos y reglas. El mensaje de aceptación constituye un turno independiente. Las llamadas directas con confirmado verdadero requieren esa misma aceptación.

## Controles y resultados

| Regla | Condición | Consecuencia |
|---|---|---|
| RC1 | Proveedor activo por NIT o, si falta, por nombre | Bloqueo |
| RC2 | Correo aprobado y remitente autorizado en el centro | Bloqueo |
| RC3 | Total dentro del tope del aprobador en el centro | Bloqueo |
| RC4 | Subárea del centro | Bloqueo |
| RC5 | Diferencia de cotización ≤ 2 % del solicitado | Confirmar exceso o cotización ausente |
| RC6 | Falta IVA | Derivar del proveedor y confirmar |
| RC7 | Falta pago | Derivar e informar |
| RC8 | Fecha de factura anterior a solicitud | Confirmar y conservar retroactividad |
| RC9 | Aprobación anterior a solicitud | Confirmar |
| RC10 | Diferencia de cantidad × precio y total ≤ 1 unidad | Bloqueo al exceder |

RC5 exige especial cuidado porque la cifra cotizada no autoriza aumentar la orden. SOL-004 queda en COP 25.000.000. SOL-001 crea una vez, SOL-002 y SOL-003 bloquean, SOL-005 mantiene su marca y SOL-006 requiere una confirmación por IVA. Los fixtures se preservan, incluidos NIT originales y correos Unicode.

## Decisiones y recuperación

- Un monolito modular facilita mantener herramientas idénticas en chat y CLI. Los microservicios agregarían coordinación para una operación pequeña.
- La creación serializa búsqueda, secuencia y escritura. Una comprobación previa aislada deja una carrera entre dos sesiones.
- Los archivos satisfacen el contrato del reto. Se guarda intención antes del commit, se publica el JSONL de órdenes mediante reemplazo y se reconstruye el CSV de intentos al reiniciar. La prueba mata un proceso después de publicar la OC. El proceso siguiente recupera el cierre y conserva número y fecha.
- La exclusión entre procesos nativos usa una tubería con nombre en Windows o un socket abstracto en Linux. Desplegar una sola instancia. Para compartir volumen entre contenedores con espacios de nombres distintos se necesita exclusión adicional en el montaje. El sistema no pretende ofrecer consenso distribuido.
- Los supuestos son topes en COP para los fixtures, precios con IVA incluido y comparación por día documental. Se mantienen duración de oferta y texto fuente. El PRD no especifica cómo contar el día final de vigencia.

## IA y costos

Ollama local usa por defecto qwen3.5:4b. La demo consume cero tokens. En local no hay tarifa de API, aunque hay costo de cómputo. El backend limita iteraciones, tiempo y presupuesto por sesión. El costo estimado de una consulta remota equivale a tokens de entrada por tarifa de entrada más tokens de salida por tarifa de salida del modelo seleccionado. No se midió gasto de OpenAI. Codex asistió en diseño, implementación y pruebas. Se descartó delegar al modelo el monto, la confirmación o la creación libre.

## SAP real y retroactividad

Para S/4HANA se propone evaluar una API OData de órdenes compatible con la edición del cliente. Mapear sociedad, organización, moneda, proveedor y pago a cabecera, cantidades y texto a posiciones, y centro a imputación. Validar unidades y base neta antes de convertir precios brutos. Conservar referencia externa única y evidencia vinculada. Usar credenciales de servicio en backend con permisos restringidos. Después de un timeout consultar por referencia y conciliar mensajes parciales antes de reenviar. Si el acceso no es viable, exportar un archivo de carga revisable.

En SOL-005 existe cotización del 5 de agosto, factura del 10 y solicitud del 27. El proceso formal se inició 17 días después de facturar. La aprobación posterior no borra la desviación. Dirección puede medir órdenes únicas creadas con marca retroactiva frente al total de órdenes únicas, separando reintentos y expedientes pendientes. Para prevención conviene revisar los centros con recurrencia y exigir que el compromiso de compra se tramite antes de recibir la factura. Esta propuesta de gestión no cambia RC8.

## Cobertura y límites

| Historia | Cobertura |
|---|---|
| HU-1 | Lectura normalizada de seis expedientes y cuatro maestros |
| HU-2 | RC1–RC10 en un motor determinístico |
| HU-3 | Payload y trazabilidad por campo |
| HU-4 | TXT y SHA-256 P0. PDF P1 pendiente |
| HU-5 | Creación, idempotencia y recuperación en SAP simulado |
| HU-6 | Errores legibles y prueba de entradas defectuosas |

Para producción quedan identidad corporativa, autenticidad de correo, respaldo de volumen, límites globales contra abuso, pruebas sobre el almacenamiento del alojamiento y validación con SAP real. El servidor se ejecuta en el equipo de defensa y se publica temporalmente con Cloudflare Tunnel y control de acceso. Se verificaron el rechazo anónimo, la página autenticada y la vista previa de SOL-004 por HTTPS. La verificación con modelo real se hizo con Ollama; el adaptador opcional OpenAI carece de prueba con credenciales reales.

