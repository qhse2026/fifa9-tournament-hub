const fs=require('node:fs');
require('../manager-match-engine-v4-phase13.bundle.js');
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const matches=Number(process.env.ME4_CAL_MATCHES||process.argv[2]||4);
const baselinePath=process.env.ME4_BASELINE||process.argv[3];
const report=core.runCalibration({matches,seedPrefix:process.env.ME4_SEED_PREFIX||'phase13-ci',profile:process.env.ME4_PROFILE||'masterpiece'});
console.log(JSON.stringify({version:report.version,matches,metrics:report.metrics,evaluation:report.evaluation,fingerprint:report.fingerprint},null,2));
let failed=report.evaluation.status==='FAIL';
if(baselinePath){const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));const comparison=core.compareBalanceBaseline(report,baseline);console.log(JSON.stringify({baselineComparison:comparison},null,2));failed=failed||!comparison.pass;}
process.exitCode=failed?1:0;
