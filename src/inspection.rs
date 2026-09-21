//! CPU inspection of the same temporal and screen-footprint equations as splat.wgsl.
//! Picking ranks T*alpha at a pixel in the renderer's actual center-depth order;
//! this is not a GPU ID buffer or exact per-ray intersection with 3D ellipsoids.
use glam::{Mat4, Vec2, Vec3, Vec4};

#[derive(Clone, Copy)]
pub(crate) struct InspectionFrame {
    pub time: f32,
    pub view: Mat4,
    pub view_proj: Mat4,
    pub viewport: [f32; 4],
    pub eye: Vec3,
}

pub(crate) struct SplatProjection {
    pub mean: Vec3,
    pub rho: f32,
    pub temporal: f32,
    pub base_opacity: f32,
    pub opacity: f32,
    pub scales: Vec3,
    pub quaternion: Vec4,
    pub axes: [Vec3; 3],
    pub uv: Vec2,
    pub covariance: [f32; 3],
    pub sigmas: Vec2,
    pub major: Vec2,
    pub depth: f32,
    pub visible: bool,
}

pub(crate) fn project(row: &[f32; 32], frame: &InspectionFrame) -> Option<SplatProjection> {
    let v3 = |i| Vec3::new(row[i], row[i + 1], row[i + 2]);
    let dt = frame.time - row[3];
    let mean = v3(0) + v3(8) * dt + v3(11) * (dt * dt) + v3(14) * (dt * dt * dt);
    let rho = row[4].exp().max(1e-6);
    let temporal = (-(dt / rho).powi(2)).exp();
    let base_opacity = 1.0 / (1.0 + (-row[20]).exp());
    let opacity = base_opacity * temporal;
    let scales = v3(21).exp();
    let q = Vec4::from_slice(&row[24..28]) + dt * Vec4::from_slice(&row[28..32]);
    if !q.is_finite() || q.length_squared() < 1e-20 {
        return None;
    }
    let quaternion = q.normalize();
    let [w, x, y, z] = quaternion.to_array();
    let axes = [
        scales.x
            * Vec3::new(
                1.0 - 2.0 * (y * y + z * z),
                2.0 * (x * y + w * z),
                2.0 * (x * z - w * y),
            ),
        scales.y
            * Vec3::new(
                2.0 * (x * y - w * z),
                1.0 - 2.0 * (x * x + z * z),
                2.0 * (y * z + w * x),
            ),
        scales.z
            * Vec3::new(
                2.0 * (x * z + w * y),
                2.0 * (y * z - w * x),
                1.0 - 2.0 * (x * x + y * y),
            ),
    ];
    let clip = frame.view_proj * mean.extend(1.0);
    if !clip.is_finite() || clip.w.abs() < 1e-8 {
        return None;
    }
    let ndc = clip.truncate() / clip.w;
    let [vx, vy, width, height] = frame.viewport;
    let uv = Vec2::new(
        vx + (ndc.x + 1.0) * width * 0.5,
        vy + (1.0 - ndc.y) * height * 0.5,
    );
    let d = axes.map(|axis| {
        let delta = frame.view_proj * axis.extend(0.0);
        Vec2::new(
            delta.x * clip.w - clip.x * delta.w,
            delta.y * clip.w - clip.y * delta.w,
        ) / (clip.w * clip.w).max(1e-8)
            * Vec2::new(width, height)
            * 0.5
    });
    let a = d.iter().map(|v| v.x * v.x).sum::<f32>() + 0.3;
    let b = d.iter().map(|v| v.x * v.y).sum::<f32>();
    let c = d.iter().map(|v| v.y * v.y).sum::<f32>() + 0.3;
    let discriminant = ((a - c) * (a - c) + 4.0 * b * b).max(0.0).sqrt();
    let major_lambda = (0.5 * (a + c + discriminant)).max(0.1);
    let minor_lambda = (0.5 * (a + c - discriminant)).max(0.1);
    let major = if b.abs() > 1e-5 {
        Vec2::new(b, major_lambda - a).normalize()
    } else if c > a {
        Vec2::Y
    } else {
        Vec2::X
    };
    let sigmas = Vec2::new(
        major_lambda.sqrt().min(192.0),
        minor_lambda.sqrt().min(192.0),
    );
    if !sigmas.is_finite() || !major.is_finite() {
        return None;
    }
    let visible = opacity >= 1.0 / 255.0
        && clip.w > 0.0
        && ndc.x.abs() <= 1.35
        && ndc.y.abs() <= 1.35
        && (0.0..=1.0).contains(&ndc.z);
    Some(SplatProjection {
        mean,
        rho,
        temporal,
        base_opacity,
        opacity,
        scales,
        quaternion,
        axes,
        uv,
        covariance: [a, b, c],
        sigmas,
        major,
        depth: -(frame.view * mean.extend(1.0)).z,
        visible,
    })
}

