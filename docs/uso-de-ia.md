# Uso de IA en el proyecto

Esta declaración sigue la plantilla del Anexo C de la consigna. Es un documento vivo: cada integrante suma sus usos a medida que avanza el desarrollo.

## Reglas que seguimos

- Somos responsables de todo el código que entregamos, lo haya escrito una persona o una IA. Antes de hacer merge, quien sube el código tiene que poder explicarlo.
- Nunca pegamos en un chat de IA claves de API, contraseñas, cadenas de conexión ni datos personales reales.
- La clave de la API de IA del producto vive solo en las variables de entorno del backend; nunca llega al frontend ni al repositorio.

## Herramientas utilizadas

- **Claude:** planificación del proyecto, documentación y revisión de coherencia entre documentos.
- **Gemini (como herramienta de desarrollo):** consultas puntuales y generación de borradores de texto. Es independiente del Gemini API que usa el producto (ver "Funcionalidad de IA en el producto").
- [Completar: otras herramientas que use cada integrante, por ejemplo ChatGPT, GitHub Copilot o Cursor, y para qué]

## Tareas en las que la usamos

- **Planificación y documentación:** redacción del informe del proyecto, las historias de usuario con sus criterios de aceptación, los contratos entre módulos y la comparación de opciones de despliegue.
- **Generación de código:** [completar durante el desarrollo]
- **Depuración de errores:** [completar durante el desarrollo]
- **Tests y diseño:** [completar durante el desarrollo]

## Un caso en que la IA ayudó bien

Le pedimos que, a partir de la idea del proyecto y de las preguntas del docente, definiera los contratos entre las tres parejas: qué funciones y endpoints expone cada una, con qué formato de datos y qué versión simulada usar mientras la otra pareja no termina. Fue útil porque nos permitió empezar a trabajar en paralelo sin bloquearnos, y nos obligó a acordar el modelo de datos antes de escribir código.

## Un caso en que hubo que corregirla

La IA propuso desplegar el backend en el plan gratuito de Render. El docente nos advirtió que nos íbamos a quedar cortos: el plan gratuito duerme el servicio tras 15 minutos sin tráfico y no admite procesos en segundo plano, que necesitamos para la cola de documentos. Lo verificamos en la documentación de Render y cambiamos a AWS EC2.

Además, como la propuesta inicial se armó antes de tener la consigna, no contemplaba el registro de usuarios ni el aislamiento de datos entre usuarios de una misma área. Al revisar los requisitos R1 a R8 los agregamos: el registro quedó por invitación, como validó el docente.

[Completar durante el desarrollo con un caso de código: qué propuso la IA, qué estaba mal o era inseguro, cómo lo detectamos y cómo lo resolvimos.]

## Funcionalidad de IA en el producto

- **Modelo y servicio:** Google Gemini API, a través del Vercel AI SDK, para generar los embeddings de los documentos y redactar las respuestas del asistente.
- **Qué hace:** el asistente responde dudas sobre los procedimientos usando solo fragmentos de documentos vigentes del área del usuario (técnica RAG), y cita la fuente de cada respuesta. Si no encuentra información, lo dice en lugar de inventar.
- **Cómo protegemos la clave:** la clave está solo en las variables de entorno del backend, en la instancia de AWS; el frontend nunca llama directamente al proveedor.
- **Cómo manejamos los errores:** las llamadas tienen timeout y reintentos limitados. Si el proveedor no responde, el usuario recibe un aviso y puede buscar en los documentos sin IA; el resto de la aplicación sigue funcionando.
- **Cómo controlamos los costos:** usamos la capa gratuita, un modelo económico, un límite de consultas por usuario y registramos los tokens de cada consulta para verlos en el panel de métricas.
