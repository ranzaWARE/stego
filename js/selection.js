// ----- Selection helpers -----
  function selectionKey(ref){ return ref.type+':'+ref.id; }
  function hasInSelection(ref){
    var k=selectionKey(ref);
    for(var i=0;i<state.selection.length;i++) if(selectionKey(state.selection[i])===k) return true;
    return false;
  }
  function toggleSelection(ref){
    var k=selectionKey(ref);
    var out=[];
    var removed=false;
    for(var i=0;i<state.selection.length;i++){
      if(selectionKey(state.selection[i])===k){ removed=true; continue; }
      out.push(state.selection[i]);
    }
    if(!removed) out.push({type:ref.type,id:ref.id});
    state.selection=out;
  }
  function setSingleSelection(ref){
    state.selection = ref ? [{type:ref.type,id:ref.id}] : [];
  }
  function clearSelection(){ state.selection=[]; }

  function primarySelection(){ return state.selection.length ? state.selection[state.selection.length-1] : null; }

  function updateSelInfo(){
    if(!state.selection.length){ ui.selInfo.textContent='Nessuna selezione'; return; }
    ui.selInfo.textContent = state.selection.length + ' oggetto(i) selezionato(i)';
  }


// ----- Global Z-Order (stack) -----
function refKey(ref){ return ref.type+':'+ref.id; }

function allEntityRefsInDefaultOrder(){
  var out=[];
  function pushArr(type, arr){
    for(var i=0;i<arr.length;i++) out.push({type:type,id:arr[i].id});
  }
  // Default order (keeps legacy look when zOrder not present)
  pushArr('img', state.images);
  pushArr('text', state.texts);
  pushArr('seg', state.segments);
  pushArr('pline', state.polylines);
  pushArr('arc', state.arcs);
  pushArr('rect', state.rects);
  pushArr('ell', state.ellipses);
  pushArr('dim', state.dims);
  pushArr('rdim', state.radDims);
  return out;
}

function ensureZOrder(){
  if(!state.zOrder) state.zOrder=[];
  // Build map of existing objects
  var exists={};
  var all=allEntityRefsInDefaultOrder();
  for(var i=0;i<all.length;i++) exists[refKey(all[i])] = 1;

  // Keep only valid refs
  var cleaned=[];
  for(var j=0;j<state.zOrder.length;j++){
    var k=refKey(state.zOrder[j]);
    if(exists[k]) cleaned.push({type:state.zOrder[j].type, id:state.zOrder[j].id});
  }

  // Append any missing refs (in default order)
  var inClean={};
  for(var c=0;c<cleaned.length;c++) inClean[refKey(cleaned[c])] = 1;
  for(var a=0;a<all.length;a++){
    var kk=refKey(all[a]);
    if(!inClean[kk]) cleaned.push({type:all[a].type,id:all[a].id});
  }

  state.zOrder = cleaned;
}

function addToZOrder(type,id){
  ensureZOrder();
  state.zOrder.push({type:type,id:id});
}

function removeFromZOrderByKeyMap(keyMap){
  if(!state.zOrder || !state.zOrder.length) return;
  var out=[];
  for(var i=0;i<state.zOrder.length;i++){
    var k=refKey(state.zOrder[i]);
    if(!keyMap[k]) out.push(state.zOrder[i]);
  }
  state.zOrder=out;
}

function moveSelectionInZOrder(mode){
  if(!state.selection.length) return;
  ensureZOrder();

  var selMap={};
  for(var i=0;i<state.selection.length;i++) selMap[refKey(state.selection[i])] = 1;

  var z=state.zOrder;

  if(mode==='up'){
    for(var i=z.length-2;i>=0;i--){
      var k=refKey(z[i]);
      if(!selMap[k]) continue;
      var k2=refKey(z[i+1]);
      if(selMap[k2]) continue;
      var tmp=z[i]; z[i]=z[i+1]; z[i+1]=tmp;
    }
    return;
  }
  if(mode==='down'){
    for(var i=1;i<z.length;i++){
      var k=refKey(z[i]);
      if(!selMap[k]) continue;
      var k2=refKey(z[i-1]);
      if(selMap[k2]) continue;
      var tmp=z[i]; z[i]=z[i-1]; z[i-1]=tmp;
    }
    return;
  }
  if(mode==='front' || mode==='back'){
    var kept=[], moved=[];
    for(var i=0;i<z.length;i++){
      if(selMap[refKey(z[i])]) moved.push(z[i]);
      else kept.push(z[i]);
    }
    state.zOrder = (mode==='back') ? moved.concat(kept) : kept.concat(moved);
    return;
  }
}