impl SplatProjection {
    pub fn alpha_at(&self, pixel: Vec2) -> f32 {
        if !self.visible {
            return 0.0;
        }
        // WGSL covariance uses screen Y up, while pointer coordinates use Y down.
        let delta = (pixel - self.uv) * Vec2::new(1.0, -1.0);
        let local = Vec2::new(
            delta.dot(self.major),
            delta.dot(Vec2::new(-self.major.y, self.major.x)),
        ) / self.sigmas;
        if local.abs().max_element() > 3.0 {
            return 0.0;
        }
        let alpha = (self.opacity * (-0.5 * local.length_squared()).exp()).min(0.99);
        if alpha >= 1.0 / 255.0 {
            alpha
        } else {
            0.0
        }
    }

    /// WASM inspector ABI: see decodeProjection in public/inspector-data.mjs.
    pub fn pack(&self, frame: &InspectionFrame) -> Vec<f32> {
        let mut out = vec![frame.time]; // 0
        out.extend(self.mean.to_array()); // 1..4
        out.extend([self.opacity, self.rho, self.temporal, self.base_opacity]); // 4..8
        out.extend(self.scales.to_array()); // 8..11
        out.extend(self.quaternion.to_array()); // 11..15, wxyz
        out.extend(self.uv.to_array()); // 15..17
        out.extend(self.covariance); // 17..20, Y-up a,b,c
        out.extend(self.sigmas.to_array()); // 20..22
        out.extend(self.major.to_array()); // 22..24
        out.extend(frame.eye.to_array()); // 24..27
        out.extend([self.depth, if self.visible { 1.0 } else { 0.0 }]); // 27..29
        out.extend(frame.viewport); // 29..33
        for axis in self.axes {
            out.extend(axis.to_array());
        } // 33..42
        out
    }
}

