'use strict';
const fs=require('node:fs'), path=require('node:path');
const files=process.argv.slice(2); if(!files.length) throw new Error('Pass worker JSON files');
const total={}; const scores=[];
for(const file of files){const row=JSON.parse(fs.readFileSync(file,'utf8')); scores.push(...row.scores); for(const [k,v] of Object.entries(row.total)) total[k]=Number(total[k]||0)+Number(v||0);}
const n=total.matches||1; const average={};
for(const [k,v] of Object.entries(total)) if(k!=='matches') average[k]=Math.round(v/n*100)/100;
average.passAccuracy=Math.round(total.passesCompleted/Math.max(1,total.passesAttempted)*10000)/100;
average.pressSuccessRate=Math.round(total.successfulPressures/Math.max(1,total.pressures)*10000)/100;
average.tackleSuccessRate=Math.round(total.tacklesWon/Math.max(1,total.tacklesAttempted)*10000)/100;
console.log(JSON.stringify({version:'4.0.0-phase6.1',matches:n,average,sampleScorelines:scores.slice(0,12)},null,2));
