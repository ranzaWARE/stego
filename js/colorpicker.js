
// Circular color picker (simple HSV wheel: angle=hue, radius=saturation, slider=value)
(function(){
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }

  // Shared modal elements
  var back=document.getElementById('colorBackdrop');
  var wheel=document.getElementById('colorWheel');
  var val=document.getElementById('colorValue');
  var ok=document.getElementById('btnColorOk');
  var cancel=document.getElementById('btnColorCancel');

  if(!back || !wheel || !val || !ok || !cancel) return;

  // Targets (stroke + fill)
  function byId(id){ return document.getElementById(id); }

  var targets = {
    stroke: {
      native: byId('objColor'),
      hex: byId('objColorHex'),
      swatches: [byId('colorSwatch'), byId('dockStrokeSwatch'), byId('dockStrokeBox')]
    },
    fill: {
      native: byId('objFill'),
      hex: byId('objFillHex'),
      swatches: [byId('dockFillSwatch'), byId('dockFillBox')]
    }
  };

  // Optional: if you later add a fill swatch in inspector, you can push it in swatches[]
  // Normalize swatches list (remove nulls)
  Object.keys(targets).forEach(function(k){
    targets[k].swatches = (targets[k].swatches||[]).filter(function(x){ return !!x; });
  });

  var ctx=wheel.getContext('2d');
  var R=wheel.width/2;

  var currentKind='stroke';
  var lastCommitted = '#111827';
  var picking=false;

  function hsvToRgb(h,s,v){
    var c=v*s; var x=c*(1-Math.abs((h/60)%2-1)); var m=v-c;
    var r=0,g=0,b=0;
    if(h<60){ r=c; g=x; b=0; }
    else if(h<120){ r=x; g=c; b=0; }
    else if(h<180){ r=0; g=c; b=x; }
    else if(h<240){ r=0; g=x; b=c; }
    else if(h<300){ r=x; g=0; b=c; }
    else { r=c; g=0; b=x; }
    return {r:Math.round((r+m)*255), g:Math.round((g+m)*255), b:Math.round((b+m)*255)};
  }
  function rgbToHex(r,g,b){
    function h(n){ var s=n.toString(16); return s.length===1?('0'+s):s; }
    return '#'+h(r)+h(g)+h(b);
  }
  function hexToRgb(hex){
    var m=/^#?([0-9a-f]{6})$/i.exec((hex||'').trim());
    if(!m) return null;
    var n=parseInt(m[1],16);
    return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
  }

  function setSwatches(kind, hex){
    (targets[kind].swatches||[]).forEach(function(el){
      // if it's the inner box, set background; if it's a button, also set a child box if present
      if(el.classList && el.classList.contains('dockColorBox')) el.style.background = hex;
      else if(el.tagName==='BUTTON') {
        // find .dockColorBox inside
        var box = el.querySelector('.dockColorBox');
        if(box) box.style.background = hex;
      } else {
        el.style.background = hex;
      }
    });
  }

  function setColor(hex, commit){
    var t=targets[currentKind];
    if(!t || !t.native || !t.hex) return;

    t.native.value = hex;
    t.hex.value = hex.toUpperCase();
    setSwatches(currentKind, hex);

    // If we're editing stroke, keep the original swatch (colorSwatch) in sync
    if(currentKind==='stroke'){
      var sw=byId('colorSwatch');
      if(sw) sw.style.background = hex;
    }

    if(commit) lastCommitted = hex;
    // Fire input event so app reacts if it listens
    try{
      var ev=new Event('input', {bubbles:true});
      t.native.dispatchEvent(ev);
    }catch(_){}
  }

  function openModal(kind){
    kind = (kind==='fill') ? 'fill' : 'stroke';
    currentKind = kind;

    var t=targets[currentKind];
    if(!t || !t.native) return;

    lastCommitted = t.native.value || lastCommitted || '#111827';

    back.classList.add('open');
    back.style.display='flex';

    drawWheel();
  }

  function closeModal(){
    back.classList.remove('open');
    back.style.display='none';
  }

  function drawWheel(){
    var v=clamp(parseInt(val.value,10)/100,0,1);
    var img=ctx.createImageData(wheel.width,wheel.height);
    for(var y=0;y<wheel.height;y++){
      for(var x=0;x<wheel.width;x++){
        var dx=x-R, dy=y-R;
        var rr=Math.sqrt(dx*dx+dy*dy);
        var idx=(y*wheel.width+x)*4;
        if(rr>R){ img.data[idx+3]=0; continue; }
        var sat=rr/R;
        var ang=Math.atan2(dy,dx);
        var hue=(ang*180/Math.PI+360)%360;
        var rgb=hsvToRgb(hue,sat,v);
        img.data[idx]=rgb.r; img.data[idx+1]=rgb.g; img.data[idx+2]=rgb.b; img.data[idx+3]=255;
      }
    }
    ctx.putImageData(img,0,0);
  }

  function pickFromEvent(ev){
    var rect=wheel.getBoundingClientRect();
    var x=clamp(ev.clientX-rect.left, 0, rect.width);
    var y=clamp(ev.clientY-rect.top, 0, rect.height);
    var cx=(x/rect.width)*wheel.width;
    var cy=(y/rect.height)*wheel.height;
    var dx=cx-R, dy=cy-R;
    var rr=Math.sqrt(dx*dx+dy*dy);
    if(rr>R) return;
    var sat=rr/R;
    var ang=Math.atan2(dy,dx);
    var hue=(ang*180/Math.PI+360)%360;
    var v=clamp(parseInt(val.value,10)/100,0,1);
    var rgb=hsvToRgb(hue,sat,v);
    setColor(rgbToHex(rgb.r,rgb.g,rgb.b), false);
  }

  // Wire up existing stroke swatch + new dock swatches
  var dockStroke=byId('dockStrokeSwatch');
  var dockFill=byId('dockFillSwatch');
  var strokeSw=byId('colorSwatch');

  if(strokeSw){
    strokeSw.addEventListener('click', function(){ openModal('stroke'); });
    strokeSw.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openModal('stroke'); } });
  }
  if(dockStroke){
    dockStroke.addEventListener('click', function(){ openModal('stroke'); });
    dockStroke.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openModal('stroke'); } });
  }
  if(dockFill){
    dockFill.addEventListener('click', function(){ openModal('fill'); });
    dockFill.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openModal('fill'); } });
  }

  back.addEventListener('click', function(){ closeModal(); setColor(lastCommitted,true); });
  cancel.addEventListener('click', function(){ closeModal(); setColor(lastCommitted,true); });
  ok.addEventListener('click', function(){ closeModal(); setColor(targets[currentKind].native.value,true); });

  val.addEventListener('input', function(){ drawWheel(); });

  wheel.addEventListener('mousedown', function(e){ picking=true; pickFromEvent(e); });
  window.addEventListener('mousemove', function(e){ if(picking) pickFromEvent(e); });
  window.addEventListener('mouseup', function(){ picking=false; });

  // Hex inputs: allow manual edit (stroke + fill)
  function wireHex(kind){
    var t=targets[kind];
    if(!t || !t.hex || !t.native) return;
    t.hex.addEventListener('change', function(){
      currentKind = kind;
      var v=(t.hex.value||'').trim();
      if(v && v[0] !== '#') v='#'+v;
      if(/^#([0-9a-f]{6})$/i.test(v)) setColor(v,true);
      else t.hex.value=(t.native.value||lastCommitted).toUpperCase();
    });
    t.native.addEventListener('input', function(){
      currentKind = kind;
      setSwatches(kind, t.native.value);
      t.hex.value=(t.native.value||'').toUpperCase();
    });
  }
  wireHex('stroke');
  wireHex('fill');

  // Init swatches from current inputs
  if(targets.stroke.native) setSwatches('stroke', targets.stroke.native.value || '#111827');
  if(targets.fill.native) setSwatches('fill', targets.fill.native.value || '#ffd166');
})();