pub(crate) fn pick(
    records: &[[f32; 32]],
    order: &[(f32, u32)],
    frame: &InspectionFrame,
    pixel: Vec2,
) -> Vec<f32> {
    let [x, y, w, h] = frame.viewport;
    if !pixel.is_finite() || pixel.x < x || pixel.y < y || pixel.x >= x + w || pixel.y >= y + h {
        return vec![];
    }
    let mut transmittance = 1.0_f32;
    let mut hits = Vec::new();
    for &(_, id) in order.iter().rev() {
        if let Some(s) = project(&records[id as usize], frame) {
            let alpha = s.alpha_at(pixel);
            if alpha == 0.0 {
                continue;
            }
            let weight = transmittance * alpha;
            hits.push([id as f32, alpha, transmittance, weight, s.depth]);
            transmittance *= 1.0 - alpha;
        }
    }
    hits.sort_by(|a, b| b[3].total_cmp(&a[3]));
    // Header: total hits, normalized t, pixel x,y. Up to 24 strongest candidates.
    let mut result = vec![hits.len() as f32, frame.time, pixel.x, pixel.y];
    for hit in hits.iter().take(24) {
        result.extend(hit);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> ([f32; 32], InspectionFrame) {
        let mut row = [0.0; 32];
        row[2] = -5.0;
        row[4] = 0.0;
        row[24] = 1.0;
        let projection = Mat4::perspective_rh(std::f32::consts::FRAC_PI_2, 1.0, 0.05, 180.0);
        (
            row,
            InspectionFrame {
                time: 0.0,
                view: Mat4::IDENTITY,
                view_proj: projection,
                viewport: [20.0, 30.0, 200.0, 200.0],
                eye: Vec3::ZERO,
            },
        )
    }
    #[test]
    fn screen_projection_matches_hand_calculation_and_letterboxing() {
        let (row, frame) = fixture();
        let p = project(&row, &frame).unwrap();
        assert!(p.uv.abs_diff_eq(Vec2::new(120.0, 130.0), 1e-4));
        assert!((p.covariance[0] - 400.3).abs() < 1e-3);
        assert!((p.alpha_at(p.uv) - 0.5).abs() < 1e-6);
        assert!(
            (p.alpha_at(p.uv + Vec2::new(p.sigmas.x, 0.0)) - 0.5 * (-0.5_f32).exp()).abs() < 1e-6
        );
        assert_eq!(p.alpha_at(p.uv + Vec2::new(p.sigmas.x * 3.01, 0.0)), 0.0);
        assert_eq!(p.pack(&frame).len(), 42);
    }
    #[test]
    fn picking_uses_transmittance_in_render_order_and_rejects_letterbox() {
        let (mut far, frame) = fixture();
        let mut near = far;
        near[2] = -4.0;
        // Near alpha 0.8, far alpha 0.5: weights 0.8 and 0.1.
        near[20] = 4.0_f32.ln();
        far[17] = 1.0;
        let records = [far, near];
        let order = [(5.0, 0), (4.0, 1)];
        let hits = pick(&records, &order, &frame, Vec2::new(120.0, 130.0));
        assert_eq!(hits[0], 2.0);
        assert_eq!(hits[4], 1.0);
        assert!((hits[7] - 0.8).abs() < 1e-6);
        assert!((hits[12] - 0.1).abs() < 1e-6);
        assert!(pick(&records, &order, &frame, Vec2::new(1.0, 1.0)).is_empty());
    }
    #[test]
    fn temporal_state_keeps_record_identity_and_rotation_finite() {
        let (mut row, mut frame) = fixture();
        row[8] = 2.0;
        row[28] = 0.1;
        frame.time = 0.5;
        let p = project(&row, &frame).unwrap();
        assert_eq!(p.mean.x, 1.0);
        assert!((p.temporal - (-0.25_f32).exp()).abs() < 1e-6);
        row[24] = 0.0;
        row[28] = 0.0;
        assert!(project(&row, &frame).is_none());
    }

    #[test]
    fn rotated_ellipse_reflects_screen_y_and_caps_footprint_like_shader() {
        let (mut row, frame) = fixture();
        row[21] = 2.0_f32.ln();
        row[22] = 0.5_f32.ln();
        row[23] = 0.5_f32.ln();
        row[24] = std::f32::consts::FRAC_PI_8.cos();
        row[27] = std::f32::consts::FRAC_PI_8.sin();
        let p = project(&row, &frame).unwrap();
        // A 45-degree rotation of diag(4, 0.25), with focal/z = 20.
        assert!((p.covariance[0] - 850.3).abs() < 0.001);
        assert!((p.covariance[1] - 750.0).abs() < 0.001);
        let screen_major = p.major * Vec2::new(1.0, -1.0);
        assert!(
            (p.alpha_at(p.uv + screen_major * p.sigmas.x) - 0.5 * (-0.5_f32).exp()).abs() < 1e-6
        );
        row[21] = 20.0_f32.ln();
        assert_eq!(project(&row, &frame).unwrap().sigmas.x, 192.0);
    }
}
