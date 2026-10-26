import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Layers3, Maximize2, Minus, Mountain, Plus, RotateCcw, Waves, X } from 'lucide-react';
import type { Language } from '../../shared/types';
import { strings } from '../i18n';

interface Terrain {bounds:number[];width:number;height:number;elevations:number[];retrievedAt:string}
interface Point{id:string;name:string;nameTj:string;lon:number;lat:number;kind:string}
interface Geography{river:number[][];points:Point[]}
type Controls={zoom:(amount:number)=>void;reset:()=>void;flat:(value:boolean)=>void;layers:(water:boolean,terrain:boolean)=>void};

export default function TerrainMap({language,storagePercent,onSelect}:{language:Language;storagePercent:number;onSelect?:(id:string)=>void}){
  const t=strings(language);
  const container=useRef<HTMLDivElement>(null);
  const canvasHost=useRef<HTMLDivElement>(null);
  const labelHost=useRef<HTMLDivElement>(null);
  const controls=useRef<Controls|null>(null);
  const languageRef=useRef(language);languageRef.current=language;
  const [ready,setReady]=useState(false);
  const [error,setError]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [flat,setFlat]=useState(false);
  const [showWater,setShowWater]=useState(true);
  const [showTerrain,setShowTerrain]=useState(true);
  const [selected,setSelected]=useState<string|null>(null);

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[]);
  useEffect(()=>{controls.current?.layers(showWater,showTerrain);},[showWater,showTerrain]);
  useEffect(()=>{controls.current?.flat(flat);},[flat]);

  useEffect(()=>{
    let disposed=false;let cleanup=()=>{};
    const abort=new AbortController();
    async function init(){
      const [terrain,geography]=await Promise.all([
        fetch('/terrain.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<Terrain>;}),
        fetch('/geography.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<Geography>;})
      ]);
      if(disposed||!canvasHost.current||!labelHost.current)return;
      const host=canvasHost.current;
      const labels=labelHost.current;
      const [west,south,east,north]=terrain.bounds;
      const W=230,D=W*(north-south)/((east-west)*Math.cos(39*Math.PI/180));
      const scale=W/((east-west)*86.3);
      const HEIGHT=scale*1.65/1000;
      const sample=(lon:number,lat:number)=>{
        const x=Math.max(0,Math.min(terrain.width-1,(lon-west)/(east-west)*(terrain.width-1)));
        const y=Math.max(0,Math.min(terrain.height-1,(north-lat)/(north-south)*(terrain.height-1)));
        const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(terrain.width-1,x0+1),y1=Math.min(terrain.height-1,y0+1);
        const a=terrain.elevations[y0*terrain.width+x0]*(1-x%1)+terrain.elevations[y0*terrain.width+x1]*(x%1);
        const b=terrain.elevations[y1*terrain.width+x0]*(1-x%1)+terrain.elevations[y1*terrain.width+x1]*(x%1);
        return a*(1-y%1)+b*(y%1);
      };
      const pos=(lon:number,lat:number,offset=.5)=>new THREE.Vector3((lon-west)/(east-west)*W-W/2,sample(lon,lat)*HEIGHT+offset,(north-lat)/(north-south)*D-D/2);
      let renderer:THREE.WebGLRenderer;
      try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch{
        const canvas=document.createElement('canvas');canvas.width=terrain.width;canvas.height=terrain.height;
        const ctx=canvas.getContext('2d');
        if(ctx){const img=ctx.createImageData(terrain.width,terrain.height);terrain.elevations.forEach((h,i)=>{const v=Math.min(1,h/6500);img.data[i*4]=25+v*160;img.data[i*4+1]=51+v*150;img.data[i*4+2]=57+v*150;img.data[i*4+3]=255;});ctx.putImageData(img,0,0);canvas.className='terrain-fallback';host.append(canvas);}
        setReady(true);setError(true);cleanup=()=>{host.replaceChildren();};return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
      renderer.setClearColor(0x101c22,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.25;
      host.append(renderer.domElement);
      const scene=new THREE.Scene();
      scene.fog=new THREE.FogExp2(0x101a22,.0011);
      const camera=new THREE.PerspectiveCamera(39,1,.1,1500);
      const orbit=new OrbitControls(camera,renderer.domElement);
      orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.maxPolarAngle=Math.PI/2.12;
      orbit.minDistance=65;orbit.maxDistance=510;orbit.enablePan=true;
      const target=new THREE.Vector3(0,0,8);
      const reset=()=>{camera.position.set(145,205,245);orbit.target.copy(target);orbit.update();};reset();
      scene.add(new THREE.AmbientLight(0xaacbd6,1.05));
      const sun=new THREE.DirectionalLight(0xfff4da,3.1);sun.position.set(-80,100,-50);scene.add(sun);
      const fill=new THREE.DirectionalLight(0x38aab2,.6);fill.position.set(80,40,70);scene.add(fill);
      const geometry=new THREE.BufferGeometry();
      const verts=new Float32Array(terrain.width*terrain.height*3);
      const colors=new Float32Array(verts.length);
      const low=new THREE.Color('#234b4c'),mid=new THREE.Color('#536865'),rock=new THREE.Color('#7e8582'),snow=new THREE.Color('#e3ede9');
      terrain.elevations.forEach((h,i)=>{
        const x=i%terrain.width,y=Math.floor(i/terrain.width);
        verts.set([x/(terrain.width-1)*W-W/2,h*HEIGHT,y/(terrain.height-1)*D-D/2],i*3);
        const c=h<2100?low.clone().lerp(mid,Math.max(0,(h-400)/1700)):h<4200?mid.clone().lerp(rock,(h-2100)/2100):rock.clone().lerp(snow,Math.min(1,(h-4200)/2000));
        colors.set([c.r,c.g,c.b],i*3);
      });
      const indices:number[]=[];
      for(let y=0;y<terrain.height-1;y++)for(let x=0;x<terrain.width-1;x++){
        const a=y*terrain.width+x,b=a+1,c=a+terrain.width,d=c+1;indices.push(a,c,b,b,c,d);
      }
      geometry.setAttribute('position',new THREE.BufferAttribute(verts,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,metalness:.02,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
      const wireMat=new THREE.MeshBasicMaterial({color:0x9fddcf,wireframe:true,transparent:true,opacity:.025,depthWrite:false});
      const wire=new THREE.Mesh(geometry,wireMat);wire.position.y=.03;scene.add(wire);
      const baseGeo=new THREE.BoxGeometry(W,.8,D);const baseMat=new THREE.MeshStandardMaterial({color:0x14282c,roughness:1});
      const base=new THREE.Mesh(baseGeo,baseMat);base.position.y=-.6;scene.add(base);
      const grid=new THREE.GridHelper(480,40,0x203a40,0x172d34);grid.position.y=-1.2;scene.add(grid);
      const waterGroup=new THREE.Group();scene.add(waterGroup);
      const riverPts:THREE.Vector3[]=[];
      for(let i=0;i<geography.river.length-1;i++){
        const [a,b]=[geography.river[i],geography.river[i+1]];
        for(let k=0;k<16;k++){const f=k/16;riverPts.push(pos(a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,.6));}
      }
      const curve=new THREE.CatmullRomCurve3(riverPts);
      const tubeGeo=new THREE.TubeGeometry(curve,400,.22,5,false);
      const tubeMat=new THREE.MeshBasicMaterial({color:0x55e9d1,transparent:true,opacity:.8});
      waterGroup.add(new THREE.Mesh(tubeGeo,tubeMat));
      const particleGeo=new THREE.SphereGeometry(.34,5,5),particleMat=new THREE.MeshBasicMaterial({color:0xb6fff0});
      const particles=Array.from({length:30},()=>{const p=new THREE.Mesh(particleGeo,particleMat);waterGroup.add(p);return p;});
      const markerGeo=new THREE.SphereGeometry(.85,12,12),markerMat=new THREE.MeshBasicMaterial({color:0x6ef5d0});
      const rings:THREE.Mesh[]=[];
      const projected:{el:HTMLButtonElement;point:THREE.Vector3;item:Point}[]=[];
      geography.points.forEach(item=>{
        const p=pos(item.lon,item.lat,1.1);
        const marker=new THREE.Mesh(markerGeo,markerMat);marker.position.copy(p);scene.add(marker);
        const ring=new THREE.Mesh(new THREE.RingGeometry(1.5,1.8,32),new THREE.MeshBasicMaterial({color:0x5bf1cd,transparent:true,opacity:.7,side:THREE.DoubleSide}));
        ring.rotation.x=-Math.PI/2;ring.position.copy(p);scene.add(ring);rings.push(ring);
        const el=document.createElement('button');el.className=`map-point ${item.kind}`;el.type='button';
        el.addEventListener('click',()=>{setSelected(item.id);onSelect?.(item.id);});
        labels.append(el);projected.push({el,point:p.clone().add(new THREE.Vector3(0,1,0)),item});
      });
      const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;
        // Preserve horizontal framing on portrait screens without resetting an orbit gesture.
        camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(39)/2)*Math.max(1,1.25/camera.aspect)));
        camera.updateProjectionMatrix();}};
      const observer=new ResizeObserver(resize);observer.observe(host);resize();
      controls.current={zoom(amount){camera.position.sub(orbit.target).multiplyScalar(amount).add(orbit.target);orbit.update();},reset,
        flat(value){camera.position.copy(value?new THREE.Vector3(0,325,1):new THREE.Vector3(145,205,245));orbit.target.copy(target);orbit.update();},
        layers(water,terrainOn){waterGroup.visible=water;mesh.visible=terrainOn;wire.visible=terrainOn;}};
      let frame=0;
      const clock=new THREE.Clock();
      const draw=()=>{
        if(disposed)return;
        const time=clock.getElapsedTime();orbit.update();
        particles.forEach((p,i)=>p.position.copy(curve.getPointAt((time*.025+i/particles.length)%1)));
        rings.forEach((ring,i)=>{const k=1+Math.sin(time*1.7+i)*.18;ring.scale.set(k,k,k);});
        projected.forEach(({el,point,item})=>{
          const p=point.clone().project(camera);
          const x=(p.x*.5+.5)*host.clientWidth,y=(-p.y*.5+.5)*host.clientHeight;
          el.style.transform=`translate(${x}px,${y}px) translate(-50%,-125%)`;
          el.style.display=p.z>1||x<0||x>host.clientWidth||y<0||y>host.clientHeight?'none':'';
          el.textContent=languageRef.current==='tj'?item.nameTj:item.name;
        });
        renderer.render(scene,camera);frame=requestAnimationFrame(draw);
      };draw();setReady(true);
      cleanup=()=>{
        cancelAnimationFrame(frame);observer.disconnect();orbit.dispose();
        const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
        scene.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.LineSegments){geometries.add(obj.geometry);(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>materials.add(m));}});
        geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();host.replaceChildren();labels.replaceChildren();controls.current=null;
      };
    }
    init().catch(e=>{if(!disposed&&e.name!=='AbortError'){setError(true);setReady(true);}});
    return()=>{disposed=true;abort.abort();cleanup();};
  },[]);

  return <section ref={container} className={`terrain-map ${expanded?'map-expanded':''}`} aria-label={t.mapTitle}>
    <div className="map-canvas" ref={canvasHost}/><div className="map-labels" ref={labelHost}/>
    <div className="map-heading"><div className="eyebrow"><span className="live-dot"/>{t.mapSubtitle}</div><h2>{t.mapTitle}</h2></div>
    <div className="map-view-toggle"><button className={!flat?'active':''} onClick={()=>setFlat(false)}>3D</button><button className={flat?'active':''} onClick={()=>setFlat(true)}>2D</button></div>
    <div className="map-layer-controls">
      <button className={showTerrain?'active':''} onClick={()=>setShowTerrain(v=>!v)} aria-pressed={showTerrain}><Mountain size={14}/>{t.terrain}</button>
      <button className={showWater?'active':''} onClick={()=>setShowWater(v=>!v)} aria-pressed={showWater}><Waves size={14}/>{t.water}</button>
    </div>
    <div className="map-compass"><span>N</span><svg viewBox="0 0 32 36" width="25" height="29"><path d="M16 2 25 32 16 24 7 32Z" fill="#c6e5df"/><path d="M16 2v22L7 32Z" fill="#547671"/></svg></div>
    <div className="map-tools">
      <button title={t.zoomIn} aria-label={t.zoomIn} onClick={()=>controls.current?.zoom(.8)}><Plus size={17}/></button>
      <button title={t.zoomOut} aria-label={t.zoomOut} onClick={()=>controls.current?.zoom(1.2)}><Minus size={17}/></button>
      <button title={t.resetView} aria-label={t.resetView} onClick={()=>{setFlat(false);controls.current?.reset();}}><RotateCcw size={15}/></button>
      <button title={expanded?t.close:t.expand} aria-label={expanded?t.close:t.expand} onClick={()=>setExpanded(v=>!v)}>{expanded?<X size={17}/>:<Maximize2 size={16}/>}</button>
    </div>
    {selected&&<div className="map-info"><button aria-label={t.close} onClick={()=>setSelected(null)}><X size={14}/></button><b>{selected==='nurek'?(language==='ru'?'Нурекская ГЭС':'НБО-и Норак'):selected==='rogun'?(language==='ru'?'Рогунская ГЭС':'НБО-и Роғун'):selected==='garm'?'Рашт':(language==='ru'?'Верховья':'Болооб')}</b><span>{selected==='nurek'||selected==='rogun'?t.modelParameters:t.pointWeather}</span>{selected==='nurek'&&<strong>{Math.round(storagePercent)}% <small>{t.storage.toLowerCase()}</small></strong>}</div>}
    <div className="map-attribution"><span><Layers3 size={12}/>{t.terrainReal}</span><span>{error?'2D':t.heightScale}</span><span>{t.schematic}</span></div>
    {!ready&&<div className="map-loading"><span className="spinner"/></div>}
  </section>;
}
