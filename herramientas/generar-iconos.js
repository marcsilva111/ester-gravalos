'use strict';
/* Genera todo lo que se ve de la marca a partir de un solo archivo:
   herramientas/marca.png —el anillo con la B, en el azul de la interfaz y
   con el fondo transparente, a 512 px—. De ahí salen:

     iconos/icono-180.png   el icono del iPhone
     iconos/icono-192.png   el icono de Android y del escritorio
     iconos/icono-512.png   el mismo, a tamaño grande
     y, dentro de index.html, la marca de la cabecera y el favicon, que van
     incrustados para que el archivo suelto siga funcionando sin servidor.

   Si cambia la marca: se sustituye herramientas/marca.png y se ejecuta

       node herramientas/generar-iconos.js

   Necesita Playwright en la máquina de quien lo ejecute. No es una
   dependencia de la agenda: el servidor sigue sin necesitar ningún paquete.
   El original del que salió marca.png está en logotipo-oficial.tif. */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const MARCA = path.join(__dirname, 'marca.png');
const AZUL = '#1e2dbe';
const MEDIDAS = [180, 192, 512];
const PROPORCION = 0.62;   // zona segura del recorte redondeado de iOS y Android

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) {
    console.error('Hace falta Playwright para componer los iconos: npm i -D playwright');
    process.exit(1);
  }
  const marca = 'data:image/png;base64,' + fs.readFileSync(MARCA).toString('base64');
  fs.mkdirSync(path.join(RAIZ, 'iconos'), { recursive: true });
  const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const pagina = await navegador.newPage({ viewport: { width: 512, height: 512 } });

  // Los iconos: la marca en blanco, centrada sobre el azul corporativo.
  for (const lado of MEDIDAS){
    await pagina.setViewportSize({ width: lado, height: lado });
    await pagina.setContent(
      '<style>html,body{margin:0;padding:0;overflow:hidden;background:' + AZUL + '}' +
      'img{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:' + Math.round(lado * PROPORCION) + 'px;filter:brightness(0) invert(1)}</style>' +
      '<img src="' + marca + '">');
    const salida = path.join(RAIZ, 'iconos', 'icono-' + lado + '.png');
    await pagina.screenshot({ path: salida });
    console.log('  ' + path.relative(RAIZ, salida) + '  ' + lado + '×' + lado);
  }

  // La marca de la cabecera y el favicon, incrustados en index.html.
  const dataURL = (lado) => pagina.evaluate(async ([src, n]) => {
    const im = new Image();
    await new Promise((ok, mal) => { im.onload = ok; im.onerror = mal; im.src = src; });
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, n, n);
    return c.toDataURL('image/png');
  }, [marca, lado]);

  await pagina.setContent('<body></body>');
  const cabecera = await dataURL(160);
  const favicon = await dataURL(64);

  const ruta = path.join(RAIZ, 'index.html');
  let html = fs.readFileSync(ruta, 'utf8');
  const antes = html;
  html = html.replace(/(<link rel="icon" href=")[^"]*(")/, '$1' + favicon + '$2');
  html = html.replace(/(<img class="brand-logo" src=")[^"]*(")/, '$1' + cabecera + '$2');
  if (html === antes) console.error('  ATENCIÓN: no se ha encontrado dónde incrustar la marca en index.html');
  else {
    fs.writeFileSync(ruta, html);
    console.log('  index.html  cabecera 160 px y favicon 64 px incrustados');
  }
  await navegador.close();
})();
