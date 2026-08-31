'use strict';
/* Genera la versión publicable de la agenda a partir de index.html.
   El publicador aporta el envoltorio del documento (doctype, head y
   body), así que aquí solo se conservan el título, los estilos y el
   contenido de la página. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const title = (src.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
const style = (src.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const body = (src.match(/<body>([\s\S]*?)<\/body>/) || ['', ''])[1];

if (!title || !style || !body){
  console.error('No se ha podido extraer el título, los estilos o el cuerpo de index.html');
  process.exit(1);
}

const out = title + '\n' + style + '\n' + body.trim() + '\n';
fs.writeFileSync(path.join(__dirname, 'agenda-publicada.html'), out);
console.log('agenda-publicada.html generado (' + Math.round(out.length / 1024) + ' KB)');
