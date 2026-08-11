// Generates the app icon set from the source artwork. Run after replacing
// assets/icon-source.png:  node scripts/make-icons.js
const sharp = require('sharp');
const { join } = require('node:path');

const root = join(__dirname, '..');
const SRC = join(root, 'assets', 'icon-source.png');

async function main() {
  const targets = [
    { path: join(root, 'public', 'icon-192.png'), size: 192 },
    { path: join(root, 'public', 'icon-512.png'), size: 512 },
    { path: join(root, 'src', 'app', 'icon.png'), size: 256 },
    // iOS home screen: no alpha, and iOS applies its own rounded mask, so
    // feed it the full square on the artwork's own dark background.
    { path: join(root, 'src', 'app', 'apple-icon.png'), size: 180, flatten: true },
  ];
  for (const t of targets) {
    let img = sharp(SRC).resize(t.size, t.size, { fit: 'cover' });
    if (t.flatten) img = img.flatten({ background: '#0a0912' });
    await img.png().toFile(t.path);
    console.log('wrote', t.path);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
