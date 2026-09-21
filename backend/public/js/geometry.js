
// ----- Geometry helpers (cut / split) -----
(function(){
  function dist2(a,b){ var dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; }
  function lerp(a,b,t){ return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}; }
  function clamp01(t){ return Math.max(0, Math.min(1,t)); }

  function projPointOnSeg(p,a,b){
    var vx=b.x-a.x, vy=b.y-a.y;
    var wx=p.x-a.x, wy=p.y-a.y;
    var vv=vx*vx+vy*vy;
    if(vv<=1e-12) return {t:0, q:{x:a.x,y:a.y}, d2:dist2(p,a)};
    var t=(wx*vx+wy*vy)/vv;
    var tt=clamp01(t);
    var q={x:a.x+vx*tt, y:a.y+vy*tt};
    return {t:tt, q:q, d2:dist2(p,q)};
  }

  function rectCorners(r){
    // returns 4 corners in order (clockwise), applying rotation around center
    var hw=(r.w||0)/2, hh=(r.h||0)/2;
    var pts=[
      {x:-hw,y:-hh},{x:hw,y:-hh},{x:hw,y:hh},{x:-hw,y:hh}
    ];
    var rot=r.rot||0;
    var c=Math.cos(rot), s=Math.sin(rot);
    for(var i=0;i<pts.length;i++){
      var x=pts[i].x, y=pts[i].y;
      pts[i]={x:r.cx + x*c - y*s, y:r.cy + x*s + y*c};
    }
    return pts;
  }

  function segSegIntersection(a,b,c,d, eps){
    eps = eps || 1e-9;
    var r={x:b.x-a.x, y:b.y-a.y};
    var s={x:d.x-c.x, y:d.y-c.y};
    var denom = r.x*s.y - r.y*s.x;
    if(Math.abs(denom) < eps) return null; // parallel
    var u = ((c.x-a.x)*r.y - (c.y-a.y)*r.x) / denom;
    var t = ((c.x-a.x)*s.y - (c.y-a.y)*s.x) / denom;
    if(t < -eps || t > 1+eps || u < -eps || u > 1+eps) return null;
    t = clamp01(t); u = clamp01(u);
    var p={x:a.x + t*r.x, y:a.y + t*r.y};
    return {x:p.x,y:p.y,t:t,u:u};
  }

  function segCircleIntersections(a,b,cx,cy,r, eps){
    eps = eps || 1e-9;
    var dx=b.x-a.x, dy=b.y-a.y;
    var fx=a.x-cx, fy=a.y-cy;
    var A=dx*dx+dy*dy;
    if(A < eps) return [];
    var B=2*(fx*dx+fy*dy);
    var C=fx*fx+fy*fy-r*r;
    var disc=B*B-4*A*C;
    if(disc < -eps) return [];
    if(disc < 0) disc = 0;
    var sd=Math.sqrt(disc);
    var t1=(-B - sd)/(2*A);
    var t2=(-B + sd)/(2*A);
    var out=[];
    function addT(t){
      if(t >= -eps && t <= 1+eps){
        var tt=clamp01(t);
        out.push({t:tt, x:a.x+dx*tt, y:a.y+dy*tt});
      }
    }
    addT(t1);
    if(Math.abs(t2-t1) > 1e-8) addT(t2);
    return out;
  }

  function dedupePoints(pts, eps){
    eps = eps || 1e-6;
    var out=[];
    for(var i=0;i<pts.length;i++){
      var p=pts[i];
      var ok=true;
      for(var j=0;j<out.length;j++){
        if(dist2(p,out[j]) <= eps*eps){ ok=false; break; }
      }
      if(ok) out.push(p);
    }
    return out;
  }

  function invRotatePoint(p, cx, cy, ang){
    var x=p.x-cx, y=p.y-cy;
    var c=Math.cos(-ang), s=Math.sin(-ang);
    return {x:x*c - y*s, y:x*s + y*c};
  }

  function ellipsePointAt(el, t){
    var ct=Math.cos(t), st=Math.sin(t);
    var x=(el.rx||0)*ct, y=(el.ry||0)*st;
    var rot=el.rot||0, c=Math.cos(rot), s=Math.sin(rot);
    return {x:el.cx + x*c - y*s, y:el.cy + x*s + y*c};
  }

  // Param angle on an ellipse (in ellipse-local parametric space).
  function ellipseParamAtPoint(el, p){
    var q=invRotatePoint(p, el.cx, el.cy, el.rot||0);
    var rx=Math.max(1e-9, Math.abs(el.rx||0));
    var ry=Math.max(1e-9, Math.abs(el.ry||0));
    return norm2pi(Math.atan2(q.y/ry, q.x/rx));
  }

  function segEllipseIntersections(a,b,el,eps){
    eps = eps || 1e-9;
    var rx=Math.abs(el.rx||0), ry=Math.abs(el.ry||0);
    if(rx<eps || ry<eps) return [];

    var A=invRotatePoint(a, el.cx, el.cy, el.rot||0);
    var B=invRotatePoint(b, el.cx, el.cy, el.rot||0);
    var dx=B.x-A.x, dy=B.y-A.y;

    var rx2=rx*rx, ry2=ry*ry;
    var qa=(dx*dx)/rx2 + (dy*dy)/ry2;
    var qb=2*(A.x*dx/rx2 + A.y*dy/ry2);
    var qc=(A.x*A.x)/rx2 + (A.y*A.y)/ry2 - 1;
    if(Math.abs(qa)<eps) return [];

    var disc=qb*qb - 4*qa*qc;
    if(disc < -eps) return [];
    if(disc < 0) disc=0;
    var sd=Math.sqrt(disc);
    var t1=(-qb - sd)/(2*qa);
    var t2=(-qb + sd)/(2*qa);
    var out=[];

    function addT(t){
      if(t < -eps || t > 1+eps) return;
      var tt=clamp01(t);
      var lx=A.x + dx*tt, ly=A.y + dy*tt;
      var rot=el.rot||0, c=Math.cos(rot), s=Math.sin(rot);
      var wx=el.cx + lx*c - ly*s;
      var wy=el.cy + lx*s + ly*c;
      out.push({t:tt, x:wx, y:wy, te:norm2pi(Math.atan2(ly/ry, lx/rx))});
    }
    addT(t1);
    if(Math.abs(t2-t1)>1e-8) addT(t2);
    return out;
  }

  function ellipsePolylineArc(el, tStart, tEnd, ccw, segsPerTurn){
    var full = Math.PI*2;
    var total = angleDiff(tStart, tEnd, !!ccw);
    var turns = Math.max(1e-6, Math.abs(total)/full);
    var n = Math.max(2, Math.ceil((segsPerTurn||96) * turns));
    var out=[];
    for(var i=0;i<=n;i++){
      var t=tStart + total*(i/n);
      out.push(ellipsePointAt(el, t));
    }
    return out;
  }

  function ellipseOpenPolylineAt(el, tBreak, segsPerTurn){
    var n=Math.max(16, (segsPerTurn||128));
    var out=[];
    for(var i=0;i<=n;i++){
      var t=tBreak + (Math.PI*2)*(i/n);
      out.push(ellipsePointAt(el, t));
    }
    return out;
  }

  function arcSweepAbs(a0, a1, ccw){
    return ccw ? norm2pi(a1-a0) : norm2pi(a0-a1);
  }

  function angleOnArc(theta, a0, a1, ccw, eps){
    eps = eps || 1e-9;
    var total = angleDiff(a0,a1,!!ccw);
    var d = angleDiff(a0,theta,!!ccw);
    if(ccw){
      return d > eps && d < total - eps;
    } else {
      // total is negative
      return d < -eps && d > total + eps;
    }
  }

  function insertIntoZOrderAt(oldType, oldId, newRefs){
    ensureZOrder();
    var kOld = oldType+':'+oldId;
    var z=state.zOrder;
    var idx=-1;
    for(var i=0;i<z.length;i++){
      if(z[i].type+':'+z[i].id === kOld){ idx=i; break; }
    }
    if(idx<0){
      // fallback: append
      for(var j=0;j<newRefs.length;j++) z.push({type:newRefs[j].type,id:newRefs[j].id});
      return;
    }
    z.splice(idx,1);
    for(var j=0;j<newRefs.length;j++) z.splice(idx+j,0,{type:newRefs[j].type,id:newRefs[j].id});
  }

  // Split a polyline into multiple polylines given split vertex indices (indices in pts array).
  // - For open polyline: splits into N+1 pieces.
  // - For closed polyline:
  //    * if one index => "open" the ring at that point (single polyline, closed=false)
  //    * if >=2 indices => creates pieces between consecutive split points along the ring (all closed=false)
  // Returns an array of {pts, closed} pieces. (No ids/layer/style assigned here.)
  function splitPolylinePieces(pts, closed, splitIdxs){
    if(!pts || pts.length<2) return [];
    var idxs = (splitIdxs||[]).slice().filter(i=>Number.isFinite(i));
    // unique + sort
    idxs.sort((a,b)=>a-b);
    idxs = idxs.filter((v,i)=> i===0 || v!==idxs[i-1]);
    // keep interior indices (we don't split at endpoints)
    idxs = idxs.filter(i=> i>0 && i<pts.length);
    if(!idxs.length){
      return [{pts:pts.map(p=>({x:p.x,y:p.y})), closed:!!closed}];
    }

    if(!closed){
      var out=[];
      var start=0;
      for(var k=0;k<idxs.length;k++){
        var end=idxs[k];
        if(end-start>=1){
          out.push({pts:pts.slice(start, end+1).map(p=>({x:p.x,y:p.y})), closed:false});
        }
        start=end;
      }
      if((pts.length-1)-start>=1){
        out.push({pts:pts.slice(start).map(p=>({x:p.x,y:p.y})), closed:false});
      }
      return out.filter(p=>p.pts.length>=2);
    }

    // closed polyline
    if(idxs.length===1){
      var i0=idxs[0];
      var ring = pts.slice(i0).concat(pts.slice(0,i0));
      // duplicate break point at end so all edges are preserved but ring is open
      ring.push({x:ring[0].x,y:ring[0].y});
      return [{pts:ring.map(p=>({x:p.x,y:p.y})), closed:false}];
    }

    // >=2 split points: create pieces between consecutive indices along the ring (including wrap)
    var out2=[];
    var cyc = idxs.slice();
    cyc.push(idxs[0] + pts.length);
    for(var t=0;t<cyc.length-1;t++){
      var a=cyc[t], b=cyc[t+1];
      var piece=[];
      for(var ii=a; ii<=b; ii++){
        var p=pts[ii % pts.length];
        piece.push({x:p.x,y:p.y});
      }
      if(piece.length>=2) out2.push({pts:piece, closed:false});
    }
    return out2;
  }

  // Insert points from intersection descriptors and return stable split indices
  // in the final points array. Handles index shifts caused by multiple inserts.
  function insertPointsAndCollectSplitIdxs(pts, inserts, allowCloseAppend){
    var splitIdxs=[];
    for(var ii=inserts.length-1; ii>=0; ii--){
      var ins=inserts[ii];
      var idx;
      if(allowCloseAppend && ins.closes){
        pts.push({x:ins.p.x,y:ins.p.y});
        idx = pts.length-1;
      } else {
        idx = ins.edge;
        pts.splice(idx,0,{x:ins.p.x,y:ins.p.y});
        // Any previously recorded split index at/after idx shifts by +1.
        for(var si=0; si<splitIdxs.length; si++){
          if(splitIdxs[si] >= idx) splitIdxs[si] += 1;
        }
      }
      splitIdxs.push(idx);
    }
    splitIdxs.sort((a,b)=>a-b);
    splitIdxs = splitIdxs.filter((v,i)=> i===0 || v!==splitIdxs[i-1]);
    return splitIdxs;
  }

  // Main cutter: split objects intersected by a cutter segment AB.
  // Returns number of original objects that were split.
  window.cutWithSegment = function(A,B){
    var eps = 1e-6;
    var changed=0;

    // --- Segments ---
    for(var i=state.segments.length-1;i>=0;i--){
      var s=state.segments[i];
      if(!s) continue;
      if(isLayerLocked(s.layer)) continue;
      var hit = segSegIntersection(s.a, s.b, A, B, 1e-9);
      if(!hit) continue;
      // ignore if too close to endpoints
      var p={x:hit.x,y:hit.y};
      if(dist2(p,s.a) <= eps*eps || dist2(p,s.b) <= eps*eps) continue;
      // split
      var id1=uid(), id2=uid();
      var s1={id:id1,a:{x:s.a.x,y:s.a.y},b:{x:p.x,y:p.y},layer:s.layer,style:deepClone(s.style||{})};
      var s2={id:id2,a:{x:p.x,y:p.y},b:{x:s.b.x,y:s.b.y},layer:s.layer,style:deepClone(s.style||{})};
      state.segments.splice(i,1);
      state.segments.push(s1); state.segments.push(s2);
      insertIntoZOrderAt('seg', s.id, [{type:'seg',id:id1},{type:'seg',id:id2}]);
      changed++;
    }

	    // --- Rectangles (convert to polyline, insert intersection points, then split) ---
	    for(var ri=state.rects.length-1;ri>=0;ri--){
	      var r=state.rects[ri];
	      if(!r) continue;
	      if(isLayerLocked(r.layer)) continue;
	      var corners=rectCorners(r);
	      var pts=corners.concat([corners[0]]); // closed ring
	      var inserts=[];
	      for(var e=0;e<4;e++){
	        var p0=pts[e], p1=pts[e+1];
	        var ih=segSegIntersection(p0,p1,A,B,1e-9);
	        if(!ih) continue;
	        var pI={x:ih.x,y:ih.y};
	        if(dist2(pI,p0)<=eps*eps || dist2(pI,p1)<=eps*eps) continue;
	        inserts.push({edge:e+1, t:ih.t, p:pI});
	      }
	      if(!inserts.length) continue;
	      // sort by edge then t
	      inserts.sort(function(a,b){ if(a.edge!==b.edge) return a.edge-b.edge; return a.t-b.t; });
	      // build polyline pts (4 corners) and insert points
	      var newPts=corners.map(p=>({x:p.x,y:p.y}));
	      // apply insertions and compute split indices in final-array coordinates
	      var splitIdxs = insertPointsAndCollectSplitIdxs(newPts, inserts, false);

	      // Split the resulting closed polyline (if possible)
	      var pieces = splitPolylinePieces(newPts, true, splitIdxs);
	      state.rects.splice(ri,1);
	      if(pieces.length<=1){
	        var plId=uid();
	        state.polylines.push({id:plId, pts:newPts.map(p=>({x:p.x,y:p.y})), closed:true, layer:r.layer, style:deepClone(r.style||{})});
	        insertIntoZOrderAt('rect', r.id, [{type:'pline',id:plId}]);
	      } else {
	        var newRefs=[];
	        for(var pp=0; pp<pieces.length; pp++){
	          var nid=uid();
	          state.polylines.push({id:nid, pts:pieces[pp].pts, closed:!!pieces[pp].closed, layer:r.layer, style:deepClone(r.style||{})});
	          newRefs.push({type:'pline',id:nid});
	        }
	        insertIntoZOrderAt('rect', r.id, newRefs);
	      }
	      changed++;
	    }

    // --- Polylines (insert intersection points, then split into separate polylines) ---
    for(var pi=state.polylines.length-1;pi>=0;pi--){
      var pl=state.polylines[pi];
      if(!pl || !pl.pts || pl.pts.length<2) continue;
      if(isLayerLocked(pl.layer)) continue;

      var inserts=[]; // {edge:i, t, p}
      for(var k=1;k<pl.pts.length;k++){
        var p0=pl.pts[k-1], p1=pl.pts[k];
        var ih = segSegIntersection(p0,p1,A,B,1e-9);
        if(!ih) continue;
        var pI={x:ih.x,y:ih.y};
        if(dist2(pI,p0)<=eps*eps || dist2(pI,p1)<=eps*eps) continue;
        inserts.push({edge:k, t:ih.t, p:pI});
      }
      // closed polyline last edge
      if(pl.closed && pl.pts.length>=3){
        var pLast=pl.pts[pl.pts.length-1], pFirst=pl.pts[0];
        var ih2 = segSegIntersection(pLast,pFirst,A,B,1e-9);
        if(ih2){
          var pI2={x:ih2.x,y:ih2.y};
          if(dist2(pI2,pLast)>eps*eps && dist2(pI2,pFirst)>eps*eps){
            inserts.push({edge:pl.pts.length, t:ih2.t, p:pI2, closes:true});
          }
        }
      }

      if(!inserts.length) continue;
      // Stable sort then keep only one insertion per geometric point.
      inserts.sort(function(a,b){
        if(a.edge!==b.edge) return a.edge-b.edge;
        return a.t-b.t;
      });
      var kept=[];
      for(var ik=0;ik<inserts.length;ik++){
        var dupe=false;
        for(var ku=0;ku<kept.length;ku++){
          if(dist2(inserts[ik].p, kept[ku].p)<=eps*eps){ dupe=true; break; }
        }
        if(!dupe) kept.push(inserts[ik]);
      }
      if(!kept.length) continue;

	      // Apply insertions and compute split indices in final-array coordinates.
	      var splitIdxs = insertPointsAndCollectSplitIdxs(pl.pts, kept, true);

      // Create separate polylines (pieces)
      var pieces = splitPolylinePieces(pl.pts, !!pl.closed, splitIdxs);
      if(pieces.length<=1){
        // no real split (shouldn't happen, but keep safety)
        changed++;
        continue;
      }
      // Replace original polyline with pieces
      state.polylines.splice(pi,1);
      var newRefs=[];
      for(var pp=0; pp<pieces.length; pp++){
        var nid=uid();
        state.polylines.push({id:nid, pts:pieces[pp].pts, closed:!!pieces[pp].closed, layer:pl.layer, style:deepClone(pl.style||{})});
        newRefs.push({type:'pline',id:nid});
      }
      insertIntoZOrderAt('pline', pl.id, newRefs);
      changed++;
    }

    // --- Arcs ---
    for(var ai=state.arcs.length-1;ai>=0;ai--){
      var ar=state.arcs[ai];
      if(!ar) continue;
      if(isLayerLocked(ar.layer)) continue;

      var hits=segCircleIntersections(A,B, ar.cx, ar.cy, ar.r, 1e-9);
      if(!hits.length) continue;

      // Keep only strict internal intersections ordered along arc progression.
      var totalPos = ar.ccw ? norm2pi(ar.a1-ar.a0) : norm2pi(ar.a0-ar.a1); // positive sweep length
      if(totalPos<=1e-10) continue;
      var pA0={x:ar.cx+Math.cos(ar.a0)*ar.r, y:ar.cy+Math.sin(ar.a0)*ar.r};
      var pA1={x:ar.cx+Math.cos(ar.a1)*ar.r, y:ar.cy+Math.sin(ar.a1)*ar.r};
      var epsLen=Math.max(1e-6, Math.abs(ar.r||0)*1e-6);
      var epsLen2=epsLen*epsLen;
      var epsAng=1e-7;
      var sumTol=Math.max(1e-6, totalPos*1e-6);
      var cuts=[]; // {ang,s,u,pt}

      for(var h=0;h<hits.length;h++){
        var hp={x:hits[h].x,y:hits[h].y};
        if(dist2(hp,pA0)<=epsLen2 || dist2(hp,pA1)<=epsLen2) continue;
        var th=Math.atan2(hp.y-ar.cy, hp.x-ar.cx);
        var sStartToHit = ar.ccw ? norm2pi(th-ar.a0) : norm2pi(ar.a0-th);
        var sHitToEnd   = ar.ccw ? norm2pi(ar.a1-th) : norm2pi(th-ar.a1);
        if(sStartToHit<=epsAng || sHitToEnd<=epsAng) continue;
        if(Math.abs((sStartToHit+sHitToEnd)-totalPos) > sumTol) continue;
        var s = sStartToHit;
        cuts.push({ang:th, s:s, u:s/totalPos, pt:hp});
      }
      if(!cuts.length) continue;

      // Dedupe by geometric proximity then sort by normalized progression t (0..1).
      cuts.sort(function(a,b){ return a.u-b.u; });
      var uniqCuts=[];
      for(var c=0;c<cuts.length;c++){
        var dup=false;
        for(var u=0;u<uniqCuts.length;u++){
          if(dist2(cuts[c].pt, uniqCuts[u].pt)<=eps*eps){ dup=true; break; }
        }
        if(!dup) uniqCuts.push(cuts[c]);
      }
      if(!uniqCuts.length) continue;

      // Build split arcs: a0 -> cut1 -> ... -> a1
      var newArcs=[];
      var startAng=ar.a0;
      for(var j=0;j<uniqCuts.length;j++){
        var endAng=uniqCuts[j].ang;
        var sw = ar.ccw ? norm2pi(endAng-startAng) : norm2pi(startAng-endAng);
        if(sw<=epsAng || sw>=Math.PI*2-epsAng) continue;
        var nid=uid();
        newArcs.push({id:nid,cx:ar.cx,cy:ar.cy,r:ar.r,a0:startAng,a1:endAng,ccw:!!ar.ccw,layer:ar.layer,style:deepClone(ar.style||{})});
        startAng=endAng;
      }
      var tail = ar.ccw ? norm2pi(ar.a1-startAng) : norm2pi(startAng-ar.a1);
      if(tail>epsAng && tail<Math.PI*2-epsAng){
        var nid2=uid();
        newArcs.push({id:nid2,cx:ar.cx,cy:ar.cy,r:ar.r,a0:startAng,a1:ar.a1,ccw:!!ar.ccw,layer:ar.layer,style:deepClone(ar.style||{})});
      }
      if(newArcs.length>=2){
        state.arcs.splice(ai,1);
        for(var na=0;na<newArcs.length;na++) state.arcs.push(newArcs[na]);
        insertIntoZOrderAt('arc', ar.id, newArcs.map(o=>({type:'arc',id:o.id})));
        changed++;
      }
    }

    // --- Circles (stored as ellipses where rx==ry and rot==0) ---
    for(var ei=state.ellipses.length-1;ei>=0;ei--){
      var el=state.ellipses[ei];
      if(!el) continue;
      if(isLayerLocked(el.layer)) continue;
      var isCircle = (Math.abs((el.rx||0)-(el.ry||0))<1e-3) && Math.abs(el.rot||0)<1e-3;
      if(!isCircle) continue;
      var hits2=segCircleIntersections(A,B, el.cx, el.cy, el.rx, 1e-9);
      if(hits2.length<2) continue;
      // dedupe and require two distinct intersections
      var pts2=dedupePoints(hits2.map(h=>({x:h.x,y:h.y,t:h.t})), eps);
      if(pts2.length<2) continue;
      // choose two farthest points (in case of numeric duplicates)
      var p1=pts2[0], p2=pts2[1];
      if(pts2.length>2){
        var bestD=-1;
        for(var a=0;a<pts2.length;a++) for(var b= a+1;b<pts2.length;b++){
          var dd=dist2(pts2[a],pts2[b]);
          if(dd>bestD){ bestD=dd; p1=pts2[a]; p2=pts2[b]; }
        }
      }
      // create two arcs (ccw) representing the two pieces
      var t1=Math.atan2(p1.y-el.cy, p1.x-el.cx);
      var t2=Math.atan2(p2.y-el.cy, p2.x-el.cx);
      // Tangency / near-tangency: don't create degenerate almost-full-circle arcs.
      if(Math.abs(angleDiff(t1,t2,true))<1e-6 || Math.abs(angleDiff(t2,t1,true))<1e-6) continue;
      var sw1=arcSweepAbs(t1,t2,true), sw2=arcSweepAbs(t2,t1,true);
      if(sw1<=1e-8 || sw2<=1e-8 || sw1>=Math.PI*2-1e-8 || sw2>=Math.PI*2-1e-8) continue;
      var aId1=uid(), aId2=uid();
      var a1={id:aId1,cx:el.cx,cy:el.cy,r:el.rx,a0:t1,a1:t2,ccw:true,layer:el.layer,style:deepClone(el.style||{})};
      var a2={id:aId2,cx:el.cx,cy:el.cy,r:el.rx,a0:t2,a1:t1,ccw:true,layer:el.layer,style:deepClone(el.style||{})};

      state.ellipses.splice(ei,1);
      state.arcs.push(a1); state.arcs.push(a2);
      insertIntoZOrderAt('ell', el.id, [{type:'arc',id:aId1},{type:'arc',id:aId2}]);
      changed++;
    }

    // --- General ellipses (non-circle): split into sampled polylines ---
    for(var ex=state.ellipses.length-1;ex>=0;ex--){
      var el2=state.ellipses[ex];
      if(!el2) continue;
      if(isLayerLocked(el2.layer)) continue;
      var isCircle2 = (Math.abs((el2.rx||0)-(el2.ry||0))<1e-3) && Math.abs(el2.rot||0)<1e-3;
      if(isCircle2) continue;

      var eh=segEllipseIntersections(A,B,el2,1e-9);
      if(eh.length<2) continue;
      var ePts=dedupePoints(eh.map(function(h){ return {x:h.x,y:h.y,t:h.te}; }), eps);
      if(ePts.length<2) continue;

      var q1=ePts[0], q2=ePts[1];
      if(ePts.length>2){
        var bestD2=-1;
        for(var ia=0;ia<ePts.length;ia++) for(var ib=ia+1;ib<ePts.length;ib++){
          var d2ab=dist2(ePts[ia],ePts[ib]);
          if(d2ab>bestD2){ bestD2=d2ab; q1=ePts[ia]; q2=ePts[ib]; }
        }
      }

      var pArc1=ellipsePolylineArc(el2, q1.t, q2.t, true, 128);
      var pArc2=ellipsePolylineArc(el2, q2.t, q1.t, true, 128);
      if(pArc1.length<2 || pArc2.length<2) continue;

      var idp1=uid(), idp2=uid();
      state.ellipses.splice(ex,1);
      state.polylines.push({id:idp1, pts:pArc1, closed:false, noVertexEdit:true, layer:el2.layer, style:deepClone(el2.style||{})});
      state.polylines.push({id:idp2, pts:pArc2, closed:false, noVertexEdit:true, layer:el2.layer, style:deepClone(el2.style||{})});
      insertIntoZOrderAt('ell', el2.id, [{type:'pline',id:idp1},{type:'pline',id:idp2}]);
      changed++;
    }

    // Clean up zOrder (in case of any edge cases)
    ensureZOrder();
    state.dirty = state.dirty || (changed>0);
    return changed;
  };

	  // One-click break: split a single object at the clicked point.
	  // Returns 1 if something changed, else 0.
	  window.breakAtPoint = function(ref, P){
	    var eps = 1e-6;
	    var tol = 0.5; // mm-ish fallback; click picking already enforces proximity
	    try{
	      if(state && typeof state.pxPerMM==='number' && state.pxPerMM>0){
	        // ~6 screen px
	        tol = 6/(state.pxPerMM);
	      }
	    } catch(e){}
	    var tol2 = tol*tol;

	    function replaceInZ(oldType, oldId, newRefs){ insertIntoZOrderAt(oldType, oldId, newRefs); ensureZOrder(); }

	    if(ref.type==='seg'){
	      var s=findById(state.segments, ref.id); if(!s) return 0;
	      if(isLayerLocked(s.layer)) return 0;
	      var pr=projPointOnSeg(P, s.a, s.b);
	      if(pr.d2>tol2) return 0;
	      if(pr.t<=eps || pr.t>=1-eps) return 0;
	      var id1=uid(), id2=uid();
	      var p=pr.q;
	      var s1={id:id1,a:{x:s.a.x,y:s.a.y},b:{x:p.x,y:p.y},layer:s.layer,style:deepClone(s.style||{})};
	      var s2={id:id2,a:{x:p.x,y:p.y},b:{x:s.b.x,y:s.b.y},layer:s.layer,style:deepClone(s.style||{})};
	      // remove old
	      for(var i=state.segments.length-1;i>=0;i--) if(state.segments[i].id===s.id){ state.segments.splice(i,1); break; }
	      state.segments.push(s1); state.segments.push(s2);
	      replaceInZ('seg', s.id, [{type:'seg',id:id1},{type:'seg',id:id2}]);
	      return 1;
	    }

	    if(ref.type==='arc'){
	      var ar=findById(state.arcs, ref.id); if(!ar) return 0;
	      if(isLayerLocked(ar.layer)) return 0;
	      var th=Math.atan2(P.y-ar.cy, P.x-ar.cx);
	      // require point on radius
	      var rr=ar.r||0;
	      var d=Math.abs(Math.sqrt(dist2(P,{x:ar.cx,y:ar.cy}))-rr);
	      if(d>tol) return 0;
	      if(!angleOnArc(th, ar.a0, ar.a1, ar.ccw, 1e-9)) return 0;
	      var id1=uid(), id2=uid();
	      var a1={id:id1,cx:ar.cx,cy:ar.cy,r:ar.r,a0:ar.a0,a1:th,ccw:!!ar.ccw,layer:ar.layer,style:deepClone(ar.style||{})};
	      var a2={id:id2,cx:ar.cx,cy:ar.cy,r:ar.r,a0:th,a1:ar.a1,ccw:!!ar.ccw,layer:ar.layer,style:deepClone(ar.style||{})};
	      for(var i2=state.arcs.length-1;i2>=0;i2--) if(state.arcs[i2].id===ar.id){ state.arcs.splice(i2,1); break; }
	      state.arcs.push(a1); state.arcs.push(a2);
	      replaceInZ('arc', ar.id, [{type:'arc',id:id1},{type:'arc',id:id2}]);
	      return 1;
	    }

	    if(ref.type==='ell'){
	      var el=findById(state.ellipses, ref.id); if(!el) return 0;
	      if(isLayerLocked(el.layer)) return 0;
	      var isCircle = (Math.abs((el.rx||0)-(el.ry||0))<1e-3) && Math.abs(el.rot||0)<1e-3;
	      if(!isCircle){
	        var thE=ellipseParamAtPoint(el, P);
	        var qE=ellipsePointAt(el, thE);
	        if(dist2(P,qE)>tol2) return 0;

	        var ptsE=ellipseOpenPolylineAt(el, thE, 160);
	        var plIdE=uid();
	        var plE={id:plIdE, pts:ptsE, closed:false, noVertexEdit:true, layer:el.layer, style:deepClone(el.style||{})};
	        for(var ie2=state.ellipses.length-1;ie2>=0;ie2--) if(state.ellipses[ie2].id===el.id){ state.ellipses.splice(ie2,1); break; }
	        state.polylines.push(plE);
	        replaceInZ('ell', el.id, [{type:'pline',id:plIdE}]);
	        return 1;
	      }
	      var th0=Math.atan2(P.y-el.cy, P.x-el.cx);
	      var r=el.rx||0;
	      var d0=Math.abs(Math.sqrt(dist2(P,{x:el.cx,y:el.cy}))-r);
	      if(d0>tol) return 0;
	      // one-click circle break => two semicircles: th0 and th0+PI
	      var th1=norm2pi(th0+Math.PI);
	      var aId1=uid(), aId2=uid();
	      var a1={id:aId1,cx:el.cx,cy:el.cy,r:r,a0:th0,a1:th1,ccw:true,layer:el.layer,style:deepClone(el.style||{})};
	      var a2={id:aId2,cx:el.cx,cy:el.cy,r:r,a0:th1,a1:th0,ccw:true,layer:el.layer,style:deepClone(el.style||{})};
	      for(var ie=state.ellipses.length-1;ie>=0;ie--) if(state.ellipses[ie].id===el.id){ state.ellipses.splice(ie,1); break; }
	      state.arcs.push(a1); state.arcs.push(a2);
	      replaceInZ('ell', el.id, [{type:'arc',id:aId1},{type:'arc',id:aId2}]);
	      return 1;
	    }

	    if(ref.type==='rect'){
	      var r0=findById(state.rects, ref.id); if(!r0) return 0;
	      if(isLayerLocked(r0.layer)) return 0;
	      var corners=rectCorners(r0);
	      // find closest edge
	      var best={d2:1e99, edge:-1, t:0, q:null};
	      for(var e=0;e<4;e++){
	        var a=corners[e], b=corners[(e+1)%4];
	        var pr=projPointOnSeg(P,a,b);
	        if(pr.d2<best.d2){ best={d2:pr.d2, edge:e, t:pr.t, q:pr.q, a:a, b:b}; }
	      }
	      if(best.d2>tol2) return 0;
	      if(best.t<=eps || best.t>=1-eps) return 0;
	      // convert to polyline, insert point, and OPEN the ring at that point
	      var pts=corners.map(p=>({x:p.x,y:p.y}));
	      var splitIndex=best.edge+1;
	      pts.splice(splitIndex,0,{x:best.q.x,y:best.q.y});
	      var pieces=splitPolylinePieces(pts, true, [splitIndex]);
	      var plId=uid();
	      var pl={id:plId, pts:pieces[0].pts, closed:false, layer:r0.layer, style:deepClone(r0.style||{})};
	      for(var ir=state.rects.length-1;ir>=0;ir--) if(state.rects[ir].id===r0.id){ state.rects.splice(ir,1); break; }
	      state.polylines.push(pl);
	      replaceInZ('rect', r0.id, [{type:'pline',id:plId}]);
	      return 1;
	    }

	    if(ref.type==='pline'){
	      var pl=findById(state.polylines, ref.id); if(!pl || !pl.pts || pl.pts.length<2) return 0;
	      if(isLayerLocked(pl.layer)) return 0;
	      var pts=pl.pts;
	      var best2={d2:1e99, idx:-1, t:0, q:null};
	      for(var i3=1;i3<pts.length;i3++){
	        var pr2=projPointOnSeg(P, pts[i3-1], pts[i3]);
	        if(pr2.d2<best2.d2){ best2={d2:pr2.d2, idx:i3, t:pr2.t, q:pr2.q}; }
	      }
	      if(pl.closed && pts.length>=3){
	        var pr3=projPointOnSeg(P, pts[pts.length-1], pts[0]);
	        if(pr3.d2<best2.d2){ best2={d2:pr3.d2, idx:pts.length, t:pr3.t, q:pr3.q, closes:true}; }
	      }
	      if(best2.d2>tol2) return 0;
	      if(best2.t<=eps || best2.t>=1-eps) return 0;
	      var splitIndex2;
	      if(best2.closes){
	        pts.push({x:best2.q.x,y:best2.q.y});
	        splitIndex2 = pts.length-1;
	      } else {
	        pts.splice(best2.idx,0,{x:best2.q.x,y:best2.q.y});
	        splitIndex2 = best2.idx;
	      }
	      // Split into separate polylines (or open the ring if closed)
	      var pieces2=splitPolylinePieces(pts, !!pl.closed, [splitIndex2]);
	      if(pieces2.length<=1){
	        // should not happen, but keep point insertion
	        return 1;
	      }
	      // replace original polyline with pieces
	      for(var ip=state.polylines.length-1;ip>=0;ip--) if(state.polylines[ip].id===pl.id){ state.polylines.splice(ip,1); break; }
	      var newRefs=[];
	      for(var pp=0; pp<pieces2.length; pp++){
	        var nid=uid();
	        state.polylines.push({id:nid, pts:pieces2[pp].pts, closed:!!pieces2[pp].closed, layer:pl.layer, style:deepClone(pl.style||{})});
	        newRefs.push({type:'pline',id:nid});
	      }
	      replaceInZ('pline', pl.id, newRefs);
	      return 1;
	    }

	    return 0;
	  };
})();
