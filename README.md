# PROCUREFLOW AI

Aplicación del Reto 3 de Periferia IT Group. Ejecutar los comandos desde esta carpeta, con Node.js 24.12 o posterior y pnpm 11.25.0. En un equipo con npm se puede instalar el gestor con `npm install -g pnpm@11.25.0`.

## Demostración

```sh
pnpm install --frozen-lockfile
node demo.ts
```

La instalación inicial requiere acceso al registro. Una vez instaladas las dependencias, la demo funciona sin internet, credenciales ni modelos. Cada ejecución imprime su carpeta nueva dentro de `.demo/`, con órdenes, control CSV, diario y evidencias. Las tres confirmaciones de la demo se identifican como decisiones del guion.

## Chat web

```sh
pnpm dev
```

Abrir [el chat local](http://localhost:3000). «Procesar expediente» ejecuta las herramientas. «Vista previa» presenta la propuesta. «Consultar con IA» usa Ollama, que debe estar ejecutándose en el equipo. El modelo predeterminado es `qwen3.5:4b`. Si hace falta descargarlo, ejecutar `ollama pull qwen3.5:4b`. Se puede configurar el modelo y la URL en `.env.local` usando `.env.example` como referencia. La configuración alternativa usa `AI_PROVIDER=openai`, `OPENAI_MODEL` y `OPENAI_API_KEY`.

Para la defensa, procesar SOL-001 dos veces, SOL-002 y SOL-003 una vez, y SOL-004 primero en vista previa y luego confirmar la pregunta. SOL-005 muestra factura anterior y SOL-006 requiere confirmar IVA. La consulta «¿Qué controles tiene sol-004?» permite inspeccionar la llamada solicitada por Ollama. El historial y las decisiones del chat se guardan en `out/`. Se puede configurar `PROCUREFLOW_OUTPUT` para apuntar a un volumen local persistente exclusivo.

## Verificación

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

Usar un solo proceso servidor por volumen. El paquete incluye fixtures y código fuente. Las salidas de ejecución se regeneran localmente.

## Acceso temporal para la defensa

[Cloudflare Tunnel · PROCUREFLOW AI](https://mileage-unlock-bones-massage.trycloudflare.com). Usuario `evaluador`. La contraseña se entrega al evaluador junto al ZIP. La aplicación de defensa usa almacenamiento independiente. El equipo y el túnel deben permanecer activos durante la evaluación.
