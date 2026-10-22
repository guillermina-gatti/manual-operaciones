/*Su trabajo principal es leer las variables de entorno de la aplicación, validarlas al arrancar el servidor y decidir de manera
inteligente qué proveedor de almacenamiento utilizar: si conectar con el servicio real de AWS S3 o usar el almacenamiento en memoria
RAM (ideal para desarrollo local o tests). */

import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigType, registerAs } from '@nestjs/config';
import { FileStorage } from './file-storage';
import { InMemoryFileStorage } from './in-memory-file-storage';
import { S3FileStorage } from './s3-file-storage';

// 1. Configuración y validaciones de entorno que se ejecutan al arrancar la aplicación
export const storageConfig = registerAs('storage', () => {
  const env = process.env;
  const bucket = env.S3_BUCKET || undefined;
  const region = env.AWS_REGION || undefined;
  const endpoint = env.S3_ENDPOINT || undefined;
  const forcePathStyle = env.S3_FORCE_PATH_STYLE || 'false';

  // Validación 1: En producción es obligatorio usar un bucket real de S3
  if (!bucket && env.NODE_ENV === 'production') {
    throw new Error(
      'Falta S3_BUCKET: en producción no se usa el almacenamiento en memoria',
    );
  }
  // Validación 2: Si hay un bucket, la región de AWS no puede faltar
  if (bucket && !region) {
    throw new Error(
      'Falta AWS_REGION: es obligatoria cuando S3_BUCKET está definida',
    );
  }
  // Validación 3: Si se define un endpoint personalizado (ej. para MinIO), debe ser una URL válida
  if (endpoint && !URL.canParse(endpoint)) {
    throw new Error('S3_ENDPOINT tiene que ser una URL');
  }
  // Validación 4: El parámetro forcePathStyle debe ser estrictamente 'true' o 'false'
  if (forcePathStyle !== 'true' && forcePathStyle !== 'false') {
    throw new Error("S3_FORCE_PATH_STYLE tiene que ser 'true' o 'false'");
  }

  // Devuelve el objeto de configuración validado y limpio
  return {
    bucket,
    region,
    endpoint,
    forcePathStyle: forcePathStyle === 'true',
  };
});

// 2. Módulo de NestJS encargado de proveer el servicio de almacenamiento correcto
@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [
    {
      provide: FileStorage, // Token del contrato abstracto
      inject: [storageConfig.KEY],
      // Fábrica (Factory): Decide qué clase instanciar basándose en las variables de entorno
      useFactory: (config: ConfigType<typeof storageConfig>): FileStorage => {
        // Si hay bucket y región configurados, usa el almacenamiento real en AWS S3
        if (config.bucket && config.region) {
          return new S3FileStorage({
            bucket: config.bucket,
            region: config.region,
            endpoint: config.endpoint,
            forcePathStyle: config.forcePathStyle,
          });
        }

        // Si no están configurados, emite una advertencia en consola y usa el almacenamiento en memoria RAM
        new Logger(StorageModule.name).warn(
          'S3_BUCKET não está definida: se usa InMemoryFileStorage y los archivos se pierden al reiniciar',
        );
        return new InMemoryFileStorage();
      },
    },
  ],
  exports: [FileStorage], // Exporta el servicio para que otros módulos de la app puedan inyectarlo y usarlo
})
export class StorageModule {}
