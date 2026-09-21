
(function(){
  function qs(s, r){ return (r||document).querySelector(s); }
  function qsa(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  var tabs = qsa('.inspector .tabs .tab');
  var panels = {
    props: qs('#panel-props'),
    layer: qs('#panel-layer'),
    snap: qs('#panel-snap'),
    io: qs('#panel-io')
  };

  function show(name){
    tabs.forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-tab')===name);
    });
    Object.keys(panels).forEach(function(k){
      if(panels[k]) panels[k].hidden = (k!==name);
    });
  }

  tabs.forEach(function(b){
    b.addEventListener('click', function(){
      show(b.getAttribute('data-tab')||'props');
    });
  });

  show('props');
})();
