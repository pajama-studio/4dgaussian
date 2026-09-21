import assert from 'node:assert/strict';
import {initialRecords} from '../public/math/trace.mjs';
import {TrainingSession,createTrainingData,evaluateTraining,trainingIteration,trainingParameters} from '../public/math/training.mjs';
const data=createTrainingData(),records=initialRecords(),frozen=JSON.stringify(data);
const initial=evaluateTraining(records,data,true);
let maxGradientError=0;
for(const field of trainingParameters) {
  const h=1e-5,plus=structuredClone(records),minus=structuredClone(records);
  plus[0][field]+=h;minus[0][field]-=h;
  const finite=(evaluateTraining(plus,data).loss-evaluateTraining(minus,data).loss)/(2*h);
  const error=Math.abs(finite-initial.gradients[trainingParameters.indexOf(field)]);
  maxGradientError=Math.max(maxGradientError,error);assert.ok(error<1e-7,`Batch gradient field ${field}: ${error}`);
}
const teacher=initialRecords();teacher[0][0]=1.12;teacher[0][8]=.8;teacher[0][20]=.2;
assert.equal(evaluateTraining(teacher,data).loss,0);
assert.deepEqual(evaluateTraining(teacher,data,true).gradients,[0,0,0]);
const initialCopy=structuredClone(records),step=trainingIteration(records,data,5);
assert.deepEqual(records,initialCopy,'Preview is pure');
assert.deepEqual(step.afterRecords[1],records[1],'Gaussian B is fixed');
for(let field=0;field<32;field++)if(!trainingParameters.includes(field))assert.equal(step.afterRecords[0][field],records[0][field]);
const s=new TrainingSession(5);s.prepare();assert.equal(s.iteration,0);
for(let i=0;i<6;i++)s.next();assert.equal(s.stage,6);assert.deepEqual(s.records,initialCopy);assert.equal(s.history.length,1);
s.next();assert.equal(s.iteration,1);assert.equal(s.history.length,2);assert.deepEqual(s.records,step.afterRecords);
s.previous();assert.equal(s.iteration,0);assert.deepEqual(s.records,initialCopy);assert.equal(s.history.length,1);
s.next();assert.deepEqual(s.records,step.afterRecords);assert.equal(s.iteration,1,'Replaying does not apply twice');
s.next();assert.equal(s.stage,0);assert.equal(s.iteration,1);
for(let i=1;i<50;i++){for(let j=0;j<8;j++)s.next();}
assert.equal(s.iteration,50);assert.equal(s.history.length,51);
assert.ok(s.history.at(-1)<initial.loss*.6,'Default training must measurably improve the fixed objective');
assert.ok(s.history.every(Number.isFinite));assert.equal(JSON.stringify(data),frozen,'Targets stay fixed');
const final=s.history.at(-1);s.reset();assert.deepEqual(s.records,initialCopy);assert.equal(s.stage,0);assert.equal(s.iteration,0);assert.equal(s.history.length,1);
console.log('PASS: three full-batch finite-difference gradients, fixed targets, selective simultaneous updates, rewind/replay/reset; '+JSON.stringify({maxGradientError,initial:initial.loss,after50:final}));
