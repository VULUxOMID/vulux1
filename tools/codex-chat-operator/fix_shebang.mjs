import { readFileSync, writeFileSync } from 'fs';

const path = '/Users/omid/vulux1/tools/codex-chat-operator/index.mjs';
let src = readFileSync(path, 'utf8');

const shebang = '#!/usr/bin/env node';
// Remove shebang wherever it is, then prepend it
src = src.replace(shebang, '').trimStart();
src = shebang + '\n' + src;

writeFileSync(path, src);
console.log('Fixed. First 120 chars:');
console.log(src.substring(0, 120));
