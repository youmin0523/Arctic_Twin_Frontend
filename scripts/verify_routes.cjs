// 실제 arcticRoutes.js 의 모든 항로/접근 배열을 파싱해 마스크 감사
const fs = require('fs');
const path = require('path');
const { auditRoute } = require('./route_audit.cjs');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'arcticRoutes.js'), 'utf8');

function parseWps(body) {
  const wps = [];
  const r = /\{\s*lon:\s*(-?[0-9.]+),\s*lat:\s*(-?[0-9.]+),\s*label:\s*'([^']*)'/g;
  let x;
  while ((x = r.exec(body))) wps.push({ lon: +x[1], lat: +x[2], label: x[3] });
  return wps;
}
function extract(key) {
  const m = src.match(new RegExp(key + ':\\s*\\[([\\s\\S]*?)\\n  \\],'));
  if (!m) throw new Error('not found ' + key);
  return parseWps(m[1]);
}

let totalBad = 0;
for (const k of ['SUEZ', 'CAPE']) {
  const r = auditRoute(k + ' (실데이터)', extract(k));
  totalBad += r.bad;
}

// SUEZ_DEP 하위 배열
const dep = src.match(/SUEZ_DEP:\s*\{([\s\S]*?)\n  \},/)[1];
const arrRe = /([A-Z]+):\s*\[([\s\S]*?)\]/g;
let m;
while ((m = arrRe.exec(dep))) {
  const r = auditRoute('SUEZ_DEP.' + m[1], parseWps(m[2]));
  totalBad += r.bad;
}

console.log('\n==== 총 잔여 육지관통 구간: ' + totalBad + ' ====');
