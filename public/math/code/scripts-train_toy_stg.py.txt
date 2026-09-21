"""Small, synthetic inverse-rendering lesson. NOT the official STG trainer.

Fit mean, linear motion, opacity and RGB to synthetic multiview images using
autograd, export the exact STG-Lite record, then render it with native_smoke.
No SfM, densification, learned rotation, feature decoder or real-world claims.
Requires torch and numpy; uses CUDA when present. No downloaded training data.
"""
import argparse
import json
import math
from pathlib import Path
import time

import numpy as np
import torch

PROPERTIES = ("x y z trbf_center trbf_scale nx ny nz "
              "motion_0 motion_1 motion_2 motion_3 motion_4 motion_5 motion_6 motion_7 motion_8 "
              "f_dc_0 f_dc_1 f_dc_2 opacity scale_0 scale_1 scale_2 "
              "rot_0 rot_1 rot_2 rot_3 omega_0 omega_1 omega_2 omega_3").split()


def render(mean, motion, rgb_logits, opacity_logits, times, cameras, width=64, height=48):
    # OpenCV camera axes; all cameras point along +Z. Focal length scales with width.
    device = mean.device
    focal = width * 60 / 64
    dt = times[:, None, None] - 0.5
    xyz = mean[None] + motion[None] * dt - cameras[:, None, :]
    x, y, z = xyz.unbind(-1)
    uv = torch.stack((focal*x/z + width/2, focal*y/z + height/2), -1)
    zero = torch.zeros_like(z)
    jacobian = torch.stack((focal/z, zero, -focal*x/z.square(),
                            zero, focal/z, -focal*y/z.square()), -1).reshape(*z.shape, 2, 3)
    covariance = 0.12**2 * (jacobian @ jacobian.transpose(-1, -2))
    covariance = covariance + torch.eye(2, device=device) * 0.3
    ys, xs = torch.meshgrid(torch.arange(height, device=device)+0.5,
                           torch.arange(width, device=device)+0.5, indexing="ij")
    delta = torch.stack((xs, ys), -1)[None, None] - uv[:, :, None, None]
    inverse = torch.linalg.inv(covariance)
    power = -0.5 * torch.einsum("bnhwi,bnij,bnhwj->bnhw", delta, inverse, delta)
    temporal = torch.exp(-((times[:, None]-0.5)/0.55).square())
    alpha = (torch.sigmoid(opacity_logits)[None, :, None, None]
             * temporal[:, :, None, None] * torch.exp(power)).clamp(max=0.99)
    alpha = torch.where(alpha >= 1/255, alpha, 0)
    order = z.argsort(dim=1)  # Discrete ordering; no gradient through visibility changes.
    alpha = alpha.gather(1, order[:, :, None, None].expand_as(alpha))
    color = torch.sigmoid(rgb_logits)[order]
    transmittance = torch.cumprod(torch.cat((torch.ones_like(alpha[:, :1]), 1-alpha), 1), 1)[:, :-1]
    return (transmittance[:, :, :, :, None] * alpha[:, :, :, :, None]
            * color[:, :, None, None, :]).sum(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("artifacts/toy-training"))
    parser.add_argument("--steps", type=int, default=400)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()
    if args.steps < 1:
        parser.error("--steps must be positive")
    torch.manual_seed(7)
    args.output.mkdir(parents=True, exist_ok=True)
    device = torch.device(args.device)
    teacher = [torch.tensor(value, device=device, dtype=torch.float32) for value in [
        [[-.55,-.25,3.0],[.0,-.25,3.2],[.55,-.25,3.4],[-.3,.3,3.1],[.3,.3,3.3]],
        [[.4,.1,0],[-.2,.3,.1],[.1,-.4,0],[.3,-.1,-.1],[-.4,-.1,.1]],
        [[2,-1,-1],[-1,2,-1],[-1,-1,2],[2,1,-1],[-1,1,2]],
        [2,2,2,2,2],
    ]]
    times = torch.linspace(0.05, 0.95, 9, device=device).repeat(2)
    cameras = torch.zeros((18, 3), device=device)
    cameras[:9, 0] = -0.3
    cameras[9:, 0] = 0.3
    with torch.no_grad():
        truth = render(*teacher, times, cameras)
    fitted = [torch.nn.Parameter(teacher[0]+torch.randn_like(teacher[0])*0.08),
              torch.nn.Parameter(torch.zeros_like(teacher[1])),
              torch.nn.Parameter(teacher[2]+torch.randn_like(teacher[2])*0.5),
              torch.nn.Parameter(torch.ones_like(teacher[3]))]
    optimizer = torch.optim.Adam(fitted, lr=0.025)
    history = []
    started = time.perf_counter()
    for step in range(args.steps):
        optimizer.zero_grad(set_to_none=True)
        loss = (render(*fitted, times, cameras)-truth).square().mean()
        if not torch.isfinite(loss):
            raise RuntimeError("Non-finite training loss")
        loss.backward()
        optimizer.step()
        history.append(float(loss.detach().cpu()))
        if step % 100 == 0:
            print(f"step={step} mse={history[-1]:.8f}", flush=True)
    with torch.no_grad():
        final_mse = float((render(*fitted, times, cameras)-truth).square().mean().cpu())
        held_times = torch.tensor([0.35,0.65], device=device)
        held_cameras = torch.zeros((2,3), device=device)
        held_mse = float((render(*fitted, held_times, held_cameras)-render(*teacher, held_times, held_cameras)).square().mean().cpu())
    rows = np.zeros((len(teacher[0]),32), dtype="<f4")
    rows[:, :3] = fitted[0].detach().cpu().numpy()
    rows[:, 3] = 0.5
    rows[:, 4] = math.log(0.55)
    rows[:, 8:11] = fitted[1].detach().cpu().numpy()
    rows[:, 17:20] = fitted[2].sigmoid().detach().cpu().numpy()
    rows[:, 20] = fitted[3].detach().cpu().numpy()
    rows[:, 21:24] = math.log(0.12)
    rows[:, 24] = 1  # quaternion wxyz
    header = (f"ply\nformat binary_little_endian 1.0\nelement vertex {len(rows)}\n"
              + "".join(f"property float {p}\n" for p in PROPERTIES) + "end_header\n")
    (args.output/"model.ply").write_bytes(header.encode("ascii")+rows.tobytes())
    (args.output/"cameras.json").write_text(json.dumps({
        "schema":"pajama.stg.reference-cameras.v1", "cameras":[{
            "name":"synthetic-heldout", "width":64, "height":48, "fx":60, "fy":60,
            "position":[0,0,0], "rotation":[[1,0,0],[0,1,0],[0,0,1]]}]}, indent=2), encoding="utf-8")
    report = {
        "scope":"synthetic teaching experiment; not official STG training or real-scene reconstruction",
        "torch":torch.__version__, "device":str(device), "seed":7, "steps":args.steps,
        "splats":len(rows), "trainImages":18, "imageSize":[64,48],
        "learned":["mean","linear motion","RGB","opacity"],
        "fixed":["scale","rotation","temporal center","temporal scale","splat count"],
        "initialMse":history[0], "finalMse":final_mse,
        "heldoutSyntheticMse":held_mse, "heldoutSyntheticPsnr":-10*math.log10(max(held_mse,1e-15)),
        "elapsedSeconds":time.perf_counter()-started,
        "timeContract":{"normalizedStart":0,"normalizedEnd":1,"captureSeconds":None},
        "lossEvery100Steps":history[::100],
    }
    (args.output/"training-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if final_mse >= history[0] * 0.1:
        raise RuntimeError("Training failed to reduce loss by at least 10x")


if __name__ == "__main__":
    main()
