const { Resvg } = require('@resvg/resvg-js');
const { default: pngToIco } = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const svgPath = path.join(buildDir, 'icon.svg');
const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

const svgBuffer = fs.readFileSync(svgPath);
const resvg = new Resvg(svgBuffer, {
  fitTo: { mode: 'width', value: 1024 },
  background: 'transparent',
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();
fs.writeFileSync(pngPath, pngBuffer);
console.log(`Created ${pngPath}`);

pngToIco(pngBuffer)
  .then((buf) => {
    fs.writeFileSync(icoPath, buf);
    console.log(`Created ${icoPath}`);
  })
  .catch((err) => {
    console.error('Failed to create ICO:', err);
    process.exit(1);
  });
