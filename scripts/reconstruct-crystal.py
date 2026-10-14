"""Refine visible cavity contours, then estimate their depth as individual pockets.

Front contour edges come from plate 1. Pocket termination and rear continuity
are manually interpreted from plates 5/6, NOT recovered hidden topology.
Wire gaps, scale figures and the floor reflection are not modeled as solids.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
PHOTOS=ROOT/"images/20260803 Crytallization"
NX,NY,NZ=256,112,56
FRAME=[42,430,986,412]
GUIDES=[
 [[.045,.32],[.09,.27],[.15,.29],[.17,.40],[.165,.66],[.115,.74],[.046,.70]],
 [[.20,.27],[.27,.35],[.29,.47],[.335,.55],[.325,.69],[.285,.73],[.225,.76],[.20,.61]],
 [[.365,.445],[.405,.455],[.475,.555],[.46,.67],[.405,.71],[.365,.60]],
 [[.605,.28],[.675,.265],[.71,.32],[.725,.46],[.717,.59],[.69,.625],[.61,.61],[.60,.44]],
 [[.77,.335],[.855,.32],[.88,.41],[.87,.565],[.815,.64],[.777,.605]],
 [[.25,.855],[.36,.84],[.45,.875],[.41,.935],[.27,.925]],
 [[.49,.79],[.55,.745],[.66,.755],[.76,.815],[.77,.90],[.65,.915],[.52,.865]],
 [[.055,.125],[.10,.11],[.105,.18],[.067,.21]],
 [[.145,.16],[.18,.14],[.185,.235],[.15,.24]],
 [[.935,.43],[.965,.43],[.98,.52],[.967,.59],[.94,.57]],
 [[.937,.64],[.965,.625],[.979,.675],[.969,.72],[.941,.715]],
]
# Estimated depths differ per pocket; a single extruded silhouette is not used.
DEPTHS=[.88,.76,.70,.84,.68,.48,.76,.34,.30,.52,.50]
TOP=[[0,.055],[.12,.07],[.17,.028],[.24,0],[.32,.05],[.47,.10],[.56,.075],[.595,.07],[.61,.005],[.68,.018],[.75,.09],[.785,.10],[.80,.065],[.88,.09],[1,.09]]


def refine_loop(guide,gray):
    p=np.asarray(guide)*FRAME[2:]+FRAME[:2]
    p=np.r_[p,p[:1]]
    lengths=np.linalg.norm(np.diff(p,axis=0),axis=1)
    cumulative=np.r_[0,np.cumsum(lengths)]
    result=[]
    for t in np.linspace(0,cumulative[-1],128,endpoint=False):
        segment=min(len(lengths)-1,np.searchsorted(cumulative,t,side="right")-1)
        a,b=p[segment],p[segment+1]
        point=a+(b-a)*(t-cumulative[segment])/lengths[segment]
        tangent=(b-a)/lengths[segment];normal=np.array([tangent[1],-tangent[0]])
        best=None
        for offset in range(-9,10):
            q=point+normal*offset
            outside=q+normal*3;inside=q-normal*3
            def sample(v):
                x,y=np.rint(v).astype(int)
                return gray[y-1:y+2,x-1:x+2].mean()
            score=sample(outside)-sample(inside)-abs(offset)*1.2
            if best is None or score>best[0]:best=(score,q)
        result.append((best[1]-FRAME[:2])/FRAME[2:])
    # Retain corners / image detail, reject isolated wire responses.
    result=np.asarray(result)
    result=np.median(np.stack([np.roll(result,1,axis=0),result,np.roll(result,-1,axis=0)]),axis=0)
    return np.round(result,6)


def inside(x,y,polygon):
    result=np.zeros(np.broadcast_shapes(x.shape,y.shape),dtype=bool)
    for a,b in zip(polygon,np.roll(polygon,1,axis=0)):
        crossing=(a[1]>y)!=(b[1]>y)
        x_at=(b[0]-a[0])*(y-a[1])/(b[1]-a[1]+1e-12)+a[0]
        result^=crossing&(x<x_at)
    return result


def reconstruct():
    photo=Image.open(PHOTOS/"1.webp").convert("RGB")
    gray=np.asarray(photo.convert("L"),dtype=float)
    loops=[refine_loop(guide,gray) for guide in GUIDES]
    x=(np.arange(NX)[:,None]+.5)/NX;y=(np.arange(NY)[None,:]+.5)/NY
    roof=np.interp(x[:,0],*np.asarray(TOP).T)
    # Refine only the visible roof edge, within a manually bounded region.
    # Fine roof variation is source-derived, never procedural noise.
    roof_pixels=[]
    for xx,guide in zip(x[:,0],roof):
        px=int(round(FRAME[0]+xx*FRAME[2]));py=int(round(FRAME[1]+guide*FRAME[3]))
        candidates=[]
        for offset in range(-12,13):
            yy=py+offset
            above=gray[yy-4:yy-1,px-1:px+2].mean()
            below=gray[yy+1:yy+4,px-1:px+2].mean()
            candidates.append((below-above-abs(offset)*.8,yy))
        roof_pixels.append(max(candidates)[1])
    refined=(np.asarray(roof_pixels)-FRAME[1])/FRAME[3]
    refined=np.median(np.stack([np.roll(refined,1),refined,np.roll(refined,-1)]),axis=0)
    # The back roof is not observed in this frontal plate. Its smoother guide
    # is deliberately recorded as an estimate, not a second extracted edge.
    volume=np.zeros((NX,NY,NZ),dtype=bool)
    for k in range(NZ):
        t=k/(NZ-1);section_roof=refined*(1-t)+roof*t
        volume[:,:,k]=(y>=section_roof[:,None])&(y<.985)
    for loop,depth in zip(loops,DEPTHS):
        center=loop.mean(axis=0)
        for k in range(NZ):
            z=k/(NZ-1)
            if z>=depth:continue
            # Finite taper is an explicit estimate, not fabricated infinite holes.
            # Preserve the irregular upright opening through most of its depth.
            # A spherical taper falsely turns the visible chambers into bowls.
            t=z/depth;tail=max(0,(t-.85)/.15)
            scale=max(.02,1-.10*t-.90*tail**1.6)
            shifted=center+(loop-center)*scale
            shifted[:,0]+=.014*t
            shifted[:,1]-=.018*t
            volume[:,:,k]&=~inside(x,y,shifted)
    columns=[]
    for i in range(NX):
        for k in range(NZ):
            changes=np.flatnonzero(np.diff(np.r_[False,volume[i,:,k],False]))
            columns.append(changes.astype(int).tolist())
    payload={
        "method":"image-guided-finite-cavity-volumes","version":2,"grid":[NX,NY,NZ],"dimensions":[8.2,3.5,2.4],
        "frontRoof":np.round(refined,6).tolist(),"estimatedBackRoof":np.round(roof,6).tolist(),
        "frontContours":[loop.tolist() for loop in loops],"pocketDepths":DEPTHS,"columns":columns,
        "sources":[{"path":f"images/20260803 Crytallization/{n}.webp","sha256":hashlib.sha256((PHOTOS/f"{n}.webp").read_bytes()).hexdigest(),"role":"front contour edge extraction" if n==1 else "manual oblique depth / rear-envelope interpretation"} for n in [1,5,6]],
        "uncertainty":"Pocket depth/taper, hidden chamber connectivity and rear geometry remain manually estimated; not the original model.",
    }
    out=ROOT/"src/particles/data/crystal-volume.json"
    out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
    draw=ImageDraw.Draw(photo)
    for i,loop in enumerate(loops):
        points=loop*np.asarray(FRAME[2:])+FRAME[:2]
        draw.line([tuple(p) for p in np.r_[points,points[:1]]],fill="#f1b751",width=2)
        center=points.mean(axis=0);draw.text(tuple(center),str(i+1),fill="#80cfff")
    preview=ROOT/".preview";preview.mkdir(exist_ok=True)
    photo.crop((30,410,1040,855)).save(preview/"crystal-contour-check.png")
    print(json.dumps({"grid":payload["grid"],"cavities":len(loops),"bytes":out.stat().st_size,"occupiedFraction":float(volume.mean())},indent=2))


if __name__=="__main__":reconstruct()
