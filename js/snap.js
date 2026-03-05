
// ---- stable rounding helper for small grid steps ----
function stableRound(v, step){
  if(!step) return v;
  var n = Math.round(v/step);
  // reduce floating point noise
  return Math.round((n*step)*1000000)/1000000;
}
// ----- Snap -----
  function visibleLayerSet(){
    var set={};
    for(var k in state.layers) if(state.layers[k].visible) set[k]=true;
    return set;
  }
  
  function isLayerLocked(layer){ return !!(state.layers[layer] && state.layers[layer].locked); }

function ignoreKey(type,id){ return type+':'+id; }
function makeIgnoreSet(refs){
  var set=null;
  if(refs && refs.length){
    set={};
    for(var i=0;i<refs.length;i++){
      var r=refs[i];
      if(r && r.type && r.id) set[ignoreKey(r.type,r.id)]=true;
    }
  }
  return set;
}
function isIgnored(set,type,id){
  return !!(set && set[ignoreKey(type,id)]);
}

function currentSnapSourcePoint(){
  // For constrained snaps (PERP/TAN), use the previous picked point when available.
  if(state.tool==='line' && state.lineStart) return {x:state.lineStart.x, y:state.lineStart.y};
  if(state.tool==='pline' && state.plinePts && state.plinePts.length){
    var lp=state.plinePts[state.plinePts.length-1];
    return {x:lp.x, y:lp.y};
  }
  if(state.tool==='dim' && state.dimFirst) return {x:state.dimFirst.x, y:state.dimFirst.y};
  return null;
}

function angleOnArcInclusive(theta, a0, a1, ccw, eps){
  eps = eps || 1e-8;
  var total = ccw ? norm2pi(a1-a0) : norm2pi(a0-a1);
  var d = ccw ? norm2pi(theta-a0) : norm2pi(a0-theta);
  return d >= -eps && d <= total + eps;
}

function pointAllowedOnCircleEntity(C, x, y){
  if(!C || C.kind!=='arc') return true;
  var th=Math.atan2(y-C.cy, x-C.cx);
  return angleOnArcInclusive(th, C.a0, C.a1, !!C.ccw, 1e-7);
}

