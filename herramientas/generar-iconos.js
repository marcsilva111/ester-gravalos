'use strict';
/* Genera los iconos de la aplicación a partir de herramientas/icono.svg.
   Solo hace falta ejecutarlo cuando cambia la marca; los PNG resultantes
   van en el repositorio, así que el servidor no necesita nada de esto.

       node herramientas/generar-iconos.js

   Usa el Chromium de Playwright si está disponible en la máquina. No es una
   dependencia de la agenda: el servidor sigue sin necesitar ningún paquete. */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ORIGEN = path.join(__dirname, 'icono.svg');
const DESTINO = path.join(RAIZ, 'iconos');
const MEDIDAS = [180, 192, 512];

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) {
    console.error('Hace falta Playwright para rasterizar el SVG: npm i -D playwright');
    process.exit(1);
  }
  const svg = fs.readFileSync(ORIGEN, 'utf8');
  fs.mkdirSync(DESTINO, { recursive: true });
  const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const lado of MEDIDAS){
    const pagina = await navegador.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
    await pagina.setContent('<style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block;width:' +
      lado + 'px;height:' + lado + 'px}</style>' + svg);
    const salida = path.join(DESTINO, 'icono-' + lado + '.png');
    await pagina.screenshot({ path: salida, omitBackground: false });
    await pagina.close();
    console.log('  ' + path.relative(RAIZ, salida) + '  ' + lado + '×' + lado);
  }
  await navegador.close();
})();
