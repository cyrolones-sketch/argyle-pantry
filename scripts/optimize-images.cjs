const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sharp = require('sharp');
(async () => {
  const context = {};
  vm.runInNewContext(await fs.readFile('menu-data.js', 'utf8'), context);
  const images = new Set(context.menuItems.flatMap(item => [item.image, ...(item.variants || []).map(v => v.image)]).filter(Boolean).map(src => src.split('?')[0]));
  const map = {};
  await fs.mkdir('assets/optimized', { recursive: true });
  let originalBytes = 0, menuBytes = 0;
  for (const source of images) {
    const buffer = await fs.readFile(source);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    map[source] = `assets/optimized/${hash}`;
    originalBytes += buffer.length;
    for (const size of [640, 1280]) {
      const target = `${map[source]}-${size}.webp`;
      await sharp(buffer).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 87, alphaQuality: 100 }).toFile(target);
      if (size === 640) menuBytes += (await fs.stat(target)).size;
    }
  }
  for (const name of ['hero-generated-brush', 'menu-donburi-cutout', 'menu-bento-cutout', 'menu-sushi-cutout']) {
    await sharp(`assets/${name}.png`).resize({ width: name.startsWith('hero') ? 1600 : 800, withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 100 }).toFile(`assets/optimized/${name}.webp`);
  }
  await fs.writeFile('image-map.js', `globalThis.optimizedImages = ${JSON.stringify(map, null, 2)};\n`);
  console.log(JSON.stringify({ images: images.size, originalBytes, menuBytes, reductionPercent: Math.round((1-menuBytes/originalBytes)*100) }));
})().catch(error => { console.error(error); process.exitCode = 1; });
