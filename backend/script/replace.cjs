const Mustache = require('mustache');
const fs = require('fs');

const built_at = new Date().toISOString();

const defs = [
  ['./netlify/functions/ver.mustache', './netlify/functions/ver.js', { built_at }],
];

for (const [from, to, view] of defs) {
  const result = Mustache.render(fs.readFileSync(from, 'utf-8'), view);
  fs.writeFileSync(to, result);    
}
