/*
 * Copyright (c) 2012 Glenn Ruehle
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true,  regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window, PathUtils, marked */

define(function (require, exports, module) {
    "use strict";
    
    require("marked");

    // Brackets modules
    var AppInit             = brackets.getModule("utils/AppInit"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        NativeFileSystem    = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        Resizer             = brackets.getModule("utils/Resizer"),
        StringUtils         = brackets.getModule("utils/StringUtils");

    // Local modules
    var panelHTML   = require("text!panel.html");
    
    // jQuery objects
    var $icon,
        $iframe,
        $panel;
    
    // Other vars
    var currentDoc,
        currentEditor,
        visible = false,
        realVisibility = false,
        refreshing = false;
    
    function _loadDoc(doc, editor, preserveScrollPos) {
        if (doc && visible && $iframe) {
            var docText = doc.getText();
            if (editor) {
                var cursor = editor.getCursorPos(),
                    lines = docText.split("\n"),
                    cursorLine = lines[cursor.line];
                lines[cursor.line] =
                    cursorLine.slice(0, cursor.ch) + "<span id='X-MARKDOWN-CURSOR'></span>" + cursorLine.slice(cursor.ch);
                docText = lines.join("\n");
            }
            var bodyText = marked.parse(docText),
                scrollPos = 0;
            
            if (preserveScrollPos) {
                scrollPos = $iframe.contents()[0].body.scrollTop;
            }
                        
            // Remove link hrefs
            bodyText = bodyText.replace(/href=\"([^\"]*)\"/g, "title=\"$1\"");
            var htmlSource = "<html><head>";
            htmlSource += "<link href='" + require.toUrl("./markdown.css") + "' rel='stylesheet'></link>";
            htmlSource += "</head><body onload='document.body.scrollTop=" + scrollPos + "; document.getElementById(\"X-MARKDOWN-CURSOR\").scrollIntoView();'>";
            htmlSource += bodyText;
            htmlSource += "</body></html>";
            $iframe.attr("srcdoc", htmlSource);
        }
        refreshing = false;
    }
    
    function _invalidatePreview() {
        if (!refreshing) {
            refreshing = true;
            window.setTimeout(function () {
                _loadDoc(currentDoc, currentEditor, true);
            }, 100);
        }
    }
    
    function _resizeIframe() {
        if (visible && $iframe) {
            var iframeWidth = $panel.innerWidth();
            $iframe.attr("width", iframeWidth + "px");
        }
    }
    
    function _setPanelVisibility(isVisible) {
        if (isVisible === realVisibility) {
            return;
        }
        
        realVisibility = isVisible;
        if (isVisible) {
            if (!$panel) {
                $panel = $(panelHTML);
                $iframe = $panel.find("#panel-markdown-preview-frame");
                
                $panel.insertBefore("#status-bar");

                Resizer.makeResizable($panel.get(0), "vert", "top", 100, false);
                $panel.on("panelResizeUpdate", function (e, newSize) {
                    $iframe.attr("height", newSize);
                });
                $iframe.attr("height", $panel.height());
                window.setTimeout(_resizeIframe);
            }
            _loadDoc(DocumentManager.getCurrentDocument(), EditorManager.getCurrentFullEditor());
            $icon.toggleClass("active");
            $panel.show();
        } else {
            $icon.toggleClass("active");
            $panel.hide();
        }
        EditorManager.resizeEditor();
    }

    function _currentDocChangedHandler() {
        var doc = DocumentManager.getCurrentDocument(),
            ext = doc ? PathUtils.filenameExtension(doc.file.fullPath).toLowerCase() : "";
        
        if (currentDoc) {
            $(currentDoc).off("change", _invalidatePreview);
            $(currentEditor).off("cursorActivity", _invalidatePreview);
            currentDoc = null;
            currentEditor = null;
        }
        
        if (doc && /md|markdown/.test(ext)) {
            currentDoc = doc;
            currentEditor = EditorManager.getCurrentFullEditor();
            $(currentDoc).on("change", _invalidatePreview);
            $(currentEditor).on("cursorActivity", _invalidatePreview);
            $icon.css({display: "inline-block"});
            _setPanelVisibility(visible);
            _loadDoc(doc, currentEditor);
        } else {
            $icon.css({display: "none"});
            _setPanelVisibility(false);
        }
    }
    
    function _toggleVisibility() {
        visible = !visible;
        _setPanelVisibility(visible);
    }
    
    // Insert CSS for this extension
    ExtensionUtils.loadStyleSheet(module, "MarkdownPreview.css");
    
    // Add toolbar icon 
    $icon = $("<a>")
        .attr({
            id: "markdown-preview-icon",
            href: "#"
        })
        .css({
            display: "none"
        })
        .click(_toggleVisibility)
        .insertAfter($("#toolbar-go-live"));
    
    // Add a document change handler
    $(DocumentManager).on("currentDocumentChange", _currentDocChangedHandler);
    
    // currentDocumentChange is *not* called for the initial document. Use
    // appReady() to set initial state.
    AppInit.appReady(function () {
        _currentDocChangedHandler();
    });
    
    $(window).on("resize", _resizeIframe);

});
