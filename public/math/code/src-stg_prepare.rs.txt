//! Reproducible CPU preparation variants. Variant 0 preserves the native baseline.
//! Source IDs and the 1/255 visibility threshold never change between variants.
use crate::{parse_stg_ply, sigmoid, ResearchSplat};
use glam::{Mat4, Vec3};

const CUT: f32 = 1.0 / 255.0;
const BUCKETS: usize = 64;

pub struct StgPreparation {
    source: Vec<ResearchSplat>,
    opacity: Vec<f32>,
    radius: Vec<f32>,
    inner: Vec<f32>,
    buckets: Vec<Vec<u32>>,
    ordered: Vec<(f32, u32)>,
    scratch: Vec<(f32, u32)>,
    indices: Vec<u32>,
    sampled: Vec<(Vec3, u32)>,
    last_sample: Option<f32>,
    last_frame: Option<(f32, Mat4, Mat4, u8)>,
    pub candidates: usize,
    pub cache_hit: bool,
    pub sort_ms: f64,
}

impl StgPreparation {
    pub fn from_ply(bytes: &[u8]) -> Result<Self, String> {
        Ok(Self::build(parse_stg_ply(bytes)?.source, true))
    }

    pub(crate) fn new(source: Vec<ResearchSplat>) -> Self {
        Self::build(source, false)
    }
    pub fn from_ply_adaptive(bytes: &[u8]) -> Result<Self, String> {
        Ok(Self::new(parse_stg_ply(bytes)?.source))
    }
    pub fn temporal_index_bytes(&self) -> usize {
        self.buckets.iter().map(|b| b.len() * 4).sum()
    }
    fn build(source: Vec<ResearchSplat>, force_index: bool) -> Self {
        let opacity: Vec<_> = source.iter().map(|s| sigmoid(s.opacity_logit)).collect();
        // Expand the analytic support slightly. The exact baseline test is still
        // evaluated afterwards; this index must only exclude definitely invisible IDs.
        let radius: Vec<_> = source
            .iter()
            .zip(&opacity)
            .map(|(s, &a)| {
                if a < CUT {
                    -1.0
                } else {
                    s.temporal_scale * (a / (CUT * (1.0 - 1e-5))).ln().max(0.0).sqrt() + 1e-5
                }
            })
            .collect();
        let inner: Vec<_> = source
            .iter()
            .zip(&opacity)
            .map(|(s, &a)| {
                if a <= CUT * (1.0 + 1e-5) {
                    -1.0
                } else {
                    (s.temporal_scale * (a / (CUT * (1.0 + 1e-5))).ln().sqrt() - 1e-5).max(-1.0)
                }
            })
            .collect();
        let coverage: f64 = radius
            .iter()
            .zip(&source)
            .filter(|(r, _)| **r >= 0.0)
            .map(|(&r, s)| {
                ((s.temporal_center + r).min(1.0) - (s.temporal_center - r).max(0.0)).max(0.0)
                    as f64
            })
            .sum::<f64>()
            / source.len().max(1) as f64;
        let indexed = force_index || coverage < 0.65;
        let mut buckets = if indexed {
            vec![Vec::new(); BUCKETS]
        } else {
            Vec::new()
        };
        for (i, (s, &r)) in source.iter().zip(&radius).enumerate() {
            if r < 0.0 {
                continue;
            }
            for (b, ids) in buckets.iter_mut().enumerate() {
                if s.temporal_center + r >= b as f32 / BUCKETS as f32
                    && s.temporal_center - r <= (b + 1) as f32 / BUCKETS as f32
                {
                    ids.push(i as u32);
                }
            }
        }
        let n = source.len();
        Self {
            source,
            opacity,
            radius,
            inner,
            buckets,
            ordered: Vec::with_capacity(n),
            scratch: Vec::with_capacity(n),
            indices: Vec::with_capacity(n),
            sampled: Vec::with_capacity(n),
            last_sample: None,
            last_frame: None,
            candidates: 0,
            cache_hit: false,
            sort_ms: 0.0,
        }
    }

    pub fn len(&self) -> usize {
        self.source.len()
    }
    pub fn is_empty(&self) -> bool {
        self.source.is_empty()
    }
    pub fn indices(&self) -> &[u32] {
        &self.indices
    }
    pub fn ordered(&self) -> &[(f32, u32)] {
        &self.ordered
    }

