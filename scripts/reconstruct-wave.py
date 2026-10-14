"""Image-guided stepped sections of Wave Erosion.

Wire cages are NOT solids: a visual hull of their silhouettes fills the passage.
Instead, refine separately marked roof/floor sheets on two opposite long faces.
The guides identify the correct sheets; local image edges supply finer samples.
Depth between faces is a loft, explicitly estimated, not recovered hidden geometry.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PHOTO_DIR = ROOT / "images/20260804 Wave Erosion"
NX, NY, NZ = 384, 96, 78

# Normalized x is shared in world space, so plate 3 runs right-to-left.
FRONT_ROOF = [[0,.56],[.077,.704],[.14,.737],[.22,.59],[.26,.544],[.30,.557],[.414,.664],[.49,.483],[.55,.50],[.615,.315],[.706,.324],[.777,.274],[.848,.24],[.93,.225],[1,.254]]
FRONT_FLOOR = [[0,.865],[.108,.939],[.18,.83],[.26,.75],[.35,.766],[.453,.852],[.514,.72],[.615,.711],[.686,.705],[.762,.84],[.818,.76],[.899,.742],[.969,.653],[1,.725]]
BACK_ROOF = [[0,.70],[.10,.70],[.20,.65],[.30,.54],[.40,.47],[.50,.43],[.60,.34],[.70,.30],[.80,.26],[.90,.24],[1,.22]]
BACK_FLOOR = [[0,.94],[.10,.94],[.20,.91],[.30,.87],[.40,.82],[.50,.78],[.60,.75],[.70,.70],[.80,.66],[.90,.60],[1,.56]]


def face_pixel(plate, x, y):
    if plate == 1:
        return 43 + x * 987, 526 + y * 244
    return 74 + (1 - x) * 870, 562 + (1 - x) * 171 + y * 224


def refine(plate, guides, roof):
    gray = np.asarray(Image.open(PHOTO_DIR / f"{plate}.webp").convert("L"), dtype=float)
    xs = (np.arange(NX) + .5) / NX
    guide = np.interp(xs, *np.asarray(guides).T)
    result = []
    for x, guess in zip(xs, guide):
        px, py = face_pixel(plate, x, guess)
        px = int(round(px))
        # Strong terraces are horizontal. Average across 7 pixels to reject an
        # isolated hanging vertical wire, but preserve local steps and notches.
        stripe = gray[:, max(0, px-3):min(gray.shape[1], px+4)].mean(axis=1)
        candidates = np.arange(int(py)-11, int(py)+12)
        scores = []
        for y in candidates:
            above = stripe[y-5:y].mean()
            below = stripe[y+1:y+6].mean()
            edge = above-below if roof else below-above
            # The marked face is a prior, not ground truth; observed edges can
            # move each sample. Do not search unrelated cage / reflection edges.
            scores.append(edge - abs(y-py) * 1.15)
        best = int(candidates[np.argmax(scores)])
        origin_y = face_pixel(plate, x, 0)[1]
        result.append(np.clip((best-origin_y)/(244 if plate == 1 else 224), .02, .98))
    # Keep voxel terraces: no spline or invented noise displacement.
    values = np.asarray(result)
    values = np.median(np.stack([np.roll(values, -1), values, np.roll(values, 1)]), axis=0)
    values[0], values[-1] = result[0], result[-1]
    return np.rint(values*NY).astype(int)


def reconstruct():
    front = [refine(1, FRONT_ROOF, True), refine(1, FRONT_FLOOR, False)]
    back = [refine(3, BACK_ROOF, True), refine(3, BACK_FLOOR, False)]
    x=(np.arange(NX)[:,None]+.5)/NX
    z=np.broadcast_to(np.arange(NZ)[None,:]/(NZ-1),(NX,NZ))
    # Solve a bounded local Y correction by reprojecting the SAME XYZ candidate
    # into both images. Z is independent spatial geometry, never pixel brightness.
    # This supplies image-constrained interior terrace variation, not random noise.
    images=[]
    for plate in [1,3]:
        gray=np.asarray(Image.open(PHOTO_DIR/f"{plate}.webp").convert("L"),dtype=float)
        images.append((gray+np.roll(gray,1,axis=1)+np.roll(gray,-1,axis=1))/3)
    sheets=[]
    for layer in range(2):
        prior=(1-z)*front[layer][:,None]+z*back[layer][:,None]
        scores=[]
        for offset in range(-6,7):
            y=np.clip((prior+offset)/NY,.02,.98)
            scale=1+(987/763-1)*z
            px1=536.5+(x-.5)*987/scale
            py1=770.5-(1-y)*244/scale
            px3=163+(1-x)*870-z*89
            py3=495+(1-x)*171+z*67+y*224
            evidence=0
            for gray,px,py,weight in [(images[0],px1,py1,.25+.75*(1-z)),(images[1],px3,py3,.25+.75*z)]:
                ix=np.rint(px).astype(int);iy=np.rint(py).astype(int)
                above=(gray[iy-1,ix]+gray[iy-2,ix])/2
                below=(gray[iy+1,ix]+gray[iy+2,ix])/2
                edge=above-below if layer==0 else below-above
                evidence+=np.clip(edge,-35,35)*weight
            scores.append(evidence-abs(offset)*2.8)
        correction=np.argmax(np.stack(scores),axis=0)-6
        # Reject isolated one-pixel matches to wires; keep small coherent steps.
        neighbors=[np.roll(np.roll(correction,di,axis=0),dk,axis=1) for di in [-1,0,1] for dk in [-1,0,1]]
        correction=np.median(np.stack(neighbors),axis=0)
        values=np.rint(prior+correction).astype(int)
        values[:,0]=front[layer];values[:,-1]=back[layer]
        sheets.append(values)
    columns = []
    for i in range(NX):
        for k in range(NZ):
            roof = int(sheets[0][i,k])
            floor = int(sheets[1][i,k])
            floor = max(roof+4, floor)
            columns.append([0, roof, min(NY, floor), NY])

    # Orthogonal frame vectors measured on plate 3. These constrain proportions
    # and a comparison camera, NOT an asserted physically calibrated reconstruction.
    pitch = float(np.arcsin(np.sqrt((171/870)*(67/89))))
    yaw = float(np.arctan(np.sqrt((171/870)/(67/89))))
    depth = float(8.2*89/870/np.tan(yaw))
    height = float(8.2*224/(870/np.cos(yaw))/np.cos(pitch))
    payload = {
        "method": "image-edge-guided-opposite-face-loft", "version": 2,
        "grid": [NX, NY, NZ], "dimensions": [8.2, round(height,6), round(depth,6)],
        "sources": [{"path": f"images/20260804 Wave Erosion/{n}.webp",
                     "sha256": hashlib.sha256((PHOTO_DIR/f"{n}.webp").read_bytes()).hexdigest()} for n in [1,3]],
        "orbitDirection": [-round(float(np.sin(yaw)*np.cos(pitch)),7), round(float(np.sin(pitch)),7), -round(float(np.cos(yaw)*np.cos(pitch)),7)],
        "front": {"roof": front[0].tolist(), "floor": front[1].tolist()},
        "back": {"roof": back[0].tolist(), "floor": back[1].tolist()},
        "interiorFit": "bounded dual-view edge reprojection (+/-6 height cells), median-regularized; no noise field",
        "uncertainty": "Marked visible sheets refined by local edges; opposite-face loft with bounded reprojection detail remains ambiguous under occlusion, NOT original geometry.",
        "columns": columns,
    }
    data_dir = ROOT/"src/particles/data"
    data_dir.mkdir(exist_ok=True)
    destination = data_dir/"wave-volume.json"
    destination.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
    diagnostic = Image.new("RGB", (1080,750), "#07090b")
    for index, (plate, bounds) in enumerate([(1,front),(3,back)]):
        photo = Image.open(PHOTO_DIR/f"{plate}.webp").convert("RGB")
        draw = ImageDraw.Draw(photo)
        for values, color in zip(bounds, ["#59bdff", "#f6ae4a"]):
            points = [face_pixel(plate,(i+.5)/NX,value/NY) for i,value in enumerate(values)]
            draw.line(points, fill=color, width=2)
        region = (30,505,1050,790) if plate == 1 else (50,475,1050,980)
        crop = photo.crop(region)
        crop.thumbnail((1050,355))
        diagnostic.paste(crop, (15,25 if index == 0 else 355))
    ImageDraw.Draw(diagnostic).text((15,730), "BLUE: ROOF / GOLD: FLOOR. VISIBLE EDGE GUIDES, NOT A 3D ACCURACY SCORE.", fill="#ccd0d4")
    preview = ROOT/".preview"
    preview.mkdir(exist_ok=True)
    diagnostic.save(preview/"wave-edge-check.png")
    print(json.dumps({"grid":payload["grid"],"dimensions":payload["dimensions"],"uniqueFrontRoofLevels":len(set(front[0].tolist())),"meanPassageHeight":float(np.mean([c[2]-c[1] for c in columns])/NY),"dataBytes":destination.stat().st_size},indent=2))


if __name__ == "__main__":
    reconstruct()
