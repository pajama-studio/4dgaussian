"""Inspect this viewer's exact STG-Lite PLY contract; needs numpy, never unpickles.
Usage: python scripts/inspect_stg.py model.ply.gz --output artifacts/model-report.json
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np

FIELDS = ("x y z trbf_center trbf_scale nx ny nz "
          "motion_0 motion_1 motion_2 motion_3 motion_4 motion_5 motion_6 motion_7 motion_8 "
          "f_dc_0 f_dc_1 f_dc_2 opacity scale_0 scale_1 scale_2 "
          "rot_0 rot_1 rot_2 rot_3 omega_0 omega_1 omega_2 omega_3").split()


def inspect(path):
    packed = path.read_bytes()
    raw = gzip.decompress(packed) if packed.startswith(b"\x1f\x8b") else packed
    marker = b"end_header\n"
    end = raw.find(marker)
    if end < 0:
        raise ValueError("Expected LF-terminated binary STG-Lite PLY header")
    offset = end+len(marker)
    lines = raw[:offset].decode("ascii").splitlines()
    if lines[0] != "ply" or "format binary_little_endian 1.0" not in lines:
        raise ValueError("Expected binary little-endian PLY")
    properties = [line.split()[1:] for line in lines if line.startswith("property ")]
    if properties != [["float", name] for name in FIELDS]:
        raise ValueError("Properties are not the exact 32-float STG-Lite schema")
    elements = [line.split()[1:] for line in lines if line.startswith("element ")]
    if len(elements) != 1 or elements[0][0] != "vertex":
        raise ValueError("Expected one vertex element")
    count = int(elements[0][1])
    if count <= 0 or len(raw)-offset != count*128:
        raise ValueError("Vertex count and exact payload length disagree")
    rows = np.frombuffer(raw, dtype="<f4", offset=offset).reshape(count,32).astype(np.float64)
    if not np.isfinite(rows).all():
        raise ValueError("Non-finite stored attributes")
    # Activation must fit the renderer's f32 values, not just NumPy float64.
    with np.errstate(over="ignore", under="ignore"):
        scales = np.exp(rows[:,[4,21,22,23]].astype(np.float32)).astype(np.float64)
    if not np.isfinite(scales).all() or (scales == 0).any():
        raise ValueError("Invalid activated scales")
    opacity = 1/(1+np.exp(-np.clip(rows[:,20],-700,700)))
    samples = []
    for time in [0.0,0.1,0.5,0.9,1.0]:
        dt = time-rows[:,3]
        position = rows[:,:3]+rows[:,8:11]*dt[:,None]+rows[:,11:14]*dt[:,None]**2+rows[:,14:17]*dt[:,None]**3
        alpha = opacity*np.exp(-np.square(dt/scales[:,0]))
        rotation = rows[:,24:28]+dt[:,None]*rows[:,28:32]
        samples.append({"normalizedTime":time,"temporallyActive":int((alpha >= 1/255).sum()),
                        "meanBounds":[position.min(0).tolist(),position.max(0).tolist()],
                        "zeroQuaternionCount":int((np.linalg.norm(rotation,axis=1)<1e-8).sum())})
    return {"schema":"stg-lite-32f-le", "file":str(path), "count":count,
            "storedBytes":len(packed),"payloadBytes":count*128,"recordBytes":128,
            "sha256Stored":hashlib.sha256(packed).hexdigest(),
            "sha256Decoded":hashlib.sha256(raw).hexdigest(),
            "fitsCurrentViewerBudget":count <= 160000,
            "temporalCenterRange":[float(rows[:,3].min()),float(rows[:,3].max())],
            "samples":samples,
            "captureTime":"Unknown from PLY alone; require frame count, fps, start frame and time convention",
            "limits":"Sampled quaternion checks are not a proof over continuous time; spatial visibility is not evaluated"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file",type=Path)
    parser.add_argument("--output",type=Path)
    args = parser.parse_args()
    try:
        report = json.dumps(inspect(args.file),indent=2)
    except (ValueError, OSError, EOFError) as error:
        parser.exit(1,f"Invalid STG asset: {error}\n")
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(report,encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
