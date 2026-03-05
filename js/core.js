// ----- Helpers -----
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
  function fmt(n){ return (Math.round(n*10)/10).toFixed(1); }
  function uid(){ return Math.random().toString(16).slice(2)+Date.now().toString(16); }
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
  function hypot(x,y){ return Math.sqrt(x*x+y*y); }
  function rad(deg){ return deg*Math.PI/180; }
  function deg(r){ return r*180/Math.PI; }
  function parseDashPatternInput(raw){
    var txt=String(raw==null ? '' : raw).trim();
    if(!txt) return {dashed:false, dash:null};
    var low=txt.toLowerCase();
    if(low==='0' || low==='off' || low==='none' || low==='false' || low==='no'){
      return {dashed:false, dash:null};
    }
    // Backward compatibility with previous UI behavior.
    if(txt==='1') return {dashed:true, dash:[6,6]};
    var parts=txt.split(/[,\s;]+/);
    var dash=[];
    for(var i=0;i<parts.length;i++){
      var v=parseFloat(parts[i]);
      if(isFinite(v) && v>0) dash.push(v);
    }
    if(!dash.length) return {dashed:false, dash:null};
    if(dash.length===1) dash.push(dash[0]);
    return {dashed:true, dash:dash};
  }
  function dashPatternForStyle(style){
    if(!style || !style.dashed) return [];
    var src = Array.isArray(style.dash) ? style.dash : [6,6];
    var out=[];
    for(var i=0;i<src.length;i++){
      var v=parseFloat(src[i]);
      if(isFinite(v) && v>0) out.push(v);
    }
    if(!out.length) return [6,6];
    if(out.length===1) out.push(out[0]);
    return out;
  }
  function dashPatternTextFromStyle(style){
    var dash = dashPatternForStyle(style);
    return dash.length ? dash.join(',') : '';
  }
  function ensureImageCached(im){
    if(!im || !im.id || !im.src) return null;
    if(!state.imageCache) state.imageCache={};
    if(!state.imageLoadState) state.imageLoadState={};

    var cached=state.imageCache[im.id];
    if(cached) return cached;

    // 1=loading, 2=loaded, -1=failed (avoid retry storm on every frame)
    var st=state.imageLoadState[im.id];
    if(st===1 || st===-1) return null;

    state.imageLoadState[im.id]=1;
    var ii=new Image();
    ii.onload=function(){
      state.imageCache[im.id]=ii;
      state.imageLoadState[im.id]=2;
      if(typeof draw==='function') draw();
    };
    ii.onerror=function(){
      state.imageLoadState[im.id]=-1;
    };
    ii.src=im.src;
    return null;
  }
  function norm2pi(t){ 
    var two=Math.PI*2;
    t = t % two;
    if(t<0) t += two;
    return t;
  }
  // Signed angular difference from a0 to a1 following direction (ccw=true => positive, ccw=false => negative)
  function angleDiff(a0,a1,ccw){
    if(ccw){
      return norm2pi(a1 - a0);
    } else {
      return -norm2pi(a0 - a1);
    }
  }


  // ----- DOM -----
  var canvasStatic=document.getElementById('cStatic');
  var canvas=document.getElementById('c'); // top (interactive) canvas
  var ctxStatic=canvasStatic ? canvasStatic.getContext('2d') : null;
  var ctxDynamic=canvas.getContext('2d');
  var ctx=ctxDynamic;
  var useDualCanvas=!!canvasStatic;

  // ----- HiDPI / resize -----
  var dpr=window.devicePixelRatio||1;
  var lastDpr=dpr;
  function resizeCanvasElement(el,w,h){
    if(!el) return;
    if(el.width!==w || el.height!==h){ el.width=w; el.height=h; }
  }
  function resizeCanvasToDisplaySize(){
    var newDpr=window.devicePixelRatio||1;
    if(state && typeof state.pxPerMM==='number' && newDpr!==lastDpr){
      state.pxPerMM = state.pxPerMM * (newDpr/lastDpr);
    }
    dpr=newDpr; lastDpr=newDpr;

    var r=canvas.getBoundingClientRect();
    var w=Math.max(1, Math.round(r.width*dpr));
    var h=Math.max(1, Math.round(r.height*dpr));
    resizeCanvasElement(canvas,w,h);
    if(canvasStatic) resizeCanvasElement(canvasStatic,w,h);
  }

  var ui={
    toolLbl:document.getElementById('badgeTool'),
    status:document.getElementById('status'),
    pos:document.getElementById('pos'),
    snapLbl:document.getElementById('snap'),
    zoomLbl:document.getElementById('zoomLbl'),

    btnLine:document.getElementById('btnLine'),
    btnRect:document.getElementById('btnRect'),
    btnEllipse:document.getElementById('btnEllipse'),
    btnSelect:document.getElementById('btnSelect'),
    btnDim:document.getElementById('btnDim'),

    btnText:document.getElementById('btnText'),
    btnImg:document.getElementById('btnImg'),
    btnCmdFocus:document.getElementById('btnCmdFocus'),

    
    btnPline:document.getElementById('btnPline'),
    btnCircle:document.getElementById('btnCircle'),
	    btnArc:document.getElementById('btnArc'),
	    btnBreak:document.getElementById('btnBreak'),
	    btnKatana:document.getElementById('btnKatana'),
    btnOffset:document.getElementById('btnOffset'),
textValue:document.getElementById('textValue'),
    textSize:document.getElementById('textSize'),
    textFont:document.getElementById('textFont'),
    textAlign:document.getElementById('textAlign'),
    textSpacing:document.getElementById('textSpacing'),
    btnEditText:document.getElementById('btnEditText'),

    btnPan:document.getElementById('btnPan'),

    gridStep:document.getElementById('gridStep'),
    zoom:document.getElementById('zoom'),
    chkSnap:document.getElementById('chkSnap'),
    chkOrtho:document.getElementById('chkOrtho'),
    snapGrid:document.getElementById('snapGrid'),
    snapEnd:document.getElementById('snapEnd'),
    snapMid:document.getElementById('snapMid'),
    snapCen:document.getElementById('snapCen'),
    snapInt:document.getElementById('snapInt'),
    snapPerp:document.getElementById('snapPerp'),
    snapTan:document.getElementById('snapTan'),
    chkLockAspect:document.getElementById('chkLockAspect'),
    chkNoBg:document.getElementById('chkNoBg'),

    layerName:document.getElementById('layerName'),
    btnAddLayer:document.getElementById('btnAddLayer'),
    layers:document.getElementById('layers'),

	    selInfo:document.getElementById('selInfo'),
	    selLayer:document.getElementById('selLayer'),
	    propsSelectionSec:document.getElementById('propsSelectionSec'),
	    propsDimensionSec:document.getElementById('propsDimensionSec'),
	    propsTextSec:document.getElementById('propsTextSec'),
	    propsImageSec:document.getElementById('propsImageSec'),
	    propsHistorySec:document.getElementById('propsHistorySec'),
	    objColor:document.getElementById('objColor'),
	    chkFill:document.getElementById('chkFill'),
	    objFill:document.getElementById('objFill'),
    objFillHex:document.getElementById('objFillHex'),
    objWidth:document.getElementById('objWidth'),
    objDash:document.getElementById('objDash'),
    objRot:document.getElementById('objRot'),
    btnApplyStyle:document.getElementById('btnApplyStyle'),
    btnDelete:document.getElementById('btnDelete'),
    btnClearSel:document.getElementById('btnClearSel'),

    
    
    btnSendBack:document.getElementById('btnSendBack'),
    btnBringFront:document.getElementById('btnBringFront'),
    btnToBack:document.getElementById('btnToBack'),
    btnToFront:document.getElementById('btnToFront'),
btnCopy:document.getElementById('btnCopy'),
    btnPaste:document.getElementById('btnPaste'),
dimOffset:document.getElementById('dimOffset'),
    dimText:document.getElementById('dimText'),
    btnApplyDim:document.getElementById('btnApplyDim'),
    btnPinDim:document.getElementById('btnPinDim'),

    
    btnAddRadDim:document.getElementById('btnAddRadDim'),
	    btnUndo:document.getElementById('btnUndo'),
	    btnRedo:document.getElementById('btnRedo'),
	    btnClear:document.getElementById('btnClear'),

	    
	    btnSaveAutosave:document.getElementById('btnSaveAutosave'),
	    btnRestoreAutosave:document.getElementById('btnRestoreAutosave'),
	btnExportJSON:document.getElementById('btnExportJSON'),
    btnExportSVG:document.getElementById('btnExportSVG'),
    btnExportDXF:document.getElementById('btnExportDXF'),
    btnExportSelPNG:document.getElementById('btnExportSelPNG'),
    btnImportJSON:document.getElementById('btnImportJSON'),
    fileImport:document.getElementById('fileImport'),

    cmd:document.getElementById('cmd'),
    btnCancelCmd:document.getElementById('btnCancelCmd'),

    btnAddImage:document.getElementById('btnAddImage'),
    btnFitImage:document.getElementById('btnFitImage'),
    fileImage:document.getElementById('fileImage')
  };

  // ----- State -----
  var state={
    tool:'line',
    offsetRef:null,
    offsetDist:10,
    offsetPreview:null,
    pxPerMM:5,
    panMM:{x:0,y:0},
    gridStepMM:1,
    snap:true,
    snapModes:{grid:false,end:true,mid:true,cen:true,int:true,perp:false,tan:true},
    ortho:false,
    lockAspect:true,
    exportNoBg:false,

    layers:{'Layer 1':{visible:true,color:'#111827',locked:false}},
    activeLayer:'Layer 1',

    segments:[], // {id,a,b,layer,style}
    rects:[],    // {id,x,y,w,h,rot,layer,style} (x,y=top-left in local before rotation? we store center-based for easier: cx,cy,w,h,rot)
    ellipses:[], // {id,cx,cy,rx,ry,rot,layer,style}
    dims:[],     // {id,a,b,offsetMM,textMM,layer,style}
    images:[],
    texts:[], // {id,x,y,text,sizeMM,font,align,rot,layer,style}
   // {id,cx,cy,w,h,rot,src,layer,opacity,aspect}
    imageCache:{},
    imageLoadState:{},

    

    polylines:[],
    arcs:[],
    radDims:[],
    zOrder:[],
    clipboard:null,
    dirty:false,
selection:[], // array of {type,id}
    hoverSnap:null,
    hotGrip:null,
    cursorMM:{x:0,y:0},

    lineStart:null,
    rectStart:null,
    ellStart:null,
    dimFirst:null,

    
    plinePts:null,
    circleCenter:null,
    arcPts:null,

    cutStart:null,
drag:null,
    spacePan:false,
    ctrlDown:false,
    shiftDown:false,
    rotateMode:false, // toggled by 'r' key while dragging rotate grip

    selBox:null, // {a,b} in world

    hist:[],
    histIndex:-1,

    styleDraft:{stroke:'#111827', width:1, dashed:false}
  };

  // ----- Transforms -----
  function worldToScreen(p){ return { x:(p.x-state.panMM.x)*state.pxPerMM, y:(p.y-state.panMM.y)*state.pxPerMM }; }
  function screenToWorld(p){ return { x:p.x/state.pxPerMM+state.panMM.x, y:p.y/state.pxPerMM+state.panMM.y }; }
  function mousePos(e){
    var r=canvas.getBoundingClientRect();
    return { x:(e.clientX-r.left)*dpr, y:(e.clientY-r.top)*dpr };
  }

  // ----- Ortho 0/45/90 -----
  function effectiveOrtho(){
    var o=state.ortho;
    if(state.shiftDown) o=!o;
    return o;
  }
  function applyOrtho45(a,b){
    var dx=b.x-a.x, dy=b.y-a.y;
    var len=hypot(dx,dy);
    if(len<1e-9) return {x:b.x,y:b.y};
    var ang=Math.atan2(dy,dx);
    var step=Math.PI/4; // 45°
    var snap=Math.round(ang/step)*step;
    return { x:a.x + Math.cos(snap)*len, y:a.y + Math.sin(snap)*len };
  }

  
