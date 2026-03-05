// ----- Drawing -----
  function clear(){
    var cv=(ctx && ctx.canvas) ? ctx.canvas : canvas;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,cv.width,cv.height);
  }

  function clearTransparent(){
    var cv=(ctx && ctx.canvas) ? ctx.canvas : canvas;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cv.width,cv.height);
  }

  function withCtx(targetCtx, fn){
    var prev=ctx;
    ctx=targetCtx;
    try{
      fn();
    } finally {
      ctx=prev;
    }
  }

  function updateHud(){
    ui.pos.textContent='x '+fmt(state.cursorMM.x)+' | y '+fmt(state.cursorMM.y);
    ui.snapLbl.textContent='snap: '+(state.snap?'on':'off')+(state.ctrlDown?' (inv)' : '');
    ui.zoomLbl.textContent='zoom: '+(Math.round(state.pxPerMM*10)/10)+' px/mm';
    updateSelInfo();
  }

  var textWidthCache=Object.create(null);
  var textWidthCacheCount=0;
  function measureCharWidth(ctx,ch){
    var key=(ctx.font||'')+'|'+ch;
    var v=textWidthCache[key];
    if(v==null){
      v=(ctx.measureText(ch).width || 0);
      textWidthCache[key]=v;
      textWidthCacheCount++;
      if(textWidthCacheCount>4096){
        textWidthCache=Object.create(null);
        textWidthCacheCount=0;
      }
    }
    return v;
  }

  
  function drawGrid(){
    if(state.gridStepMM<=0) return;
    var cv=(ctx && ctx.canvas) ? ctx.canvas : canvas;
    // allow very small grid steps (e.g. 0.01mm) by auto-scaling drawing density
    var baseStepMM = Math.max(0.00001, state.gridStepMM);
    var stepPx = baseStepMM*state.pxPerMM;
    var mul = 1;
    // keep at least ~6px between drawn lines
    while(stepPx*mul < 6) mul *= 10;
    var stepMM = baseStepMM * mul;
    var drawStepPx = stepMM * state.pxPerMM;

    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.strokeStyle='rgba(0,0,0,0.06)';
    ctx.lineWidth=1;

    var offsetX=(-state.panMM.x*state.pxPerMM)%drawStepPx;
    var offsetY=(-state.panMM.y*state.pxPerMM)%drawStepPx;
    if(offsetX<0) offsetX+=drawStepPx;
    if(offsetY<0) offsetY+=drawStepPx;

    for(var x=offsetX; x<cv.width; x+=drawStepPx){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,cv.height); ctx.stroke();
    }
    for(var y=offsetY; y<cv.height; y+=drawStepPx){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cv.width,y); ctx.stroke();
    }

    // Major grid (x10) a bit stronger if visible
    var majorPx = drawStepPx*10;
    if(majorPx >= 12){
      ctx.strokeStyle='rgba(0,0,0,0.10)';
      var ox=(-state.panMM.x*state.pxPerMM)%majorPx;
      var oy=(-state.panMM.y*state.pxPerMM)%majorPx;
      if(ox<0) ox+=majorPx;
      if(oy<0) oy+=majorPx;
      for(var xx=ox; xx<cv.width; xx+=majorPx){
        ctx.beginPath(); ctx.moveTo(xx,0); ctx.lineTo(xx,cv.height); ctx.stroke();
      }
      for(var yy=oy; yy<cv.height; yy+=majorPx){
        ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(cv.width,yy); ctx.stroke();
      }
    }

    ctx.restore();
  }


  function applyStrokeStyle(style){
    ctx.strokeStyle=(style && style.stroke) ? style.stroke : '#111827';
    ctx.lineWidth=((style && style.width) ? style.width : 1) * (state.pxPerMM/5);
    var dash = dashPatternForStyle(style);
    ctx.setLineDash(dash.length ? dash : []);
  }

  function isSelected(ref){ return hasInSelection(ref); }

  function drawImages(){
    var vis=visibleLayerSet();
    for(var i=0;i<state.images.length;i++){
      var im=state.images[i]; if(!vis[im.layer]) continue;
      var img=ensureImageCached(im);
      if(!img) continue;
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
        var corners=getRectCorners(im);
        ctx.beginPath();
        for(var k=0;k<corners.length;k++){
          var p=worldToScreen(corners[k]);
          if(k===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
        }
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawTextSpaced(ctx, text, spacingPx, align){
    // Draw text with additional letter spacing (Canvas has no native letter-spacing)
    // align: 'left' | 'center' | 'right' (already set on ctx)
    text = String(text||'');
    if(!text){ return; }

    // measure total width
    var total=0;
    for(var i=0;i<text.length;i++){
      var ch=text[i];
      total += measureCharWidth(ctx,ch);
      if(i<text.length-1) total += spacingPx;
    }

    var x=0;
    if(align==='center') x = -total/2;
    else if(align==='right') x = -total;

    for(var i=0;i<text.length;i++){
      var ch=text[i];
      ctx.fillText(ch, x, 0);
      x += measureCharWidth(ctx,ch) + spacingPx;
    }
  }

  function drawTexts(){
    var vis=visibleLayerSet();
    for(var i=0;i<state.texts.length;i++){
      var t=state.texts[i];
      if(!vis[t.layer]) continue;
      var p=worldToScreen({x:t.x,y:t.y});
      var sizePx=(t.sizeMM||5)*state.pxPerMM;
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(t.rot||0);
      ctx.font=sizePx+'px '+(t.font||'Arial');
      ctx.fillStyle=(t.style && t.style.fill)?t.style.fill:'#111827';
      ctx.textAlign=t.align||'left';
      ctx.textBaseline='alphabetic';
      var spacingPx=(t.spacingMM||0)*state.pxPerMM;
      if(Math.abs(spacingPx) < 0.01){
        ctx.fillText(t.text||'',0,0);
      } else {
        drawTextSpaced(ctx, t.text||'', spacingPx, ctx.textAlign);
      }
      ctx.restore();

      if(isSelected({type:'text',id:t.id})){
        var b=boundsOfObject({type:'text',id:t.id});
        if(b){
          var s0=worldToScreen({x:b.x,y:b.y});
          ctx.save();
          ctx.setLineDash([4,4]);
          ctx.strokeStyle='rgba(59,130,246,.8)';
          ctx.lineWidth=2;
          ctx.strokeRect(s0.x,s0.y,b.w*state.pxPerMM,b.h*state.pxPerMM);
          ctx.restore();
        }
      }
    }
  }


  function drawSegments(){
    var vis=visibleLayerSet();
    for(var i=0;i<state.segments.length;i++){
      var s=state.segments[i]; if(!vis[s.layer]) continue;
      var a=worldToScreen(s.a), b=worldToScreen(s.b);
      ctx.beginPath();
      applyStrokeStyle(s.style||{});
      ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

      if(isSelected({type:'seg',id:s.id})){
        ctx.save();
        ctx.setLineDash([4,4]);
        ctx.strokeStyle='rgba(59,130,246,.85)';
        ctx.lineWidth=2;
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  function drawPolylines(){
    var vis=visibleLayerSet();
    for(var i=0;i<state.polylines.length;i++){
      var pl=state.polylines[i]; if(!vis[pl.layer]) continue;
      if(pl.pts.length<2) continue;
      ctx.beginPath();
      applyStrokeStyle(pl.style||{});
      var p0=worldToScreen(pl.pts[0]);
      ctx.moveTo(p0.x,p0.y);
      for(var j=1;j<pl.pts.length;j++){
        var pj=worldToScreen(pl.pts[j]);
        ctx.lineTo(pj.x,pj.y);
      }
      if(pl.closed) ctx.closePath();
      if(pl.closed && pl.style && pl.style.fill){ ctx.save(); ctx.fillStyle=pl.style.fill; ctx.fill(); ctx.restore(); }
      ctx.stroke();
      if(isSelected({type:'pline',id:pl.id})){
        ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(59,130,246,.85)'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
      }
    }
  }

  function drawArcs(){
    var vis=visibleLayerSet();
    for(var i=0;i<state.arcs.length;i++){
      var a=state.arcs[i]; if(!vis[a.layer]) continue;
      if(!isFinite(a.cx)||!isFinite(a.cy)||!isFinite(a.r)||!isFinite(a.a0)||!isFinite(a.a1)) continue;
      var sw=Math.abs(angleDiff(a.a0,a.a1,!!a.ccw));
      if(sw<=1e-8 || sw>=Math.PI*2-1e-8) continue;
      var c=worldToScreen({x:a.cx,y:a.cy});
      ctx.save();
      applyStrokeStyle(a.style||{});
      ctx.beginPath();
      ctx.arc(c.x,c.y, a.r*state.pxPerMM, a.a0, a.a1, !!a.ccw);
      ctx.stroke();
      ctx.restore();
      if(isSelected({type:'arc',id:a.id})){
        ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(59,130,246,.85)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(c.x,c.y, a.r*state.pxPerMM, a.a0, a.a1, !!a.ccw); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawRadDims(){
    var vis=visibleLayerSet();
    ctx.save();
    ctx.fillStyle='#111827'; ctx.strokeStyle='#111827'; ctx.lineWidth=1;
    for(var i=0;i<state.radDims.length;i++){
      var d=state.radDims[i]; if(!vis[d.layer]) continue;
      var sc=worldToScreen({x:d.cx,y:d.cy}), sa=worldToScreen(d.anchor);
      ctx.beginPath(); ctx.moveTo(sc.x,sc.y); ctx.lineTo(sa.x,sa.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(sc.x,sc.y,3,0,Math.PI*2); ctx.fill();
      var text='R '+fmt(d.r)+' mm';
      var mid={x:(sc.x+sa.x)/2,y:(sc.y+sa.y)/2};
      ctx.save(); ctx.translate(mid.x,mid.y);
      var ang=Math.atan2(sa.y-sc.y, sa.x-sc.x); ctx.rotate(ang);
      var ts=(d.textMM||3)*state.pxPerMM;
      ctx.font=ts+'px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText(text,0,-6);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawRects(){
    var vis=visibleLayerSet();
    for(var i=0;i<state.rects.length;i++){
      var r=state.rects[i]; if(!vis[r.layer]) continue;
      var c=worldToScreen({x:r.cx,y:r.cy});
      ctx.save();
      ctx.translate(c.x,c.y);
      ctx.rotate(r.rot||0);
      ctx.beginPath();
      applyStrokeStyle(r.style||{});
      ctx.rect(-r.w*state.pxPerMM/2, -r.h*state.pxPerMM/2, r.w*state.pxPerMM, r.h*state.pxPerMM);
      if(r.style && r.style.fill){ ctx.save(); ctx.fillStyle=r.style.fill; ctx.fill(); ctx.restore(); }
      ctx.stroke();
      ctx.restore();

      if(isSelected({type:'rect',id:r.id})){
        ctx.save();
        ctx.setLineDash([4,4]);
        ctx.strokeStyle='rgba(59,130,246,.85)';
        ctx.lineWidth=2;
        var corners=getRectCorners(r);
        ctx.beginPath();
        for(var k=0;k<corners.length;k++){
          var p=worldToScreen(corners[k]);
          if(k===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
        }
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawEllipses(){
    var vis=visibleLayerSet();
    for(var i=0;i<state.ellipses.length;i++){
      var e=state.ellipses[i]; if(!vis[e.layer]) continue;
      var c=worldToScreen({x:e.cx,y:e.cy});
      ctx.save();
      ctx.translate(c.x,c.y);
      ctx.rotate(e.rot||0);
      ctx.beginPath();
      applyStrokeStyle(e.style||{});
      ctx.ellipse(0,0,e.rx*state.pxPerMM,e.ry*state.pxPerMM,0,0,Math.PI*2);
      if(e.style && e.style.fill){ ctx.save(); ctx.fillStyle=e.style.fill; ctx.fill(); ctx.restore(); }
      ctx.stroke();
      ctx.restore();

      if(isSelected({type:'ell',id:e.id})){
        ctx.save();
        ctx.setLineDash([4,4]);
        ctx.strokeStyle='rgba(59,130,246,.85)';
        ctx.lineWidth=2;
        // approximate bound by sampling
        var pts=[];
        for(var t=0;t<16;t++){
          var ang=(t/16)*Math.PI*2;
          var p=rotPoint({x:e.cx+Math.cos(ang)*e.rx,y:e.cy+Math.sin(ang)*e.ry}, e.cx,e.cy,e.rot||0);
          pts.push(worldToScreen(p));
        }
        ctx.beginPath();
        for(var k=0;k<pts.length;k++){
          if(k===0) ctx.moveTo(pts[k].x,pts[k].y); else ctx.lineTo(pts[k].x,pts[k].y);
        }
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawDims(){
    var vis=visibleLayerSet();
    ctx.save();
    ctx.fillStyle='#111827';
    ctx.strokeStyle='#111827';
    ctx.lineWidth=1;

    for(var i=0;i<state.dims.length;i++){
      var d=state.dims[i]; if(!vis[d.layer]) continue;
      var a=d.a, b=d.b;
      var vx=b.x-a.x, vy=b.y-a.y;
      var len=hypot(vx,vy); if(len<1e-6) continue;
      var nx=-vy/len, ny=vx/len;
      var off=d.offsetMM||10;
      var a2={x:a.x+nx*off,y:a.y+ny*off};
      var b2={x:b.x+nx*off,y:b.y+ny*off};

      var sa=worldToScreen(a2), sb=worldToScreen(b2);
      var s0=worldToScreen(a),  s1=worldToScreen(b);

      ctx.beginPath();
      ctx.moveTo(s0.x,s0.y); ctx.lineTo(sa.x,sa.y);
      ctx.moveTo(s1.x,s1.y); ctx.lineTo(sb.x,sb.y);
      ctx.stroke();

      ctx.beginPath(); ctx.moveTo(sa.x,sa.y); ctx.lineTo(sb.x,sb.y); ctx.stroke();

      function arrow(p, dirx, diry){
        var L=8,W=4;
        var ax=p.x-dirx*L, ay=p.y-diry*L;
        var lx=ax+(-diry)*W, ly=ay+(dirx)*W;
        var rx=ax-(-diry)*W, ry=ay-(dirx)*W;
        ctx.beginPath();
        ctx.moveTo(p.x,p.y);
        ctx.lineTo(lx,ly);
        ctx.lineTo(rx,ry);
        ctx.closePath();
        ctx.fill();
      }
      var dirx=(sb.x-sa.x), diry=(sb.y-sa.y);
      var sl=hypot(dirx,diry); dirx/=sl; diry/=sl;
      arrow(sa, dirx, diry);
      arrow(sb,-dirx,-diry);

      var text=fmt(len)+" mm";
      var midp={x:(sa.x+sb.x)/2, y:(sa.y+sb.y)/2};
      ctx.save();
      ctx.translate(midp.x,midp.y);
      var ang=Math.atan2(sb.y-sa.y,sb.x-sa.x);
      ctx.rotate(ang);
      var ts=(d.textMM||3)*state.pxPerMM;
      ctx.font=ts+'px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText(text,0,-6);
      ctx.restore();

      if(isSelected({type:'dim',id:d.id})){
        ctx.save();
        ctx.setLineDash([4,4]);
        ctx.strokeStyle='rgba(59,130,246,.85)';
        ctx.strokeRect(midp.x-30,midp.y-30,60,60);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  
  function drawOffsetPreview(){
    if(!(state.tool==='offset' && state.offsetPreview)) return;
    var g=state.offsetPreview;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6,4]);
    ctx.strokeStyle = 'rgba(245,158,11,.95)'; // yellow
    ctx.fillStyle = 'rgba(245,158,11,.08)';
    if(g.type==='seg'){
      var a=worldToScreen(g.a), b=worldToScreen(g.b);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    } else if(g.type==='ell'){
      var c=worldToScreen({x:g.cx,y:g.cy});
      ctx.beginPath();
      ctx.arc(c.x,c.y, g.rx*state.pxPerMM, 0, Math.PI*2);
      ctx.stroke();
    } else if(g.type==='arc'){
      var c=worldToScreen({x:g.cx,y:g.cy});
      var r=g.r*state.pxPerMM;
      ctx.beginPath();
      ctx.arc(c.x,c.y,r, g.a0, g.a1, !g.ccw);
      ctx.stroke();
    } else if(g.type==='pline'){
      if(g.pts && g.pts.length>1){
        var p0=worldToScreen(g.pts[0]);
        ctx.beginPath(); ctx.moveTo(p0.x,p0.y);
        for(var i=1;i<g.pts.length;i++){
          var pi=worldToScreen(g.pts[i]);
          ctx.lineTo(pi.x,pi.y);
        }
        if(g.closed) ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

function drawPreview(){
    ctx.save();
    ctx.strokeStyle='rgba(17,24,39,.6)';
    ctx.lineWidth=2;
    ctx.setLineDash([6,6]);

    var c=state.cursorMM;
    if(state.tool==='pline' && state.plinePts && state.plinePts.length){
      ctx.beginPath();
      ctx.strokeStyle='rgba(17,24,39,.6)';
      ctx.lineWidth=2;
      ctx.setLineDash([6,6]);
      var p0=worldToScreen(state.plinePts[0]); ctx.moveTo(p0.x,p0.y);
      for(var j=1;j<state.plinePts.length;j++){ var pj=worldToScreen(state.plinePts[j]); ctx.lineTo(pj.x,pj.y); }
      var curp=worldToScreen(c); ctx.lineTo(curp.x,curp.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if(state.tool==='line' && state.lineStart){
      var a=worldToScreen(state.lineStart);
      var b=worldToScreen(c);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }

    if(state.tool==='katana' && state.cutStart){
      var ca=worldToScreen(state.cutStart);
      var cb=worldToScreen(c);
      ctx.beginPath(); ctx.moveTo(ca.x,ca.y); ctx.lineTo(cb.x,cb.y); ctx.stroke();
    }
    if(state.tool==='rect' && state.rectStart){
      var a2=worldToScreen(state.rectStart);
      var b2=worldToScreen(c);
      ctx.strokeRect(Math.min(a2.x,b2.x), Math.min(a2.y,b2.y), Math.abs(b2.x-a2.x), Math.abs(b2.y-a2.y));
    }
    if(state.tool==='ell' && state.ellStart){
      var cx=(state.ellStart.x+c.x)/2, cy=(state.ellStart.y+c.y)/2;
      var rx=Math.abs(c.x-state.ellStart.x)/2, ry=Math.abs(c.y-state.ellStart.y)/2;
      var sc=worldToScreen({x:cx,y:cy});
      ctx.beginPath();
      ctx.ellipse(sc.x,sc.y,rx*state.pxPerMM,ry*state.pxPerMM,0,0,Math.PI*2);
      ctx.stroke();
    }

    if(state.tool==='circle' && state.circleCenter){
      var cc=worldToScreen(state.circleCenter);
      var rr=hypot(c.x-state.circleCenter.x, c.y-state.circleCenter.y);
      ctx.beginPath();
      ctx.arc(cc.x, cc.y, rr*state.pxPerMM, 0, Math.PI*2);
      ctx.stroke();
    }

    if(state.tool==='arc3' && state.arcPts && state.arcPts.length){
      // preview polyline / arc through points
      ctx.beginPath();
      var pA=worldToScreen(state.arcPts[0]);
      ctx.moveTo(pA.x,pA.y);
      if(state.arcPts.length>=2){
        var pB=worldToScreen(state.arcPts[1]);
        ctx.lineTo(pB.x,pB.y);
      }
      var pC=worldToScreen(c);
      ctx.lineTo(pC.x,pC.y);
      ctx.stroke();

      if(state.arcPts.length===2){
        var cir=circleFrom3(state.arcPts[0], state.arcPts[1], c);
        if(cir){
          var a0=Math.atan2(state.arcPts[0].y-cir.cy, state.arcPts[0].x-cir.cx);
          var a1=Math.atan2(c.y-cir.cy, c.x-cir.cx);
          var am=Math.atan2(state.arcPts[1].y-cir.cy, state.arcPts[1].x-cir.cx);
          function norm(t){ while(t<0)t+=Math.PI*2; while(t>=Math.PI*2)t-=Math.PI*2; return t; }
          var n0=norm(a0), n1=norm(a1), nm=norm(am);
          function onPathCW(x0,x1,xm){
            if(x0<=x1) return (xm>=x0 && xm<=x1);
            return (xm>=x0 || xm<=x1);
          }
          var ccw = !onPathCW(n0,n1,nm);

          var sc=worldToScreen({x:cir.cx,y:cir.cy});
          ctx.beginPath();
          var rpx = cir.r*state.pxPerMM;
          if(isFinite(rpx) && rpx>0 && rpx<1e7){
            ctx.arc(sc.x, sc.y, rpx, a0, a1, !!ccw);
            ctx.stroke();
          }
        }
      }
    }

    if(state.tool==='dim' && state.dimFirst){
      var a3=worldToScreen(state.dimFirst), b3=worldToScreen(c);
      ctx.beginPath(); ctx.moveTo(a3.x,a3.y); ctx.lineTo(b3.x,b3.y); ctx.stroke();
    }

    // box selection preview
    if(state.selBox){
      var a4=worldToScreen(state.selBox.a), b4=worldToScreen(state.selBox.b);
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.strokeStyle='rgba(59,130,246,.8)';
      ctx.setLineDash([4,4]);
      ctx.strokeRect(Math.min(a4.x,b4.x), Math.min(a4.y,b4.y), Math.abs(b4.x-a4.x), Math.abs(b4.y-a4.y));
      ctx.restore();
    }

    ctx.restore();
  }

  function drawCursor(){
    // Crosshair at current cursor
    var p=worldToScreen(state.cursorMM);
    ctx.save();
    ctx.strokeStyle='rgba(59,130,246,.9)';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(p.x-10,p.y); ctx.lineTo(p.x+10,p.y);
    ctx.moveTo(p.x,p.y-10); ctx.lineTo(p.x,p.y+10);
    ctx.stroke();

    // Snap indicator (at snapped point)
    if(state.hoverSnap){
      var sp=worldToScreen({x:state.hoverSnap.x, y:state.hoverSnap.y});
      var k=(state.hoverSnap.kind||'').toUpperCase();

      // Yellow marker coherent with UI
      var yCol = '#f59e0b';
      ctx.lineWidth=2.25;
      // subtle outline for contrast
      ctx.strokeStyle='rgba(17,24,39,.55)';
      ctx.fillStyle='rgba(245,158,11,.14)';

      function strokeMarker(drawFn){
        ctx.save();
        // outline
        ctx.strokeStyle='rgba(17,24,39,.55)';
        ctx.lineWidth=3.5;
        ctx.beginPath(); drawFn(); ctx.stroke();
        // main
        ctx.strokeStyle=yCol;
        ctx.lineWidth=2.25;
        ctx.beginPath(); drawFn(); ctx.stroke();
        ctx.restore();
      }

      if(k==='END'){
        strokeMarker(function(){ ctx.rect(sp.x-6, sp.y-6, 12, 12); });
        ctx.fillStyle='rgba(245,158,11,.22)';
        ctx.fillRect(sp.x-3, sp.y-3, 6, 6);
      } else if(k==='MID'){
        strokeMarker(function(){
          ctx.moveTo(sp.x, sp.y-7);
          ctx.lineTo(sp.x+7, sp.y+6);
          ctx.lineTo(sp.x-7, sp.y+6);
          ctx.closePath();
        });
        ctx.fillStyle='rgba(245,158,11,.20)';
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y-4);
        ctx.lineTo(sp.x+4, sp.y+3);
        ctx.lineTo(sp.x-4, sp.y+3);
        ctx.closePath();
        ctx.fill();
      } else if(k==='CEN'){
        strokeMarker(function(){ ctx.arc(sp.x,sp.y,7,0,Math.PI*2); });
        // dot
        ctx.fillStyle=yCol;
        ctx.beginPath(); ctx.arc(sp.x,sp.y,1.7,0,Math.PI*2); ctx.fill();
      } else if(k==='INT'){
        strokeMarker(function(){
          ctx.moveTo(sp.x-7,sp.y); ctx.lineTo(sp.x+7,sp.y);
          ctx.moveTo(sp.x,sp.y-7); ctx.lineTo(sp.x,sp.y+7);
        });
      } else if(k==='PERP'){
        strokeMarker(function(){
          // ⟂ style
          ctx.moveTo(sp.x-7,sp.y); ctx.lineTo(sp.x+7,sp.y);
          ctx.moveTo(sp.x,sp.y); ctx.lineTo(sp.x,sp.y+7);
        });
      } else if(k==='TAN'){
        strokeMarker(function(){
          // small arc + tangent line
          ctx.arc(sp.x-1,sp.y+1,6,Math.PI*1.15,Math.PI*1.95);
          ctx.moveTo(sp.x+1,sp.y-6); ctx.lineTo(sp.x+8,sp.y-6);
        });
      } else { // GRID or unknown
        strokeMarker(function(){ ctx.rect(sp.x-5, sp.y-5, 10, 10); });
      }
    }
    ctx.restore();
  }

  function drawGrips(){
    if(!state.selection.length) return;
    var grips=[];
    for(var i=0;i<state.selection.length;i++){
      grips = grips.concat(gripsFor(state.selection[i]));
    }
    ctx.save();
    for(var i=0;i<grips.length;i++){
      var g=grips[i];
      var p=worldToScreen({x:g.x,y:g.y});
      if(g.grip==='rot'){
        ctx.fillStyle='rgba(59,130,246,.95)';
        ctx.strokeStyle='white';
        ctx.lineWidth=1;
        ctx.beginPath();
        ctx.arc(p.x,p.y,6,0,Math.PI*2);
        ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle='rgba(59,130,246,.9)';
        ctx.strokeStyle='white';
        ctx.lineWidth=1;
        ctx.beginPath();
        ctx.rect(p.x-5,p.y-5,10,10);
        ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderStaticLayer(){
    if(ctxStatic){
      withCtx(ctxStatic, function(){
        clear();
        drawGrid();
        drawEntitiesByZOrder();
      });
      return;
    }
    // Fallback: if static context is unavailable, render on current canvas.
    clear();
    drawGrid();
    drawEntitiesByZOrder();
  }

  function renderDynamicLayer(){
    withCtx(ctxDynamic, function(){
      clearTransparent();
      drawPreview();
      drawOffsetPreview();
      drawGrips();
      drawCursor();
    });
  }

  function renderSingleLayer(){
    clear();
    drawGrid();
    drawEntitiesByZOrder();
    drawPreview();
    drawOffsetPreview();
    drawGrips();
    drawCursor();
  }

  function drawDynamic(){
    try{
      resizeCanvasToDisplaySize();
      if(useDualCanvas){
        renderDynamicLayer();
      } else {
        renderSingleLayer();
      }
      updateHud();
    } catch(err){
      console.error(err);
      setStatus('Errore render dinamico: '+(err && err.message ? err.message : err));
    }
  }

  function draw(){
    try{
      resizeCanvasToDisplaySize();
      if(useDualCanvas){
        renderStaticLayer();
        renderDynamicLayer();
      } else {
        renderSingleLayer();
      }
      updateHud();
    } catch(err){
      console.error(err);
      setStatus('Errore render: '+(err && err.message ? err.message : err));
    }
  }

  // ----- UI / Tools -----
  function setStatus(t){ ui.status.textContent=t; }

  function setTool(t){
    state.tool=t;
    state.lineStart=null;
    state.rectStart=null;
    state.ellStart=null;
    state.dimFirst=null;
    state.selBox=null;
    state.plinePts=null;
    state.circleCenter=null;
    state.arcPts=null;
    state.cutStart=null;
    state.offsetRef=null;
    state.offsetPreview=null;

    ui.btnLine.classList.toggle('active', t==='line');
    ui.btnRect.classList.toggle('active', t==='rect');
    ui.btnEllipse.classList.toggle('active', t==='ell');
    ui.btnSelect.classList.toggle('active', t==='select');
    ui.btnDim.classList.toggle('active', t==='dim');
        ui.btnText.classList.toggle('active', t==='text');
    ui.btnPline.classList.toggle('active', t==='pline');
    ui.btnCircle.classList.toggle('active', t==='circle');
    ui.btnArc.classList.toggle('active', t==='arc3');
    if(ui.btnBreak) ui.btnBreak.classList.toggle('active', t==='break');
    if(ui.btnKatana) ui.btnKatana.classList.toggle('active', t==='katana');
    if(ui.btnOffset) ui.btnOffset.classList.toggle('active', t==='offset');
ui.btnPan.classList.toggle('active', t==='pan');
    if(ui.toolLbl) ui.toolLbl.textContent=t.toUpperCase();
    setStatus('OK');
    draw();
  }

  ui.btnLine.onclick=function(){ setTool('line'); };
  ui.btnRect.onclick=function(){ setTool('rect'); };
  ui.btnEllipse.onclick=function(){ setTool('ell'); };
  ui.btnSelect.onclick=function(){ setTool('select'); };
  ui.btnDim.onclick=function(){ setTool('dim'); };
  ui.btnPan.onclick=function(){ setTool('pan'); };

  ui.btnPline.onclick=function(){ setTool('pline'); };
  ui.btnCircle.onclick=function(){ setTool('circle'); };
  ui.btnArc.onclick=function(){ setTool('arc3'); };
  if(ui.btnBreak) ui.btnBreak.onclick=function(){ setTool('break'); setStatus('SPEZZA: clicca un oggetto nel punto in cui vuoi spezzarlo'); };
  if(ui.btnKatana) ui.btnKatana.onclick=function(){ setTool('katana'); setStatus('KATANA: clicca 2 punti per tagliare'); };
  if(ui.btnOffset) ui.btnOffset.onclick=function(){ setTool('offset'); setStatus('OFFSET: click oggetto, poi click lato (distanza da comando o default 10)'); };

  ui.btnText.onclick=function(){ setTool('text'); };
  ui.btnImg.onclick=function(){ ui.fileImage.click(); };
  ui.btnCmdFocus.onclick=function(){ ui.cmd.focus(); ui.cmd.select(); };

  ui.gridStep.oninput=function(){ state.gridStepMM=+ui.gridStep.value||1; draw(); };
  ui.zoom.oninput=function(){ state.pxPerMM=+ui.zoom.value||5; draw(); };
  ui.chkSnap.onchange=function(){ state.snap=ui.chkSnap.checked; draw(); };
  ui.chkOrtho.onchange=function(){ state.ortho=ui.chkOrtho.checked; draw(); };
  function syncSnapModes(){
    if(!state.snapModes) state.snapModes={grid:false,end:true,mid:true,cen:true,int:true,perp:false,tan:true};
    if(ui.snapGrid) state.snapModes.grid=!!ui.snapGrid.checked;
    if(ui.snapEnd)  state.snapModes.end=!!ui.snapEnd.checked;
    if(ui.snapMid)  state.snapModes.mid=!!ui.snapMid.checked;
    if(ui.snapCen)  state.snapModes.cen=!!ui.snapCen.checked;
    if(ui.snapInt)  state.snapModes.int=!!ui.snapInt.checked;
    if(ui.snapPerp) state.snapModes.perp=!!ui.snapPerp.checked;
    if(ui.snapTan)  state.snapModes.tan=!!ui.snapTan.checked;
  }
  if(ui.snapGrid) ui.snapGrid.onchange=function(){ syncSnapModes(); draw(); };
  if(ui.snapEnd)  ui.snapEnd.onchange=function(){ syncSnapModes(); draw(); };
  if(ui.snapMid)  ui.snapMid.onchange=function(){ syncSnapModes(); draw(); };
  if(ui.snapCen)  ui.snapCen.onchange=function(){ syncSnapModes(); draw(); };
  if(ui.snapInt)  ui.snapInt.onchange=function(){ syncSnapModes(); draw(); };
  if(ui.snapPerp) ui.snapPerp.onchange=function(){ syncSnapModes(); draw(); };
  if(ui.snapTan)  ui.snapTan.onchange=function(){ syncSnapModes(); draw(); };
  syncSnapModes();

  ui.chkLockAspect.onchange=function(){ state.lockAspect=ui.chkLockAspect.checked; };
  ui.chkNoBg.onchange=function(){ state.exportNoBg=ui.chkNoBg.checked; };

  // ----- Layers -----
  
function refreshUI(){
    ui.layers.innerHTML='';
    for(var name in state.layers){
      (function(layerName){
        var L=state.layers[layerName];
        var div=document.createElement('div');
        div.className='layerItem';
        if(layerName===state.activeLayer) div.classList.add('isActive');
        if(!L.visible) div.classList.add('isHidden');
        if(L.locked) div.classList.add('isLocked');

        var left=document.createElement('div'); left.className='row';
        var dot=document.createElement('div'); dot.className='dot'; dot.style.background=L.color; left.appendChild(dot);

        var btn=document.createElement('button');
        btn.className='layerBtn';
        btn.textContent=layerName+(layerName===state.activeLayer?' ✓':'');
        btn.onclick=function(){ state.activeLayer=layerName; refreshUI(); refreshLayerDropdown(); draw(); };
        left.appendChild(btn);

        var right=document.createElement('div'); right.className='row';

        var visBtn=document.createElement('button');
        visBtn.className='iconBtn';
        visBtn.title='Mostra/Nascondi layer';
        visBtn.innerHTML = (L.visible? '<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/></svg>' : '<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 3l18 18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M2.5 12s3.5-7 9.5-7c2.2 0 4.1.9 5.6 2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M21.5 12s-3.5 7-9.5 7c-2.2 0-4.1-.9-5.6-2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>');
        visBtn.onclick=function(){ L.visible=!L.visible; refreshUI(); draw(); };
        right.appendChild(visBtn);

        var lockBtn=document.createElement('button');
        lockBtn.className='iconBtn';
        lockBtn.title='Blocca layer (no select/edit)';
        lockBtn.innerHTML = (L.locked? '<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 11V8a5 5 0 0 1 10 0v3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><rect x=\"6\" y=\"11\" width=\"12\" height=\"10\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M12 15v3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>' : '<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M9 11V8a5 5 0 0 1 9-3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><rect x=\"6\" y=\"11\" width=\"12\" height=\"10\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M12 15v3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>');
        lockBtn.onclick=function(){ L.locked=!L.locked; refreshUI(); draw(); };
        right.appendChild(lockBtn);

        var col=document.createElement('input');
        col.type='color'; col.value=L.color||'#111827'; col.style.width='44px';
        col.title='Colore layer';
        col.oninput=function(){ L.color=col.value; refreshUI(); draw(); };
        right.appendChild(col);

        var delBtn=document.createElement('button');
        delBtn.className='iconBtn';
        delBtn.innerHTML='<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M9 3h6l1 2h4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M6 7h12l-1 14H7L6 7z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><path d=\"M10 11v6M14 11v6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>';
        delBtn.title='Elimina layer';
        delBtn.onclick=function(e){ e.stopPropagation(); deleteLayer(layerName); };
        right.appendChild(delBtn);

        div.appendChild(left); div.appendChild(right);
        ui.layers.appendChild(div);
      })(name);
    }
    refreshLayerDropdown();
  }



  function deleteLayer(layerName){
  var names=Object.keys(state.layers||{});
  if(names.length<=1){ setStatus('Non puoi eliminare l\'ultimo layer'); return; }
  if(!(layerName in state.layers)) return;

  // confirm: delete content on that layer
  if(!confirm('Eliminare il layer "'+layerName+'"?\nATTENZIONE: tutti gli oggetti su questo layer verranno ELIMINATI.')) return;

  function keepOtherLayers(arr, field){
    var out=[];
    for(var i=0;i<arr.length;i++){
      var o=arr[i];
      if(!o) continue;
      if(o[field]!==layerName) out.push(o);
    }
    return out;
  }

  // Build z-order removal map before deleting entities.
  var zrm={};
  function markForZ(type, arr){
    for(var i=0;i<arr.length;i++){
      var o=arr[i];
      if(o && o.layer===layerName && o.id) zrm[type+':'+o.id]=1;
    }
  }
  markForZ('seg', state.segments);
  markForZ('rect', state.rects);
  markForZ('ell', state.ellipses);
  markForZ('dim', state.dims);
  markForZ('img', state.images);
  markForZ('text', state.texts);
  markForZ('pline', state.polylines);
  markForZ('arc', state.arcs);
  markForZ('rdim', state.radDims);

  // Release cached image resources for entities on the removed layer.
  for(var ci=0;ci<state.images.length;ci++){
    var cim=state.images[ci];
    if(cim && cim.layer===layerName && cim.id){
      if(state.imageCache) delete state.imageCache[cim.id];
      if(state.imageLoadState) delete state.imageLoadState[cim.id];
    }
  }

  // Remove all entities on that layer
  state.segments   = keepOtherLayers(state.segments,'layer');
  state.rects      = keepOtherLayers(state.rects,'layer');
  state.ellipses   = keepOtherLayers(state.ellipses,'layer');
  state.dims       = keepOtherLayers(state.dims,'layer');
  state.images     = keepOtherLayers(state.images,'layer');
  state.texts      = keepOtherLayers(state.texts,'layer');
  state.polylines  = keepOtherLayers(state.polylines,'layer');
  state.arcs       = keepOtherLayers(state.arcs,'layer');
  state.radDims    = keepOtherLayers(state.radDims,'layer');

  // Keep z-order coherent immediately (without waiting next ensure pass).
  removeFromZOrderByKeyMap(zrm);

  // Clear selection because some ids may have been deleted
  clearSelection();
  updateSelInfo();

  // Delete the layer itself
  delete state.layers[layerName];

  // If it was active, switch to the first remaining layer
  if(state.activeLayer===layerName){
    var remaining=Object.keys(state.layers||{});
    state.activeLayer = remaining[0] || 'Layer 1';
  }

  refreshUI();
  refreshLayerDropdown();
  pushHist();
  draw();
  setStatus('Layer e contenuto eliminati');
}



  function refreshLayerDropdown(){
    ui.selLayer.innerHTML='';
    for(var lname in state.layers){
      var opt=document.createElement('option'); opt.value=lname; opt.textContent=lname;
      ui.selLayer.appendChild(opt);
    }
    ui.selLayer.value=state.activeLayer;
  }

  ui.btnAddLayer.onclick=function(){
    var name=(ui.layerName.value||'').trim();
    if(!name){ setStatus('Inserisci nome layer'); return; }
    if(state.layers[name]){ setStatus('Layer già esistente'); return; }
    state.layers[name]={visible:true,color:'#111827',locked:false};

    state.activeLayer=name;
    ui.layerName.value='';
    refreshUI();
    pushHist();
    draw();
  };

  // ----- Project Save/Load -----
  (function(){
    var bSave=document.getElementById('btnSaveProject');
    var bLoad=document.getElementById('btnLoadProject');
    var fLoad=document.getElementById('fileLoadProject');

    function doSave(){
      // Prefer existing exportJSON if present
      if(typeof exportJSON==='function'){ exportJSON(); return; }
      try{
        var data=JSON.stringify(state);
        var blob=new Blob([data], {type:'application/json'});
        var a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download='minicad_project.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ try{URL.revokeObjectURL(a.href);}catch(_){}} ,2000);
        setStatus('Progetto salvato');
      }catch(err){ console.error(err); setStatus('Errore salvataggio progetto'); }
    }

	    function doLoadText(txt){
	      try{
	        var obj=JSON.parse(txt);
	        if(typeof restore!=='function'){
	          setStatus('Errore caricamento: restore non disponibile');
	          return;
	        }
	        restore(obj);
	        if(typeof pushHist==='function') pushHist();
	        setStatus('Progetto caricato');
	      }catch(err){ console.error(err); setStatus('Errore caricamento progetto'); }
	    }

    if(bSave) bSave.addEventListener('click', doSave);
    if(bLoad) bLoad.addEventListener('click', function(){ if(fLoad) fLoad.click(); });
    if(fLoad) fLoad.addEventListener('change', function(){
      var file=fLoad.files && fLoad.files[0];
      if(!file) return;
      var r=new FileReader();
      r.onload=function(){ doLoadText(String(r.result||'')); fLoad.value=''; };
      r.readAsText(file);
    });

    var legacyExp=document.getElementById('btnExportJSON');
    var legacyImp=document.getElementById('btnImportJSON');
    if(legacyExp) legacyExp.style.display='none';
    if(legacyImp) legacyImp.style.display='none';
  })();

  // ----- Command line / coordinates -----
  function parseCoord(text, base){
    text=(text||'').trim();
    if(!text) return null;
    var rel=false;
    if(text[0]==='@'){ rel=true; text=text.slice(1).trim(); }
    var parts=text.split(',');
    if(parts.length!==2) return null;
    var x=parseFloat(parts[0]), y=parseFloat(parts[1]);
    if(!isFinite(x)||!isFinite(y)) return null;
    if(rel) return {x:base.x+x, y:base.y+y};
    return {x:x,y:y};
  }
  function commitPoint(p){ handleClickForTool(p); }

  ui.btnCancelCmd.onclick=function(){ ui.cmd.value=''; setStatus('OK'); canvas.focus(); };

  ui.cmd.addEventListener('keydown', function(e){
    if(e.key==='Enter'){
      e.preventDefault();
      var v=(ui.cmd.value||'').trim();

      // OFFSET: allow entering a numeric distance (mm)
      if(state.tool==='offset'){
        var num = /^-?\d+(?:[\.,]\d+)?$/.test(v) ? parseFloat(v.replace(',','.')) : null;
        if(num!==null && isFinite(num)){
          state.offsetDist = Math.max(0, Math.abs(num));
          ui.cmd.value='';
          setStatus('OFFSET distanza: '+state.offsetDist+' mm (clic oggetto, poi lato)');
          draw();
          return;
        }
      }

      var base = state.lineStart || state.rectStart || state.ellStart || state.dimFirst || state.cursorMM || {x:0,y:0};
      var p=parseCoord(v, base);
      if(!p){ setStatus('Coordinate non valide. Usa "x,y" o "@dx,dy" (o un numero per OFFSET).'); return; }
      state.cursorMM=p;
      commitPoint(p);
      ui.cmd.value='';
      draw();
    }
    if(e.key==='Escape'){
      e.preventDefault();
      ui.cmd.value='';
      setStatus('OK');
    }
  });

  // ----- Images -----
  function ensureUniqueLayerName(base){
    var name=base, i=2;
    while(state.layers[name]){ name=base+' '+i; i++; }
    return name;
  }
  function loadImageToState(dataUrl, suggestedName){
    var img=new Image();
    img.onload=function(){
      var aspect=img.width/Math.max(1,img.height);
      var w=120;
      var h=w/aspect;

      var layerName=ensureUniqueLayerName('IMG '+(suggestedName||'Layer'));
      state.layers[layerName]={visible:true,color:'#111827',locked:false};
      state.activeLayer=layerName;

      var id=uid();
      state.images.push({id:id,cx:state.cursorMM.x,cy:state.cursorMM.y,w:w,h:h,rot:0,src:dataUrl,layer:layerName,opacity:1,aspect:aspect});
      state.imageCache[id]=img;
      if(!state.imageLoadState) state.imageLoadState={};
      state.imageLoadState[id]=2;

      pushHist();
      refreshUI();
      setTool('select');
      setSingleSelection({type:'img',id:id});
      setStatus('Immagine inserita');
      draw();
    };
    img.src=dataUrl;
  }
  ui.btnAddImage.onclick=function(){ ui.fileImage.click(); };
  ui.fileImage.addEventListener('change', function(){
    var f=ui.fileImage.files && ui.fileImage.files[0];
    if(!f) return;
    var r=new FileReader();
    r.onload=function(){ loadImageToState(String(r.result), f.name); ui.fileImage.value=''; };
    r.readAsDataURL(f);
  });

  ui.btnFitImage.onclick=function(){
    var p=primarySelection();
    if(!p || p.type!=='img'){ setStatus("Seleziona un'immagine"); return; }
    var im=findById(state.images,p.id); if(!im) return;
    var padPx=24*dpr;
    var viewW=(canvas.width-padPx*2)/state.pxPerMM;
    var viewH=(canvas.height-padPx*2)/state.pxPerMM;
    var aspect=im.w/Math.max(0.0001,im.h);

    var targetW=viewW;
    var targetH=targetW/aspect;
    if(targetH>viewH){ targetH=viewH; targetW=targetH*aspect; }
    im.w=Math.max(1,targetW);
    im.h=Math.max(1,targetH);
    im.cx=state.panMM.x+(padPx/state.pxPerMM)+im.w/2;
    im.cy=state.panMM.y+(padPx/state.pxPerMM)+im.h/2;
    pushHist();
    draw();
    setStatus('Immagine adattata');
  };

  
