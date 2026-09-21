// A real, tiny full-batch SGD experiment. Analytic derivatives, fixed synthetic
// targets, one camera, three times, two STG-Lite splats. No prerecorded losses.
import { initialRecords, forward, gradient } from './trace.mjs';

export const trainingSpec = Object.freeze({ width:12, height:10, left:68, top:63, times:[0.25,0.5,0.75] });
export const trainingParameters = [0,8,20]; // A: mean x, linear motion x, opacity logit
export const trainingNames = ['μ₀x','m₁x','β'];
export const copyRecords = rows => rows.map(row=>[...row]);

export function createTrainingData() {
  const truth=initialRecords();
  truth[0][0]=1.12; truth[0][8]=0.8; truth[0][20]=0.2;
  const {width,height,left,top,times}=trainingSpec;
  return times.map(time=>({time,samples:Array.from({length:width*height},(_,i)=>{
    const pixel=[left+i%width+0.5,top+Math.floor(i/width)+0.5];
    return {pixel,target:forward(truth,time,pixel).color};
  })}));
}

export function evaluateTraining(records, data, withGradient=false) {
  let loss=0; const gradients=[0,0,0],frames=[];
  const count=data.reduce((n,frame)=>n+frame.samples.length,0);
  for(const frame of data) {
    const pixels=[];
    for(const sample of frame.samples) {
      const options={target:sample.target,finite:false};
      const position=withGradient?gradient(records,0,frame.time,sample.pixel,options):null;
      const result=position?.result??forward(records,frame.time,sample.pixel,options);
      loss+=result.loss/count;
      if(withGradient) {
        gradients[0]+=position.analytic/count;
        gradients[1]+=position.analytic*(frame.time-records[0][3])/count;
        gradients[2]+=gradient(records,20,frame.time,sample.pixel,options).analytic/count;
      }
      pixels.push(result);
    }
    frames.push(pixels);
  }
  return {loss,gradients,frames};
}

export function trainingIteration(records, data, rate=1) {
  if(!Number.isFinite(rate)||rate<=0)throw new RangeError('Learning rate must be positive');
  const beforeRecords=copyRecords(records),before=evaluateTraining(beforeRecords,data,true);
  const afterRecords=copyRecords(beforeRecords);
  // All gradients come from the same pre-update batch; commit simultaneously.
  trainingParameters.forEach((field,j)=>{afterRecords[0][field]-=rate*before.gradients[j];});
  const after=evaluateTraining(afterRecords,data);
  if(!Number.isFinite(after.loss)||!afterRecords.flat().every(Number.isFinite))throw new Error('Non-finite training state');
  return {beforeRecords,before,afterRecords,after,rate};
}

// Moving through explanatory stages never repeats an update. Only the last
// stage commits; rewinding from it restores the exact pre-update snapshot.
export class TrainingSession {
  constructor(rate=1) { this.data=createTrainingData(); this.rate=rate; this.reset(); }
  reset() {
    this.records=initialRecords(); this.stage=0; this.iteration=0;
    this.history=[evaluateTraining(this.records,this.data).loss]; this.pending=null;
  }
  prepare() { return this.pending??=trainingIteration(this.records,this.data,this.rate); }
  next() {
    if(this.stage===7) { this.pending=null;this.stage=0;return; }
    const trace=this.prepare(); this.stage++;
    if(this.stage===7) {
      this.records=copyRecords(trace.afterRecords);this.iteration++;
      this.history.push(trace.after.loss);
    }
  }
  previous() {
    if(this.stage===0)return;
    if(this.stage===7) {
      this.records=copyRecords(this.pending.beforeRecords);this.iteration--;this.history.pop();
    }
    this.stage--;
  }
}
