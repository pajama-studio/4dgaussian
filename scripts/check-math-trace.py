"""Independent PyTorch float64 verification of the published JS pixel experiment."""
import json
from pathlib import Path
import torch

ROOT = Path(__file__).resolve().parent.parent
torch.set_default_dtype(torch.float64)
cases = json.loads((ROOT / "artifacts/math/trace-cases.json").read_text())
reports = []
for case in cases:
    raw = torch.tensor(case["records"], requires_grad=True)
    t, pixel = case["time"], torch.tensor(case["pixel"])
    dt = t - raw[:, 3]
    mean = raw[:, :3] + raw[:, 8:11]*dt[:, None] + raw[:, 11:14]*dt[:, None]**2 + raw[:, 14:17]*dt[:, None]**3
    q = torch.nn.functional.normalize(raw[:, 24:28]+dt[:, None]*raw[:, 28:32], dim=1)
    w,x,y,z = q.unbind(1)
    rotation = torch.stack((1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),
                            2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),
                            2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)),1).reshape(-1,3,3)
    sigma = rotation @ torch.diag_embed(torch.exp(2*raw[:,21:24])) @ rotation.transpose(1,2)
    x,y,z = mean.unbind(1)
    zero = torch.zeros_like(z)
    uv = torch.stack((100*x/z+64,100*y/z+48),1)
    J = torch.stack((100/z,zero,-100*x/z**2,zero,100/z,-100*y/z**2),1).reshape(-1,2,3)
    C = J @ sigma @ J.transpose(1,2) + 0.3*torch.eye(2)
    delta = pixel-uv
    power = -0.5*torch.einsum("ni,nij,nj->n",delta,torch.linalg.inv(C),delta)
    temporal = torch.exp(-(dt/torch.exp(raw[:,4]))**2)
    alpha = (torch.sigmoid(raw[:,20])*temporal*torch.exp(power)).clamp(max=0.99)
    # Independently derive quad coverage using torch's symmetric eigensolver.
    values, vectors = torch.linalg.eigh(C)
    local = torch.einsum("nij,nj->ni",vectors.transpose(1,2),delta)/torch.sqrt(values)
    alpha = torch.where((local.abs()<=3).all(1) & (alpha>=1/255), alpha, 0)
    order = z.argsort()
    color = torch.tensor([0.04,0.05,0.08])
    for i in reversed(order.tolist()):
        color = alpha[i]*raw[i,17:20].clamp(0,1)+(1-alpha[i])*color
    loss = ((color-torch.tensor([0.45,0.18,0.22]))**2).mean()
    loss.backward()
    errors = {"color":float((color-torch.tensor(case["color"])).abs().max().detach()),
              "loss":abs(float(loss.detach())-case["loss"]),
              "gradient":abs(float(raw.grad[0,case["parameter"]])-case["gradient"])}
    assert max(errors.values())<1e-10, errors
    reports.append({"time":t,"parameter":case["parameter"],"errors":errors})
(ROOT / "artifacts/math/pytorch-checks.json").write_text(json.dumps(reports,indent=2))
print(f"PASS: {len(reports)} independent float64 PyTorch forward/autograd comparisons, max error "
      f"{max(max(r['errors'].values()) for r in reports):.3g}")