function drawEntityByRef(ref){
  var vis=visibleLayerSet();
  if(ref.type==='seg'){
    var s=findById(state.segments,ref.id); if(!s||!vis[s.layer]) return;
    var a=worldToScreen(s.a), b=worldToScreen(s.b);
    ctx.beginPath();
    applyStrokeStyle(s.style||{});
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    if(isSelected({type:'seg',id:s.id})){
      ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(59,130,246,.85)'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
    }
    return;
  }
  if(ref.type==='pline'){
    var pl=findById(state.polylines,ref.id); if(!pl||!vis[pl.layer]||isLayerLocked(pl.layer)) return;
    if(pl.pts.length<2) return;
    ctx.beginPath();
    applyStrokeStyle(pl.style||{});
    var p0=worldToScreen(pl.pts[0]);
    ctx.moveTo(p0.x,p0.y);
    for(var j=1;j<pl.pts.length;j++){
      var pj=worldToScreen(pl.pts[j]);
      ctx.lineTo(pj.x,pj.y);
    }
    if(pl.closed) ctx.closePath();
    if(pl.closed && pl.style && pl.style.fill){
      ctx.save(); ctx.fillStyle=pl.style.fill; ctx.fill(); ctx.restore();
    }
    ctx.stroke();
    if(isSelected({type:'pline',id:pl.id})){
      ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(59,130,246,.85)'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
    }
    return;
  }
  if(ref.type==='arc'){
    var ar=findById(state.arcs,ref.id); if(!ar||!vis[ar.layer]||isLayerLocked(ar.layer)) return;
    var c=worldToScreen({x:ar.cx,y:ar.cy});
    ctx.beginPath();
    applyStrokeStyle(ar.style||{});
    ctx.arc(c.x,c.y,ar.r*state.pxPerMM, ar.a0, ar.a1, !!ar.ccw);
    ctx.stroke();
    if(isSelected({type:'arc',id:ar.id})){
      ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(59,130,246,.85)'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
    }
    return;
  }
  if(ref.type==='rect'){
    var r=findById(state.rects,ref.id); if(!r||!vis[r.layer]||isLayerLocked(r.layer)) return;
    var c=worldToScreen({x:r.cx,y:r.cy});
    ctx.save();
    ctx.translate(c.x,c.y);
    ctx.rotate(r.rot||0);
    if(r.style && r.style.fill){
      ctx.save();
      ctx.fillStyle=r.style.fill;
      ctx.fillRect(-r.w*state.pxPerMM/2,-r.h*state.pxPerMM/2,r.w*state.pxPerMM,r.h*state.pxPerMM);
      ctx.restore();
    }
    ctx.beginPath();
    applyStrokeStyle(r.style||{});
    ctx.rect(-r.w*state.pxPerMM/2,-r.h*state.pxPerMM/2,r.w*state.pxPerMM,r.h*state.pxPerMM);
    ctx.stroke();
    if(isSelected({type:'rect',id:r.id})){
      ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(59,130,246,.85)'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    return;
  }
  if(ref.type==='ell'){
    var e=findById(state.ellipses,ref.id); if(!e||!vis[e.layer]||isLayerLocked(e.layer)) return;
    var c=worldToScreen({x:e.cx,y:e.cy});
    ctx.save();
    ctx.translate(c.x,c.y);
    ctx.rotate(e.rot||0);
    if(e.style && e.style.fill){
      ctx.save(); ctx.fillStyle=e.style.fill;
      ctx.beginPath(); ctx.ellipse(0,0,e.rx*state.pxPerMM,e.ry*state.pxPerMM,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    applyStrokeStyle(e.style||{});
    ctx.ellipse(0,0,e.rx*state.pxPerMM,e.ry*state.pxPerMM,0,0,Math.PI*2);
    ctx.stroke();
    if(isSelected({type:'ell',id:e.id})){
      ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(59,130,246,.85)'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    return;
  }
  if(ref.type==='dim'){
    var d=findById(state.dims,ref.id); if(!d||!vis[d.layer]||isLayerLocked(d.layer)) return;
    var save=state.dims; state.dims=[d]; drawDims(); state.dims=save;
    return;
  }
  if(ref.type==='rdim'){
    var rd=findById(state.radDims,ref.id); if(!rd||!vis[rd.layer]||isLayerLocked(rd.layer)) return;
    var save=state.radDims; state.radDims=[rd]; drawRadDims(); state.radDims=save;
    return;
  }
  if(ref.type==='img'){
    var im=findById(state.images,ref.id); if(!im||!vis[im.layer]) return;
    var img=ensureImageCached(im);
    if(!img) return;
    var c=worldToScreen({x:im.cx,y:im.cy});
    ctx.save();
    ctx.translate(c.x,c.y);
    ctx.rotate(im.rot||0);
    ctx.globalAlpha=(typeof im.opacity==='number') ? clamp(im.opacity,0,1) : 1;
    ctx.drawImage(img, -im.w*state.pxPerMM/2, -im.h*state.pxPerMM/2, im.w*state.pxPerMM, im.h*state.pxPerMM);
    ctx.restore();
    if(isSelected({type:'img',id:im.id})){
      ctx.save();
      ctx.setLineDash([4,4]);
      ctx.strokeStyle='rgba(59,130,246,.85)';
      ctx.lineWidth=2;
      var cs=getRectCorners(im);
      ctx.beginPath();
      var p0=worldToScreen(cs[0]); ctx.moveTo(p0.x,p0.y);
      for(var j=1;j<cs.length;j++){ var pj=worldToScreen(cs[j]); ctx.lineTo(pj.x,pj.y); }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    return;
  }
	  if(ref.type==='text'){
	    var t=findById(state.texts,ref.id); if(!t||!vis[t.layer]||isLayerLocked(t.layer)) return;
	    var p=worldToScreen({x:t.x,y:t.y});
	    ctx.save();
	    ctx.translate(p.x,p.y);
	    ctx.rotate(t.rot||0);
	    var sizePx=(t.sizeMM||5)*state.pxPerMM;
	    ctx.font=sizePx+'px '+(t.font||'Arial');
	    ctx.textAlign=t.align||'left';
	    ctx.textBaseline='alphabetic';
	    ctx.fillStyle=(t.style && t.style.fill) ? t.style.fill : '#111827';
	    var txt=(t.text||'').toString();
	    var spacingMM = (typeof t.spacingMM==='number') ? t.spacingMM : ((typeof t.letterSpacingMM==='number') ? t.letterSpacingMM : 0);
	    var lsPx=spacingMM*state.pxPerMM;
	    if(Math.abs(lsPx)>0.01 && txt.length>0){
	      var total=0;
	      for(var ci0=0;ci0<txt.length;ci0++){
	        total += (ctx.measureText(txt[ci0]).width || 0);
	        if(ci0<txt.length-1) total += lsPx;
	      }
	      var x=0;
	      if(ctx.textAlign==='center') x = -total/2;
	      else if(ctx.textAlign==='right') x = -total;
	      for(var ci=0;ci<txt.length;ci++){
	        ctx.fillText(txt[ci], x, 0);
	        x += (ctx.measureText(txt[ci]).width || 0) + lsPx;
	      }
	    } else {
	      ctx.fillText(txt,0,0);
	    }
	    ctx.restore();
	    if(isSelected({type:'text',id:t.id})){
      ctx.save();
      ctx.setLineDash([4,4]);
      ctx.strokeStyle='rgba(59,130,246,.85)';
      ctx.lineWidth=2;
      var tr=textRectMM(t);
      var aabb=rotRectAABB(tr.cx,tr.cy,tr.w,tr.h,tr.ang);
      ctx.beginPath();
      var ps=worldToScreen(aabb.pts[0]); ctx.moveTo(ps.x,ps.y);
      for(var j=1;j<aabb.pts.length;j++){ var pj=worldToScreen(aabb.pts[j]); ctx.lineTo(pj.x,pj.y); }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    return;
  }
}

function drawEntitiesByZOrder(){
  ensureZOrder();
  for(var i=0;i<state.zOrder.length;i++){
    drawEntityByRef(state.zOrder[i]);
  }
}


  // ----- Picking with rotation -----
  function distPointToSeg(p,a,b){
    var vx=b.x-a.x, vy=b.y-a.y;
    var wx=p.x-a.x, wy=p.y-a.y;
    var c1=wx*vx+wy*vy;
    if(c1<=0) return hypot(p.x-a.x,p.y-a.y);
    var c2=vx*vx+vy*vy;
    if(c2<=c1) return hypot(p.x-b.x,p.y-b.y);
    var t=c1/c2;
    var px=a.x+t*vx, py=a.y+t*vy;
    return hypot(p.x-px,p.y-py);
  }

  
function pick(p){
  ensureZOrder();
  var vis=visibleLayerSet();
  var thrMM=8/state.pxPerMM;

  // iterate topmost first
  for(var zi=state.zOrder.length-1; zi>=0; zi--){
    var ref=state.zOrder[zi];

    if(ref.type==='img'){
      var im=findById(state.images,ref.id); if(!im||!vis[im.layer]||isLayerLocked(im.layer)) continue;
      var q=invRotPoint(p, im.cx, im.cy, im.rot||0);
      if(Math.abs(q.x-im.cx)<=im.w/2 && Math.abs(q.y-im.cy)<=im.h/2) return {type:'img', id:im.id};
      continue;
    }

    if(ref.type==='text'){
      var tt=findById(state.texts,ref.id); if(!tt||!vis[tt.layer]||isLayerLocked(tt.layer)) continue;
      var tr=textRectMM(tt);
      if(pointInRotRect(p, tr.cx, tr.cy, tr.w, tr.h, tr.ang)) return {type:'text',id:tt.id};
      continue;
    }

    if(ref.type==='seg'){
      var seg=findById(state.segments,ref.id); if(!seg||!vis[seg.layer]||isLayerLocked(seg.layer)) continue;
      if(distPointToSeg(p,seg.a,seg.b) < thrMM) return {type:'seg', id:seg.id};
      continue;
    }

    if(ref.type==='pline'){
      var pl=findById(state.polylines,ref.id); if(!pl||!vis[pl.layer]||isLayerLocked(pl.layer)) continue;
      for(var j=1;j<pl.pts.length;j++){
        if(distPointToSeg(p, pl.pts[j-1], pl.pts[j]) < thrMM) return {type:'pline', id:pl.id, segIndex:j-1};
      }
      if(pl.closed && pl.pts.length>2){
        if(distPointToSeg(p, pl.pts[pl.pts.length-1], pl.pts[0]) < thrMM) return {type:'pline', id:pl.id, segIndex:pl.pts.length-1};
      }
      continue;
    }

    if(ref.type==='arc'){
      var ar=findById(state.arcs,ref.id); if(!ar||!vis[ar.layer]||isLayerLocked(ar.layer)) continue;
      var d=hypot(p.x-ar.cx, p.y-ar.cy);
      if(Math.abs(d-ar.r) < thrMM) return {type:'arc', id:ar.id};
      continue;
    }

    if(ref.type==='rect'){
      var rr=findById(state.rects,ref.id); if(!rr||!vis[rr.layer]||isLayerLocked(rr.layer)) continue;
      var q2=invRotPoint(p, rr.cx, rr.cy, rr.rot||0);
      if(Math.abs(q2.x-rr.cx)<=rr.w/2 && Math.abs(q2.y-rr.cy)<=rr.h/2) return {type:'rect', id:rr.id};
      continue;
    }

    if(ref.type==='ell'){
      var el=findById(state.ellipses,ref.id); if(!el||!vis[el.layer]||isLayerLocked(el.layer)) continue;
      var q3=invRotPoint(p, el.cx, el.cy, el.rot||0);
      var nx=(q3.x-el.cx)/Math.max(0.0001,el.rx);
      var ny=(q3.y-el.cy)/Math.max(0.0001,el.ry);
      if(nx*nx+ny*ny<=1.0) return {type:'ell', id:el.id};
      continue;
    }

    if(ref.type==='dim'){
      var dd=findById(state.dims,ref.id); if(!dd||!vis[dd.layer]||isLayerLocked(dd.layer)) continue;

      var a=dd.a, b=dd.b;
      var vx=b.x-a.x, vy=b.y-a.y;
      var len=hypot(vx,vy); if(len<1e-6) continue;
      var nx=-vy/len, ny=vx/len;
      var off=dd.offsetMM||10;

      var a2={x:a.x+nx*off,y:a.y+ny*off};
      var b2={x:b.x+nx*off,y:b.y+ny*off};

      if(distPointToSeg(p, a2, b2) < thrMM*1.4) return {type:'dim', id:dd.id};
      if(distPointToSeg(p, a, a2) < thrMM*1.2) return {type:'dim', id:dd.id};
      if(distPointToSeg(p, b, b2) < thrMM*1.2) return {type:'dim', id:dd.id};

      var mid={x:(a2.x+b2.x)/2,y:(a2.y+b2.y)/2};
      if(hypot(p.x-mid.x,p.y-mid.y) < thrMM*2) return {type:'dim', id:dd.id};

      continue;
    }
  }
  return null;
}

  // ----- Grips (incl rotate grip) -----
  function gripsFor(ref){
    if(!ref) return [];
    if(ref.type==='seg'){
      var s=findById(state.segments,ref.id); if(!s) return [];
      return [
        {type:'seg',id:s.id,grip:'a',x:s.a.x,y:s.a.y},
        {type:'seg',id:s.id,grip:'b',x:s.b.x,y:s.b.y},
      ];
    }
    if(ref.type==='dim'){
      var d=findById(state.dims,ref.id); if(!d) return [];
      var a=d.a, b=d.b;
      var vx=b.x-a.x, vy=b.y-a.y;
      var len=hypot(vx,vy); if(len<1e-6) return [];
      var nx=-vy/len, ny=vx/len;
      var off=d.offsetMM||10;
      var mid={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
      var offPt={x:mid.x+nx*off, y:mid.y+ny*off};
      return [
        {type:'dim',id:d.id,grip:'a',x:a.x,y:a.y},
        {type:'dim',id:d.id,grip:'b',x:b.x,y:b.y},
        {type:'dim',id:d.id,grip:'off',x:offPt.x,y:offPt.y},
      ];
    }
    if(ref.type==='rect'){
      var r=findById(state.rects,ref.id); if(!r) return [];
      var corners=getRectCorners(r);
      // rotate grip: above top edge midpoint
      var topMid={x:(corners[0].x+corners[1].x)/2, y:(corners[0].y+corners[1].y)/2};
      var gripRot=rotPoint({x:r.cx, y:r.cy-r.h/2-10}, r.cx, r.cy, r.rot||0);
      return [
        {type:'rect',id:r.id,grip:'nw',x:corners[0].x,y:corners[0].y},
        {type:'rect',id:r.id,grip:'ne',x:corners[1].x,y:corners[1].y},
        {type:'rect',id:r.id,grip:'se',x:corners[2].x,y:corners[2].y},
        {type:'rect',id:r.id,grip:'sw',x:corners[3].x,y:corners[3].y},
        {type:'rect',id:r.id,grip:'rot',x:gripRot.x,y:gripRot.y},
      ];
    }
    if(ref.type==='img'){
      var im=findById(state.images,ref.id); if(!im) return [];
      var corners=getRectCorners(im);
      var gripRot=rotPoint({x:im.cx, y:im.cy-im.h/2-10}, im.cx, im.cy, im.rot||0);
      return [
        {type:'img',id:im.id,grip:'nw',x:corners[0].x,y:corners[0].y},
        {type:'img',id:im.id,grip:'ne',x:corners[1].x,y:corners[1].y},
        {type:'img',id:im.id,grip:'se',x:corners[2].x,y:corners[2].y},
        {type:'img',id:im.id,grip:'sw',x:corners[3].x,y:corners[3].y},
        {type:'img',id:im.id,grip:'rot',x:gripRot.x,y:gripRot.y},
      ];
    }
    if(ref.type==='ell'){
      var e=findById(state.ellipses,ref.id); if(!e) return [];
      var ang=e.rot||0;
      var pts=[
        rotPoint({x:e.cx+e.rx,y:e.cy}, e.cx,e.cy,ang),
        rotPoint({x:e.cx-e.rx,y:e.cy}, e.cx,e.cy,ang),
        rotPoint({x:e.cx,y:e.cy+e.ry}, e.cx,e.cy,ang),
        rotPoint({x:e.cx,y:e.cy-e.ry}, e.cx,e.cy,ang),
        rotPoint({x:e.cx, y:e.cy-e.ry-10}, e.cx,e.cy,ang),
      ];
      return [
        {type:'ell',id:e.id,grip:'rxp',x:pts[0].x,y:pts[0].y},
        {type:'ell',id:e.id,grip:'rxm',x:pts[1].x,y:pts[1].y},
        {type:'ell',id:e.id,grip:'ryp',x:pts[2].x,y:pts[2].y},
        {type:'ell',id:e.id,grip:'rym',x:pts[3].x,y:pts[3].y},
        {type:'ell',id:e.id,grip:'rot',x:pts[4].x,y:pts[4].y},
      ];
    }

    if(ref.type==='pline'){
      var pl=findById(state.polylines,ref.id); if(!pl) return [];
      if(pl.noVertexEdit) return [];
      var gs=[];
      for(var i=0;i<pl.pts.length;i++) gs.push({type:'pline',id:pl.id,grip:'p'+i,x:pl.pts[i].x,y:pl.pts[i].y});
      return gs;
    }
    if(ref.type==='arc'){ var a=findById(state.arcs,ref.id); if(!a) return []; return [{type:'arc',id:a.id,grip:'c',x:a.cx,y:a.cy},{type:'arc',id:a.id,grip:'a0',x:a.cx+Math.cos(a.a0)*a.r,y:a.cy+Math.sin(a.a0)*a.r},{type:'arc',id:a.id,grip:'a1',x:a.cx+Math.cos(a.a1)*a.r,y:a.cy+Math.sin(a.a1)*a.r}]; }

    if(ref.type==='text'){
      var t=findById(state.texts,ref.id); if(!t) return [];
      var gripRot=rotPoint({x:t.x, y:t.y-(t.sizeMM||5)*2}, t.x, t.y, t.rot||0);
      return [
        {type:'text',id:t.id,grip:'move',x:t.x,y:t.y},
        {type:'text',id:t.id,grip:'rot',x:gripRot.x,y:gripRot.y},
      ];
    }
    return [];
  }

  function gripHitTest(p){
    var thrMM=10/state.pxPerMM;
    var best=null, bestD=1e9;
    for(var i=0;i<state.selection.length;i++){
      var gs=gripsFor(state.selection[i]);
      for(var j=0;j<gs.length;j++){
        var g=gs[j];
        var d=hypot(p.x-g.x,p.y-g.y);
        if(d<thrMM && d<bestD){ bestD=d; best=g; }
      }
    }
    return best;
  }

  
