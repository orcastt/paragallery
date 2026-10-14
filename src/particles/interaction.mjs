// Local point-cloud contact and damped springs. Coordinates are model-space XYZ.
// No screen plane, infinite ray cylinder, or whole-object displacement field.
export const CONTACT_RADIUS = .38;
export const MAX_DISPLACEMENT = .16;

export class ParticleField {
  constructor(positions, cellSize = .18) {
    this.rest = positions;
    this.offsets = new Float32Array(positions.length);
    this.velocity = new Float32Array(positions.length);
    this.active = [];
    this.awake = new Uint8Array(positions.length / 3);
    this.buckets = new Map(); this.cellSize = cellSize; this.peakOffset = 0;
    this.min = [Infinity,Infinity,Infinity]; this.max = [-Infinity,-Infinity,-Infinity];
    for (let i=0;i<positions.length;i++) {const a=i%3;this.min[a]=Math.min(this.min[a],positions[i]);this.max[a]=Math.max(this.max[a],positions[i]);}
    for (let a=0;a<3;a++) {this.min[a]-=cellSize+MAX_DISPLACEMENT;this.max[a]+=cellSize+MAX_DISPLACEMENT;}
    this.dims=this.min.map((v,a)=>Math.ceil((this.max[a]-v)/cellSize)+1);
    for (let i=0;i<positions.length;i+=3) {
      const xyz=[0,1,2].map(a=>Math.floor((positions[i+a]-this.min[a])/cellSize));
      const key=this.key(...xyz); let bucket=this.buckets.get(key);
      if (!bucket) {bucket=[];this.buckets.set(key,bucket);} bucket.push(i/3);
    }
  }
  key(x,y,z) {return (x*this.dims[1]+y)*this.dims[2]+z;}
  candidates(center,radius,visited) {
    const lo=center.map((v,a)=>Math.max(0,Math.floor((v-radius-this.min[a])/this.cellSize)));
    const hi=center.map((v,a)=>Math.min(this.dims[a]-1,Math.floor((v+radius-this.min[a])/this.cellSize)));
    const result=[];
    for (let x=lo[0];x<=hi[0];x++) for (let y=lo[1];y<=hi[1];y++) for (let z=lo[2];z<=hi[2];z++) {
      const key=this.key(x,y,z);if(visited?.has(key))continue;if(visited)visited.add(key);
      const bucket=this.buckets.get(key);if(bucket)for(const id of bucket)result.push(id);
    }
    return result;
  }
  raycast(origin,direction,radius=.06,maxDistance=150) {
    const length=Math.hypot(...direction);if(length<1e-8)return null;
    const axis=direction.map(v=>v/length);
    let near=0,far=maxDistance;
    for (let a=0;a<3;a++) {
      if (Math.abs(axis[a])<1e-9) {if(origin[a]<this.min[a]||origin[a]>this.max[a])return null;continue;}
      let t0=(this.min[a]-origin[a])/axis[a],t1=(this.max[a]-origin[a])/axis[a];
      if(t0>t1)[t0,t1]=[t1,t0];near=Math.max(near,t0);far=Math.min(far,t1);
    }
    if(near>far||far<0)return null;
    const visited=new Set();let best=null;
    for(let t=near;t<=far;t+=this.cellSize*.65) {
      const center=origin.map((v,a)=>v+axis[a]*t);
      for(const id of this.candidates(center,radius+MAX_DISPLACEMENT+this.cellSize,visited)) {
        const n=id*3,p=[0,1,2].map(a=>this.rest[n+a]+this.offsets[n+a]);
        const delta=p.map((v,a)=>v-origin[a]),along=delta.reduce((s,v,a)=>s+v*axis[a],0);
        if(along<0||along>maxDistance||(best&&along>=best.distance))continue;
        const perpendicular=delta.reduce((s,v,a)=>s+(v-axis[a]*along)**2,0);
        if(perpendicular<=radius*radius)best={index:id,point:p,distance:along,axis};
      }
      if(best&&t>best.distance+this.cellSize)break;
    }
    return best;
  }
  activate(id) {
    if(this.awake[id])return true;
    if(this.active.length>=20000)return false;
    this.awake[id]=1;this.active.push(id);return true;
  }
  brush(center,axis,stroke,mode,strength,dt,impulse=false,radius=CONTACT_RADIUS) {
    if(!(strength>0))return 0;
    let affected=0;
    const gain=impulse ? .68 : Math.min(dt,1/30)*12;
    for(const id of this.candidates(center,radius+MAX_DISPLACEMENT)) {
      const n=id*3,delta=[0,1,2].map(a=>this.rest[n+a]+this.offsets[n+a]-center[a]);
      const distance=Math.hypot(...delta);if(distance>=radius||!this.activate(id))continue;
      const radial=distance>.0001?delta.map(v=>v/distance):axis;
      const f=(1-distance/radius)**2*strength*gain;
      let force;
      if(mode===1)force=radial;
      else if(mode===2)force=radial.map(v=>-v);
      else if(mode===3)force=[axis[1]*radial[2]-axis[2]*radial[1],axis[2]*radial[0]-axis[0]*radial[2],axis[0]*radial[1]-axis[1]*radial[0]];
      else force=axis.map((v,a)=>v*.75+radial[a]*.25);
      for(let a=0;a<3;a++)this.velocity[n+a]+=f*(force[a]+Math.max(-.8,Math.min(.8,stroke[a]||0))*.5);
      affected++;
    }
    return affected;
  }
  scatter(strength=.7) {
    const stride=Math.max(1,Math.ceil(this.awake.length/12000));
    for(let id=0;id<this.awake.length;id+=stride)if(this.activate(id))for(let a=0;a<3;a++)this.velocity[id*3+a]+=(Math.sin((id+1)*(a+3)*1.618)*.4)*strength;
  }
  step(dt) {
    if(!this.active.length){this.peakOffset=0;return false;}
    if(!(dt>0))return false;
    const steps=Math.max(1,Math.ceil(Math.min(dt,1/30)*120)),h=Math.min(dt,1/30)/steps;
    this.peakOffset=0;
    for(let i=this.active.length-1;i>=0;i--) {
      const id=this.active[i],n=id*3;
      for(let s=0;s<steps;s++) {
        for(let a=0;a<3;a++) {
          this.velocity[n+a]+=(-48*this.offsets[n+a]-8.5*this.velocity[n+a])*h;
          this.offsets[n+a]+=this.velocity[n+a]*h;
        }
        const length=Math.hypot(this.offsets[n],this.offsets[n+1],this.offsets[n+2]);
        if(length>MAX_DISPLACEMENT)for(let a=0;a<3;a++){this.offsets[n+a]*=MAX_DISPLACEMENT/length;this.velocity[n+a]*=.45;}
      }
      const distance=Math.hypot(this.offsets[n],this.offsets[n+1],this.offsets[n+2]);
      this.peakOffset=Math.max(this.peakOffset,distance);
      if(distance<.0001&&Math.hypot(this.velocity[n],this.velocity[n+1],this.velocity[n+2])<.001) {
        for(let a=0;a<3;a++){this.offsets[n+a]=0;this.velocity[n+a]=0;}
        this.awake[id]=0;this.active[i]=this.active.at(-1);this.active.pop();
      }
    }
    return true;
  }
}
