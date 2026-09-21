export const B = (en, zh) => ({ en, zh });
export const S = (en, zh, bodyEn, bodyZh, latex = '') => ({ title:B(en,zh), body:B(bodyEn,bodyZh), latex });
export const Q = (en, zh, choices, answer, feedback) => ({ question:B(en,zh), choices, answer, feedback });
export const sources = {
  gs:['https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/','3D Gaussian Splatting · paper & implementation'],
  stg:['https://arxiv.org/html/2312.16812v2','Spacetime Gaussian Feature Splatting · paper'],
  deform:['https://guanjunwu.github.io/4dgs/','4D-GS · deformation-based representation'],
  native:['https://arxiv.org/html/2310.10642v3','Native 4D Gaussian Splatting · joint spacetime representation'],
  density:['https://github.com/graphdeco-inria/gaussian-splatting/blob/main/scene/gaussian_model.py','3DGS · density control implementation'],
  train:['https://github.com/graphdeco-inria/gaussian-splatting/blob/main/train.py','3DGS · training implementation'],
  colmap:['https://colmap.github.io/format.html','COLMAP · camera and pose conventions'],
  adam:['https://arxiv.org/abs/1412.6980','Adam · original optimizer paper'],
  webgpu:['https://www.w3.org/TR/webgpu/','WebGPU · specification'],
};
