import { copyFile, access } from 'node:fs/promises';
try {
  await access(new URL('../.env', import.meta.url));
  console.log('.env já existe; configuração preservada.');
} catch {
  await copyFile(new URL('../.env.example', import.meta.url), new URL('../.env', import.meta.url));
  console.log('.env criado para desenvolvimento local.');
}
console.log('Próximos passos: npm install → npm run db:up → npm run db:generate → npm run db:migrate → npm run db:seed → npm run dev');
