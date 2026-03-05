
(function(){
  try{
    var u=document.getElementById('uiUserPill');
    if(u) u.textContent = (window.localStorage.getItem('minicad_user')||'ranza.ware');
    var v=document.getElementById('uiVersionPill');
    if(v) v.textContent='CAD 2D';
    var b=document.getElementById('btnExit');
    if(b) b.onclick=function(){ alert(window.t('dialog.exitPlaceholder')); };
  }catch(e){}
})();