    /// 0 baseline; 1 cached sigmoid; 2 temporal support rejection;
    /// 3 temporal buckets; 4 exact radix order; 5 repeated-frame cache;
    /// 6 reuse temporal samples when only the camera changes.
    pub fn prepare(&mut self, time: f32, view: Mat4, projection: Mat4, variant: u8) -> &[u32] {
        let key = (time, view, projection, variant);
        self.cache_hit = variant >= 5 && self.last_frame == Some(key);
        if self.cache_hit {
            self.sort_ms = 0.0;
            return &self.indices;
        }
        let vp = projection * view;
        self.ordered.clear();
        let bucket = ((time.clamp(0.0, 1.0) * BUCKETS as f32) as usize).min(BUCKETS - 1);
        let capture_samples = variant >= 6 && (variant < 9 || self.last_sample == Some(time));
        let indexed = variant >= 3 && !self.buckets.is_empty();
        let reuse = variant >= 6 && self.last_sample == Some(time) && !self.sampled.is_empty();
        if !reuse {
            self.sampled.clear();
            self.candidates = if indexed {
                self.buckets[bucket].len()
            } else {
                self.source.len()
            };
            for j in 0..self.candidates {
                let i = if indexed {
                    self.buckets[bucket][j] as usize
                } else {
                    j
                };
                let s = self.source[i];
                let dt = time - s.temporal_center;
                if variant >= 2 && (self.radius[i] < 0.0 || dt.abs() > self.radius[i]) {
                    continue;
                }
                let (center, a) = if variant == 0 {
                    s.sample(time)
                } else {
                    let dt2 = dt * dt;
                    let center = s.base
                        + s.motion_linear * dt
                        + s.motion_quadratic * dt2
                        + s.motion_cubic * (dt2 * dt);
                    let a = if variant >= 7 && dt.abs() < self.inner[i] {
                        1.0
                    } else {
                        self.opacity[i] * (-(dt / s.temporal_scale).powi(2)).exp()
                    };
                    (center, a)
                };
                if a < CUT {
                    continue;
                }
                if capture_samples {
                    self.sampled.push((center, i as u32));
                }
                project(&mut self.ordered, center, i as u32, view, vp);
            }
        } else {
            for &(center, id) in &self.sampled {
                project(&mut self.ordered, center, id, view, vp);
            }
        }
        self.last_sample = if variant >= 6 { Some(time) } else { None };
        let sort_started = web_time::Instant::now();
        if variant >= 4 {
            if variant >= 8 {
                radix11(&mut self.ordered, &mut self.scratch);
            } else {
                radix(&mut self.ordered, &mut self.scratch);
            }
        } else {
            self.ordered
                .sort_unstable_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
        }
        self.sort_ms = sort_started.elapsed().as_secs_f64() * 1000.0;
        self.indices.clear();
        self.indices.extend(self.ordered.iter().map(|x| x.1));
        self.last_frame = Some(key);
        &self.indices
    }
}

fn project(out: &mut Vec<(f32, u32)>, center: Vec3, id: u32, view: Mat4, vp: Mat4) {
    let clip = vp * center.extend(1.0);
    if clip.w <= 0.0 {
        return;
    }
    let ndc = clip.truncate() / clip.w;
    if ndc.x.abs() > 1.35 || ndc.y.abs() > 1.35 || ndc.z < 0.0 || ndc.z > 1.0 {
        return;
    }
    out.push((-(view * center.extend(1.0)).z, id));
}

// Stable LSD sort. Input IDs are ascending, so equal depths retain the baseline
// ID tie-break. Float key also handles signed depths and IEEE total-order values.
fn radix(values: &mut Vec<(f32, u32)>, temp: &mut Vec<(f32, u32)>) {
    temp.resize(values.len(), (0.0, 0));
    let key = |x: f32| {
        let bits = x.to_bits();
        !(bits
            ^ if bits >> 31 != 0 {
                u32::MAX
            } else {
                0x8000_0000
            })
    };
    for shift in [0, 8, 16, 24] {
        let mut counts = [0usize; 256];
        for &(depth, _) in values.iter() {
            counts[((key(depth) >> shift) & 255) as usize] += 1;
        }
        let mut sum = 0;
        for count in &mut counts {
            let n = *count;
            *count = sum;
            sum += n;
        }
        for &value in values.iter() {
            let bucket = ((key(value.0) >> shift) & 255) as usize;
            temp[counts[bucket]] = value;
            counts[bucket] += 1;
        }
        std::mem::swap(values, temp);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn radix_matches_total_order_and_ties() {
        let mut values = vec![
            (1.0, 0),
            (-3.0, 1),
            (1.0, 2),
            (0.0, 3),
            (-0.0, 4),
            (f32::INFINITY, 5),
        ];
        let mut expected = values.clone();
        expected.sort_unstable_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
        radix(&mut values, &mut Vec::new());
        assert_eq!(
            values.iter().map(|x| x.1).collect::<Vec<_>>(),
            expected.iter().map(|x| x.1).collect::<Vec<_>>()
        );
    }
}

fn radix11(values: &mut Vec<(f32, u32)>, temp: &mut Vec<(f32, u32)>) {
    temp.resize(values.len(), (0.0, 0));
    let key = |x: f32| {
        let b = x.to_bits();
        !(b ^ if b >> 31 != 0 { u32::MAX } else { 0x8000_0000 })
    };
    for shift in [0, 11, 22] {
        let mut counts = [0usize; 2048];
        for &(depth, _) in values.iter() {
            counts[((key(depth) >> shift) & 2047) as usize] += 1;
        }
        let mut sum = 0;
        for c in &mut counts {
            let n = *c;
            *c = sum;
            sum += n;
        }
        for &v in values.iter() {
            let b = ((key(v.0) >> shift) & 2047) as usize;
            temp[counts[b]] = v;
            counts[b] += 1;
        }
        std::mem::swap(values, temp);
    }
}
