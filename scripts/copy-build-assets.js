import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const srcBuild = path.join(rootDir, 'build');
const destDistElectron = path.join(rootDir, 'dist-electron');

try {
  if (!fs.existsSync(destDistElectron)) {
    fs.mkdirSync(destDistElectron, { recursive: true });
  }

  if (fs.existsSync(srcBuild)) {
    const files = fs.readdirSync(srcBuild);
    for (const file of files) {
      if (file.startsWith('icon.') || file.startsWith('icon-') || file.startsWith('icons')) {
        const srcPath = path.join(srcBuild, file);
        const destPath = path.join(destDistElectron, file);
        const stat = fs.statSync(srcPath);
        if (stat.isFile()) {
          fs.copyFileSync(srcPath, destPath);
        } else if (stat.isDirectory()) {
          fs.cpSync(srcPath, destPath, { recursive: true });
        }
      }
    }
  }

  // Also keep Android assets synced if android directory and dist directory exist
  const androidDir = path.join(rootDir, 'android');
  const distDir = path.join(rootDir, 'dist');
  if (fs.existsSync(androidDir) && fs.existsSync(distDir)) {
    try {
      execSync('npx cap copy android', { cwd: rootDir, stdio: 'ignore' });
    } catch {
      const destAndroidPublic = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');
      if (fs.existsSync(destAndroidPublic)) {
        fs.cpSync(distDir, destAndroidPublic, { recursive: true });
      }
    }
  }
} catch (err) {
  // Gracefully continue if copy is optional
  console.warn('Notice while copying build assets:', err.message);
}
