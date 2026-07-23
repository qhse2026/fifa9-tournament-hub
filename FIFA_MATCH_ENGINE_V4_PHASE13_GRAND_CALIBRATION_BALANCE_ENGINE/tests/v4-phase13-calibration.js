require('../manager-match-engine-v4-phase13.bundle.js');
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const matches=Number(process.argv[2]||12);
const report=core.runCalibration({matches,seedPrefix:'phase13-validation',profile:'masterpiece'});
console.log(JSON.stringify(report,null,2));
