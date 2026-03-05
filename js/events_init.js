var pointers=new Map();
var pinch=null;
function dist(a,b){ var dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
function mid(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }

canvas.addEventListener('pointerdown', function(e){
    e.preventDefault();

    // Only track multi-pointer gestures for touch/pen. Mouse clicks should never enter pinch mode.
    if(e.pointerType==='touch' || e.pointerType==='pen'){
      if(pointers.has(e.pointerId)) pointers.delete(e.pointerId);
      try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
      pointers.set(e.pointerId, {x:e.clientX,y:e.clientY});

      if(pointers.size===2){
        var pts=Array.from(pointers.values());
        pinch={ startDist:dist(pts[0],pts[1]), startPxPerMM:state.pxPerMM, startMid:mid(pts[0],pts[1]), startPan:{x:state.panMM.x,y:state.panMM.y} };
        setStatus('PINCH: zoom/pan');
        return;
      }
    } else {
      // mouse: make sure pinch state is off
      pinch=null;
      pointers.clear();
    }

    var m=mousePos(e);

    if(e.button===1 || state.spacePan || state.tool==='pan'){
      state.drag={active:true,kind:'pan',startPx:m,startPan:{x:state.panMM.x,y:state.panMM.y}};
      setStatus('PAN: trascina');
      return;
    }

    var w0=screenToWorld(m);
// IMPORTANT: in Select we pick/grips on the true cursor position (no snap),
// otherwise snapping can move the hit-point away from texts and make them hard to select/move.
var w = (state.tool==='select') ? w0 : snapWorld(w0).snapped;

    if(state.tool==='select'){
      // grips
      var gh=gripHitTest(w);
      if(gh){
        if(gh.grip==='move'){
          var hitRef={type:gh.type,id:gh.id};
          state.selection=[hitRef];
          state.drag=createMoveDrag(deepClone(state.selection), w);
        } else {
          state.drag={active:true,kind:'grip',target:{type:gh.type,id:gh.id},grip:gh.grip};
        }
        setStatus(gh.grip==='rot' ? 'Rotazione: trascina' : 'Grip: modifica');
        draw(); return;
      }

      var hit=pick(w);
      if(hit){
        if(state.shiftDown){
          toggleSelection(hit);
        } else {
          // if clicking already-selected, keep multi selection; else single
          if(!hasInSelection(hit)) setSingleSelection(hit);
        }
        // start move for selection (all selected)
        if(state.selection.length){
          state.drag=createMoveDrag(deepClone(state.selection), w);
          setStatus('Move: trascina');
        } else {
          setStatus('OK');
        }
        draw(); return;
      } else {
        // empty space -> start box selection
        state.selBox={a:w,b:w};
        state.drag={active:true,kind:'box'};
        setStatus('Box selection: trascina');
        draw(); return;
      }
    }

    // other tools
    handleClickForTool(w);

  }, {passive:false});

  canvas.addEventListener('dblclick', function(e){
    // 1) double click to finish polyline
    if(state.tool==='pline'){
      e.preventDefault();
      finishPolyline();
      draw();
      return;
    }

    // 2) double click on text to edit
    var m=mousePos(e);
    var w=screenToWorld(m);
    var hit=pick(w);
    if(hit && hit.type==='text'){
      e.preventDefault();
      var t=findById(state.texts, hit.id);
      if(!t) return;
      if(isLayerLocked(t.layer)){ setStatus('Layer bloccato: non puoi modificare il testo'); return; }

      var cur=(t.text||'').toString();
      var entered=window.prompt('Modifica testo:', cur);
      if(entered===null) return;

      t.text=(entered||'').toString();
      // keep panel in sync
      ui.textValue.value=t.text;

      state.selection=[{type:'text',id:t.id}];
      pushHist();
      setStatus('Testo aggiornato');
      syncPropsFromPrimary();
      draw();
      return;
    }
  }, {passive:false});

  canvas.addEventListener('pointermove', function(e){
    e.preventDefault();

    if(e.pointerType==='touch' || e.pointerType==='pen'){
      if(pointers.has(e.pointerId)) pointers.set(e.pointerId, {x:e.clientX,y:e.clientY});

      if(pinch && pointers.size===2){

      var pts=Array.from(pointers.values());
      var nowDist=dist(pts[0],pts[1]);
      var nowMid=mid(pts[0],pts[1]);
      var factor=nowDist/(pinch.startDist||1);
      var newPxPerMM=clamp(pinch.startPxPerMM*factor,0.2,50);

      var rect=canvas.getBoundingClientRect();
      var midPx={x:(nowMid.x-rect.left)*dpr, y:(nowMid.y-rect.top)*dpr};
      var before=screenToWorld(midPx);
      state.pxPerMM=newPxPerMM;
      var after=screenToWorld(midPx);

      state.panMM={ x: pinch.startPan.x + (before.x-after.x), y: pinch.startPan.y + (before.y-after.y) };
      setStatus('PINCH: zoom/pan');
      draw();
      return;
    }
    }

    handlePointerMoveLikeMouse(e);
  }, {passive:false});

  
  canvas.addEventListener('pointerup', function(e){
    e.preventDefault();
    if(e.pointerType==='touch' || e.pointerType==='pen'){
      try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
      pointers.delete(e.pointerId);
      if(pointers.size<2) pinch=null;
    } else {
      pinch=null;
      pointers.clear();
    }

    if(state.drag && state.drag.active){
      var kind=state.drag.kind;
      state.drag.active=false;
      state.drag=null;

      if(kind==='box' && state.selBox){
        var box=rectNorm(state.selBox.a, state.selBox.b);
        applyBoxSelection(box, state.shiftDown);
        state.selBox=null;
      }

      if(kind==='move' || kind==='grip' || kind==='pan' || kind==='box'){
        pushHist();
      }
      setStatus('OK');
      draw();
    }
  }, {passive:false});

  
  canvas.addEventListener('pointercancel', function(e){
    e.preventDefault();
    if(e.pointerType==='touch' || e.pointerType==='pen'){
      try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
      pointers.delete(e.pointerId);
    } else {
      pointers.clear();
    }
    pinch=null;
    if(state.drag && state.drag.active){
      state.drag.active=false;
      state.drag=null;
      state.selBox=null;
      setStatus('OK');
      draw();
    }
  }, {passive:false});

  
  
  // extra safety: if pointerup/cancel is delivered to window instead of canvas, clean up anyway
  window.addEventListener('pointerup', function(e){
    if(e.pointerType==='touch' || e.pointerType==='pen'){
      if(pointers.has(e.pointerId)) pointers.delete(e.pointerId);
      if(pointers.size<2) pinch=null;
    }
  }, {passive:true});
  window.addEventListener('pointercancel', function(e){
    if(e.pointerType==='touch' || e.pointerType==='pen'){
      if(pointers.has(e.pointerId)) pointers.delete(e.pointerId);
    }
    pinch=null;
  }, {passive:true});

canvas.addEventListener('lostpointercapture', function(e){
    // safety: if capture is lost unexpectedly, clear any stuck state
    pointers.delete(e.pointerId);
    pinch=null;
    if(state.drag && state.drag.active){
      state.drag.active=false;
      state.drag=null;
      state.selBox=null;
      setStatus('OK');
      draw();
    }
  });

  // ----- Wheel zoom -----
  canvas.addEventListener('wheel', function(e){
    e.preventDefault();
    var m=mousePos(e);
    var before=screenToWorld(m);
    var delta=-e.deltaY;
    var factor=Math.exp(delta*0.001);
    state.pxPerMM=clamp(state.pxPerMM*factor,0.2,50);
    var after=screenToWorld(m);
    state.panMM={ x: state.panMM.x + (before.x-after.x), y: state.panMM.y + (before.y-after.y) };
    draw();
  }, {passive:false});

  
  // ----- Keyboard -----
  addEventListener('keydown', function(e){
    if(e.key==='Control') state.ctrlDown=true;
    if(e.key==='Shift') state.shiftDown=true;
    if(e.key===' '){ state.spacePan=true; e.preventDefault(); }
    if(e.key==='Escape'){
      state.lineStart=null; state.rectStart=null; state.ellStart=null; state.dimFirst=null;
      state.selBox=null;
      setStatus('OK'); draw();
    }
    if((e.key==='Delete' || e.key==='Backspace') && state.selection.length){
      ui.btnDelete.click(); e.preventDefault();
    }
  });
  addEventListener('keyup', function(e){
    if(e.key==='Control') state.ctrlDown=false;
    if(e.key==='Shift') state.shiftDown=false;
    if(e.key===' ') state.spacePan=false;
  });

  // ----- Export / Import -----
  function downloadBlob(blob, filename){
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download=filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeXML(text){
    return String(text||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&apos;');
  }

  function exportJSON(){
    var data=snapshot();
    downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'minicad.json');
  }

	  function exportSVG(){
	    var vis=visibleLayerSet();
	    var box=computeWorldBounds();
	    if(!box){ setStatus('Niente da esportare'); return; }
    var pad=10;
    var w=box.w+pad*2, h=box.h+pad*2;

    function x(v){ return (v-box.x+pad); }
    function y(v){ return (v-box.y+pad); }

    var svg=[];
    svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">');
    if(!state.exportNoBg) svg.push('<rect width="100%" height="100%" fill="white"/>');

    // segments
    for(var i=0;i<state.segments.length;i++){
      var s=state.segments[i]; if(!vis[s.layer]) continue;
      var st=s.style||{};
      var dashArr=dashPatternForStyle(st);
      var dash=dashArr.length ? ' stroke-dasharray="'+dashArr.join(' ')+'"' : '';
      svg.push('<line x1="'+x(s.a.x)+'" y1="'+y(s.a.y)+'" x2="'+x(s.b.x)+'" y2="'+y(s.b.y)+'" stroke="'+(st.stroke||'#111827')+'" stroke-width="'+(st.width||1)+'" fill="none"'+dash+'/>');
    }

    // rects as <rect> with transform
    for(var r=0;r<state.rects.length;r++){
      var rr=state.rects[r]; if(!vis[rr.layer]) continue;
      var st2=rr.style||{};
      var dashArr2=dashPatternForStyle(st2);
      var dash2=dashArr2.length ? ' stroke-dasharray="'+dashArr2.join(' ')+'"' : '';
      var rotDeg=deg(rr.rot||0);
      var rx=x(rr.cx), ry=y(rr.cy);
      svg.push('<rect x="'+(rx-rr.w/2)+'" y="'+(ry-rr.h/2)+'" width="'+rr.w+'" height="'+rr.h+'" fill="none" stroke="'+(st2.stroke||'#111827')+'" stroke-width="'+(st2.width||1)+'"'+dash2+' transform="rotate('+rotDeg+' '+rx+' '+ry+')" />');
    }

	    // ellipses with transform
	    for(var e=0;e<state.ellipses.length;e++){
	      var el=state.ellipses[e]; if(!vis[el.layer]) continue;
	      var st3=el.style||{};
      var dashArr3=dashPatternForStyle(st3);
      var dash3=dashArr3.length ? ' stroke-dasharray="'+dashArr3.join(' ')+'"' : '';
      var rotDeg2=deg(el.rot||0);
      var ex=x(el.cx), ey=y(el.cy);
	      svg.push('<ellipse cx="'+ex+'" cy="'+ey+'" rx="'+el.rx+'" ry="'+el.ry+'" fill="none" stroke="'+(st3.stroke||'#111827')+'" stroke-width="'+(st3.width||1)+'"'+dash3+' transform="rotate('+rotDeg2+' '+ex+' '+ey+')" />');
	    }

	    // polylines
	    for(var p=0;p<state.polylines.length;p++){
	      var pl=state.polylines[p]; if(!vis[pl.layer]) continue;
	      if(!pl.pts || pl.pts.length<2) continue;
	      var stp=pl.style||{};
	      var dashArrP=dashPatternForStyle(stp);
	      var dashP=dashArrP.length ? ' stroke-dasharray="'+dashArrP.join(' ')+'"' : '';
	      var pts=[];
	      for(var pi=0;pi<pl.pts.length;pi++) pts.push(x(pl.pts[pi].x)+','+y(pl.pts[pi].y));
	      if(pl.closed){
	        var fillP=(stp.fill||'none');
	        svg.push('<polygon points="'+pts.join(' ')+'" fill="'+fillP+'" stroke="'+(stp.stroke||'#111827')+'" stroke-width="'+(stp.width||1)+'"'+dashP+' />');
	      } else {
	        svg.push('<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+(stp.stroke||'#111827')+'" stroke-width="'+(stp.width||1)+'"'+dashP+' />');
	      }
	    }

	    // arcs
	    for(var aidx=0;aidx<state.arcs.length;aidx++){
	      var aa=state.arcs[aidx]; if(!vis[aa.layer]) continue;
	      if(!isFinite(aa.cx)||!isFinite(aa.cy)||!isFinite(aa.r)||aa.r<=1e-8) continue;
	      var sta=aa.style||{};
	      var dashArrA=dashPatternForStyle(sta);
	      var dashA=dashArrA.length ? ' stroke-dasharray="'+dashArrA.join(' ')+'"' : '';
	      var sweep=Math.abs(angleDiff(aa.a0, aa.a1, !!aa.ccw));
	      if(sweep<=1e-8) continue;
	      if(sweep>=Math.PI*2-1e-8){
	        svg.push('<circle cx="'+x(aa.cx)+'" cy="'+y(aa.cy)+'" r="'+aa.r+'" fill="none" stroke="'+(sta.stroke||'#111827')+'" stroke-width="'+(sta.width||1)+'"'+dashA+' />');
	        continue;
	      }
	      var sx=x(aa.cx + Math.cos(aa.a0)*aa.r), sy=y(aa.cy + Math.sin(aa.a0)*aa.r);
	      var ex2=x(aa.cx + Math.cos(aa.a1)*aa.r), ey2=y(aa.cy + Math.sin(aa.a1)*aa.r);
	      var laf = (sweep > Math.PI) ? 1 : 0;
	      // Canvas ccw=true is opposite sweep direction in SVG path flag.
	      var sf = aa.ccw ? 0 : 1;
	      var dPath='M '+sx+' '+sy+' A '+aa.r+' '+aa.r+' 0 '+laf+' '+sf+' '+ex2+' '+ey2;
	      svg.push('<path d="'+dPath+'" fill="none" stroke="'+(sta.stroke||'#111827')+'" stroke-width="'+(sta.width||1)+'"'+dashA+' />');
	    }

	    // images are NOT embedded by default in SVG (to keep it simple)
	    // dims simplified
	    for(var d=0; d<state.dims.length; d++){
      var dd=state.dims[d]; if(!vis[dd.layer]) continue;
      var a=dd.a, b=dd.b;
      var vx=b.x-a.x, vy=b.y-a.y;
      var len=hypot(vx,vy); if(len<1e-6) continue;
      var nx=-vy/len, ny=vx/len;
      var off=dd.offsetMM||10;
      var a2={x:a.x+nx*off,y:a.y+ny*off};
      var b2={x:b.x+nx*off,y:b.y+ny*off};
      svg.push('<line x1="'+x(a.x)+'" y1="'+y(a.y)+'" x2="'+x(a2.x)+'" y2="'+y(a2.y)+'" stroke="#111827" stroke-width="1"/>');
      svg.push('<line x1="'+x(b.x)+'" y1="'+y(b.y)+'" x2="'+x(b2.x)+'" y2="'+y(b2.y)+'" stroke="#111827" stroke-width="1"/>');
      svg.push('<line x1="'+x(a2.x)+'" y1="'+y(a2.y)+'" x2="'+x(b2.x)+'" y2="'+y(b2.y)+'" stroke="#111827" stroke-width="1"/>');
	      var mx=(a2.x+b2.x)/2, my=(a2.y+b2.y)/2;
	      svg.push('<text x="'+x(mx)+'" y="'+y(my-2)+'" font-size="'+(dd.textMM||3)+'" text-anchor="middle" fill="#111827">'+fmt(len)+' mm</text>');
	    }

	    // radial dims (simplified)
	    for(var rd=0; rd<state.radDims.length; rd++){
	      var rdd=state.radDims[rd]; if(!vis[rdd.layer]) continue;
	      if(!rdd.anchor) continue;
	      svg.push('<line x1="'+x(rdd.cx)+'" y1="'+y(rdd.cy)+'" x2="'+x(rdd.anchor.x)+'" y2="'+y(rdd.anchor.y)+'" stroke="#111827" stroke-width="1"/>');
	      svg.push('<circle cx="'+x(rdd.cx)+'" cy="'+y(rdd.cy)+'" r="1.2" fill="#111827"/>');
	      var txr=(rdd.cx+rdd.anchor.x)/2, tyr=(rdd.cy+rdd.anchor.y)/2;
	      svg.push('<text x="'+x(txr)+'" y="'+y(tyr-2)+'" font-size="'+(rdd.textMM||3)+'" text-anchor="middle" fill="#111827">R '+fmt(rdd.r)+' mm</text>');
	    }

	    // texts
	    for(var t=0;t<state.texts.length;t++){
	      var tt=state.texts[t]; if(!vis[tt.layer]) continue;
	      var fill=(tt.style && tt.style.fill)?tt.style.fill:'#111827';
	      var tx=(tt.x-box.x+pad);
	      var ty=(tt.y-box.y+pad);
	      var rot=(tt.rot||0)*180/Math.PI;
	      var anchor=(tt.align||'left')==='center'?'middle':((tt.align||'left')==='right'?'end':'start');
	      var lsp=(typeof tt.spacingMM==='number') ? tt.spacingMM : ((typeof tt.letterSpacingMM==='number') ? tt.letterSpacingMM : 0);
	      var lspAttr=(Math.abs(lsp)>1e-9) ? (' letter-spacing="'+lsp+'"') : '';
	      svg.push('<text x=\"'+tx+'\" y=\"'+ty+'\" font-size=\"'+(tt.sizeMM||5)+'\" text-anchor=\"'+anchor+'\" fill=\"'+fill+'\"'+lspAttr+' transform=\"rotate('+rot+' '+tx+' '+ty+')\">'+escapeXML(tt.text||'')+'</text>');
	    }

    svg.push('</svg>');
    downloadBlob(new Blob([svg.join('\n')],{type:'image/svg+xml'}),'minicad.svg');
  }

	  function exportDXF(){
	    var vis=visibleLayerSet();
	    var dxf=[];
	    function push(){ dxf.push.apply(dxf, arguments); }
	    function normDeg(v){
	      var n=(deg(v||0)%360);
	      if(n<0) n+=360;
	      return n;
	    }
	    function dxfTextSafe(s){
	      return String(s==null ? '' : s).replace(/\r?\n/g,' ');
	    }
	    push("0","SECTION","2","HEADER","0","ENDSEC");
	    push("0","SECTION","2","TABLES","0","ENDSEC");
	    push("0","SECTION","2","ENTITIES");

    for(var i=0;i<state.segments.length;i++){
      var s=state.segments[i]; if(!vis[s.layer]) continue;
      push("0","LINE","8",s.layer,"10",s.a.x,"20",s.a.y,"11",s.b.x,"21",s.b.y);
    }
    // rects exported as 4 lines (rotation approximated by corners)
    for(var r=0;r<state.rects.length;r++){
      var rr=state.rects[r]; if(!vis[rr.layer]) continue;
      var cs=getRectCorners(rr);
      for(var k=0;k<4;k++){
        var p1=cs[k], p2=cs[(k+1)%4];
        push("0","LINE","8",rr.layer,"10",p1.x,"20",p1.y,"11",p2.x,"21",p2.y);
      }
    }
	    // ellipses: DXF supports ELLIPSE with major axis vector; include rotation
	    for(var e=0;e<state.ellipses.length;e++){
	      var el=state.ellipses[e]; if(!vis[el.layer]) continue;
      var ang=el.rot||0;
      // major axis vector along rotated x axis, length rx
	      var mx=Math.cos(ang)*el.rx, my=Math.sin(ang)*el.rx;
	      push("0","ELLIPSE","8",el.layer,"10",el.cx,"20",el.cy,"11",mx,"21",my,"40",(el.ry/Math.max(0.0001,el.rx)),"41",0,"42",6.283185307179586);
	    }

	    // polylines
	    for(var p=0;p<state.polylines.length;p++){
	      var pl=state.polylines[p]; if(!vis[pl.layer]) continue;
	      if(!pl.pts || pl.pts.length<2) continue;
	      push("0","LWPOLYLINE","8",pl.layer,"90",pl.pts.length,"70",pl.closed?1:0);
	      for(var pi=0;pi<pl.pts.length;pi++){
	        var pt=pl.pts[pi];
	        push("10",pt.x,"20",pt.y);
	      }
	    }

	    // arcs
	    for(var ai=0;ai<state.arcs.length;ai++){
	      var ar=state.arcs[ai]; if(!vis[ar.layer]) continue;
	      if(!isFinite(ar.cx)||!isFinite(ar.cy)||!isFinite(ar.r)||ar.r<=1e-8) continue;
	      var sw=Math.abs(angleDiff(ar.a0, ar.a1, !!ar.ccw));
	      if(sw<=1e-8) continue;
	      if(sw>=Math.PI*2-1e-8){
	        push("0","CIRCLE","8",ar.layer,"10",ar.cx,"20",ar.cy,"40",ar.r);
	        continue;
	      }
	      var a0=normDeg(ar.a0), a1=normDeg(ar.a1);
	      var startDeg = ar.ccw ? a0 : a1;
	      var endDeg   = ar.ccw ? a1 : a0;
	      push("0","ARC","8",ar.layer,"10",ar.cx,"20",ar.cy,"40",ar.r,"50",startDeg,"51",endDeg);
	    }

	    // texts
	    for(var t=0;t<state.texts.length;t++){
	      var tt=state.texts[t]; if(!vis[tt.layer]) continue;
	      var align=(tt.align==='center')?1:((tt.align==='right')?2:0);
	      push("0","TEXT","8",tt.layer,"10",tt.x,"20",tt.y,"40",(tt.sizeMM||5),"1",dxfTextSafe(tt.text||''),"50",normDeg(tt.rot||0));
	      if(align){
	        push("72",align,"11",tt.x,"21",tt.y);
	      }
	    }

	    push("0","ENDSEC","0","EOF");
	    downloadBlob(new Blob([dxf.join("\n")],{type:'application/dxf'}),'minicad.dxf');
	  }

	  function computeWorldBounds(){
	    var vis=visibleLayerSet();
	    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9,any=false;
	    function consider(x,y){ any=true; minx=Math.min(minx,x); miny=Math.min(miny,y); maxx=Math.max(maxx,x); maxy=Math.max(maxy,y); }
	    for(var i=0;i<state.segments.length;i++){ var s=state.segments[i]; if(!vis[s.layer]) continue; consider(s.a.x,s.a.y); consider(s.b.x,s.b.y); }
	    for(var r=0;r<state.rects.length;r++){ var rr=state.rects[r]; if(!vis[rr.layer]) continue; var b=boundsFromPoints(getRectCorners(rr)); consider(b.x,b.y); consider(b.x+b.w,b.y+b.h); }
	    for(var e=0;e<state.ellipses.length;e++){ var el=state.ellipses[e]; if(!vis[el.layer]) continue; var b2=boundsOfObject({type:'ell',id:el.id}); consider(b2.x,b2.y); consider(b2.x+b2.w,b2.y+b2.h); }
	    for(var d=0;d<state.dims.length;d++){ var dd=state.dims[d]; if(!vis[dd.layer]) continue; consider(dd.a.x,dd.a.y); consider(dd.b.x,dd.b.y); }
	    for(var im=0;im<state.images.length;im++){ var ii=state.images[im]; if(!vis[ii.layer]) continue; var b3=boundsFromPoints(getRectCorners(ii)); consider(b3.x,b3.y); consider(b3.x+b3.w,b3.y+b3.h); }
	    for(var p=0;p<state.polylines.length;p++){
	      var pl=state.polylines[p]; if(!vis[pl.layer]) continue;
	      var bp=boundsOfObject({type:'pline',id:pl.id});
	      if(bp){ consider(bp.x,bp.y); consider(bp.x+bp.w,bp.y+bp.h); }
	    }
	    for(var a=0;a<state.arcs.length;a++){
	      var ar=state.arcs[a]; if(!vis[ar.layer]) continue;
	      var ba=boundsOfObject({type:'arc',id:ar.id});
	      if(ba){ consider(ba.x,ba.y); consider(ba.x+ba.w,ba.y+ba.h); }
	    }
	    for(var rd=0;rd<state.radDims.length;rd++){
	      var rdd=state.radDims[rd]; if(!vis[rdd.layer]) continue;
	      var br=boundsOfObject({type:'rdim',id:rdd.id});
	      if(br){ consider(br.x,br.y); consider(br.x+br.w,br.y+br.h); }
	    }
	    
	    for(var t=0;t<state.texts.length;t++){
	      var tt=state.texts[t]; if(!vis[tt.layer]) continue;
      var b=boundsOfObject({type:'text',id:tt.id});
      if(b){ consider(b.x,b.y); consider(b.x+b.w,b.y+b.h); }
    }

    if(!any) return null;
    return {x:minx,y:miny,w:maxx-minx,h:maxy-miny};
  }

  function exportSelectedPNG(){
    if(!state.selection.length){ setStatus('Nessuna selezione'); return; }

    // bounds of all selected
    var minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    for(var i=0;i<state.selection.length;i++){
      var b=boundsOfObject(state.selection[i]);
      if(!b) continue;
      minx=Math.min(minx,b.x); miny=Math.min(miny,b.y);
      maxx=Math.max(maxx,b.x+b.w); maxy=Math.max(maxy,b.y+b.h);
    }
    if(minx>maxx || miny>maxy){ setStatus('Selezione non valida'); return; }
    var bb={x:minx,y:miny,w:maxx-minx,h:maxy-miny};

    var pxPerMM=Math.max(5,state.pxPerMM);
    var padMM=5;
    var wPx=Math.ceil((bb.w+padMM*2)*pxPerMM);
    var hPx=Math.ceil((bb.h+padMM*2)*pxPerMM);

    var out=document.createElement('canvas');
    out.width=wPx; out.height=hPx;
    var octx=out.getContext('2d');

    if(!state.exportNoBg){
      octx.fillStyle='#ffffff';
      octx.fillRect(0,0,wPx,hPx);
    } else {
      // transparent: leave blank
      octx.clearRect(0,0,wPx,hPx);
    }

    function w2s(p){ return { x:(p.x-(bb.x-padMM))*pxPerMM, y:(p.y-(bb.y-padMM))*pxPerMM }; }
    function applyStroke(style){
      octx.strokeStyle=(style&&style.stroke)?style.stroke:'#111827';
      octx.lineWidth=((style&&style.width)?style.width:1)*(pxPerMM/5);
      var dash = dashPatternForStyle(style);
      octx.setLineDash(dash.length ? dash : []);
    }

    var keys=new Set(state.selection.map(selectionKey));

    // draw in a simple order: images, segments, rects, ellipses, dims
    for(var im=0;im<state.images.length;im++){
      var imgObj=state.images[im]; if(!keys.has('img:'+imgObj.id)) continue;
      var img=state.imageCache[imgObj.id];
      if(!img){ /* try load sync not possible */ continue; }
      var c=w2s({x:imgObj.cx,y:imgObj.cy});
      octx.save();
      octx.translate(c.x,c.y);
      octx.rotate(imgObj.rot||0);
      octx.globalAlpha=(typeof imgObj.opacity==='number') ? clamp(imgObj.opacity,0,1) : 1;
      octx.drawImage(img, -imgObj.w*pxPerMM/2, -imgObj.h*pxPerMM/2, imgObj.w*pxPerMM, imgObj.h*pxPerMM);
      octx.restore();
    }

    // texts
    for(var ti=0;ti<state.texts.length;ti++){
      var tt=state.texts[ti]; if(!keys.has('text:'+tt.id)) continue;
      var p=w2s({x:tt.x,y:tt.y});
      octx.save();
      octx.translate(p.x,p.y);
      octx.rotate(tt.rot||0);
      var sizePx=(tt.sizeMM||5)*pxPerMM;
      octx.font=sizePx+'px '+(tt.font||'Arial');
      octx.fillStyle=(tt.style && tt.style.fill)?tt.style.fill:'#111827';
      octx.textAlign=tt.align||'left';
      octx.textBaseline='alphabetic';
      octx.fillText(tt.text||'',0,0);
      octx.restore();
    }


    for(var i=0;i<state.segments.length;i++){
      var s=state.segments[i]; if(!keys.has('seg:'+s.id)) continue;
      var a=w2s(s.a), b=w2s(s.b);
      octx.beginPath(); applyStroke(s.style||{}); octx.moveTo(a.x,a.y); octx.lineTo(b.x,b.y); octx.stroke();
    }

    for(var r=0;r<state.rects.length;r++){
      var rr=state.rects[r]; if(!keys.has('rect:'+rr.id)) continue;
      var c2=w2s({x:rr.cx,y:rr.cy});
      octx.save();
      octx.translate(c2.x,c2.y);
      octx.rotate(rr.rot||0);
      octx.beginPath(); applyStroke(rr.style||{});
      octx.rect(-rr.w*pxPerMM/2, -rr.h*pxPerMM/2, rr.w*pxPerMM, rr.h*pxPerMM);
      octx.stroke();
      octx.restore();
    }

    for(var e=0;e<state.ellipses.length;e++){
      var el=state.ellipses[e]; if(!keys.has('ell:'+el.id)) continue;
      var c3=w2s({x:el.cx,y:el.cy});
      octx.save();
      octx.translate(c3.x,c3.y);
      octx.rotate(el.rot||0);
      octx.beginPath(); applyStroke(el.style||{});
      octx.ellipse(0,0,el.rx*pxPerMM,el.ry*pxPerMM,0,0,Math.PI*2);
      octx.stroke();
      octx.restore();
    }

    for(var d=0;d<state.dims.length;d++){
      var dd=state.dims[d]; if(!keys.has('dim:'+dd.id)) continue;
      // simplified like on-screen
      var a2=dd.a, b2=dd.b;
      var vx=b2.x-a2.x, vy=b2.y-a2.y;
      var len=hypot(vx,vy); if(len<1e-6) continue;
      var nx=-vy/len, ny=vx/len;
      var off=dd.offsetMM||10;
      var p1={x:a2.x+nx*off,y:a2.y+ny*off};
      var p2={x:b2.x+nx*off,y:b2.y+ny*off};
      var sa=w2s(p1), sb=w2s(p2), s0=w2s(a2), s1=w2s(b2);

      octx.save();
      octx.fillStyle='#111827'; octx.strokeStyle='#111827'; octx.lineWidth=1;

      octx.beginPath();
      octx.moveTo(s0.x,s0.y); octx.lineTo(sa.x,sa.y);
      octx.moveTo(s1.x,s1.y); octx.lineTo(sb.x,sb.y);
      octx.stroke();

      octx.beginPath(); octx.moveTo(sa.x,sa.y); octx.lineTo(sb.x,sb.y); octx.stroke();

      function arrow(p, dirx, diry){
        var L=8,W=4;
        var ax=p.x-dirx*L, ay=p.y-diry*L;
        var lx=ax+(-diry)*W, ly=ay+(dirx)*W;
        var rx=ax-(-diry)*W, ry=ay-(dirx)*W;
        octx.beginPath();
        octx.moveTo(p.x,p.y); octx.lineTo(lx,ly); octx.lineTo(rx,ry);
        octx.closePath(); octx.fill();
      }
      var dirx=(sb.x-sa.x), diry=(sb.y-sa.y);
      var sl=hypot(dirx,diry); dirx/=sl; diry/=sl;
      arrow(sa,dirx,diry); arrow(sb,-dirx,-diry);

      var text=fmt(len)+" mm";
      var midp={x:(sa.x+sb.x)/2,y:(sa.y+sb.y)/2};
      octx.save();
      octx.translate(midp.x,midp.y);
      var ang=Math.atan2(sb.y-sa.y,sb.x-sa.x);
      octx.rotate(ang);
      var ts=(dd.textMM||3)*pxPerMM;
      octx.font=ts+'px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
      octx.textAlign='center'; octx.textBaseline='bottom';
      octx.fillText(text,0,-6);
      octx.restore();

      octx.restore();
    }

    var a=document.createElement('a');
    a.download='selezione.png';
    a.href=out.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('PNG esportato');
  }

  ui.btnExportJSON.onclick=exportJSON;
  ui.btnExportSVG.onclick=exportSVG;
  ui.btnExportDXF.onclick=exportDXF;
  ui.btnExportSelPNG.onclick=exportSelectedPNG;

  function importJSON(file){
    var reader=new FileReader();
    reader.onload=function(){
      try{
        var data=JSON.parse(reader.result);
        restore(data);
        pushHist();
        setStatus('Import OK');
      } catch(err){
        console.error(err);
        setStatus('Errore import');
      }
    };
    reader.readAsText(file);
  }
  ui.btnImportJSON.onclick=function(){ ui.fileImport.click(); };
  ui.fileImport.onchange=function(){
    if(ui.fileImport.files && ui.fileImport.files[0]) importJSON(ui.fileImport.files[0]);
    ui.fileImport.value='';
  };

  // ----- Sync UI fields to selection -----
  function syncPropsFromPrimary(){
    var p=primarySelection();
    if(!p){
      ui.btnDelete.disabled=true;
      ui.btnApplyStyle.disabled=true;
      ui.btnClearSel.disabled=true;
      ui.objRot.value=0;
      if(ui.objDash) ui.objDash.value='';
      return;
    }
    ui.btnDelete.disabled=false;
    ui.btnApplyStyle.disabled=false;
    ui.btnClearSel.disabled=false;

    var layer=state.activeLayer;
    var rot=0;
    var primaryStyle=null;

    if(p.type==='seg'){ var s=findById(state.segments,p.id); if(s){ layer=s.layer; rot=0; primaryStyle=s.style||null; } }
    if(p.type==='rect'){ var r=findById(state.rects,p.id); if(r){ layer=r.layer; rot=deg(r.rot||0); primaryStyle=r.style||null; } }
    if(p.type==='ell'){ var e=findById(state.ellipses,p.id); if(e){ layer=e.layer; rot=deg(e.rot||0); primaryStyle=e.style||null; } }
    if(p.type==='img'){ var im=findById(state.images,p.id); if(im){ layer=im.layer; rot=deg(im.rot||0); } }
    if(p.type==='dim'){ var d=findById(state.dims,p.id); if(d){ layer=d.layer; rot=0; if(ui.dimOffset) ui.dimOffset.value=(typeof d.offsetMM==='number'?d.offsetMM:10); if(ui.dimText) ui.dimText.value=(typeof d.textMM==='number'&&isFinite(d.textMM)?d.textMM:''); } }
    if(p.type==='rdim'){ var rd=findById(state.radDims,p.id); if(rd){ layer=rd.layer; rot=0; if(ui.dimText) ui.dimText.value=(typeof rd.textMM==='number'&&isFinite(rd.textMM)?rd.textMM:''); } }
    if(p.type==='pline'){ var pl=findById(state.polylines,p.id); if(pl){ layer=pl.layer; rot=0; primaryStyle=pl.style||null; } }
    if(p.type==='arc'){ var ar=findById(state.arcs,p.id); if(ar){ layer=ar.layer; rot=0; primaryStyle=ar.style||null; } }
	    if(p.type==='text'){ var t=findById(state.texts,p.id); if(t){ layer=t.layer; rot=deg(t.rot||0);
	      // sync text panel
	      ui.textValue.value=(t.text||'');
	      ui.textSize.value=(t.sizeMM||5);
	      ui.textFont.value=(t.font||'Arial');
	      ui.textAlign.value=(t.align||'left');
	      if(ui.textSpacing){
	        var sp=(typeof t.spacingMM==='number') ? t.spacingMM : ((typeof t.letterSpacingMM==='number') ? t.letterSpacingMM : 0);
	        ui.textSpacing.value=sp;
	      }
	      // sync color swatch for text fill
	      if(t.style && t.style.fill){
	        ui.objColor.value=t.style.fill;
	        if(ui.objColorHex) ui.objColorHex.value=(t.style.fill||'').toUpperCase();
	      }
	    } }


    // Fill (solo forme chiuse: rettangoli, ellissi/circhi, polilinee chiuse)
    var fillVal=null;
    var fillEligible=false;
    if(p.type==='rect'){ var r2=findById(state.rects,p.id); if(r2){ fillEligible=true; fillVal=(r2.style&&r2.style.fill)?r2.style.fill:null; } }
    if(p.type==='ell'){ var e2=findById(state.ellipses,p.id); if(e2){ fillEligible=true; fillVal=(e2.style&&e2.style.fill)?e2.style.fill:null; } }
    if(p.type==='pline'){ var pl2=findById(state.polylines,p.id); if(pl2){ fillEligible=!!pl2.closed; fillVal=(pl2.closed && pl2.style && pl2.style.fill)?pl2.style.fill:null; } }

    if(ui.chkFill && ui.objFill && ui.objFillHex){
      ui.chkFill.disabled=!fillEligible;
      ui.objFill.disabled=!fillEligible || !fillVal;
      ui.objFillHex.disabled=!fillEligible || !fillVal;
      ui.chkFill.checked=!!fillVal;
      if(fillEligible){
        ui.objFill.value=(fillVal||ui.objFill.value||'#FFD166');
        ui.objFillHex.value=(ui.objFill.value||'#FFD166').toUpperCase();
        var row=document.getElementById('fillRow');
        if(row) row.style.opacity = ui.chkFill.checked ? '1' : '.45';
      }
    }

    ui.selLayer.value=layer;
    ui.objRot.value=Math.round(rot);
    if(ui.objDash) ui.objDash.value = dashPatternTextFromStyle(primaryStyle);
  }

  // hook into draw update
  var _draw=draw;
  draw=function(){ _draw(); if(typeof syncPropsFromPrimary==='function') syncPropsFromPrimary(); };

  window.addEventListener('beforeunload', function(e){ if(state.dirty){ e.preventDefault(); e.returnValue=''; } });

// ----- Init -----
  refreshUI();
  var as=loadAutosave();
  if(as && confirm('Trovato autosave. Ripristinare?')){ restore(as); }
  setTool('line');
  pushHist();
  draw();


  // ----- Canvas context menu (right click) -----
  var ctxMenuEl = document.getElementById('ctxMenu');
  function hideCtxMenu(){
    if(!ctxMenuEl) return;
    ctxMenuEl.hidden = true;
  }
  function showCtxMenu(px, py){
    if(!ctxMenuEl) return;
    // enable/disable items based on current state
    var hasSel = !!(state && state.selection && state.selection.length);
    var hasClip = !!(state && state.clipboard);
    var btns = ctxMenuEl.querySelectorAll('button[data-act]');
    for(var i=0;i<btns.length;i++){
      var b = btns[i];
      var act = b.getAttribute('data-act');
      if(act==='paste') b.disabled = !hasClip;
      else if(act==='clear') b.disabled = !hasSel;
      else if(act==='delete' || act==='copy' || act==='back' || act==='forward' || act==='toback' || act==='tofront'){
        b.disabled = !hasSel;
      }
    }

    // clamp within viewport
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    ctxMenuEl.hidden = false;
    ctxMenuEl.style.left = '0px';
    ctxMenuEl.style.top = '0px';
    var rect = ctxMenuEl.getBoundingClientRect();
    var x = Math.max(8, Math.min(px, vw - rect.width - 8));
    var y = Math.max(8, Math.min(py, vh - rect.height - 8));
    ctxMenuEl.style.left = x + 'px';
    ctxMenuEl.style.top = y + 'px';
  }

  if(ctxMenuEl){
    // click actions
    ctxMenuEl.addEventListener('click', function(e){
      var t = e.target;
      if(!t || t.tagName !== 'BUTTON') return;
      var act = t.getAttribute('data-act');
      hideCtxMenu();
      if(!act) return;

      if(act==='delete' && ui && ui.btnDelete) ui.btnDelete.click();
      else if(act==='copy' && ui && ui.btnCopy) ui.btnCopy.click();
      else if(act==='paste' && ui && ui.btnPaste) ui.btnPaste.click();
      else if(act==='back' && ui && ui.btnSendBack) ui.btnSendBack.click();
      else if(act==='forward' && ui && ui.btnBringFront) ui.btnBringFront.click();
      else if(act==='toback' && ui && ui.btnToBack) ui.btnToBack.click();
      else if(act==='tofront' && ui && ui.btnToFront) ui.btnToFront.click();
      else if(act==='clear' && ui && ui.btnClearSel) ui.btnClearSel.click();
    });

    // hide on outside click / scroll / resize
    window.addEventListener('pointerdown', function(ev2){
      if(ctxMenuEl.hidden) return;
      if(ev2.target === ctxMenuEl || ctxMenuEl.contains(ev2.target)) return;
      hideCtxMenu();
    }, {passive:true});
    window.addEventListener('resize', hideCtxMenu, {passive:true});
    window.addEventListener('scroll', hideCtxMenu, {passive:true});
    window.addEventListener('keydown', function(ev2){
      if(ev2.key==='Escape') hideCtxMenu();
    }, {passive:true});
  }

  // right-click on canvas shows context menu and selects top object under cursor
  canvas.addEventListener('contextmenu', function(e){
    e.preventDefault();
    hideCtxMenu();
    var m = mousePos(e);
    var w = screenToWorld(m);

    // select hit object (top-most) if any
    var hit = pick(w);
    if(hit){
      if(state.shiftDown){
        // keep existing selection, but ensure hit is included
        if(typeof hasInSelection==='function' && !hasInSelection(hit)) toggleSelection(hit);
      } else {
        if(typeof hasInSelection==='function' && !hasInSelection(hit)) setSingleSelection(hit);
      }
      if(typeof syncPropsFromPrimary==='function') syncPropsFromPrimary();
      draw();
    } else {
      // empty -> keep selection as-is (CAD-like). If you prefer deselect on empty right click, uncomment:
      // state.selection=[]; if(typeof syncPropsFromPrimary==='function') syncPropsFromPrimary(); draw();
    }

    showCtxMenu(e.clientX, e.clientY);
  }, {passive:false});
