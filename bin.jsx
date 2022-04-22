/*

---------------------------- info ----------------------------

  title:   bin

  notes:   a multi purpose tool to for development
           1. binary converter;
           2. shape layer definition;
           3. expression string formatter;

  copy this file to 'ScriptUI Panels' folder

  author:  Jean-Marc Billard
  version: 2.0
  date:    xx-xx-2022

--------------------------------------------------------------

*/

//  linter settings:
//  jshint -W061
//  jscs:disable maximumLineLength


function bin(thisObj) {

  var exportIcon = "\u0089PNG\r\n\x1A\n\x00\x00\x00\rIHDR\x00\x00\x002\x00\x00\x00-\b\x06\x00\x00\x00\u00EC\u00BF8\u00FF\x00\x00\x00\tpHYs\x00\x00\x0B\x12\x00\x00\x0B\x12\x01\u00D2\u00DD~\u00FC\x00\x00\x01]IDATh\u0081\u00ED\u0099\u008Bm\u00C30\fD\u008FE\x07\u00C8&\u00F5\b\x19\u00A1+t\u0083\u008E\u0092\x11<BF\u00C8\b\u00CE&\u00EE\x04,\b0(\u00AB\x18V\u00F4\u0081M\x18|\u0080\x109\u008Ad\u009E(\u00C6\u00A2L\u00CC\u008C#\u00F0v\b\x15!\u00C4!!\u00C4\x1B!\u00C4BD\\P&\":uS\u00A0\u00EC\u00E1\u0091\x0F\x00\u00B7\u00DEb\u00BA<\x10\u00C5\x1B\u00F2\u00C9\u00CC\u00F4\u00CA\u00EF\u0094;\u008033\u00CF\u00CD\x06\u00D4xDf\u0092\u0088F\u00BB\u0094\u00AC\u00A1\u00DA\u0096\u009B\u00ED\u009F\u00EE\u009E\x11\u008F\u0094\x14\x00\u00A3t\u00CB\u0094qiL\u00D3g\x000k}\x02p*\u00B5\u00E3i\u00EC\n!\x0Fc\u009E\u008C\u00B5\"\u00D7\u00FAj\u00BD\u00AB\u0098\u00E2\x18\u00C9\u00C5\u00C3Z{\x12#)wf\x1E\u008A\u008C\u00B1c;\x12\u0092\u00FD\u00B3X\u00E3\u00BD\u00B6c\u00CE\u00A8\x12Ck\u00C6J\u0089'\u00BB\u00CC\u00AE\u009D\u00E1\u00F4zk\u00C2#\u00DE\b!\u00DE\b!\u00DE\b!\u00DE\u00A8\x16BD\u009F\u00AF|\u00B7\x19\x15\u00DB\u00F8\u008Bn\u00BDg\u00BB\u00F5\u0096\u00BA\u00D9\u0096_jR\u0083M\u00F3\x11\u00BD\u00F1\u00A47\u00BF-$XSm\u008E\u00B3\u0087\x10\u009B\x14\u00A5e\u00D8CHU\u008C0\u00B3x\u00E4{\u00A1\u00E9K\u00DB\u00FC\u00C7H2\u0093W\u00E3\u008D+\u00FFO\u0085\u008BK\u008B-M\u00C7Az\x02\u00F2\u00F0\u0080,\u00A9\u00B9%IjI\x03\u009A\u00CF\u00B5\u0088h\u00C0\u00DFr\u00DB\u008Dxc\u00E5\u008D\x10\u00E2\u008D\x10\u00E2\u008D\x10\u00E2\u008D\x10\u00E2\u008Dc\b\x01\u00F0\x0B\u00B2\x0EK\u00B6\u00BAg\x1BJ\x00\x00\x00\x00IEND\u00AEB`\u0082";

  var importIcon = '\u0089PNG\r\n\x1A\n\x00\x00\x00\rIHDR\x00\x00\x002\x00\x00\x00-\b\x06\x00\x00\x00\u00EC\u00BF8\u00FF\x00\x00\x00\tpHYs\x00\x00\x0B\x12\x00\x00\x0B\x12\x01\u00D2\u00DD~\u00FC\x00\x00\x00\u0094IDATh\u0081\u00ED\u00D9\u00B1\x0E\u00830\f\x00\u00D1\u00B8\u00EA\u00FF\u00FF\u00B2;u\u00A9T\x05\u009B\u00D2\u009C\u00C2\u00BD\u0095\x01\x0E\u00A3\x10Dd\u00E6\u00D8\u00C1c\u008B\nC\u0080\f\u00A11\u0084\u00C6\x10\x1ACh\u009E\u0095\u00EB\u0089\u0088\u00D2\u00C6,3\u00E3_\u00BD\u00A5\u0090\u00AAj\u00F8\u00A7\u00CA\u008Dh\u0085\u00CCNp6\u00A0\u00E3\u00D2\u0089|\x0B~\u0087\u00CE\u008EW,}\u00B4~9\u00B9{\u00AEZG\u009D]\u00AD:\u0093\u00F2\u0085Hc\b\u008D!4\u0086\u00D0\x18Bc\bMk\u00D3\u00B8\u00E2\u00C3if\u009B\u0089\u00F8\u00A3\u0087\u00C6\x10\x1ACh\f\u00A11\u0084\u00C6\x10\u00941\u00C6\x0B?\u00C3!g\u00EC\x18\u00C1\u00FC\x00\x00\x00\x00IEND\u00AEB`\u0082';

  var spacer = '\u0089PNG\r\n\x1A\n\x00\x00\x00\rIHDR\x00\x00\x00\x0E\x00\x00\x00-\b\x06\x00\x00\x00\u009EpZI\x00\x00\x00\tpHYs\x00\x00\x0B\x12\x00\x00\x0B\x12\x01\u00D2\u00DD~\u00FC\x00\x00\x003IDATH\u0089\u00ED\u00D6\u00B1\r\x000\f\x02A\u00F0\u00FE;\x13y\x05\u00E4.\u008FDy\r\x15N\u00A2&S)`\tmg\u00CB\u00AA@ \x10\b\u00BC\u0082|\u0080\u009F\u00A1\u00A4\x07\u0081u\bW\u00C1$\u0089E\x00\x00\x00\x00IEND\u00AEB`\u0082';

  function convertFile(inFile) {

    inFile.open('r');
    inFile.encoding = 'binary';

    var bin = inFile.read();
    var binStr = bin.toSource().toString();

    binStr = binStr.substring(12, binStr.length - 2);
    inFile.close();

    return binStr;
  }

  function exportFile(outFile, strCode) {

    outFile.open('w');
    outFile.write(strCode);
    outFile.close();
  }

  function trim(str) {

    return str.replace(/^\s+|\s+$/gm, '');
  }

  function replaceSpcChar(str) {

    str = str.replace(/À|Á|Â|Ã|Ä/g, 'A');
    str = str.replace(/à|á|â|ã|ä/g, 'a');
    str = str.replace(/È|É|Ê|Ë/g, 'E');
    str = str.replace(/è|é|ê|ë/g, 'e');
    str = str.replace(/Ì|Í|Î|Ï/g, 'I');
    str = str.replace(/ì|í|î|ï/g, 'i');
    str = str.replace(/Ò|Ó|Ô|Õ|Ö/g, 'O');
    str = str.replace(/ò|ó|ô|õ|ö/g, 'o');
    str = str.replace(/Ù|Ú|Û|Ü/g, 'U');
    str = str.replace(/ù|ú|û|ü/g, 'u');
    str = str.replace(/Ç/g, 'C');
    str = str.replace(/ç/g, 'c');
    str = str.replace(/[^\w\s]/ig, ''); // replaces any non-word character except space...
    str = str.replace(/[\s]{1,}|-/g, '_'); // replaces 1 or more spaces...

    return trim(str);
  }

  function expCode(exp) {

    var tab = (exp.match(/^\t+/) != null) ? exp.match(/^\t+/) : '';
    exp = exp.replace(/\\/g, '\\\\');
    exp = exp.replace(/\'|\"/g, '\\\'');
    exp = exp.split(/\r\n/);
    exp = tab.toString() + 'exp += \'' + exp.join('\\n\';\n' + tab.toString() + 'exp += \'') + '\';\n';

    return exp;
  }

  function shapeCode(shpLayer) {

    var root = shpLayer.property('ADBE Root Vectors Group');

    var shpStr = '';
    shpStr += 'function ' + shpLayer.name.toCamelCase() + '() {\n\n';
    shpStr += '\tvar shp;\n';
    shpStr += '\tvar exp;\n';
    shpStr += '\tvar shpLayer = app.project.activeItem.layers.addShape();\n';
    shpStr += "\tvar root = shpLayer.property('ADBE Root Vectors Group');\n";

    function getShapeProperties(prop) {
  
      for (var i = 1; i <= prop.numProperties; i++) {
        var currentProp = prop.property(i);
        var parentProp = currentProp.parentProperty;
        var D = prop.property(i).propertyDepth - 1;
        var var2 = parentProp == root ? 'root' : parentProp.name.toCamelCase() + '_' + (D - 1);
        var varN = parentProp.name;
  
        if (currentProp.numProperties > 0) {
          var var1 = currentProp.name.toCamelCase() + '_' + D;
  
          if (parentProp.elided || parentProp == root) {
            shpStr += '\tvar ' + var1 + ' = ' + var2 + '.addProperty(\'' + currentProp.matchName + '\');\n';
  
            if (!currentProp.enabled) {
              shpStr += var1 + '.enabled = false;\n';
            }
          } else {
            if (currentProp.matchName == 'ADBE Vector Group') {
              shpStr += '\tvar ' + var1 + ' = ' + var2 + '.addProperty(\'' + currentProp.matchName + '\');\n\n';
            } else {
              shpStr += '\tvar ' + var1 + ' = ' + var2 + '.property(\'' + currentProp.matchName + '\');\n';
            }
            if (i == parentProp.numProperties) {
              shpStr += '\t' + var1 + '.parentProperty.name = \'' + varN + '\';\n';
            }
          }
          getShapeProperties(currentProp);
        
        } else {
          
          if (currentProp.matchName == 'ADBE Vector Shape') {
            var vert = currentProp.value.vertices;
            var inTang = currentProp.value.inTangents;
            var outTang = currentProp.value.outTangents;
  
            shpStr += '\n\tshp = new Shape();\n';
            shpStr += '\tshp.vertices = [';
            
            for (var v = 0; v < vert.length; v++) {
              shpStr += '[' + vert[v].toString() + '],';
            }
            shpStr = shpStr.substring(0, shpStr.length - 1) + '];\n';
            shpStr += '\tshp.inTangents = [';
  
            for (var iT = 0; iT < inTang.length; iT++) {
              shpStr += '[' + inTang[iT].toString() + '],';
            }
            shpStr = shpStr.substring(0, shpStr.length - 1) + '];\n';
            shpStr += '\tshp.outTangents = [';
  
            for (var oT = 0; oT < outTang.length; oT++) {
              shpStr += '[' + outTang[oT].toString() + '],';
            }
            shpStr = shpStr.substring(0, shpStr.length - 1) + '];\n\n';
            shpStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setValue(shp);\n';
          
          } else {
            
            if (currentProp.isModified) {
              var val = currentProp.value;
              var exp = currentProp.expression;
              val = val.length > 0 ? '[' + val.toString() + ']' : val.toString();
              shpStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setValue(' + val + ');\n';
  
              if (exp != '') {
                shpStr += '\n\texp = \'\';\n' + expCode('\t' + exp);
                shpStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').expression = exp;\n\n';
              }
            }
          }
          if (i == parentProp.numProperties) {

            try {
              parentProp.name = parentProp.name;
              shpStr += '\t' + var2 + '.name = \'' + varN + '\';\n';

            } catch (error) {}
          }
        }
      }
    }
    getShapeProperties(root);
    
    shpStr += '\tshpLayer.name = \'' + shpLayer.name + '\';\n\n';
    shpStr += '\treturn shpLayer;\n';
    shpStr += '}\n\n';
    shpStr += shpLayer.name.toCamelCase() + '();';
  
    return shpStr;
  }

  function bin_ui() {

    var coolBlue = [0.23, 0.74, 1];
    var offWhite = [0.95, 0.95, 0.95];
    var fileArray = [];
    var codeArray = [];
    var nameTxt;
    var codeTxt;

    var w = (thisObj instanceof Panel) ? thisObj : new Window('palette');
    w.alignChildren = 'fill';

    // botões e spacers
    var stcTxt = w.add('statictext', [0, 0, 600, 15], '');
    var edtText = w.add('edittext', [0, 0, 600, 600], '', {multiline: true});
    var prgBar = w.add('progressbar', [0, 0, 600, 5], 0, 100);
    var btnGrp = w.add('group');
    btnGrp.alignment = 'center';
    var pickBtn = btnGrp.add('iconbutton', undefined, importIcon, {style: 'toolbutton'});
    pickBtn.helpTip = 'pick files | selected layer';

    btnGrp.add('image', undefined, spacer);
    
    var exportBtn = btnGrp.add('iconbutton', undefined, exportIcon, {style: 'toolbutton'});
    exportBtn.helpTip = 'export data';
    
    var evalBtn = btnGrp.add('iconbutton', undefined, exportIcon, {style: 'toolbutton'});
    evalBtn.helpTip = 'run data';

    // exportBtn.enabled = false;
    var radGrp = btnGrp.add('group');
    // radGrp.enabled = false;
    var expRad01 = radGrp.add('radiobutton', undefined, 'binary');
    expRad01.helpTip = 'binary converter';
    var expRad02 = radGrp.add('radiobutton', undefined, 'shape');
    expRad02.helpTip = 'shape layer definition';
    var expRad03 = radGrp.add('radiobutton', undefined, 'exp. string');
    expRad03.helpTip = 'format property expression string';

    var pType = stcTxt.graphics.PenType.SOLID_COLOR;
    var bType = w.graphics.BrushType.SOLID_COLOR;

    stcTxt.graphics.foregroundColor = stcTxt.graphics.newPen(pType, coolBlue, 1);
    w.graphics.backgroundColor = w.graphics.newBrush(bType, offWhite);

    // eventos
    w.onShow = function() {

      edtText.size.width = w.size.width - 20;
      edtText.size.height = w.size.height - 120;
      prgBar.size.width = w.size.width - 20;
      btnGrp.layout.layout(true);
      w.layout.layout(true);
      w.layout.resize();
    };

    w.onResizing = w.onResize = function() {

      edtText.size.width = w.size.width - 20;
      edtText.size.height = w.size.height - 120;
      prgBar.size.width = w.size.width - 20;
      btnGrp.layout.layout(true);
      w.layout.layout(true);
      w.layout.resize();
    };

    pickBtn.onClick = function() {

      var aItem = app.project.activeItem;
      var aLayer = aItem.selectedLayers[0];

      nameTxt = '';
      codeTxt = '';

      switch (true) {
    
        case expRad01.value:
          fileArray = File.openDialog('open...', undefined, true);
          prgBar.value = 0;
    
          if (fileArray != null) {
    
            for (i = 0; i < fileArray.length; i++) {
              var fileObj = fileArray[i];
              var fileName = fileObj.name;
    
              nameTxt += fileName + ' | ';
              fileName = File.decode(fileName.substring(0, fileName.length - 4));
              fileName = replaceSpcChar(fileName);
              codeTxt += '\nvar ' + fileName + ' = ' + convertFile(fileObj) + ';\n';
    
              codeArray.push(convertFile(fileObj));
              prgBar.value = (i + 1) / fileArray.length * 100;
            }
            nameTxt = File.decode(nameTxt.substring(0, nameTxt.length - 2));
            stcTxt.helpTip = nameTxt;
    
            if (nameTxt.length > 120) {
              nameTxt = nameTxt.substring(0, 120) + '...';
            }
            stcTxt.text = nameTxt;
            edtText.text = codeTxt;
            prgBar.value = 100;
          
          } else {
            exportBtn.enabled = false;
            radGrp.enabled = false;
            expRad01.value = false;
            expRad02.value = false;
          }
          break;

        case expRad02.value:
          stcTxt.text = aLayer.name;
          edtText.text = shapeCode(aLayer);
          break;

        case expRad03.value:
          var aProp = aLayer.selectedProperties[0];
          var exp = (aProp.expression == undefined) ? '' : aProp.expression;

          if (exp != '') {
            exp = '\tvar exp = \'\';\n' + expCode(exp);
            edtText.text = exp;
          }
          break;
      }
    };

    var exp = 'var ll = \'ll\';\n';
    exp += 'var rr = \'rr\';\n';
    exp += '\n';
    exp += '// partiu...\n';
    exp += 'transform.position;';

    exportBtn.onClick = function() {
      var fileExpObj;
      prgBar.value = 0;

      if (edtText.text != '') {
        var fileTypesArray = ['Text:*.txt', "Script:*.jsx"];
        fileExpObj = File.saveDialog('export...', fileTypesArray);

        if (fileExpObj != null) {
          exportFile(fileExpObj, edtText.text);
        }
      }
      prgBar.value = 100;
    };

    evalBtn.onClick = function() {
    
      if (edtText.text != '') {
        eval(edtText.text);
      }
    };

    return w;
  }  

  binWindow = bin_ui(thisObj);

  if (binWindow.toString() != '[object Panel]') {
    binWindow.show();
  }
}

bin(this);

/*

---------------------------------------------------------------
> prototype functions
---------------------------------------------------------------

*/

String.prototype.toCamelCase = function () {
  return this.toLowerCase()
    .replace(/\s(.)/g, function ($1) {return $1.toUpperCase();})
    .replace(/\s/g, '')
    .replace(/^(.)/, function ($1) {return $1.toLowerCase();});
};
