/* En cada archivo de test: PrismaService lee DATABASE_URL, que apunta a la base de tests */

import { useTestDatabase } from './test-database';

useTestDatabase();
