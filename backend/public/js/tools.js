// ----- Object creation -----
  function currentLayer(){ return state.activeLayer; }
  function getLayerColor(l){ return (state.layers[l]&&state.layers[l].color)||'#111827'; }
  function styleForNew(){
    var c=state.styleDraft.stroke||getLayerColor(currentLayer());
    return { stroke:c, width:+state.styleDraft.width||1, dashed:!!state.styleDraft.dashed };
  }
  function addSeg(a,b){ var id=uid(); state.segments.push({id:id,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},layer:currentLayer(),style:styleForNew()}); addToZOrder("seg",id); }
  function addRectFromCorners(a,b){
    var cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
    var id=uid(); state.rects.push({id:id,cx:cx,cy:cy,w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y),rot:0,layer:currentLayer(),style:styleForNew()}); addToZOrder("rect",id);
  }
  function addEllipseFromCorners(a,b){
    var cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
    var id=uid(); state.ellipses.push({id:id,cx:cx,cy:cy,rx:Math.abs(b.x-a.x)/2,ry:Math.abs(b.y-a.y)/2,rot:0,layer:currentLayer(),style:styleForNew()}); addToZOrder("ell",id);
  }
  function addDim(a,b,offsetMM,textMM){
    var id=uid(); state.dims.push({id:id,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},offsetMM:offsetMM,textMM:textMM,layer:currentLayer(),style:{stroke:'#111827',width:1,dashed:false}}); addToZOrder("dim",id);
  }


  function addPolyline(pts, closed){
    var id=uid(); state.polylines.push({id:id, pts:pts.map(p=>({x:p.x,y:p.y})), closed:!!closed, layer:currentLayer(), style:styleForNew()}); addToZOrder("pline",id);
  }
  function addCircle(center, edge){
    var r=hypot(edge.x-center.x, edge.y-center.y);
    var id=uid(); state.ellipses.push({id:id,cx:center.x,cy:center.y,rx:r,ry:r,rot:0,layer:currentLayer(),style:styleForNew()}); addToZOrder("ell",id);
  }
  function circleFrom3(a,b,c){
    // Robust circumcircle from 3 points. Returns null if collinear/degenerate.
    var d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
    if(!isFinite(d) || Math.abs(d)<1e-9) return null;

    var ux=((a.x*a.x+a.y*a.y)*(b.y-c.y)+(b.x*b.x+b.y*b.y)*(c.y-a.y)+(c.x*c.x+c.y*c.y)*(a.y-b.y))/d;
    var uy=((a.x*a.x+a.y*a.y)*(c.x-b.x)+(b.x*b.x+b.y*b.y)*(a.x-c.x)+(c.x*c.x+c.y*c.y)*(b.x-a.x))/d;

    if(!isFinite(ux) || !isFinite(uy)) return null;

    var r=hypot(a.x-ux,a.y-uy);
    // Avoid insane radii that can freeze canvas arc rendering
    if(!isFinite(r) || r<=1e-6 || r>1e6) return null;

    return {cx:ux,cy:uy,r:r};
  }
  function addArc3p(a,b,c){
    var cir=circleFrom3(a,b,c);
    if(!cir) return false;
    var a0=Math.atan2(a.y-cir.cy, a.x-cir.cx);
    var a1=Math.atan2(c.y-cir.cy, c.x-cir.cx);
    var am=Math.atan2(b.y-cir.cy, b.x-cir.cx);
    function norm(t){ while(t<0)t+=Math.PI*2; while(t>=Math.PI*2)t-=Math.PI*2; return t; }
    var n0=norm(a0), n1=norm(a1), nm=norm(am);
    function onPathCW(x0,x1,xm){
      if(x0<=x1) return (xm>=x0 && xm<=x1);
      return (xm>=x0 || xm<=x1);
    }
    var ccw = !onPathCW(n0,n1,nm);
    var id=uid(); state.arcs.push({id:id,cx:cir.cx,cy:cir.cy,r:cir.r,a0:a0,a1:a1,ccw:ccw,layer:currentLayer(),style:styleForNew()}); addToZOrder("arc",id);
    return true;
  }
  function addRadDimFromCircle(obj, anchor){
    var r=obj.rx;
    var id=uid(); state.radDims.push({id:id,cx:obj.cx,cy:obj.cy,r:r,anchor:{x:anchor.x,y:anchor.y},textMM:+ui.dimText.value||3,layer:currentLayer(),style:{stroke:'#111827',width:1,dashed:false}}); addToZOrder("rdim",id);
  }

  function addTextAt(p){
    // Allow both workflows:
    // 1) type text in the panel, then click to place
    // 2) click to place, then type via prompt if empty
    var txt=(ui.textValue.value||'').toString();

    if(!txt.trim()){
      var entered=window.prompt(window.t('dialog.insertText'), '');
      if(entered===null) { setStatus(window.t('status.cancelled')); return; }
      txt=(entered||'').toString();
      ui.textValue.value=txt;
    }

    if(!txt.trim()){ setStatus(window.t('status.enterText')); return; }

    // Prevent "invisible insert" on locked layer
    var lay=currentLayer();
    if(isLayerLocked(lay)){
      setStatus(window.t('status.unlockLayerForText'));
      return;
    }

    var sizeMM = +ui.textSize.value || 5;
    var font = ui.textFont.value || 'Arial';
    var align = ui.textAlign.value || 'left';
    var col = state.styleDraft.stroke || getLayerColor(lay);

    var id=uid();
    state.texts.push({
      id:id,
      x:p.x, y:p.y,
      text:txt,
      sizeMM:sizeMM,
      font:font,
      align:align,
      spacingMM:(+ui.textSpacing.value||0),
      rot:0,
      layer:lay,
      style:{fill:col}
    });
    addToZOrder('text', id);

    pushHist();
    setStatus(window.t('status.textInserted'));
    return id;
  }



  function findById(arr,id){ for(var i=0;i<arr.length;i++) if(arr[i].id===id) return arr[i]; return null; }

  // ----- Rotation geometry -----
  function rotPoint(p,cx,cy,ang){
    var x=p.x-cx, y=p.y-cy;
    var ca=Math.cos(ang), sa=Math.sin(ang);
    return { x: cx + x*ca - y*sa, y: cy + x*sa + y*ca };
  }
  function textMetricsPx(t){
    var sizePx=(t.sizeMM||5)*state.pxPerMM;
    ctx.save();
    ctx.font=sizePx+'px '+(t.font||'Arial');
    var text=String(t.text||'');
    var m=ctx.measureText(text);
    ctx.restore();

    // Fallbacks for browsers that don't expose precise metrics
    var ascent = (typeof m.actualBoundingBoxAscent === 'number') ? m.actualBoundingBoxAscent : sizePx*0.8;
    var descent = (typeof m.actualBoundingBoxDescent === 'number') ? m.actualBoundingBoxDescent : sizePx*0.2;

    var spacingMM=(typeof t.spacingMM==='number') ? t.spacingMM : ((typeof t.letterSpacingMM==='number') ? t.letterSpacingMM : 0);
    var spacingPx=spacingMM*state.pxPerMM;
    var width=(m.width||0);
    if(Math.abs(spacingPx)>0.01 && text.length>1){
      width += spacingPx*(text.length-1);
    }

    return { w:width, h:(ascent+descent), ascent:ascent, descent:descent, fontPx:sizePx };
  }

  // Compute text rectangle (center + size) in world mm, accounting for align/baseline and rotation about the anchor (t.x,t.y)
  function textRectMM(t){
    var mp=textMetricsPx(t);
    var wPx=mp.w, ascentPx=mp.ascent, descentPx=mp.descent;

    var align=t.align||'left';
    var leftPx=0, rightPx=wPx;
    if(align==='center'){ leftPx=-wPx/2; rightPx=wPx/2; }
    else if(align==='right'){ leftPx=-wPx; rightPx=0; }

    // Baseline is alphabetic at y=0 (as used in drawTexts)
    var topPx=-ascentPx;
    var bottomPx=descentPx;

    var cxLocalPx=(leftPx+rightPx)/2;
    var cyLocalPx=(topPx+bottomPx)/2;

    var cxLocalMM=cxLocalPx/state.pxPerMM;
    var cyLocalMM=cyLocalPx/state.pxPerMM;
    var wMM=(rightPx-leftPx)/state.pxPerMM;
    var hMM=(bottomPx-topPx)/state.pxPerMM;

    // Center in world: rotate local center offset around anchor by t.rot
    var center=rotPoint({x:t.x+cxLocalMM, y:t.y+cyLocalMM}, t.x, t.y, t.rot||0);
    return {cx:center.x, cy:center.y, w:wMM, h:hMM, ang:(t.rot||0)};
  }

  function rotRectAABB(cx,cy,w,h,ang){
    var hw=w/2, hh=h/2;
    var pts=[
      rotPoint({x:cx-hw,y:cy-hh},cx,cy,ang),
      rotPoint({x:cx+hw,y:cy-hh},cx,cy,ang),
      rotPoint({x:cx+hw,y:cy+hh},cx,cy,ang),
      rotPoint({x:cx-hw,y:cy+hh},cx,cy,ang),
    ];
    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    for(var i=0;i<pts.length;i++){minx=Math.min(minx,pts[i].x);miny=Math.min(miny,pts[i].y);maxx=Math.max(maxx,pts[i].x);maxy=Math.max(maxy,pts[i].y);}
    return {x:minx,y:miny,w:maxx-minx,h:maxy-miny,pts:pts};
  }
  function pointInRotRect(p,cx,cy,w,h,ang){
    var s=Math.sin(-ang), c=Math.cos(-ang);
    var dx=p.x-cx, dy=p.y-cy;
    var lx=dx*c - dy*s;
    var ly=dx*s + dy*c;
    return Math.abs(lx)<=w/2 && Math.abs(ly)<=h/2;
  }

  function invRotPoint(p,cx,cy,ang){ return rotPoint(p,cx,cy,-ang); }

  function getRectCorners(obj){
    // obj has cx,cy,w,h,rot
    var hw=obj.w/2, hh=obj.h/2;
    var pts=[
      {x:obj.cx-hw,y:obj.cy-hh},
      {x:obj.cx+hw,y:obj.cy-hh},
      {x:obj.cx+hw,y:obj.cy+hh},
      {x:obj.cx-hw,y:obj.cy+hh},
    ];
    var ang=obj.rot||0;
    if(Math.abs(ang)<1e-9) return pts;
    for(var i=0;i<pts.length;i++) pts[i]=rotPoint(pts[i],obj.cx,obj.cy,ang);
    return pts;
  }
  function boundsFromPoints(pts){
    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    for(var i=0;i<pts.length;i++){
      minx=Math.min(minx,pts[i].x); miny=Math.min(miny,pts[i].y);
      maxx=Math.max(maxx,pts[i].x); maxy=Math.max(maxy,pts[i].y);
    }
    return {x:minx,y:miny,w:maxx-minx,h:maxy-miny};
  }
  function boundsOfObject(ref){
    if(ref.type==='seg'){
      var s=findById(state.segments,ref.id); if(!s) return null;
      var x1=Math.min(s.a.x,s.b.x), y1=Math.min(s.a.y,s.b.y);
      var x2=Math.max(s.a.x,s.b.x), y2=Math.max(s.a.y,s.b.y);
      return {x:x1,y:y1,w:x2-x1,h:y2-y1};
    }
    if(ref.type==='rect'){
      var r=findById(state.rects,ref.id); if(!r) return null;
      return boundsFromPoints(getRectCorners(r));
    }
    if(ref.type==='ell'){
      var e=findById(state.ellipses,ref.id); if(!e) return null;
      // rotated ellipse bounds approximated via sampling 16 points
      var pts=[];
      for(var i=0;i<16;i++){
        var t=(i/16)*Math.PI*2;
        var p={x:e.cx+Math.cos(t)*e.rx, y:e.cy+Math.sin(t)*e.ry};
        pts.push(rotPoint(p,e.cx,e.cy,e.rot||0));
      }
      return boundsFromPoints(pts);
    }
    if(ref.type==='text'){
      var t=findById(state.texts,ref.id); if(!t) return null;
      var tr=textRectMM(t);
      var aabb=rotRectAABB(tr.cx,tr.cy,tr.w,tr.h,tr.ang);
      return {x:aabb.x,y:aabb.y,w:aabb.w,h:aabb.h};
    }
    if(ref.type==='pline'){ var pl=findById(state.polylines,ref.id); if(!pl) return null; return boundsFromPoints(pl.pts); }
    if(ref.type==='arc'){ var a=findById(state.arcs,ref.id); if(!a) return null; return {x:a.cx-a.r,y:a.cy-a.r,w:a.r*2,h:a.r*2}; }
    if(ref.type==='rdim'){ var d=findById(state.radDims,ref.id); if(!d) return null; return boundsFromPoints([{x:d.cx,y:d.cy}, d.anchor]); }

    if(ref.type==='img'){
      var im=findById(state.images,ref.id); if(!im) return null;
      return boundsFromPoints(getRectCorners(im));
    }
    if(ref.type==='dim'){
      var d=findById(state.dims,ref.id); if(!d) return null;
      var x1=Math.min(d.a.x,d.b.x), y1=Math.min(d.a.y,d.b.y);
      var x2=Math.max(d.a.x,d.b.x), y2=Math.max(d.a.y,d.b.y);
      var pad=Math.max(15,(d.offsetMM||10)+10);
      return {x:x1-pad,y:y1-pad,w:(x2-x1)+pad*2,h:(y2-y1)+pad*2};
    }
    return null;
  }

  
