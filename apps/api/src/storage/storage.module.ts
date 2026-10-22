import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigType, registerAs } from '@nestjs/config';
import { FileStorage } from './file-storage';
import { InMemoryFileStorage } from './in-memory-file-storage';
import { S3FileStorage } from './s3-file-storage';

// Se valida al arrancar (plan 6). Solo nombres de variables: los valores viven en el .env local.
export const storageConfig = registerAs('storage', () => {
  const env = process.env;
  const bucket = env.S3_BUCKET || undefined;
  const region = env.AWS_REGION || undefined;
  const endpoint = env.S3_ENDPOINT || undefined;
  const forcePathStyle = env.S3_FORCE_PATH_STYLE || 'false';

  if (!bucket && env.NODE_ENV === 'production') {
    throw new Error(
      'Falta S3_BUCKET: en producción no se usa el almacenamiento en memoria',
    );
  }
  if (bucket && !region) {
    throw new Error(
      'Falta AWS_REGION: es obligatoria cuando S3_BUCKET está definida',
    );
  }
  if (endpoint && !URL.canParse(endpoint)) {
    throw new Error('S3_ENDPOINT tiene que ser una URL');
  }
  if (forcePathStyle !== 'true' && forcePathStyle !== 'false') {
    throw new Error("S3_FORCE_PATH_STYLE tiene que ser 'true' o 'false'");
  }

  return {
    bucket,
    region,
    endpoint,
    forcePathStyle: forcePathStyle === 'true',
  };
});

// Elige la implementación de FileStorage (plan 5.5). Se registra en AppModule en T19.
@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [
    {
      provide: FileStorage,
      inject: [storageConfig.KEY],
      useFactory: (config: ConfigType<typeof storageConfig>): FileStorage => {
        if (config.bucket && config.region) {
          return new S3FileStorage({
            bucket: config.bucket,
            region: config.region,
            endpoint: config.endpoint,
            forcePathStyle: config.forcePathStyle,
          });
        }
        new Logger(StorageModule.name).warn(
          'S3_BUCKET no está definida: se usa InMemoryFileStorage y los archivos se pierden al reiniciar',
        );
        return new InMemoryFileStorage();
      },
    },
  ],
  exports: [FileStorage],
})
export class StorageModule {}
