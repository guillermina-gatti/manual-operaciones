/* En cada archivo de test: PrismaService y RedisModule leen la configuración aislada de pruebas E2E */

import { useE2eDatabase, useTestRedis } from './test-database';

useE2eDatabase();
useTestRedis();
