
// ----- Offset helpers -----
function getLayerOfRef(ref){
  if(!ref) return null;
  if(ref.type==='seg'){ var o=findById(state.segments,ref.id); return o?o.layer:null; }
  if(ref.type==='rect'){ var o=findById(state.rects,ref.id); return o?o.layer:null; }
  if(ref.type==='ell'){ var o=findById(state.ellipses,ref.id); return o?o.layer:null; }
  if(ref.type==='pline'){ var o=findById(state.polylines,ref.id); return o?o.layer:null; }
  if(ref.type==='arc'){ var o=findById(state.arcs,ref.id); return o?o.layer:null; }
  if(ref.type==='dim'){ var o=findById(state.dims,ref.id); return o?o.layer:null; }
  if(ref.type==='rdim'){ var o=findById(state.radDims,ref.id); return o?o.layer:null; }
  if(ref.type==='img'){ var o=findById(state.images,ref.id); return o?o.layer:null; }
  if(ref.type==='text'){ var o=findById(state.texts,ref.id); return o?o.layer:null; }
  return null;
}
function lineIntersection(a1,a2,b1,b2){
  var x1=a1.x,y1=a1.y,x2=a2.x,y2=a2.y,x3=b1.x,y3=b1.y,x4=b2.x,y4=b2.y;
  var den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(den)<1e-12) return null;
  var px=((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/den;
  var py=((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/den;
  return {x:px,y:py};
}
function offsetSignForRef(ref, w){
  // returns +1 or -1 depending on which side user points
  if(ref.type==='seg'){
    var s=findById(state.segments,ref.id); if(!s) return 1;
    var ax=s.a.x, ay=s.a.y, bx=s.b.x, by=s.b.y;
    var cross=(bx-ax)*(w.y-ay)-(by-ay)*(w.x-ax);
    return (cross>=0)? 1 : -1;
  }
  if(ref.type==='ell'){
    var e=findById(state.ellipses,ref.id); if(!e) return 1;
    // only reliable for circles; for ellipses we fallback
    var dx=w.x-e.cx, dy=w.y-e.cy;
    var r=Math.max(1e-9, (e.rx+e.ry)/2);
    var d=Math.sqrt(dx*dx+dy*dy);
    return (d>=r)? 1 : -1;
  }
  if(ref.type==='arc'){
    var a=findById(state.arcs,ref.id); if(!a) return 1;
    var dx=w.x-a.cx, dy=w.y-a.cy;
    var d=Math.sqrt(dx*dx+dy*dy);
    return (d>=a.r)? 1 : -1;
  }
  if(ref.type==='pline'){
    var pl=findById(state.polylines,ref.id); if(!pl || pl.pts.length<2) return 1;
    // choose closest segment
    var bestI=0, bestD=1e100;
    for(var i=0;i<pl.pts.length-1;i++){
      var p0=pl.pts[i], p1=pl.pts[i+1];
      var vx=p1.x-p0.x, vy=p1.y-p0.y;
      var t=((w.x-p0.x)*vx+(w.y-p0.y)*vy)/(vx*vx+vy*vy||1);
      t=Math.max(0,Math.min(1,t));
      var px=p0.x+t*vx, py=p0.y+t*vy;
      var dd=(w.x-px)*(w.x-px)+(w.y-py)*(w.y-py);
      if(dd<bestD){ bestD=dd; bestI=i; }
    }
    var a0=pl.pts[bestI], b0=pl.pts[bestI+1];
    var cross=(b0.x-a0.x)*(w.y-a0.y)-(b0.y-a0.y)*(w.x-a0.x);
    return (cross>=0)? 1 : -1;
  }
  return 1;
}
function buildOffsetGeom(ref, distSigned){
  // returns {type, ...} in the same entity shape (for preview or commit), or null
  var d=distSigned;
  if(ref.type==='seg'){
    var s=findById(state.segments,ref.id); if(!s) return null;
    var ax=s.a.x, ay=s.a.y, bx=s.b.x, by=s.b.y;
    var vx=bx-ax, vy=by-ay;
    var len=Math.sqrt(vx*vx+vy*vy)||1;
    var nx=-vy/len, ny=vx/len;
    return {type:'seg', a:{x:ax+nx*d,y:ay+ny*d}, b:{x:bx+nx*d,y:by+ny*d}, layer:s.layer, style:s.style||{}};
  }
  if(ref.type==='ell'){
    var e=findById(state.ellipses,ref.id); if(!e) return null;
    // circle only (rx ~ ry)
    var r=(e.rx+e.ry)/2;
    var r2=r + d;
    if(r2<=0.05) return null;
    return {type:'ell', cx:e.cx, cy:e.cy, rx:r2, ry:r2, rot:e.rot||0, layer:e.layer, style:e.style||{}};
  }
  if(ref.type==='arc'){
    var a=findById(state.arcs,ref.id); if(!a) return null;
    var r2=a.r + d;
    if(r2<=0.05) return null;
    return {type:'arc', cx:a.cx, cy:a.cy, r:r2, a0:a.a0, a1:a.a1, ccw:!!a.ccw, layer:a.layer, style:a.style||{}};
  }
  if(ref.type==='pline'){
    var pl=findById(state.polylines,ref.id); if(!pl || pl.pts.length<2) return null;
    var pts=pl.pts;
    var n=pts.length;
    var closed=!!pl.closed;
    // build offset lines for each segment
    var segs=[];
    var segCount = closed? n : (n-1);
    for(var i=0;i<segCount;i++){
      var p0=pts[i];
      var p1=pts[(i+1)%n];
      var vx=p1.x-p0.x, vy=p1.y-p0.y;
      var len=Math.sqrt(vx*vx+vy*vy)||1;
      var nx=-vy/len, ny=vx/len;
      segs.push({
        a:{x:p0.x+nx*d,y:p0.y+ny*d},
        b:{x:p1.x+nx*d,y:p1.y+ny*d},
      });
    }
    // intersect consecutive offset segments
    var outPts=[];
    if(!closed){
      outPts.push(segs[0].a);
      for(var i=0;i<segs.length-1;i++){
        var inter=lineIntersection(segs[i].a,segs[i].b,segs[i+1].a,segs[i+1].b);
        outPts.push(inter || segs[i].b);
      }
      outPts.push(segs[segs.length-1].b);
    } else {
      for(var i=0;i<segs.length;i++){
        var prev=segs[(i-1+segs.length)%segs.length];
        var cur=segs[i];
        var inter=lineIntersection(prev.a,prev.b,cur.a,cur.b);
        outPts.push(inter || cur.a);
      }
    }
    return {type:'pline', pts:outPts, closed:closed, layer:pl.layer, style:pl.style||{}};
  }
  return null;
}
function commitOffset(ref, distSigned){
  var g=buildOffsetGeom(ref, distSigned);
  if(!g) return false;
  var id=uid();
  var style=styleForNew();
  // Keep source layer by default (mechanical-friendly)
  var lay=g.layer || currentLayer();
    if(isLayerLocked(lay)){
      setStatus(window.t('status.offsetLockedLayer'));
      return false;
  }
  if(g.type==='seg'){
    state.segments.push({id:id, a:g.a, b:g.b, layer:lay, style:Object.assign({}, g.style, style)});
    addToZOrder('seg', id);
    return true;
  }
  if(g.type==='ell'){
    state.ellipses.push({id:id, cx:g.cx, cy:g.cy, rx:g.rx, ry:g.ry, rot:g.rot||0, layer:lay, style:Object.assign({}, g.style, style)});
    addToZOrder('ell', id);
    return true;
  }
  if(g.type==='arc'){
    state.arcs.push({id:id, cx:g.cx, cy:g.cy, r:g.r, a0:g.a0, a1:g.a1, ccw:!!g.ccw, layer:lay, style:Object.assign({}, g.style, style)});
    addToZOrder('arc', id);
    return true;
  }
  if(g.type==='pline'){
    state.polylines.push({id:id, pts:g.pts.map(p=>({x:p.x,y:p.y})), closed:!!g.closed, layer:lay, style:Object.assign({}, g.style, style)});
    addToZOrder('pline', id);
    return true;
  }
  return false;
}

// ----- Apply properties to selection -----
  function applyToSelection(){
    if(!state.selection.length){ setStatus(window.t('status.noSelection')); return; }
    var layer=ui.selLayer.value;
    var color=ui.objColor.value;
    var width=+ui.objWidth.value||1;
    var dashCfg=parseDashPatternInput(ui.objDash.value);
    var rotDeg=+ui.objRot.value||0;
    var rotR=rad(rotDeg);
    var fillOn=!!(ui.chkFill && ui.chkFill.checked);
    var fillColor=(ui.objFill ? ui.objFill.value : '#FFD166');
    var skippedLocked=0;

    for(var i=0;i<state.selection.length;i++){
      var ref=state.selection[i];
      var refLayer=getLayerOfRef(ref);
      if(refLayer && isLayerLocked(refLayer)){ skippedLocked++; continue; }
      if(ref.type==='seg'){
        var s=findById(state.segments,ref.id); if(!s) continue;
        s.layer=layer;
        s.style=s.style||{};
        s.style.stroke=color; s.style.width=width; s.style.dashed=dashCfg.dashed;
        if(dashCfg.dash) s.style.dash=dashCfg.dash.slice(); else delete s.style.dash;
        // rotation doesn't apply (line already defined by endpoints)
      } else if(ref.type==='rect'){
        var r=findById(state.rects,ref.id); if(!r) continue;
        r.layer=layer;
        r.style=r.style||{};
        r.style.stroke=color; r.style.width=width; r.style.dashed=dashCfg.dashed;
        if(dashCfg.dash) r.style.dash=dashCfg.dash.slice(); else delete r.style.dash;
        if(fillOn) r.style.fill=fillColor; else delete r.style.fill;
        r.rot=rotR;
      } else if(ref.type==='ell'){
        var e=findById(state.ellipses,ref.id); if(!e) continue;
        e.layer=layer;
        e.style=e.style||{};
        e.style.stroke=color; e.style.width=width; e.style.dashed=dashCfg.dashed;
        if(dashCfg.dash) e.style.dash=dashCfg.dash.slice(); else delete e.style.dash;
        if(fillOn) e.style.fill=fillColor; else delete e.style.fill;
        e.rot=rotR;
      } else if(ref.type==='pline'){
        var pl=findById(state.polylines,ref.id); if(!pl) continue;
        pl.layer=layer;
        pl.style=pl.style||{};
        pl.style.stroke=color; pl.style.width=width; pl.style.dashed=dashCfg.dashed;
        if(dashCfg.dash) pl.style.dash=dashCfg.dash.slice(); else delete pl.style.dash;
        // fill only if closed
        if(pl.closed){
          if(fillOn) pl.style.fill=fillColor; else delete pl.style.fill;
        }
      }
      else if(ref.type==='text'){
        var t=findById(state.texts,ref.id); if(!t) continue;
        t.layer=layer;
        t.style=t.style||{};
        t.style.fill=color;
        t.rot=rotR;
        // apply text props from inspector
        t.sizeMM=+ui.textSize.value||t.sizeMM||5;
        t.font=ui.textFont.value||t.font||'Arial';
        t.align=ui.textAlign.value||t.align||'left';
        t.spacingMM=+ui.textSpacing.value||0;
        // do not force content here (use Modifica button or double click)
      } else if(ref.type==='dim'){
        var d=findById(state.dims,ref.id); if(!d) continue;
        d.layer=layer;
      } else if(ref.type==='arc'){
        var ar=findById(state.arcs,ref.id); if(!ar) continue;
        ar.layer=layer;
        ar.style=ar.style||{};
        ar.style.stroke=color; ar.style.width=width; ar.style.dashed=dashCfg.dashed;
        if(dashCfg.dash) ar.style.dash=dashCfg.dash.slice(); else delete ar.style.dash;
      } else if(ref.type==='rdim'){
        var rd=findById(state.radDims,ref.id); if(!rd) continue;
        rd.layer=layer;
        rd.style=rd.style||{};
        rd.style.stroke=color; rd.style.width=width; rd.style.dashed=dashCfg.dashed;
        if(dashCfg.dash) rd.style.dash=dashCfg.dash.slice(); else delete rd.style.dash;
      } else if(ref.type==='img'){
        var im=findById(state.images,ref.id); if(!im) continue;
        im.layer=layer;
        im.rot=rotR;
      }
    }
    pushHist();
    draw();
    if(skippedLocked>0) setStatus(window.t('status.propertiesAppliedPartial'));
    else setStatus(window.t('status.propertiesApplied'));
  }


  function newId(){ return uid(); }
  function cloneEntity(ref){
    var out=[];
    function addRef(type,id){ out.push({type:type,id:id}); }
    if(ref.type==='seg'){ var s=findById(state.segments,ref.id); if(!s) return out; var ns=deepClone(s); ns.id=newId(); state.segments.push(ns); addRef('seg',ns.id); }
    else if(ref.type==='rect'){ var r=findById(state.rects,ref.id); if(!r) return out; var nr=deepClone(r); nr.id=newId(); state.rects.push(nr); addRef('rect',nr.id); }
    else if(ref.type==='ell'){ var e=findById(state.ellipses,ref.id); if(!e) return out; var ne=deepClone(e); ne.id=newId(); state.ellipses.push(ne); addRef('ell',ne.id); }
    else if(ref.type==='img'){ var im=findById(state.images,ref.id); if(!im) return out; var ni=deepClone(im); ni.id=newId(); state.images.push(ni); addRef('img',ni.id); }
    else if(ref.type==='text'){ var t=findById(state.texts,ref.id); if(!t) return out; var nt=deepClone(t); nt.id=newId(); state.texts.push(nt); addRef('text',nt.id); }
    else if(ref.type==='dim'){ var d=findById(state.dims,ref.id); if(!d) return out; var nd=deepClone(d); nd.id=newId(); state.dims.push(nd); addRef('dim',nd.id); }
    else if(ref.type==='pline'){ var pl=findById(state.polylines,ref.id); if(!pl) return out; var npl=deepClone(pl); npl.id=newId(); state.polylines.push(npl); addRef('pline',npl.id); }
    else if(ref.type==='arc'){ var a=findById(state.arcs,ref.id); if(!a) return out; var na=deepClone(a); na.id=newId(); state.arcs.push(na); addRef('arc',na.id); }
    else if(ref.type==='rdim'){ var rd=findById(state.radDims,ref.id); if(!rd) return out; var nrd=deepClone(rd); nrd.id=newId(); state.radDims.push(nrd); addRef('rdim',nrd.id); }
    return out;
  }
  function offsetRefs(refs, dx, dy){
    for(var i=0;i<refs.length;i++){
      var ref=refs[i];
      if(ref.type==='seg'){ var s=findById(state.segments,ref.id); if(s){ s.a.x+=dx; s.a.y+=dy; s.b.x+=dx; s.b.y+=dy; } }
      if(ref.type==='rect'){ var r=findById(state.rects,ref.id); if(r){ r.cx+=dx; r.cy+=dy; } }
      if(ref.type==='ell'){ var e=findById(state.ellipses,ref.id); if(e){ e.cx+=dx; e.cy+=dy; } }
      if(ref.type==='img'){ var im=findById(state.images,ref.id); if(im){ im.cx+=dx; im.cy+=dy; } }
      if(ref.type==='text'){ var t=findById(state.texts,ref.id); if(t){ t.x+=dx; t.y+=dy; } }
      if(ref.type==='dim'){ var d=findById(state.dims,ref.id); if(d){ d.a.x+=dx; d.a.y+=dy; d.b.x+=dx; d.b.y+=dy; } }
      if(ref.type==='pline'){ var pl=findById(state.polylines,ref.id); if(pl){ for(var j=0;j<pl.pts.length;j++){ pl.pts[j].x+=dx; pl.pts[j].y+=dy; } } }
      if(ref.type==='arc'){ var a=findById(state.arcs,ref.id); if(a){ a.cx+=dx; a.cy+=dy; } }
      if(ref.type==='rdim'){ var rd=findById(state.radDims,ref.id); if(rd){ rd.cx+=dx; rd.cy+=dy; rd.anchor.x+=dx; rd.anchor.y+=dy; } }
    }
  }
  function copySelection(){
    if(!state.selection.length){ setStatus(window.t('status.noSelection')); return; }
    state.clipboard = deepClone(state.selection);
    setStatus(window.t('status.copiedCount', { count: state.selection.length }));
  }
  function pasteSelection(){
    if(!state.clipboard || !state.clipboard.length){ setStatus(window.t('status.emptyClipboard')); return; }
    var created=[];
    for(var i=0;i<state.clipboard.length;i++) created = created.concat(cloneEntity(state.clipboard[i]));
    offsetRefs(created, 10, 10);
    state.selection=created;
    pushHist(); draw(); setStatus(window.t('status.pasted'));
  }

  ui.btnApplyStyle.onclick=applyToSelection;
  ui.btnEditText.onclick=function(){
    var ps=primarySelection();
    if(!ps || ps.type!=='text'){ setStatus(window.t('status.selectText')); return; }
    var t=findById(state.texts,ps.id); if(!t) return;
    if(isLayerLocked(t.layer)){ setStatus(window.t('status.lockedLayerEditText')); return; }

    // 1) content from panel if present, else prompt
    var panelTxt=(ui.textValue.value||'').toString();
    var nv=panelTxt.trim() ? panelTxt : prompt(window.t('dialog.text'), t.text||'');
    if(nv===null) return;
    t.text=String(nv);
    ui.textValue.value=t.text;

    // 2) apply formatting from panel
    t.sizeMM=+ui.textSize.value||t.sizeMM||5;
    t.font=ui.textFont.value||t.font||'Arial';
    t.align=ui.textAlign.value||t.align||'left';
    t.spacingMM=+ui.textSpacing.value||t.spacingMM||0;
    // color uses current styleDraft or layer color via Apply button; keep fill if already set

    pushHist();
    draw();
    setStatus(window.t('status.textUpdated'));
  };
  ui.btnClearSel.onclick=function(){ clearSelection(); draw(); };
  // Z-order buttons (within same type)
  if(ui.btnSendBack) ui.btnSendBack.onclick=function(){ moveSelectionInZOrder("down"); pushHist(); draw(); };
  if(ui.btnBringFront) ui.btnBringFront.onclick=function(){ moveSelectionInZOrder("up"); pushHist(); draw(); };
  if(ui.btnToBack) ui.btnToBack.onclick=function(){ moveSelectionInZOrder("back"); pushHist(); draw(); };
  if(ui.btnToFront) ui.btnToFront.onclick=function(){ moveSelectionInZOrder("front"); pushHist(); draw(); };

  ui.btnCopy.onclick=copySelection;
  ui.btnPaste.onclick=pasteSelection;


  ui.selLayer.onchange=function(){ /* apply via button */ };

  ui.btnDelete.onclick=function(){
    if(!state.selection.length) return;
    var keys=new Set(state.selection.map(selectionKey));
    var zrm={}; keys.forEach(function(k){ zrm[k]=1; });
    removeFromZOrderByKeyMap(zrm);
    keys.forEach(function(k){
      if(k.indexOf('img:')===0){
        var id=k.slice(4);
        if(state.imageCache) delete state.imageCache[id];
        if(state.imageLoadState) delete state.imageLoadState[id];
      }
    });
    state.segments=state.segments.filter(o=>!keys.has('seg:'+o.id));
    state.rects=state.rects.filter(o=>!keys.has('rect:'+o.id));
    state.ellipses=state.ellipses.filter(o=>!keys.has('ell:'+o.id));
    state.dims=state.dims.filter(o=>!keys.has('dim:'+o.id));
    state.images=state.images.filter(o=>!keys.has('img:'+o.id));
    state.texts=state.texts.filter(o=>!keys.has('text:'+o.id));
    state.polylines=state.polylines.filter(o=>!keys.has('pline:'+o.id));
    state.arcs=state.arcs.filter(o=>!keys.has('arc:'+o.id));
    state.radDims=state.radDims.filter(o=>!keys.has('rdim:'+o.id));
    clearSelection();
    pushHist();
    draw();
    setStatus(window.t('status.deleted'));
  };

  // ----- Dimension apply / pin -----
  ui.btnApplyDim.onclick=function(){
    var p=primarySelection();
    if(!p || p.type!=='dim'){ setStatus(window.t('status.selectDimension')); return; }
    var d=findById(state.dims,p.id); if(!d) return;
    d.offsetMM=+ui.dimOffset.value||10;
    d.textMM=+ui.dimText.value||3;
    pushHist(); draw(); setStatus(window.t('status.dimensionUpdated'));
  };
  ui.btnAddRadDim.onclick=function(){
    var p=primarySelection();
    if(!p||p.type!=='ell'){ setStatus(window.t('status.selectCircle')); return; }
    var e=findById(state.ellipses,p.id); if(!e) return;
    if(Math.abs((e.rx||0)-(e.ry||0))>1e-6){ setStatus(window.t('status.selectCircleRxRy')); return; }
    addRadDimFromCircle(e, state.cursorMM);
    pushHist(); draw(); setStatus(window.t('status.radialDimensionAdded'));
  };

  ui.btnPinDim.onclick=function(){
    var p=primarySelection();
    if(!p || p.type!=='dim'){ setStatus(window.t('status.selectDimension')); return; }
    setStatus(window.t('status.dimensionPinnedPlaceholder'));
  };

  
  var AUTOSAVE_KEY='minicad_autosave_v1';
  var HISTORY_LIMIT=50;
  function saveAutosave(){ try{ localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot())); } catch(e){} }
  function loadAutosave(){ try{ var raw=localStorage.getItem(AUTOSAVE_KEY); if(!raw) return null; return JSON.parse(raw); } catch(e){ return null; } }


// ----- History -----
  function snapshot(){
    return {
      layers:deepClone(state.layers),
      activeLayer:state.activeLayer,
      segments:deepClone(state.segments),
      rects:deepClone(state.rects),
      ellipses:deepClone(state.ellipses),
      dims:deepClone(state.dims),
      images:deepClone(state.images),
      texts:deepClone(state.texts),
      polylines:deepClone(state.polylines),
      arcs:deepClone(state.arcs),
      radDims:deepClone(state.radDims),
      zOrder:deepClone(state.zOrder||[]),
      panMM:deepClone(state.panMM),
	      pxPerMM:state.pxPerMM,
	      gridStepMM:state.gridStepMM,
	      snap:state.snap,
	      snapModes:deepClone(state.snapModes||{grid:false,end:true,mid:true,cen:true,int:true,perp:false,tan:true}),
	      ortho:state.ortho,
	      lockAspect:state.lockAspect,
	      exportNoBg:state.exportNoBg,
	      styleDraft:deepClone(state.styleDraft||{stroke:'#111827', width:1, dashed:false}),
	      dirty:state.dirty
	    };
	  }
  function restore(s){
    state.layers=deepClone(s.layers||{'Layer 1':{visible:true,color:'#111827'}});
    state.activeLayer=s.activeLayer||'Layer 1';
    state.segments=deepClone(s.segments||[]);
    state.rects=deepClone(s.rects||[]);
    state.ellipses=deepClone(s.ellipses||[]);
    state.dims=deepClone(s.dims||[]);
    state.images=deepClone(s.images||[]);
    state.texts=deepClone(s.texts||[]);
    state.polylines=deepClone(s.polylines||[]);
    state.arcs=deepClone(s.arcs||[]);
    state.radDims=deepClone(s.radDims||[]);
    state.zOrder=deepClone(s.zOrder||[]);
    state.imageCache={};
    state.imageLoadState={};
    state.panMM=deepClone(s.panMM||{x:0,y:0});
	    state.pxPerMM=s.pxPerMM||5;
	    state.gridStepMM=s.gridStepMM||1;
	    state.snap=!!s.snap;
	    state.snapModes=deepClone(s.snapModes||{grid:false,end:true,mid:true,cen:true,int:true,perp:false,tan:true});
	    state.ortho=!!s.ortho;
	    state.lockAspect= ('lockAspect' in s) ? !!s.lockAspect : true;
	    state.exportNoBg=!!s.exportNoBg;
	    state.styleDraft=deepClone(s.styleDraft||{stroke:'#111827', width:1, dashed:false});

    clearSelection();
    state.lineStart=null; state.rectStart=null; state.ellStart=null; state.dimFirst=null; state.selBox=null;
    refreshUI();
    draw();
  }
  function pushHist(){
    state.dirty=true;

    var snap=snapshot();
    state.hist=state.hist.slice(0,state.histIndex+1);
    state.hist.push(snap);
    while(state.hist.length>HISTORY_LIMIT){
      state.hist.shift();
    }
    state.histIndex=state.hist.length-1;
    saveAutosave();
  }
  function undo(){ if(state.histIndex<=0) return; state.histIndex--; restore(state.hist[state.histIndex]); setStatus(window.t('status.undo')); }
  function redo(){ if(state.histIndex>=state.hist.length-1) return; state.histIndex++; restore(state.hist[state.histIndex]); setStatus(window.t('status.redo')); }
  ui.btnUndo.onclick=undo;
  ui.btnRedo.onclick=redo;
  if(ui.btnSaveAutosave) ui.btnSaveAutosave.onclick=function(){ saveAutosave(); setStatus(window.t('status.autosaveSaved')); };
  ui.btnRestoreAutosave.onclick=function(){ var a=loadAutosave(); if(!a){ setStatus(window.t('status.noAutosave')); return; } if(!confirm(window.t('dialog.restoreAutosave'))) return; restore(a); pushHist(); setStatus(window.t('status.autosaveRestored')); };

  ui.btnClear.onclick=function(){
    if(!confirm(window.t('dialog.resetDrawing'))) return;
    state.segments=[]; state.rects=[]; state.ellipses=[]; state.dims=[]; state.images=[]; state.texts=[];
    state.polylines=[]; state.arcs=[]; state.radDims=[]; state.zOrder=[];
    state.imageCache={}; state.imageLoadState={};
    state.panMM={x:0,y:0}; state.pxPerMM=5; state.gridStepMM=1;
    clearSelection();
    pushHist();
    refreshUI();
    draw();
  };

  // ----- Tool click logic -----
  function finishPolyline(){
    if(state.plinePts && state.plinePts.length>=2){
      addPolyline(state.plinePts,false);
      state.plinePts=null;
      pushHist();
      setStatus(window.t('status.ok'));
      setTool('select');
    } else {
      state.plinePts=null;
      setStatus(window.t('status.ok'));
    }
  }

  // keyboard shortcuts
  window.addEventListener('keydown', function(e){
    // Finish polyline / cancel construction tools
    if(e.key==='Escape'){
      if(state.tool==='pline' && state.plinePts){ e.preventDefault(); finishPolyline(); draw(); return; }
      if(state.tool==='circle' && state.circleCenter){ e.preventDefault(); state.circleCenter=null; setStatus(window.t('status.ok')); draw(); return; }
      if(state.tool==='arc3' && state.arcPts){ e.preventDefault(); state.arcPts=null; setStatus(window.t('status.ok')); draw(); return; }
      if(state.tool==='line' && state.lineStart){ e.preventDefault(); state.lineStart=null; setStatus(window.t('status.ok')); draw(); return; }
    }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='c'){ e.preventDefault(); if(typeof copySelection==='function') copySelection(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='v'){ e.preventDefault(); if(typeof pasteSelection==='function') pasteSelection(); }
  });


  function handleClickForTool(w){
    var orthoNow=effectiveOrtho();

	    if(state.tool==='katana'){
      if(!state.cutStart){
        state.cutStart={x:w.x,y:w.y};
	        setStatus(window.t('status.katanaPickSecond'));
      } else {
        var end=w;
        if(orthoNow) end=applyOrtho45(state.cutStart,end);
        var changed = (typeof cutWithSegment === 'function') ? cutWithSegment(state.cutStart, end) : 0;
        state.cutStart=null;
        if(changed){ pushHist(); setStatus(window.t('status.cutObjectsCount', { count: changed })); }
        else { setStatus(window.t('status.cutNoIntersection')); }
      }
      draw();
      return;
    }

	    if(state.tool==='break'){
	      var hit=pick(w);
	      if(!hit){ setStatus(window.t('status.breakPickObject')); draw(); return; }
	      var lay=getLayerOfRef(hit);
	      if(lay && isLayerLocked(lay)){
	        setStatus(window.t('status.breakLockedLayer'));
	        draw(); return;
	      }
	      var ok = (typeof breakAtPoint==='function') ? breakAtPoint(hit, w) : 0;
	      if(ok){ pushHist(); setStatus(window.t('status.ok')); }
	      else { setStatus(window.t('status.breakInvalidPoint')); }
	      draw();
	      return;
	    }

    if(state.tool==='offset'){
      // Step 1: choose base object
      if(!state.offsetRef){
        var hit=pick(w);
        if(!hit){ setStatus(window.t('status.offsetPickObject')); draw(); return; }
        var lay=getLayerOfRef(hit);
        if(lay && isLayerLocked(lay)){
          setStatus(window.t('status.offsetLockedObject'));
          draw(); return;
        }
        state.offsetRef=hit;
        setStatus(window.t('status.offsetChooseSide', { distance: (state.offsetDist||10) }));
        draw(); return;
      }
      // Step 2: click side to commit
      var sign=offsetSignForRef(state.offsetRef, w);
      var dist=(state.offsetDist||10) * sign;
      var ok=commitOffset(state.offsetRef, dist);
      state.offsetPreview=null;
      state.offsetRef=null;
      if(ok){ pushHist(); setStatus(window.t('status.ok')); }
      draw(); return;
    }

    if(state.tool==='line'){
      if(!state.lineStart){ state.lineStart=w; setStatus(window.t('status.linePickEnd')); }
      else{
        var end=w;
        if(orthoNow) end=applyOrtho45(state.lineStart,end);
        addSeg(state.lineStart,end);
        state.lineStart=null;
        pushHist();
        setStatus(window.t('status.ok'));
      }
      draw(); return;
    }
    if(state.tool==='rect'){
      if(!state.rectStart){ state.rectStart=w; setStatus(window.t('status.rectPickOpposite')); }
      else{
        addRectFromCorners(state.rectStart,w);
        state.rectStart=null;
        pushHist();
        setStatus(window.t('status.ok'));
      }
      draw(); return;
    }
    if(state.tool==='ell'){
      if(!state.ellStart){ state.ellStart=w; setStatus(window.t('status.ellipsePickOpposite')); }
      else{
        addEllipseFromCorners(state.ellStart,w);
        state.ellStart=null;
        pushHist();
        setStatus(window.t('status.ok'));
      }
      draw(); return;
    }
    if(state.tool==='text'){
      var textId=addTextAt(w);
      if(textId){
        state.selection=[{type:'text',id:textId}];
        pushHist();
      }
      // after placing, jump back to Select so you can drag immediately
      setTool('select');
      syncPropsFromPrimary();
      draw();
      return;
    }

    if(state.tool==='pline'){
      if(!state.plinePts){
        state.plinePts=[{x:w.x,y:w.y}];
        setStatus(window.t('status.polylineAddPoints'));
      } else {
        state.plinePts.push({x:w.x,y:w.y});
      }
      draw(); return;
    }
    if(state.tool==='circle'){
      if(!state.circleCenter){ state.circleCenter={x:w.x,y:w.y}; setStatus(window.t('status.circlePickRadius')); }
      else{
        addCircle(state.circleCenter,w);
        state.circleCenter=null;
        pushHist();
        setStatus(window.t('status.ok'));
      }
      draw(); return;
    }
    if(state.tool==='arc3'){
      if(!state.arcPts){ state.arcPts=[{x:w.x,y:w.y}]; setStatus(window.t('status.arcPickSecond')); }
      else if(state.arcPts.length===1){ state.arcPts.push({x:w.x,y:w.y}); setStatus(window.t('status.arcPickThird')); }
      else{
        state.arcPts.push({x:w.x,y:w.y});
        var ok=addArc3p(state.arcPts[0],state.arcPts[1],state.arcPts[2]);
        state.arcPts=null;
        if(ok){
          // keep Arc tool active (no auto-switch to Select) to allow drawing multiple arcs
          pushHist();
          setStatus(window.t('status.ok'));
        } else {
          setStatus(window.t('status.invalidArc'));
        }
      }
      draw(); return;
    }

    if(state.tool==='dim'){
      if(!state.dimFirst){ state.dimFirst=w; setStatus(window.t('status.dimensionPickSecond')); }
      else{
        addDim(state.dimFirst,w,+ui.dimOffset.value||10,+ui.dimText.value||3);
        state.dimFirst=null;
        // auto-select the last dimension and go back to Select so you can move/adjust immediately
        var last=state.dims[state.dims.length-1];
        if(last){ state.selection=[{type:'dim',id:last.id}]; }
        pushHist();
        setTool('select');
        syncPropsFromPrimary();
        setStatus(window.t('status.ok'));
      }
      draw(); return;
    }
  }

  // ----- Box selection -----
  function rectNorm(a,b){
    return { x:Math.min(a.x,b.x), y:Math.min(a.y,b.y), w:Math.abs(b.x-a.x), h:Math.abs(b.y-a.y) };
  }
  function intersects(a,b){
    return !(a.x+a.w < b.x || b.x+b.w < a.x || a.y+a.h < b.y || b.y+b.h < a.y);
  }
  function applyBoxSelection(box, additive){
    var newSel=[];
    var targets=[];
    function add(type,id){ targets.push({type:type,id:id}); }
    var vis=visibleLayerSet();
    for(var i=0;i<state.segments.length;i++){ if(vis[state.segments[i].layer]) add('seg',state.segments[i].id); }
    for(var i=0;i<state.rects.length;i++){ if(vis[state.rects[i].layer]) add('rect',state.rects[i].id); }
    for(var i=0;i<state.ellipses.length;i++){ if(vis[state.ellipses[i].layer]) add('ell',state.ellipses[i].id); }
    for(var i=0;i<state.dims.length;i++){ if(vis[state.dims[i].layer]) add('dim',state.dims[i].id); }
    for(var i=0;i<state.images.length;i++){ if(vis[state.images[i].layer] && !isLayerLocked(state.images[i].layer)) add('img',state.images[i].id); }
    for(var i=0;i<state.texts.length;i++){ if(vis[state.texts[i].layer] && !isLayerLocked(state.texts[i].layer)) add('text',state.texts[i].id); }
    for(var i=0;i<state.polylines.length;i++){ if(vis[state.polylines[i].layer] && !isLayerLocked(state.polylines[i].layer)) add('pline',state.polylines[i].id); }
    for(var i=0;i<state.arcs.length;i++){ if(vis[state.arcs[i].layer] && !isLayerLocked(state.arcs[i].layer)) add('arc',state.arcs[i].id); }
    for(var i=0;i<state.radDims.length;i++){ if(vis[state.radDims[i].layer] && !isLayerLocked(state.radDims[i].layer)) add('rdim',state.radDims[i].id); }

    for(var t=0;t<targets.length;t++){
      var bnds=boundsOfObject(targets[t]);
      if(!bnds) continue;
      if(intersects(box,bnds)) newSel.push(targets[t]);
    }

    if(additive){
      // merge unique
      var map=new Map();
      for(var i=0;i<state.selection.length;i++) map.set(selectionKey(state.selection[i]), state.selection[i]);
      for(var i=0;i<newSel.length;i++) map.set(selectionKey(newSel[i]), newSel[i]);
      state.selection=Array.from(map.values());
    } else {
      state.selection=newSel;
    }
  }


  // ----- Move drag snapshot (prevents drift / inconsistent movement in multi-selection) -----
  function dragRefKey(r){ return (r&&r.type? r.type : '') + ':' + (r&&r.id? r.id : ''); }

  function snapshotForRef(ref){
    if(!ref || !ref.type || !ref.id) return null;
    if(ref.type==='seg'){
      var s=findById(state.segments,ref.id); if(!s) return null;
      return {type:'seg', id:ref.id, a:{x:s.a.x,y:s.a.y}, b:{x:s.b.x,y:s.b.y}};
    }
    if(ref.type==='rect'){
      var r=findById(state.rects,ref.id); if(!r) return null;
      return {type:'rect', id:ref.id, cx:r.cx, cy:r.cy};
    }
    if(ref.type==='ell'){
      var e=findById(state.ellipses,ref.id); if(!e) return null;
      return {type:'ell', id:ref.id, cx:e.cx, cy:e.cy};
    }
    if(ref.type==='img'){
      var im=findById(state.images,ref.id); if(!im) return null;
      return {type:'img', id:ref.id, cx:im.cx, cy:im.cy};
    }
    if(ref.type==='text'){
      var t=findById(state.texts,ref.id); if(!t) return null;
      return {type:'text', id:ref.id, x:t.x, y:t.y};
    }
    if(ref.type==='dim'){
      var d=findById(state.dims,ref.id); if(!d) return null;
      return {type:'dim', id:ref.id, a:{x:d.a.x,y:d.a.y}, b:{x:d.b.x,y:d.b.y}};
    }
    if(ref.type==='pline'){
      var pl=findById(state.polylines,ref.id); if(!pl) return null;
      return {type:'pline', id:ref.id, pts:pl.pts.map(function(p){ return {x:p.x,y:p.y}; })};
    }
    if(ref.type==='arc'){
      var a=findById(state.arcs,ref.id); if(!a) return null;
      return {type:'arc', id:ref.id, cx:a.cx, cy:a.cy};
    }
    if(ref.type==='rdim'){
      var rd=findById(state.radDims,ref.id); if(!rd) return null;
      return {type:'rdim', id:ref.id, cx:rd.cx, cy:rd.cy, anchor: rd.anchor ? {x:rd.anchor.x,y:rd.anchor.y} : null};
    }
    return null;
  }

  function createMoveDrag(targets, grabW){
    var orig={};
    for(var i=0;i<(targets||[]).length;i++){
      var ref=targets[i];
      var snap=snapshotForRef(ref);
      if(snap) orig[dragRefKey(ref)] = snap;
    }
    return {active:true, kind:'move', targets:targets||[], grabW:{x:grabW.x,y:grabW.y}, orig:orig};
  }

  // ----- Pointer events -----

  function handlePointerMoveLikeMouse(e){
    var m=mousePos(e);
    var w=screenToWorld(m);
    var sw=snapWorld(w);
    var cur=sw.snapped;

    if(state.tool==='line' && state.lineStart && effectiveOrtho()){
      cur=applyOrtho45(state.lineStart,cur);
    }

    state.cursorMM=cur;
    state.hoverSnap=sw.snap;

    // Offset preview
    if(state.tool==='offset' && state.offsetRef){
      var sign=offsetSignForRef(state.offsetRef, cur);
      var dist=(state.offsetDist||10)*sign;
      state.offsetPreview=buildOffsetGeom(state.offsetRef, dist);
    } else {
      state.offsetPreview=null;
    }

    if(state.tool==='select'){
      state.hotGrip=gripHitTest(cur);
    } else {
      state.hotGrip=null;
    }

    if(state.drag && state.drag.active){
      if(state.drag.kind==='pan'){
        var dx=m.x-state.drag.startPx.x, dy=m.y-state.drag.startPx.y;
        state.panMM={ x: state.drag.startPan.x - dx/state.pxPerMM, y: state.drag.startPan.y - dy/state.pxPerMM };
      } else if(state.drag.kind==='move'){
        // Compute translation from the original grab point, then reapply to the original geometry snapshot.
        // This prevents drift and ensures texts move exactly with the rest of a multi-selection.
        var rawNow = screenToWorld(m);
        var now = snapWorld(rawNow, makeIgnoreSet(state.drag.targets)).snapped;
        var ddx = now.x - state.drag.grabW.x, ddy = now.y - state.drag.grabW.y;

        for(var i=0;i<state.drag.targets.length;i++){
          var ref=state.drag.targets[i];
          var key=dragRefKey(ref);
          var base=state.drag.orig ? state.drag.orig[key] : null;
          if(!base) continue;

          // skip locked layers
          var lay = (ref.type==='seg')? (findById(state.segments,ref.id)||{}).layer :
                    (ref.type==='rect')? (findById(state.rects,ref.id)||{}).layer :
                    (ref.type==='ell')? (findById(state.ellipses,ref.id)||{}).layer :
                    (ref.type==='img')? (findById(state.images,ref.id)||{}).layer :
                    (ref.type==='text')? (findById(state.texts,ref.id)||{}).layer :
                    (ref.type==='dim')? (findById(state.dims,ref.id)||{}).layer :
                    (ref.type==='pline')? (findById(state.polylines,ref.id)||{}).layer :
                    (ref.type==='arc')? (findById(state.arcs,ref.id)||{}).layer :
                    (ref.type==='rdim')? (findById(state.radDims,ref.id)||{}).layer : null;
          if(lay && isLayerLocked(lay)) continue;

          if(ref.type==='seg'){
            var s=findById(state.segments,ref.id); if(!s) continue;
            s.a.x = base.a.x + ddx; s.a.y = base.a.y + ddy;
            s.b.x = base.b.x + ddx; s.b.y = base.b.y + ddy;
          } else if(ref.type==='rect'){
            var r=findById(state.rects,ref.id); if(!r) continue;
            r.cx = base.cx + ddx; r.cy = base.cy + ddy;
          } else if(ref.type==='ell'){
            var el=findById(state.ellipses,ref.id); if(!el) continue;
            el.cx = base.cx + ddx; el.cy = base.cy + ddy;
          } else if(ref.type==='img'){
            var im=findById(state.images,ref.id); if(!im) continue;
            im.cx = base.cx + ddx; im.cy = base.cy + ddy;
          } else if(ref.type==='text'){
            var t=findById(state.texts,ref.id); if(!t) continue;
            t.x = base.x + ddx; t.y = base.y + ddy;
          } else if(ref.type==='dim'){
            var d=findById(state.dims,ref.id); if(!d) continue;
            d.a.x = base.a.x + ddx; d.a.y = base.a.y + ddy;
            d.b.x = base.b.x + ddx; d.b.y = base.b.y + ddy;
          } else if(ref.type==='pline'){
            var pl=findById(state.polylines,ref.id); if(pl && base.pts){
              for(var j=0;j<pl.pts.length && j<base.pts.length;j++){
                pl.pts[j].x = base.pts[j].x + ddx;
                pl.pts[j].y = base.pts[j].y + ddy;
              }
            }
          } else if(ref.type==='arc'){
            var ar=findById(state.arcs,ref.id); if(ar){ ar.cx = base.cx + ddx; ar.cy = base.cy + ddy; }
          } else if(ref.type==='rdim'){
            var rd=findById(state.radDims,ref.id); if(rd){
              rd.cx = base.cx + ddx; rd.cy = base.cy + ddy;
              if(rd.anchor && base.anchor){ rd.anchor.x = base.anchor.x + ddx; rd.anchor.y = base.anchor.y + ddy; }
            }
          }
        }
	      } else if(state.drag.kind==='box'){
	        if(!state.selBox) state.selBox = {a:{x:cur.x,y:cur.y}, b:{x:cur.x,y:cur.y}, mode:'replace'};
	        state.selBox.b = cur;
      } else if(state.drag.kind==='grip'){
        var now2=snapWorld(screenToWorld(m)).snapped;
        var g=state.drag.grip;
        var ref=state.drag.target;
        var gripLayer=getLayerOfRef(ref);
        if(gripLayer && isLayerLocked(gripLayer)){
          // Locked layers are not editable via grips.
        } else if(g==='rot'){
          // rotate around center: angle from center to pointer
          if(ref.type==='rect'){
            var r=findById(state.rects,ref.id); if(r){
              var a=Math.atan2(now2.y-r.cy, now2.x-r.cx);
              // rotation grip is above, we rotate so that "up" corresponds to -90°
              r.rot = a + Math.PI/2;
            }
          } else if(ref.type==='img'){
            var im=findById(state.images,ref.id); if(im){
              var a2=Math.atan2(now2.y-im.cy, now2.x-im.cx);
              im.rot = a2 + Math.PI/2;
            }
          } else if(ref.type==='ell'){
            var el=findById(state.ellipses,ref.id); if(el){
              var a3=Math.atan2(now2.y-el.cy, now2.x-el.cx);
              el.rot = a3 + Math.PI/2;
            }
          } else if(ref.type==='text'){
            var tt=findById(state.texts,ref.id); if(tt){
              var a4=Math.atan2(now2.y-tt.y, now2.x-tt.x);
              tt.rot = a4 + Math.PI/2;
            }
          }
          // update rot input to primary selected
          var ps=primarySelection();
          if(ps && ps.type===ref.type && ps.id===ref.id){
            var obj = (ref.type==='rect')?findById(state.rects,ref.id):(ref.type==='img')?findById(state.images,ref.id):findById(state.ellipses,ref.id);
            if(obj) ui.objRot.value = Math.round(deg(obj.rot||0));
          }
        } else if(ref.type==='seg'){
          var s2=findById(state.segments,ref.id); if(s2){
            if(g==='a') s2.a={x:now2.x,y:now2.y};
            if(g==='b') s2.b={x:now2.x,y:now2.y};
          }
        } else if(ref.type==='dim'){
          var d2=findById(state.dims,ref.id); if(d2){
            if(g==='a') d2.a={x:now2.x,y:now2.y};
            if(g==='b') d2.b={x:now2.x,y:now2.y};
            if(g==='off'){
              var a=d2.a, b=d2.b;
              var vx=b.x-a.x, vy=b.y-a.y;
              var len=hypot(vx,vy); 
              if(len>1e-6){
                var nx=-vy/len, ny=vx/len;
                var mid={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
                var proj=(now2.x-mid.x)*nx + (now2.y-mid.y)*ny;
                // clamp to avoid extreme offsets
                d2.offsetMM=clamp(proj, -1000, 1000);
              }
            }
          }
        } else if(ref.type==='pline'){ var pl3=findById(state.polylines,ref.id); if(pl3 && !pl3.noVertexEdit){ if(g && g[0]==='p'){ var idx=parseInt(g.slice(1),10); if(isFinite(idx) && pl3.pts[idx]) pl3.pts[idx]={x:now2.x,y:now2.y}; } } } else if(ref.type==='arc'){ var ar2=findById(state.arcs,ref.id); if(ar2){ if(g==='c'){ ar2.cx=now2.x; ar2.cy=now2.y; } if(g==='a0'){ ar2.a0=Math.atan2(now2.y-ar2.cy, now2.x-ar2.cx); } if(g==='a1'){ ar2.a1=Math.atan2(now2.y-ar2.cy, now2.x-ar2.cx); } } } else if(ref.type==='rect'){
          var r2=findById(state.rects,ref.id); if(r2){
            // resize in local space
            var q=invRotPoint(now2, r2.cx, r2.cy, r2.rot||0);
            var hw=r2.w/2, hh=r2.h/2;
            var lx=q.x-r2.cx, ly=q.y-r2.cy;
            if(g==='nw' || g==='sw') hw = Math.max(0.5, (r2.cx - q.x));
            if(g==='ne' || g==='se') hw = Math.max(0.5, (q.x - r2.cx));
            if(g==='nw' || g==='ne') hh = Math.max(0.5, (r2.cy - q.y));
            if(g==='sw' || g==='se') hh = Math.max(0.5, (q.y - r2.cy));
            r2.w = hw*2; r2.h = hh*2;
          }
        } else if(ref.type==='img'){
          var im2=findById(state.images,ref.id); if(im2){
            var q2=invRotPoint(now2, im2.cx, im2.cy, im2.rot||0);
            var hw2=im2.w/2, hh2=im2.h/2;
            if(g==='nw' || g==='sw') hw2 = Math.max(0.5, (im2.cx - q2.x));
            if(g==='ne' || g==='se') hw2 = Math.max(0.5, (q2.x - im2.cx));
            if(g==='nw' || g==='ne') hh2 = Math.max(0.5, (im2.cy - q2.y));
            if(g==='sw' || g==='se') hh2 = Math.max(0.5, (q2.y - im2.cy));

            if(state.lockAspect && im2.aspect){
              // keep aspect: choose driver based on bigger relative change
              var w=hw2*2, h=hh2*2;
              var targetH = w / im2.aspect;
              var targetW = h * im2.aspect;
              if(Math.abs(targetH - h) < Math.abs(targetW - w)){
                h = targetH;
              } else {
                w = targetW;
              }
              im2.w = Math.max(1,w);
              im2.h = Math.max(1,h);
            } else {
              im2.w = hw2*2; im2.h = hh2*2;
            }
          }
        } else if(ref.type==='ell'){
          var e2=findById(state.ellipses,ref.id); if(e2){
            var q3=invRotPoint(now2, e2.cx, e2.cy, e2.rot||0);
            if(g==='rxp' || g==='rxm') e2.rx = Math.max(0.1, Math.abs(q3.x - e2.cx));
            if(g==='ryp' || g==='rym') e2.ry = Math.max(0.1, Math.abs(q3.y - e2.cy));
          }
        }
      }
    }

    var needsFullRedraw = !!(state.drag && state.drag.active &&
      (state.drag.kind==='move' || state.drag.kind==='grip' || state.drag.kind==='pan'));
    if(needsFullRedraw || typeof drawDynamic!=='function'){
      draw();
    } else {
      drawDynamic();
    }
  }

  
