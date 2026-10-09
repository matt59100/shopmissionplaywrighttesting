// Sert le rapport d'historique en HTTP (nécessaire pour le trace viewer) puis l'ouvre dans le navigateur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

const root = path.resolve('test-history');
const port = Number(process.env.PORT) || 9324;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm',
  '.zip': 'application/zip', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('Aucun rapport trouvé : lancez d\'abord les tests (npm test).');
  process.exit(1);
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.join(root, urlPath);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  });
}).listen(port, () => {
  const url = `http://localhost:${port}/`;
  console.log(`Rapport disponible sur ${url} (Ctrl+C pour arrêter)`);
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  exec(cmd);
});
