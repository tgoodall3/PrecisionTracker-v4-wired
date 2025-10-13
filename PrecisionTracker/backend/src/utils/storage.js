import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

export function saveBase64Image(base64, filename){
  const m = base64.match(/^data:(.+);base64,(.*)$/);
  if(!m) throw new Error('Invalid base64 image');
  const buffer = Buffer.from(m[2], 'base64');
  const filePath = path.join(root, '..', 'uploads', filename);
  fs.writeFileSync(filePath, buffer);
  return '/uploads/' + filename;
}