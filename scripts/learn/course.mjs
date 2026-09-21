import { rendering } from './rendering.mjs';
import { learning } from './learning.mjs';
import { shipping } from './shipping.mjs';
import { B } from './shared.mjs';
const exactCode={kernel:'course-kernel',camera:'course-camera',composite:'course-composite',gradient:'course-gradient',density:'course-duplication',data:'course-resize',budget:'course-budget'};
export const lessons=[...rendering,...learning,...shipping].map((lesson,i)=>({...lesson,
 code:[...(exactCode[lesson.lab]?[[exactCode[lesson.lab],B('The exact arithmetic behind this lesson’s controls and worked example.','本课控件与算例实际执行的计算函数。')]]:[]),...lesson.code],
 quizzes:lesson.quizzes.map(q=>{const order=q.choices.map((_,k)=>(k+i)%q.choices.length);return {...q,
   choices:order.map(k=>q.choices[k]),feedback:order.map(k=>q.feedback[k]),answer:order.indexOf(q.answer)};})
}));
export const phases=[
 {en:'See how pixels are made',zh:'看懂像素怎样形成'},
 {en:'Add appearance and time',zh:'加入外观与时间'},
 {en:'Learn from observations',zh:'从观测中学习'},
 {en:'Ship and explain the renderer',zh:'运行并解释渲染器'},
];
