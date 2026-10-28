/* En cada archivo de test: PrismaService y RedisModule leen la configuración aislada de pruebas */

import { useTestDatabase, useTestRedis } from './test-database';

useTestDatabase();
useTestRedis();
