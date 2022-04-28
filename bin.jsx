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

  /* cSpell:disable */
  var evalIcon = "\u0089PNG\r\n\x1A\n\x00\x00\x00\rIHDR\x00\x00\x00\x1F\x00\x00\x00\x1F\b\x06\x00\x00\x00\x1F\u00AE\x169\x00\x00\x00\tpHYs\x00\x00\x0B\x12\x00\x00\x0B\x12\x01\u00D2\u00DD~\u00FC\x00\x00\x00\u00CEIDATH\u0089\u00ED\u0096\r\r\u00C3 \x10\u0085\u00DF\u009B\x02$TB% a\x12&a\x12*\u00A1\x12*a\x12*a\x12&\u00A1\x0EXH !\f\u00D6\u00B5\u0094\u0092,w\u00C9K\u00E8\x0F\u00F9\u00EE\u00B8;r4\u00C6\u00A0\u0095]\u009A\u0091\x05.p\u00817\u0085\u0093T$\x1FN}5\u00BA\u00BD\u00E1b\x01x\u00DAO\u0081F\x00*\u00F5o\u0089rp\x0F^\u00A2\u00F5\u00FDL\u00B8\x020D\u00A7\u00F0\x02\u00A0\u00AB\u00C3\u0083\u00E7\x0E\u00C0\x1C91\u0097\u00A6\u00E2\'x\u00F0^\u00BB\u00C8\u00BD\x03\u00B7\x12\u00F8\u00D6V\u00EB\\*\u00AAV{|\u00EC:\u00D5\x01\u00B5\x0B\u00CEF:%r\u00DD\u009F\u00DDj6\u00D7\u00D7#\u00A0k\u00F0)r`8\x12\u00EA\u0095\u009D\u00E1H\u008Eni\u00C1\u00CBZ\u00ED\u0090\u00FC:\f\x1Ac\u00F8\u00B1\'\x07\u00DFjM\u00E1{L\u0086\t\u0081\x0B\u00FC\u00CF\u00E1\x00\u00DE\u00B7X\u00C9\u0096>o\u00F1g\x00\x00\x00\x00IEND\u00AEB`\u0082";

  var exportIcon = "\u0089PNG\r\n\x1A\n\x00\x00\x00\rIHDR\x00\x00\x00\x1F\x00\x00\x00\x1F\b\x06\x00\x00\x00\x1F\u00AE\x169\x00\x00\x00\tpHYs\x00\x00\x0B\x12\x00\x00\x0B\x12\x01\u00D2\u00DD~\u00FC\x00\x00\x00kIDATH\u0089\u00ED\u0096Q\n\u00C0 \fC\u009B\u00E1\u00FD\u00AF\u009C}m\u008C:\u00EB\x14f\x07\u00CB\u00FB,\u00C2\u00C3X\u0082 iYlif\u00C9%\u0097|\x15\u00A5\u00E5\x01p\u00B6\x0FI\u00F8\u0099\u00E7\u00EE\u00CC1\u00FB\u00E4\u00CDS\u00EB\u00B5\x19\u00FB\u0095\u00A7O\u00D0\u008B\u00D9\u00A3\u00D8+F\u00B6v\x16\u00C5\x1E\x12mvT<\u00D6y2\u00C5^1\u00DB\u00ED#\u00FC7v\u00FDd$\u0097\u00FC}\u00CCl\x07H+:1\u0093\u00A1\x15`\x00\x00\x00\x00IEND\u00AEB`\u0082";
  
  var pickIcon = '\u0089PNG\r\n\x1A\n\x00\x00\x00\rIHDR\x00\x00\x00\x1F\x00\x00\x00\x1F\b\x06\x00\x00\x00\x1F\u00AE\x169\x00\x00\x00\tpHYs\x00\x00\x0B\x12\x00\x00\x0B\x12\x01\u00D2\u00DD~\u00FC\x00\x00\x01\bIDATH\u0089\u00EDV\u00D1\r\u0083 \x14\u00BC\u00EB\x04\u008E\u00E2(t\x03Fq\x04Ga\x04\u00BB\u0081#8\u0082\x1B\u00BC\u00C6\u00F6\x11\u0089UA\x1BK?x\u00C9\u008B\x06\u00CEwp\u00DEC)\"\u00C8\x15\u00B7l\u00CC\u0085\u00BC\u0090\u00C7\u0082\u00A4%\u00E9H\x0E$Es\u00D01{\u0098}j\u00B5X\x02\u00A8\x01\u00F4\x13<\u0092\x13\u00A6N\u00A9\u00F9\u00AA\u009B@l\x03\u00C2\x11@\x13\x12\u00E8\u00C2\x1A\u009D\u00F38\u00FB5\u00B9\x16\u00F6\x05\x1D\u0080j\x07[)\u00C6\u00E3\u00A3\n\u00C4\u00C8\u00BD\u00D4.Y\u00CAy\x01\u00FDi\u00F2@\u00EEqo\u00C7\x1B\n\u008C)\u00F2\u00EF\u00B9\u00DD\u00E8\u00B5\x15\u00911\u009C iHv\u009A&\u009CSl\u00BB\u00A8q\u00CC\u00ED\x00\u0086\u00B5w\u00A7\x05\u0097\u00AE7\x1B^\x19\u00CE\u00CA.\u00EF\u00B5}\u008Cw\u0098\u00DB\u00CA{\u00A2K}>U\u00F6\u00EB#\u00A7\u00EC{;\u00EF\u00D7L#\"S+\u00DD\x01<4\u00EF:\x16\u0086Y\u00D48l\u00B8\u00CB[\u00ED?\x0F\x19\u00C9}\u00BCJ\u00CE\x0F\u00CB\u0082\u00E0\u00F7\u009F\u00D4\x15\x15\\\u00D0\u0086\u00A2\u00F7.u\u00B7a\u0096\u00FF\u00F6B^\u00C8\u00AF\x0F\x00O\u00E8m\u00FB\u00CE\u0083\u00A1W|\x00\x00\x00\x00IEND\u00AEB`\u0082';
  
  var spacer = '\u0089PNG\r\n\x1A\n\x00\x00\x00\rIHDR\x00\x00\x00\x0E\x00\x00\x00-\b\x06\x00\x00\x00\u009EpZI\x00\x00\x00\tpHYs\x00\x00\x0B\x12\x00\x00\x0B\x12\x01\u00D2\u00DD~\u00FC\x00\x00\x003IDATH\u0089\u00ED\u00D6\u00B1\r\x000\f\x02A\u00F0\u00FE;\x13y\x05\u00E4.\u008FDy\r\x15N\u00A2&S)`\tmg\u00CB\u00AA@ \x10\b\u00BC\u0082|\u0080\u009F\u00A1\u00A4\x07\u0081u\bW\u00C1$\u0089E\x00\x00\x00\x00IEND\u00AEB`\u0082';
  /* cSpell:enable */

  function convertFile(inFile) {

    inFile.open('r');
    inFile.encoding = 'binary';

    var bin = inFile.read();
    var binStr = bin.toSource().toString();

    binStr = binStr.substring(12, binStr.length - 2);
    inFile.close();

    return binStr.replace(/\'/g, '\\\'').replace(/^\"/, '\'').replace(/[\"]+$/, '\'');
  }

  function exportFile(outFile, strCode) {

    outFile.open('w');
    outFile.write(strCode);
    outFile.close();
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

    return str.trim();
  }

  function expCode(exp) {

    var tab = (exp.match(/^\t+/) != null) ? exp.match(/^\t+/) : '';
    exp = exp.trim().replace(/\\/g, '\\\\');
    exp = exp.replace(/\'|\"/g, '\\\'');
    exp = exp.replace(/\t/g, '\\t');
    exp = exp.split(/\r\n/);
    exp = tab.toString() + 'exp += \'' + exp.join('\\n\';\n' + tab.toString() + 'exp += \'') + '\';\n';

    return exp;
  }

  function layerCode(layer) {

    var layerStr = '';

    function getProperties(prop) {
  
      for (var i = 1; i <= prop.numProperties; i++) {
        var currentProp = prop.property(i);
        var parentProp = currentProp.parentProperty;
        var parentName = parentProp.name.toCamelCase();
        var D = prop.property(i).propertyDepth - 1;
        var var2 = (parentProp.propertyDepth == 1) ? parentName : parentName + '_' + parentProp.parentProperty.name.toCamelCase() + (D - 1);
        var varN = parentProp.name;
  
        if (currentProp.numProperties > 0) {
          var var1 = currentProp.name.toCamelCase() + '_' + parentName + D;
  
          if (parentProp.elided || parentProp == contents || parentProp == effects || parentProp == masks) {

            if (parentProp == effects) {
              layerStr += '\t// ' + currentProp.name.toLowerCase() + ' effect...\n';
            }
            layerStr += '\tvar ' + var1 + ' = ' + var2 + '.addProperty(\'' + currentProp.matchName + '\');\n';
  
            if (!currentProp.enabled) {
              layerStr += var1 + '.enabled = false;\n';
            }
          } else {
            if (currentProp.matchName == 'ADBE Vector Group') {
              layerStr += '\tvar ' + var1 + ' = ' + var2 + '.addProperty(\'' + currentProp.matchName + '\');\n\n';

            } else {
              layerStr += '\tvar ' + var1 + ' = ' + var2 + '.property(\'' + currentProp.matchName + '\');\n';
            }
            if (i == parentProp.numProperties) {
              
              try {
                parentProp.name = parentProp.name;
                layerStr += '\t' + var1 + '.parentProperty.name = \'' + varN + '\';\n';
              } catch (error) {}
            }
          }
          getProperties(currentProp);
        
        } else {
          
          if (currentProp.matchName == 'ADBE Vector Shape' || currentProp.matchName == 'ADBE Mask Shape' ) {
            var vert = currentProp.value.vertices;
            var inTang = currentProp.value.inTangents;
            var outTang = currentProp.value.outTangents;

            /* cSpell:disable */
            layerStr += '\n\tshp = new Shape();\n';
            layerStr += '\tshp.vertices = [';
            
            for (var v = 0; v < vert.length; v++) {
              layerStr += '[' + vert[v].toString() + '],';
            }
            layerStr = layerStr.substring(0, layerStr.length - 1) + '];\n';
            layerStr += '\tshp.inTangents = [';
  
            for (var iT = 0; iT < inTang.length; iT++) {
              layerStr += '[' + inTang[iT].toString() + '],';
            }
            layerStr = layerStr.substring(0, layerStr.length - 1) + '];\n';
            layerStr += '\tshp.outTangents = [';
  
            for (var oT = 0; oT < outTang.length; oT++) {
              layerStr += '[' + outTang[oT].toString() + '],';
            }
            layerStr = layerStr.substring(0, layerStr.length - 1) + '];\n\n';
            layerStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setValue(shp);\n';
            /* cSpell:enable */
          } else {
            
            if (currentProp.isModified) {
              var val = currentProp.value;
              var exp = currentProp.expression;

              try {
                currentProp.setValue(val);

                if (val.length > 0) {
                  val = '[' + val.toString() + ']';
                  
                } else {
                  
                  if (typeof val == 'object') {
                    val = 'textDocVal';

                  } else {
                    val = val.toString();
                  }
                }
                if (parentProp.matchName == ('ADBE Text Animator Properties')) {
                  layerStr += '\t' + var2 + '.addProperty(\'' + currentProp.matchName + '\');\n';
                }
                layerStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setValue(' + val + ');\n';

                if (exp != '') {
                  layerStr += '\n\t// ' + parentProp.name.toLowerCase() + ' ' + currentProp.name.toLowerCase() + ' expression...';
                  layerStr += '\n\texp = \'\';\n' + expCode('\t' + exp);
                  layerStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').expression = exp;\n\n';
                }
              } catch (error) {}              

              if (currentProp.numKeys > 0) {
                layerStr += '\n\t// ' + parentProp.name.toLowerCase() + ' ' + currentProp.name.toLowerCase() + ' animation...\n';
                
                for (var k = 1; k <= currentProp.numKeys; k++) {

                  val = currentProp.keyValue(k);
                  var t = currentProp.keyTime(k);
                  var tInTArray = currentProp.keyInTemporalEase(k);
                  var tOutTArray = currentProp.keyOutTemporalEase(k);
                  var kInIType = currentProp.keyInInterpolationType(k);
                  var kOutIType = currentProp.keyOutInterpolationType(k);
                  var easeIn = '';
                  var easeOut = '';

                  if (val.length > 0) {
                    val = '[' + val.toString() + ']';
                  
                  } else {
                  
                    if (typeof val == 'object') {
                      val = 'text';

                    } else {
                      val = val.toString();
                    }
                  }
                  layerStr += '\t// key ' + k + '...\n';
                  
                  for (var d = 0; d < tOutTArray.length; d++) {
                    layerStr += '\teaseIn' + (d + 1) + ' = new KeyframeEase(' + tInTArray[d].speed + ', ' + tInTArray[d].influence + ');\n';
                    layerStr += '\teaseOut' + (d + 1) + ' = new KeyframeEase(' + tOutTArray[d].speed + ', ' + tOutTArray[d].influence + ');\n';

                    if (d > 0) {
                      easeIn += ', easeIn' + (d + 1);
                      easeOut += ', easeOut' + (d + 1);

                    } else {
                      easeIn += 'easeIn' + (d + 1);
                      easeOut += 'easeOut' + (d + 1);
                    }
                  }
                  layerStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setValueAtTime(' + t + ', ' + val + ');\n';
                  layerStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setTemporalEaseAtKey(' + k + ', [' + easeIn + '], [' + easeOut + ']);\n';
                  layerStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setInterpolationTypeAtKey(' + k + ', ' + kInIType + ', ' + kOutIType + ');\n';
                  
                  if (currentProp.isSpatial) {
                    var kInSArray = currentProp.keyInSpatialTangent(k).toString();
                    var kOutSArray = currentProp.keyOutSpatialTangent(k).toString();
                    var ct = currentProp.keySpatialContinuous(k).toString();
                  
                    layerStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setSpatialTangentsAtKey(' + k + ', [' + kInSArray + '], [' + kOutSArray + ']);\n';
                    layerStr += '\t' + var2 + '.property(\'' + currentProp.matchName + '\').setSpatialContinuousAtKey(' + k + ', ' + ct + ');\n';
                  }
                }
                layerStr += '\n';
              }
            }
          }
          if (i == parentProp.numProperties) {

            try {
              parentProp.name = parentProp.name;
              layerStr += '\t' + var2 + '.name = \'' + varN + '\';\n';
            } catch (error) {}
          }
        }
      }
      return layerStr;
    }
    var transform = layer.property('ADBE Transform Group');
    var effects = layer.property('ADBE Effect Parade');
    var masks = layer.property('ADBE Mask Parade');
    var marker = layer.property('ADBE Marker');
    
    layerStr += 'function ' + replaceSpcChar(layer.name.toCamelCase().replace(/\W/g, '')) + '() {\n\n';
    layerStr += '\t// expressions variable...\n';
    layerStr += '\tvar exp;\n';
    layerStr += '\n\t// keyframe ease objects variable...\n';
    layerStr += '\tvar easeIn1;\n';
    layerStr += '\tvar easeIn2;\n';
    layerStr += '\tvar easeIn3;\n';
    layerStr += '\tvar easeOut1;\n';
    layerStr += '\tvar easeOut2;\n';
    layerStr += '\tvar easeOut3;\n';
    
    switch (true) {
      
      case layer instanceof ShapeLayer:
        var contents = layer.property('ADBE Root Vectors Group');        
        layerStr += '\n\t// shape object variable...\n';
        layerStr += '\tvar shp;\n';
        layerStr += '\n\t// shape layer creation...\n';
        layerStr += '\tvar layer = app.project.activeItem.layers.addShape();\n';

        if (contents.numProperties > 0) {
          layerStr += '\n\t// vector content...\n';
          layerStr += '\tvar contents = layer.property(\'ADBE Root Vectors Group\');\n';
          getProperties(contents);
        }
        break;
        
      case layer instanceof TextLayer:
        var text = layer.property('ADBE Text Properties');        
        var textDoc = text.property('ADBE Text Document').value;
        layerStr += '\n\t// text layer creation...\n';
        layerStr += '\tvar layer = app.project.activeItem.layers.addText();\n';
        layerStr += '\n\t// text document...\n';
        layerStr += '\tvar text = layer.property(\'ADBE Text Properties\');\n';
        layerStr += '\tvar textDoc = text.property(\'ADBE Text Document\');\n';
        layerStr += '\tvar textDocVal = textDoc.value;\n';
        layerStr += '\ttextDocVal.text = \'' + textDoc.text + '\';\n';
        layerStr += '\ttextDocVal.font = \'' + textDoc.font + '\';\n';
        layerStr += '\ttextDocVal.fontSize = ' + textDoc.fontSize + ';\n';
        layerStr += '\ttextDocVal.applyStroke = ' + textDoc.applyStroke.toString() + ';\n';
        layerStr += '\ttextDocVal.applyFill = ' + textDoc.applyFill.toString() + ';\n';
        
        if (textDoc.applyFill) {
          layerStr += '\ttextDocVal.fillColor = [' + textDoc.fillColor.toString() + '];\n';
        }
        if (textDoc.applyStroke) {
          layerStr += '\ttextDocVal.strokeColor = [' + textDoc.strokeColor.toString() + '];\n';
        }
        layerStr += '\ttextDocVal.strokeWidth = ' + textDoc.strokeWidth + ';\n';
        layerStr += '\ttextDocVal.strokeOverFill = ' + textDoc.strokeOverFill.toString() + ';\n';
        layerStr += '\ttextDocVal.tracking = ' + textDoc.tracking + ';\n';
        layerStr += '\ttextDocVal.leading = ' + textDoc.leading + ';\n';
        layerStr += '\ttextDocVal.justification = ' + textDoc.justification + ';\n';
        
        // read-only properties...
        //layerStr += '\ttextDocVal.allCaps = ' + textDoc.allCaps.toString() + ';\n';
        //layerStr += '\ttextDocVal.smallCaps = ' + textDoc.smallCaps.toString() + ';\n';
        //layerStr += '\ttextDocVal.subscript = ' + textDoc.subscript.toString() + ';\n';
        //layerStr += '\ttextDocVal.superscript = ' + textDoc.superscript.toString() + ';\n';
        //layerStr += '\ttextDocVal.fauxBold = ' + textDoc.fauxBold.toString() + ';\n';
        //layerStr += '\ttextDocVal.fauxItalic = ' + textDoc.fauxItalic.toString() + ';\n';

        layerStr += '\n\t// text content...\n';
        getProperties(text);
        break;
    }

    layerStr += '\n\t// transformations...\n';
    layerStr += '\tvar transform = layer.property(\'ADBE Transform Group\');\n';
    var t1 = layerStr;
    var t2 = getProperties(transform);
    if (t1 == t2) {
      layerStr = layerStr.substring(0, layerStr.length - 81);
    }
  
    if (masks.numProperties > 0) {
      layerStr += '\n\t// masks...\n';
      layerStr += '\tvar masks = layer.property(\'ADBE Mask Parade\');\n';
      getProperties(masks);
    }
    
    if (effects.numProperties > 0) {
      layerStr += '\n\t// fx...\n';
      layerStr += '\tvar effects = layer.property(\'ADBE Effect Parade\');\n';
      getProperties(effects);
    }
    var i = 1;
    
    while (i > 0) {
      
      try {
        var t = marker.keyTime(i);
        var comment = marker.keyValue(i).comment;
        var l = marker.keyValue(i).label;
        var dur = marker.keyValue(i).duration;
        layerStr += '\n\t// layer marker ' + i + '...\n';
        layerStr += '\tvar t' + i + ' = ' + t + ';\n';
        layerStr += '\tvar marker' + i + ' = new MarkerValue(\'' + comment + '\');\n';
        layerStr += '\tmarker' + i + '.label = ' + l + ';\n';
        layerStr += '\tmarker' + i + '.duration = ' + dur + ';\n';
        layerStr += '\tlayer.property(\'ADBE Marker\').setValueAtTime(t' + i + ', marker' + i + ');\n\n';
        i += 1;          
      
      } catch (error) {
        break;
      }
    }      
    layerStr += '\n\t// layer attributes...\n';
    layerStr += '\tlayer.autoOrient = ' + layer.autoOrient + ';\n';
    layerStr += '\tlayer.inPoint = ' + layer.inPoint + ';\n';
    layerStr += '\tlayer.outPoint = ' + layer.outPoint + ';\n';
    layerStr += '\tlayer.comment = \'' + layer.comment + '\';\n';
    layerStr += '\tlayer.name = \'' + layer.name + '\';\n';
    layerStr += '\tlayer.label = ' + layer.label + ';\n';
    layerStr += '\tlayer.locked = ' + layer.locked + ';\n';
    
    layerStr += '\n\treturn layer;\n';
    layerStr += '}\n\n';
    layerStr += replaceSpcChar(layer.name.toCamelCase().replace(/\W/g, '')) + '();';
  
    return layerStr;
  }

  function bin_ui() {

    var coolBlue = [0.23, 0.74, 1];
    var offWhite = [0.95, 0.95, 0.95];
    var fileArray = [];
    var codeArray = [];
    var nameTxt;
    var codeTxt;
    var aItem;
    var aLayer;
    var hasData = false;

    var w = (thisObj instanceof Panel) ? thisObj : new Window('palette');
    w.alignChildren = 'fill';

    // botões e spacers
    var stcTxt = w.add('statictext', [0, 0, 600, 15], '');
    var edtText = w.add('edittext', [0, 0, 600, 600], '', {multiline: true});
    var prgBar = w.add('progressbar', [0, 0, 600, 5], 0, 100);
    var btnGrp = w.add('group');
    btnGrp.alignment = 'center';
    var pickBtn = btnGrp.add('iconbutton', undefined, pickIcon, {style: 'toolbutton'});
    pickBtn.helpTip = 'pick files | selected layer';

    btnGrp.add('image', undefined, spacer);
    
    var exportBtn = btnGrp.add('iconbutton', undefined, exportIcon, {style: 'toolbutton'});
    exportBtn.helpTip = 'export data';
    
    var evalBtn = btnGrp.add('iconbutton', undefined, evalIcon, {style: 'toolbutton'});
    evalBtn.helpTip = 'run data';

    var radGrp = btnGrp.add('group');
    var expRad01 = radGrp.add('radiobutton', undefined, 'binary');
    expRad01.helpTip = 'binary converter';
    var expRad02 = radGrp.add('radiobutton', undefined, 'layer def.');
    expRad02.helpTip = 'get selected layer definition';
    var expRad03 = radGrp.add('radiobutton', undefined, 'exp. string');
    expRad03.helpTip = 'format selected property expression string';

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
      radGrp.children[0].value = true;
      radGrp.children[0].active = true;
      evalBtn.enabled = false;
      exportBtn.enabled = false;
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

    edtText.onChanging = function() {

      hasData = (edtText.text.trim() != '');
      exportBtn.enabled = hasData;
      evalBtn.enabled = hasData && expRad02.value;
    };

    pickBtn.onClick = function() {

      nameTxt = '';
      codeTxt = '';
      
      switch (true) {
        
        case expRad01.value:
          prgBar.value = 0;
          fileArray = File.openDialog('open...', undefined, true);
    
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
            stcTxt.text = 'file: ' + nameTxt;
            edtText.text = codeTxt;
            prgBar.value = 100;
          }
          break;

        case expRad02.value:
          aItem = app.project.activeItem;
          aLayer = aItem.selectedLayers[0];
    
          stcTxt.text = 'layer: ' + aLayer.name;
          edtText.text = layerCode(aLayer);
          break;
          
        case expRad03.value:
          var aProp = aLayer.selectedProperties[0];
          var exp = (aProp.expression == undefined) ? '' : aProp.expression;
          
          if (exp != '') {
            exp = '\tvar exp = \'\';\n' + expCode(exp);
            edtText.text = exp;
          }
          stcTxt.text = 'prop: ' + aProp.name;
          break;
      }
      hasData = (edtText.text.trim() != '');
      exportBtn.enabled = hasData;
      evalBtn.enabled = hasData && expRad02.value;
    };

    exportBtn.onClick = function() {
      var fileExpObj;
      prgBar.value = 0;

      if (edtText.text != '') {
        var fileTypesArray = ['Script:*.jsx','Text:*.txt'];
        fileExpObj = File.saveDialog('export...', fileTypesArray);

        if (fileExpObj != null) {
          exportFile(fileExpObj, edtText.text);
        }
      }
      prgBar.value = 100;
    };

    evalBtn.onClick = function() {

      if (expRad02.value) {

        if (edtText.text != '') {
          eval(edtText.text);
        }          
      }
    
    };

    expRad01.onClick = expRad02.onClick = expRad03.onClick = function() {
      
      evalBtn.enabled = expRad02.value && hasData;
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

String.prototype.trim = function () {
  return this.replace(/^[\s|\t]+|[\s|\t]+$/, '');
};