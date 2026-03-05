
(function(){
  var chk=document.getElementById('chkFill');
  var col=document.getElementById('objFill');
  var hex=document.getElementById('objFillHex');
  var row=document.getElementById('fillRow');
  if(!chk || !col || !hex) return;

  function normHex(v){
    v=(v||'').trim();
    if(v && v[0]!=='#') v='#'+v;
    return v;
  }
  function syncEnabled(){
    var on=!!chk.checked;
    col.disabled=!on;
    hex.disabled=!on;
    if(row) row.style.opacity = on ? '1' : '.45';
  }
  function syncHexFromColor(){ hex.value=(col.value||'#000000').toUpperCase(); }

  chk.addEventListener('change', syncEnabled);
  col.addEventListener('input', syncHexFromColor);
  hex.addEventListener('change', function(){
    var v=normHex(hex.value);
    if(/^#([0-9a-f]{6})$/i.test(v)){
      col.value=v;
      hex.value=v.toUpperCase();
    } else {
      syncHexFromColor();
    }
  });

  // init
  syncHexFromColor();
  syncEnabled();
})();
