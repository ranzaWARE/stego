(function(){
  var STORAGE_KEY = 'stego_lang';
  var TRANSLATIONS = {
    it: {
      'common.on': 'on',
      'common.off': 'off',
      'header.language.label': 'Lingua',
      'header.user': 'Utente',
      'tool.select.title': 'Selezione (V)',
      'tool.line.title': 'Linea (L)',
      'tool.rect.title': 'Rettangolo (R)',
      'tool.ellipse.title': 'Ellisse (E)',
      'tool.circle.title': 'Cerchio (C)',
      'tool.arc.title': 'Arco (A)',
      'tool.polyline.title': 'Polilinea (P)',
      'tool.break.title': 'Spezza (un click)',
      'tool.katana.title': 'Katana (2 punti)',
      'tool.offset.title': 'Offset',
      'tool.dimension.title': 'Quota (D)',
      'tool.text.title': 'Testo (T)',
      'tool.image.title': 'Immagine',
      'tool.pan.title': 'Pan (Spazio)',
      'tool.commandFocus.title': 'Focus comando',
      'tooldock.aria': 'Strumenti',
      'dock.colors.aria': 'Colori',
      'dock.stroke.title': 'Colore linea',
      'dock.fill.title': 'Colore riempimento',
      'canvas.unsupported': 'Canvas non supportato',
      'inspector.aria': 'Pannello proprieta',
      'tab.properties': 'Proprieta',
      'tab.layers': 'Layer',
      'tab.snap': 'Snap / Griglia',
      'tab.io': 'Export / Import',
	      'section.selection': 'Selezione',
	      'selection.geometry': 'Geometria',
	      'selection.appearance': 'Aspetto',
	      'selection.actions': 'Azioni',
	      'selection.order': 'Ordine',
	      'selection.clipboard': 'Clipboard',
	      'selection.none': 'Nessuna selezione',
	      'selection.count': '{count} oggetto(i) selezionato(i)',
      'prop.layer': 'Layer',
      'prop.lineWidth': 'Spessore',
      'prop.dash': 'Dash',
      'prop.dashPlaceholder': 'es: 6,4',
      'prop.rotation': 'Rotazione (deg)',
      'prop.color': 'Colore',
      'prop.openColorPicker': 'Apri color picker',
      'prop.fill': 'Riempimento',
      'action.apply': 'Applica',
      'action.delete': 'Elimina',
      'action.deselectShort': 'Deselez.',
      'action.sendBack': 'Indietro',
      'action.sendBack.title': 'Porta indietro (stesso tipo)',
      'action.bringFront': 'Avanti',
      'action.bringFront.title': 'Porta avanti (stesso tipo)',
      'action.toBack': 'In fondo',
      'action.toBack.title': 'Porta in fondo (stesso tipo)',
      'action.toFront': 'Primo piano',
      'action.toFront.title': 'Porta in primo piano (stesso tipo)',
      'action.copy': 'Copia',
      'action.paste': 'Incolla',
      'section.dimensions': 'Quote',
      'dimension.offset': 'Offset',
      'dimension.text': 'Testo',
      'action.applyDimension': 'Applica quota',
      'action.pin': 'Pin',
      'action.radial': 'Radiale',
      'section.text': 'Testo',
      'text.content': 'Contenuto',
      'text.placeholder': 'Testo',
      'text.size': 'Dimensione',
      'text.alignment': 'Allineamento',
      'text.align.left': 'Sinistra',
      'text.align.center': 'Centro',
      'text.align.right': 'Destra',
      'text.spacing': 'Spaziatura (mm)',
      'text.font': 'Font',
      'action.edit': 'Modifica',
      'section.images': 'Immagini',
      'action.upload': 'Carica',
      'action.fit': 'Adatta',
      'image.lockAspect': 'Blocca proporzioni',
	      'section.history': 'Storico',
	      'action.clear': 'Pulisci',
	      'section.autosave': 'Autosave',
	      'action.saveAutosave': 'Salva autosave',
	      'action.restoreAutosave': 'Ripristina autosave',
	      'autosave.help': 'Snapshot locale rapido del disegno corrente.',
	      'section.layers': 'Layer',
      'layer.name.placeholder': 'Nome layer',
      'action.add': 'Aggiungi',
      'section.snapGrid': 'Snap e griglia',
      'snap.types': 'Tipi di snap',
      'snap.grid': 'Griglia',
      'snap.endpoint': 'Endpoint',
      'snap.midpoint': 'Midpoint',
      'snap.center': 'Centro',
      'snap.intersection': 'Intersezione',
      'snap.perpendicular': 'Perpendicolare',
      'snap.tangent': 'Tangente',
      'snap.tip': 'Suggerimento: se lo snap prende troppo, disattiva Perpendicolare o Tangente.',
      'grid.step': 'Griglia (mm)',
      'zoom.pxPerMm': 'Zoom (px/mm)',
      'section.project': 'Progetto',
      'project.save': 'Salva progetto',
      'project.load': 'Carica progetto',
      'project.help': 'Salva/carica disegno completo (oggetti, layer, impostazioni).',
      'section.export': 'Export',
      'export.pngSelection': 'PNG selezione',
      'export.transparentBg': 'PNG senza sfondo',
      'status.ready': 'Pronto',
      'hud.snap': 'Snap: {state}{inverted}',
      'hud.inverted': ' (inv)',
      'hud.zoom': 'Zoom: {value} px/mm',
      'command.label': 'Comando:',
      'command.placeholder': 'Es: 10,20  oppure  @50,0  (Invio = conferma punto)',
      'action.cancel': 'Annulla',
      'modal.colorPicker': 'Color picker',
      'modal.brightness': 'Luminosita',
      'ctx.delete': 'Elimina',
      'ctx.copy': 'Copia',
      'ctx.paste': 'Incolla',
      'ctx.back': 'Indietro',
      'ctx.forward': 'Avanti',
      'ctx.toBack': 'In fondo',
      'ctx.toFront': 'Primo piano',
      'ctx.clear': 'Deseleziona',
      'layer.toggleVisibility.title': 'Mostra/Nascondi layer',
      'layer.toggleLock.title': 'Blocca layer (no select/edit)',
      'layer.color.title': 'Colore layer',
      'layer.delete.title': 'Elimina layer',
      'dialog.editText': 'Modifica testo:',
      'dialog.insertText': 'Testo da inserire:',
      'dialog.text': 'Testo:',
      'dialog.deleteLayerConfirm': 'Eliminare il layer "{layerName}"?\nATTENZIONE: tutti gli oggetti su questo layer verranno ELIMINATI.',
      'dialog.restoreAutosaveFound': 'Trovato autosave. Ripristinare?',
      'dialog.restoreAutosave': 'Ripristinare autosave?',
      'dialog.resetDrawing': 'Reset disegno?',
      'dialog.exitPlaceholder': 'Uscita (placeholder)',
      'status.ok': 'OK',
      'status.pinch': 'PINCH: zoom/pan',
      'status.panDrag': 'PAN: trascina',
      'status.rotationDrag': 'Rotazione: trascina',
      'status.gripEdit': 'Grip: modifica',
      'status.moveDrag': 'Move: trascina',
      'status.boxSelection': 'Box selection: trascina',
      'status.lockedLayerEditText': 'Layer bloccato: non puoi modificare il testo',
      'status.textUpdated': 'Testo aggiornato',
      'status.nothingToExport': 'Niente da esportare',
      'status.noSelection': 'Nessuna selezione',
      'status.invalidSelection': 'Selezione non valida',
      'status.pngExported': 'PNG esportato',
      'status.importOk': 'Import OK',
      'status.importError': 'Errore import',
      'status.dynamicRenderError': 'Errore render dinamico: {message}',
      'status.renderError': 'Errore render: {message}',
      'status.breakIntro': 'SPEZZA: clicca un oggetto nel punto in cui vuoi spezzarlo',
      'status.katanaIntro': 'KATANA: clicca 2 punti per tagliare',
      'status.offsetIntro': 'OFFSET: click oggetto, poi click lato (distanza da comando o default 10)',
      'status.cannotDeleteLastLayer': 'Non puoi eliminare l\'ultimo layer',
      'status.layerDeleted': 'Layer e contenuto eliminati',
      'status.enterLayerName': 'Inserisci nome layer',
      'status.layerExists': 'Layer gia esistente',
      'status.projectSaved': 'Progetto salvato',
      'status.projectSaveError': 'Errore salvataggio progetto',
      'status.projectLoadRestoreMissing': 'Errore caricamento: restore non disponibile',
      'status.projectLoaded': 'Progetto caricato',
      'status.projectLoadError': 'Errore caricamento progetto',
      'status.offsetDistance': 'OFFSET distanza: {distance} mm (clic oggetto, poi lato)',
      'status.invalidCoordinates': 'Coordinate non valide. Usa "x,y" o "@dx,dy" (o un numero per OFFSET).',
      'status.imageInserted': 'Immagine inserita',
      'status.selectImage': 'Seleziona un\'immagine',
      'status.imageFitted': 'Immagine adattata',
      'status.cancelled': 'Annullato',
      'status.enterText': 'Inserisci un testo',
      'status.textInserted': 'Testo inserito',
      'status.unlockLayerForText': 'Layer bloccato: sblocca il layer per inserire testo',
      'status.offsetLockedLayer': 'Layer bloccato: impossibile creare offset su layer bloccato',
      'status.propertiesAppliedPartial': 'Proprieta applicate (alcuni oggetti bloccati ignorati)',
      'status.propertiesApplied': 'Proprieta applicate',
      'status.copiedCount': 'Copiato ({count})',
      'status.emptyClipboard': 'Clipboard vuota',
      'status.pasted': 'Incollato',
      'status.selectText': 'Seleziona un testo',
      'status.deleted': 'Eliminato',
      'status.selectDimension': 'Seleziona una quota',
      'status.dimensionUpdated': 'Quota aggiornata',
      'status.selectCircle': 'Seleziona un cerchio',
      'status.selectCircleRxRy': 'Seleziona un cerchio (rx=ry)',
      'status.radialDimensionAdded': 'Quota R aggiunta',
      'status.dimensionPinnedPlaceholder': 'Quota fissata (placeholder)',
	      'status.undo': 'Undo',
	      'status.redo': 'Redo',
	      'status.autosaveSaved': 'Autosave salvato',
	      'status.noAutosave': 'Nessun autosave',
	      'status.autosaveRestored': 'Autosave ripristinato',
      'status.katanaPickSecond': 'KATANA: scegli secondo punto',
      'status.cutObjectsCount': 'Taglio: {count} oggetto(i) spezzato(i)',
      'status.cutNoIntersection': 'Taglio: nessuna intersezione',
      'status.breakPickObject': 'SPEZZA: clicca un oggetto',
      'status.breakLockedLayer': 'SPEZZA: oggetto su layer bloccato',
      'status.breakInvalidPoint': 'SPEZZA: punto non valido (vicino a estremi?)',
      'status.offsetPickObject': 'OFFSET: clicca un oggetto (linea, polilinea, cerchio, arco)',
      'status.offsetLockedObject': 'OFFSET: oggetto su layer bloccato',
      'status.offsetChooseSide': 'OFFSET: scegli lato (distanza {distance} mm)',
      'status.linePickEnd': 'Linea: scegli punto finale',
      'status.rectPickOpposite': 'Rettangolo: scegli angolo opposto',
      'status.ellipsePickOpposite': 'Ellisse: scegli angolo opposto',
      'status.polylineAddPoints': 'Polilinea: aggiungi punti (Doppio click o Esc per finire)',
      'status.circlePickRadius': 'Cerchio: scegli raggio',
      'status.arcPickSecond': 'Arco: scegli secondo punto',
      'status.arcPickThird': 'Arco: scegli terzo punto',
      'status.invalidArc': 'Arco non valido',
      'status.dimensionPickSecond': 'Quota: scegli secondo punto'
    },
    en: {
      'common.on': 'on',
      'common.off': 'off',
      'header.language.label': 'Language',
      'header.user': 'User',
      'tool.select.title': 'Select (V)',
      'tool.line.title': 'Line (L)',
      'tool.rect.title': 'Rectangle (R)',
      'tool.ellipse.title': 'Ellipse (E)',
      'tool.circle.title': 'Circle (C)',
      'tool.arc.title': 'Arc (A)',
      'tool.polyline.title': 'Polyline (P)',
      'tool.break.title': 'Break (single click)',
      'tool.katana.title': 'Katana (2 points)',
      'tool.offset.title': 'Offset',
      'tool.dimension.title': 'Dimension (D)',
      'tool.text.title': 'Text (T)',
      'tool.image.title': 'Image',
      'tool.pan.title': 'Pan (Space)',
      'tool.commandFocus.title': 'Command focus',
      'tooldock.aria': 'Tools',
      'dock.colors.aria': 'Colors',
      'dock.stroke.title': 'Stroke color',
      'dock.fill.title': 'Fill color',
      'canvas.unsupported': 'Canvas not supported',
      'inspector.aria': 'Properties panel',
      'tab.properties': 'Properties',
      'tab.layers': 'Layers',
      'tab.snap': 'Snap / Grid',
      'tab.io': 'Export / Import',
	      'section.selection': 'Selection',
	      'selection.geometry': 'Geometry',
	      'selection.appearance': 'Appearance',
	      'selection.actions': 'Actions',
	      'selection.order': 'Order',
	      'selection.clipboard': 'Clipboard',
	      'selection.none': 'No selection',
	      'selection.count': '{count} selected object(s)',
      'prop.layer': 'Layer',
      'prop.lineWidth': 'Width',
      'prop.dash': 'Dash',
      'prop.dashPlaceholder': 'e.g. 6,4',
      'prop.rotation': 'Rotation (deg)',
      'prop.color': 'Color',
      'prop.openColorPicker': 'Open color picker',
      'prop.fill': 'Fill',
      'action.apply': 'Apply',
      'action.delete': 'Delete',
      'action.deselectShort': 'Deselect',
      'action.sendBack': 'Back',
      'action.sendBack.title': 'Send backward (same type)',
      'action.bringFront': 'Forward',
      'action.bringFront.title': 'Bring forward (same type)',
      'action.toBack': 'To back',
      'action.toBack.title': 'Send to back (same type)',
      'action.toFront': 'To front',
      'action.toFront.title': 'Bring to front (same type)',
      'action.copy': 'Copy',
      'action.paste': 'Paste',
      'section.dimensions': 'Dimensions',
      'dimension.offset': 'Offset',
      'dimension.text': 'Text',
      'action.applyDimension': 'Apply dim',
      'action.pin': 'Pin',
      'action.radial': 'Radial',
      'section.text': 'Text',
      'text.content': 'Content',
      'text.placeholder': 'Text',
      'text.size': 'Size',
      'text.alignment': 'Alignment',
      'text.align.left': 'Left',
      'text.align.center': 'Center',
      'text.align.right': 'Right',
      'text.spacing': 'Spacing (mm)',
      'text.font': 'Font',
      'action.edit': 'Edit',
      'section.images': 'Images',
      'action.upload': 'Upload',
      'action.fit': 'Fit',
      'image.lockAspect': 'Lock aspect',
	      'section.history': 'History',
	      'action.clear': 'Clear',
	      'section.autosave': 'Autosave',
	      'action.saveAutosave': 'Save autosave',
	      'action.restoreAutosave': 'Restore autosave',
	      'autosave.help': 'Quick local snapshot of the current drawing.',
	      'section.layers': 'Layers',
      'layer.name.placeholder': 'Layer name',
      'action.add': 'Add',
      'section.snapGrid': 'Snap and grid',
      'snap.types': 'Snap types',
      'snap.grid': 'Grid',
      'snap.endpoint': 'Endpoint',
      'snap.midpoint': 'Midpoint',
      'snap.center': 'Center',
      'snap.intersection': 'Intersection',
      'snap.perpendicular': 'Perpendicular',
      'snap.tangent': 'Tangent',
      'snap.tip': 'Tip: if snap grabs too much, disable Perpendicular or Tangent.',
      'grid.step': 'Grid (mm)',
      'zoom.pxPerMm': 'Zoom (px/mm)',
      'section.project': 'Project',
      'project.save': 'Save project',
      'project.load': 'Load project',
      'project.help': 'Save/load the full drawing (objects, layers, settings).',
      'section.export': 'Export',
      'export.pngSelection': 'Selection PNG',
      'export.transparentBg': 'PNG without background',
      'status.ready': 'Ready',
      'hud.snap': 'Snap: {state}{inverted}',
      'hud.inverted': ' (inv)',
      'hud.zoom': 'Zoom: {value} px/mm',
      'command.label': 'Command:',
      'command.placeholder': 'Ex: 10,20  or  @50,0  (Enter = confirm point)',
      'action.cancel': 'Cancel',
      'modal.colorPicker': 'Color picker',
      'modal.brightness': 'Brightness',
      'ctx.delete': 'Delete',
      'ctx.copy': 'Copy',
      'ctx.paste': 'Paste',
      'ctx.back': 'Back',
      'ctx.forward': 'Forward',
      'ctx.toBack': 'To back',
      'ctx.toFront': 'To front',
      'ctx.clear': 'Deselect',
      'layer.toggleVisibility.title': 'Show/Hide layer',
      'layer.toggleLock.title': 'Lock layer (no select/edit)',
      'layer.color.title': 'Layer color',
      'layer.delete.title': 'Delete layer',
      'dialog.editText': 'Edit text:',
      'dialog.insertText': 'Text to insert:',
      'dialog.text': 'Text:',
      'dialog.deleteLayerConfirm': 'Delete layer "{layerName}"?\nWARNING: all objects on this layer will be DELETED.',
      'dialog.restoreAutosaveFound': 'Autosave found. Restore it?',
      'dialog.restoreAutosave': 'Restore autosave?',
      'dialog.resetDrawing': 'Reset drawing?',
      'dialog.exitPlaceholder': 'Exit (placeholder)',
      'status.ok': 'OK',
      'status.pinch': 'PINCH: zoom/pan',
      'status.panDrag': 'PAN: drag',
      'status.rotationDrag': 'Rotation: drag',
      'status.gripEdit': 'Grip: edit',
      'status.moveDrag': 'Move: drag',
      'status.boxSelection': 'Box selection: drag',
      'status.lockedLayerEditText': 'Locked layer: you cannot edit text',
      'status.textUpdated': 'Text updated',
      'status.nothingToExport': 'Nothing to export',
      'status.noSelection': 'No selection',
      'status.invalidSelection': 'Invalid selection',
      'status.pngExported': 'PNG exported',
      'status.importOk': 'Import OK',
      'status.importError': 'Import error',
      'status.dynamicRenderError': 'Dynamic render error: {message}',
      'status.renderError': 'Render error: {message}',
      'status.breakIntro': 'BREAK: click an object where you want to split it',
      'status.katanaIntro': 'KATANA: click 2 points to cut',
      'status.offsetIntro': 'OFFSET: click object, then side (distance from command or default 10)',
      'status.cannotDeleteLastLayer': 'You cannot delete the last layer',
      'status.layerDeleted': 'Layer and content deleted',
      'status.enterLayerName': 'Enter layer name',
      'status.layerExists': 'Layer already exists',
      'status.projectSaved': 'Project saved',
      'status.projectSaveError': 'Project save error',
      'status.projectLoadRestoreMissing': 'Load error: restore unavailable',
      'status.projectLoaded': 'Project loaded',
      'status.projectLoadError': 'Project load error',
      'status.offsetDistance': 'OFFSET distance: {distance} mm (click object, then side)',
      'status.invalidCoordinates': 'Invalid coordinates. Use "x,y" or "@dx,dy" (or a number for OFFSET).',
      'status.imageInserted': 'Image inserted',
      'status.selectImage': 'Select an image',
      'status.imageFitted': 'Image fitted',
      'status.cancelled': 'Cancelled',
      'status.enterText': 'Enter text',
      'status.textInserted': 'Text inserted',
      'status.unlockLayerForText': 'Locked layer: unlock the layer to insert text',
      'status.offsetLockedLayer': 'Locked layer: cannot create offset on a locked layer',
      'status.propertiesAppliedPartial': 'Properties applied (some locked objects skipped)',
      'status.propertiesApplied': 'Properties applied',
      'status.copiedCount': 'Copied ({count})',
      'status.emptyClipboard': 'Clipboard is empty',
      'status.pasted': 'Pasted',
      'status.selectText': 'Select a text object',
      'status.deleted': 'Deleted',
      'status.selectDimension': 'Select a dimension',
      'status.dimensionUpdated': 'Dimension updated',
      'status.selectCircle': 'Select a circle',
      'status.selectCircleRxRy': 'Select a circle (rx=ry)',
      'status.radialDimensionAdded': 'Radial dimension added',
      'status.dimensionPinnedPlaceholder': 'Dimension pinned (placeholder)',
	      'status.undo': 'Undo',
	      'status.redo': 'Redo',
	      'status.autosaveSaved': 'Autosave saved',
	      'status.noAutosave': 'No autosave',
	      'status.autosaveRestored': 'Autosave restored',
      'status.katanaPickSecond': 'KATANA: choose second point',
      'status.cutObjectsCount': 'Cut: {count} object(s) split',
      'status.cutNoIntersection': 'Cut: no intersection',
      'status.breakPickObject': 'BREAK: click an object',
      'status.breakLockedLayer': 'BREAK: object is on a locked layer',
      'status.breakInvalidPoint': 'BREAK: invalid point (too close to ends?)',
      'status.offsetPickObject': 'OFFSET: click an object (line, polyline, circle, arc)',
      'status.offsetLockedObject': 'OFFSET: object is on a locked layer',
      'status.offsetChooseSide': 'OFFSET: choose side (distance {distance} mm)',
      'status.linePickEnd': 'Line: choose end point',
      'status.rectPickOpposite': 'Rectangle: choose opposite corner',
      'status.ellipsePickOpposite': 'Ellipse: choose opposite corner',
      'status.polylineAddPoints': 'Polyline: add points (double click or Esc to finish)',
      'status.circlePickRadius': 'Circle: choose radius',
      'status.arcPickSecond': 'Arc: choose second point',
      'status.arcPickThird': 'Arc: choose third point',
      'status.invalidArc': 'Invalid arc',
      'status.dimensionPickSecond': 'Dimension: choose second point'
    }
  };

  var TOOL_LABELS = {
    it: {
      line: 'LINE',
      rect: 'RECT',
      ell: 'ELLISSE',
      select: 'SELEZ.',
      dim: 'QUOTA',
      text: 'TESTO',
      pline: 'PLINE',
      circle: 'CERCHIO',
      arc3: 'ARCO',
      break: 'SPEZZA',
      katana: 'KATANA',
      offset: 'OFFSET',
      pan: 'PAN'
    },
    en: {
      line: 'LINE',
      rect: 'RECT',
      ell: 'ELLIPSE',
      select: 'SELECT',
      dim: 'DIM',
      text: 'TEXT',
      pline: 'POLY',
      circle: 'CIRCLE',
      arc3: 'ARC',
      break: 'BREAK',
      katana: 'KATANA',
      offset: 'OFFSET',
      pan: 'PAN'
    }
  };

  function formatTemplate(template, vars){
    return String(template).replace(/\{(\w+)\}/g, function(_, key){
      return vars && vars[key] != null ? String(vars[key]) : '';
    });
  }

  function isSupportedLanguage(lang){
    return Object.prototype.hasOwnProperty.call(TRANSLATIONS, lang);
  }

  function getInitialLanguage(){
    try{
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (isSupportedLanguage(saved)) return saved;
    }catch(_){}
    return 'it';
  }

  var currentLang = getInitialLanguage();

  function t(key, vars){
    var table = TRANSLATIONS[currentLang] || TRANSLATIONS.it;
    var fallback = TRANSLATIONS.it;
    var template = table[key];
    if (template == null) template = fallback[key];
    if (template == null) template = key;
    return formatTemplate(template, vars);
  }

  function applyTranslations(root){
    var scope = root || document;
    document.documentElement.lang = currentLang;

    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n]'), function(el){
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-title]'), function(el){
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-placeholder]'), function(el){
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-aria-label]'), function(el){
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });

    var langSelect = document.getElementById('langSelect');
    if (langSelect) langSelect.value = currentLang;
  }

  function translateToolLabel(tool){
    var map = TOOL_LABELS[currentLang] || TOOL_LABELS.it;
    return map[tool] || String(tool || '').toUpperCase();
  }

  function formatSnapLabel(enabled, inverted){
    return t('hud.snap', {
      state: t(enabled ? 'common.on' : 'common.off'),
      inverted: inverted ? t('hud.inverted') : ''
    });
  }

  function formatZoomLabel(value){
    return t('hud.zoom', {
      value: Math.round((value || 0) * 10) / 10
    });
  }

  function formatSelectionInfo(count){
    return count ? t('selection.count', { count: count }) : t('selection.none');
  }

  function setAppLanguage(lang){
    if (!isSupportedLanguage(lang)) lang = 'it';
    currentLang = lang;
    try{
      window.localStorage.setItem(STORAGE_KEY, currentLang);
    }catch(_){}

    applyTranslations(document);

    if (window.ui && window.state && window.ui.toolLbl) {
      window.ui.toolLbl.textContent = translateToolLabel(window.state.tool);
    }
    if (typeof window.refreshUI === 'function') window.refreshUI();
    if (typeof window.draw === 'function') window.draw();
  }

  window.t = t;
  window.translateToolLabel = translateToolLabel;
  window.formatSnapLabel = formatSnapLabel;
  window.formatZoomLabel = formatZoomLabel;
  window.formatSelectionInfo = formatSelectionInfo;
  window.setAppLanguage = setAppLanguage;
  window.getAppLanguage = function(){ return currentLang; };

  applyTranslations(document);

  var langSelect = document.getElementById('langSelect');
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', function(){
      setAppLanguage(langSelect.value);
    });
  }
})();