function nearestSnap(p, ignore){
    var modes = state.snapModes || {grid:false,end:true,mid:true,cen:true,int:true,perp:false,tan:true};
    var best=null, bestD=1e9;
    var src=currentSnapSourcePoint();

    function setBest(x,y,kind,meta){
      var d = hypot(x-p.x, y-p.y);
      if(d < bestD){
        bestD=d;
        best={x:x,y:y,kind:kind,meta:meta||null};
      }
    }

    // Performance guards: advanced snaps can become expensive on pointermove.
    // Keep UI responsive by pruning far geometry and skipping O(n^2) checks when scene is large.
    var MAX_EDGES_FOR_PAIRWISE = 80;   // cap for edge-edge intersections
    var MAX_EDGES_FOR_ADV = 220;       // cap for advanced (perp/int/line-circle) altogether
    var MAX_CIRCLES_FOR_TAN = 80;      // cap for tangent tests

    function bboxDistToPoint(e, p){
      var dx = 0, dy = 0;
      if(p.x < e.minx) dx = e.minx - p.x;
      else if(p.x > e.maxx) dx = p.x - e.maxx;
      if(p.y < e.miny) dy = e.miny - p.y;
      else if(p.y > e.maxy) dy = p.y - e.maxy;
      return hypot(dx,dy);
    }

    var vis = visibleLayerSet();

    // --- Grid ---
    if(modes.grid && state.gridStepMM > 0.00001){
      var gx = stableRound(p.x, state.gridStepMM);
      var gy = stableRound(p.y, state.gridStepMM);
      setBest(gx,gy,'GRID');
    }

    // Collect segments/edges to use for advanced snapping
    var edges=[]; // {a:{x,y}, b:{x,y}, minx,miny,maxx,maxy}
    function addEdge(a,b){
      var minx=Math.min(a.x,b.x), miny=Math.min(a.y,b.y);
      var maxx=Math.max(a.x,b.x), maxy=Math.max(a.y,b.y);
      edges.push({a:{x:a.x,y:a.y}, b:{x:b.x,y:b.y}, minx:minx, miny:miny, maxx:maxx, maxy:maxy});
    }

    // Segments
    for(var i=0;i<state.segments.length;i++){
      var s=state.segments[i];
      if(isIgnored(ignore,'seg',s.id)) continue;
      if(!vis[s.layer]) continue;
      addEdge(s.a,s.b);
      if(modes.end){ setBest(s.a.x,s.a.y,'END'); setBest(s.b.x,s.b.y,'END'); }
      if(modes.mid){ setBest((s.a.x+s.b.x)/2,(s.a.y+s.b.y)/2,'MID'); }
    }

    // Rects (corners + edges)
    for(var r=0;r<state.rects.length;r++){
      var rr=state.rects[r];
      if(isIgnored(ignore,'rect',rr.id)) continue;
      if(!vis[rr.layer]) continue;
      var cs=getRectCorners(rr);
      for(var c=0;c<cs.length;c++){
        var a=cs[c], b=cs[(c+1)%cs.length];
        addEdge(a,b);
        if(modes.end) setBest(a.x,a.y,'END');
        if(modes.mid) setBest((a.x+b.x)/2,(a.y+b.y)/2,'MID');
      }
    }

    // Images as rect edges (useful for snap)
    for(var im=0;im<state.images.length;im++){
      var ii=state.images[im];
      if(isIgnored(ignore,'img',ii.id)) continue;
      if(!vis[ii.layer]) continue;
      var cs2=getRectCorners(ii);
      for(var c2=0;c2<cs2.length;c2++){
        var a2=cs2[c2], b2=cs2[(c2+1)%cs2.length];
        addEdge(a2,b2);
        if(modes.end) setBest(a2.x,a2.y,'END');
        if(modes.mid) setBest((a2.x+b2.x)/2,(a2.y+b2.y)/2,'MID');
      }
    }

	    // Polylines
	    for(var pi=0;pi<state.polylines.length;pi++){
	      var pl=state.polylines[pi];
	      if(isIgnored(ignore,'pline',pl.id)) continue;
	      if(!vis[pl.layer]) continue;
	      for(var j=0;j<pl.pts.length;j++){
	        var pt=pl.pts[j];
	        if(modes.end) setBest(pt.x,pt.y,'END');
	        if(j>0){
	          var prev=pl.pts[j-1];
	          addEdge(prev,pt);
	          if(modes.mid) setBest((prev.x+pt.x)/2,(prev.y+pt.y)/2,'MID');
	        }
	      }
	      if(pl.closed && pl.pts.length>2){
	        var last=pl.pts[pl.pts.length-1], first=pl.pts[0];
	        addEdge(last,first);
	        if(modes.mid) setBest((last.x+first.x)/2,(last.y+first.y)/2,'MID');
	      }
	    }

    // Arcs / circles list
    var circles=[]; // {cx,cy,r}
    for(var ai=0;ai<state.arcs.length;ai++){
      var ar=state.arcs[ai];
      if(isIgnored(ignore,'arc',ar.id)) continue;
      if(!vis[ar.layer]) continue;

      if(modes.cen) setBest(ar.cx,ar.cy,'CEN');

      var p0={x:ar.cx+Math.cos(ar.a0)*ar.r, y:ar.cy+Math.sin(ar.a0)*ar.r};
      var p1={x:ar.cx+Math.cos(ar.a1)*ar.r, y:ar.cy+Math.sin(ar.a1)*ar.r};
      if(modes.end){ setBest(p0.x,p0.y,'END'); setBest(p1.x,p1.y,'END'); }

      if(modes.mid){
        var am=ar.a0 + angleDiff(ar.a0, ar.a1, ar.ccw)/2;
        var pm={x:ar.cx+Math.cos(am)*ar.r, y:ar.cy+Math.sin(am)*ar.r};
        setBest(pm.x,pm.y,'MID');
      }

      // Only treat arc as circle for advanced snaps if it is sane
      if(isFinite(ar.cx)&&isFinite(ar.cy)&&isFinite(ar.r) && ar.r>1e-6 && ar.r<1e6){
        circles.push({kind:'arc', id:ar.id, cx:ar.cx, cy:ar.cy, r:ar.r, a0:ar.a0, a1:ar.a1, ccw:!!ar.ccw});
      }
    }

    // Ellipses: if near-circle, include as circle for center/tangent/intersection
    for(var e=0;e<state.ellipses.length;e++){
      var el=state.ellipses[e];
      if(isIgnored(ignore,'ell',el.id)) continue;
      if(!vis[el.layer]) continue;
      if(modes.cen) setBest(el.cx,el.cy,'CEN');
      if(Math.abs(el.rx-el.ry) < 1e-3 && Math.abs(el.rot||0) < 1e-3){
        circles.push({kind:'circle', id:el.id, cx:el.cx, cy:el.cy, r:el.rx});
      }
    }

	    // Text anchor
	    for(var ti=0;ti<state.texts.length;ti++){
	      var tt=state.texts[ti];
	      if(isIgnored(ignore,'text',tt.id)) continue;
	      if(!vis[tt.layer]) continue;
	      if(modes.end) setBest(tt.x,tt.y,'END');
	    }

	    // Nothing to snap against: skip advanced passes early.
	    if(bestD===1e9 && edges.length===0 && circles.length===0) return best;

	    // If we already have an excellent candidate, skip expensive passes
	    var fastEnough = (bestD < (0.25 * (10/state.pxPerMM))); // 1/4 of snap threshold
    if(fastEnough && !(modes.perp || modes.tan)) return best;

    // Determine a local search radius for advanced snaps (world mm)
    // Keep it bounded so pointermove doesn't explode.
    var searchR = clamp(bestD*1.5 + 20, 20, 80);
    if(src && (state.tool==='line' || state.tool==='pline' || state.tool==='dim')){
      // Constrained snaps need a wider local search to be practical on long constructions.
      searchR = clamp(searchR*2, 40, 180);
    }

    // If scene is huge, disable the heaviest advanced snaps to keep the UI responsive
    var allowAdv = edges.length <= MAX_EDGES_FOR_ADV;

    // --- Perpendicular (foot on edges) ---
    if(allowAdv && modes.perp){
      for(var k=0;k<edges.length;k++){
        var E=edges[k];
        if(bboxDistToPoint(E,p) > searchR) continue;

        var A=E.a, B=E.b;
        var vx=B.x-A.x, vy=B.y-A.y;
        var len2=vx*vx+vy*vy;
        if(len2 < 1e-9) continue;
        var t=((p.x-A.x)*vx + (p.y-A.y)*vy)/len2;
        if(t<0 || t>1) continue;
        var fx=A.x + t*vx, fy=A.y + t*vy;
        setBest(fx,fy,'PERP',{edge:k});
      }
    }
    // Perpendicular on circles/arcs from source point.
    if(modes.perp && circles.length && src){
      for(var pc=0;pc<circles.length;pc++){
        var C0=circles[pc];
        var vx0=src.x-C0.cx, vy0=src.y-C0.cy;
        var d0=hypot(vx0,vy0);
        if(d0<=1e-9) continue;
        var ux=vx0/d0, uy=vy0/d0;
        var q1={x:C0.cx+ux*C0.r, y:C0.cy+uy*C0.r};
        var q2={x:C0.cx-ux*C0.r, y:C0.cy-uy*C0.r};
        if(pointAllowedOnCircleEntity(C0,q1.x,q1.y)) setBest(q1.x,q1.y,'PERP',{circle:pc});
        if(pointAllowedOnCircleEntity(C0,q2.x,q2.y)) setBest(q2.x,q2.y,'PERP',{circle:pc});
      }
    }

    // --- Intersections (edge-edge + line-circle) ---
    if(allowAdv && modes.int && edges.length>=2){
      function segInt(a,b,c,d){
        var r={x:b.x-a.x,y:b.y-a.y};
        var s={x:d.x-c.x,y:d.y-c.y};
        var denom = r.x*s.y - r.y*s.x;
        if(Math.abs(denom) < 1e-9) return null;
        var u = ((c.x-a.x)*r.y - (c.y-a.y)*r.x) / denom;
        var t = ((c.x-a.x)*s.y - (c.y-a.y)*s.x) / denom;
        if(t>=0 && t<=1 && u>=0 && u<=1){
          return {x:a.x + t*r.x, y:a.y + t*r.y};
        }
        return null;
      }

      // pairwise edge intersections (capped)
      if(edges.length <= MAX_EDGES_FOR_PAIRWISE){
        for(var a=0;a<edges.length;a++){
          var Ea=edges[a];
          if(bboxDistToPoint(Ea,p) > searchR) continue;
          for(var b=a+1;b<edges.length;b++){
            var Eb=edges[b];
            if(bboxDistToPoint(Eb,p) > searchR) continue;
            var P=segInt(Ea.a,Ea.b,Eb.a,Eb.b);
            if(P) setBest(P.x,P.y,'INT',{e1:a,e2:b});
          }
        }
      }

      // intersections line-circle (also pruned)
      function lineCircleInt(A,B,C){
        var cx=C.cx, cy=C.cy, r=C.r;
        var dx=B.x-A.x, dy=B.y-A.y;
        var fx=A.x-cx, fy=A.y-cy;
        var aa=dx*dx+dy*dy;
        if(aa < 1e-12) return;
        var bb=2*(fx*dx+fy*dy);
        var cc=fx*fx+fy*fy - r*r;
        var disc=bb*bb-4*aa*cc;
        if(disc<0) return;
        disc=Math.sqrt(disc);
        var t1=(-bb-disc)/(2*aa);
        var t2=(-bb+disc)/(2*aa);
        if(t1>=0&&t1<=1){
          var x1=A.x+t1*dx, y1=A.y+t1*dy;
          if(pointAllowedOnCircleEntity(C,x1,y1)) setBest(x1,y1,'INT',{circle:true});
        }
        if(t2>=0&&t2<=1){
          var x2=A.x+t2*dx, y2=A.y+t2*dy;
          if(pointAllowedOnCircleEntity(C,x2,y2)) setBest(x2,y2,'INT',{circle:true});
        }
      }

      if(circles.length){
        var maxC = Math.min(circles.length, 200);
        for(var ei=0;ei<edges.length;ei++){
          var Ee=edges[ei];
          if(bboxDistToPoint(Ee,p) > searchR) continue;
          for(var ci=0;ci<maxC;ci++){
            var C=circles[ci];
            // quick prune: if point is far from circle center, skip
            if(hypot(p.x-C.cx, p.y-C.cy) > (C.r + searchR)) continue;
            lineCircleInt(Ee.a, Ee.b, C);
          }
        }
      }
    }

    // --- Tangents from p to circle ---
    if(modes.tan && circles.length){
      var count = Math.min(circles.length, MAX_CIRCLES_FOR_TAN);
      var base = src || p;
      for(var ci=0;ci<count;ci++){
        var C=circles[ci];
        // Prune by cursor distance (selection intent), not by base distance.
        var dcur=hypot(p.x-C.cx, p.y-C.cy);
        if(dcur > C.r + searchR) continue;

        var dx=base.x-C.cx, dy=base.y-C.cy;
        var d=hypot(dx,dy);
        if(d < C.r + 1e-6) continue; // inside: no real tangents
        var ang=Math.atan2(dy,dx);
        var alpha=Math.acos(C.r/d);
        var a1=ang+alpha, a2=ang-alpha;
        var tx1=C.cx + Math.cos(a1)*C.r, ty1=C.cy + Math.sin(a1)*C.r;
        var tx2=C.cx + Math.cos(a2)*C.r, ty2=C.cy + Math.sin(a2)*C.r;
        if(pointAllowedOnCircleEntity(C,tx1,ty1)) setBest(tx1,ty1,'TAN',{circle:ci});
        if(pointAllowedOnCircleEntity(C,tx2,ty2)) setBest(tx2,ty2,'TAN',{circle:ci});
      }
    }

    return best;
  }
function snapWorld(p, ignore){
    var enable=state.snap;
    if(state.ctrlDown) enable=!enable;
    if(!enable) return {snapped:p, snap:null};
    var snap=nearestSnap(p, ignore);
    var thrMM=10/state.pxPerMM;
    if(snap && (snap.kind==='PERP' || snap.kind==='TAN')) thrMM*=1.8;
    if(snap && hypot(snap.x-p.x,snap.y-p.y)<=thrMM) return {snapped:{x:snap.x,y:snap.y}, snap:snap};
    return {snapped:p, snap:null};
  }

  // Object creation helpers (addSeg, addRectFromCorners, addEllipseFromCorners, ...)
  // and generic findById are defined in js/tools.js to avoid duplicate globals.

  
