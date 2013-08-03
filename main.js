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

    // Brackets modules
    var AppInit             = brackets.getModule("utils/AppInit"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        Menus               = brackets.getModule("command/Menus"),
        NativeFileSystem    = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        PanelManager        = brackets.getModule("view/PanelManager"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        Resizer             = brackets.getModule("utils/Resizer"),
        StringUtils         = brackets.getModule("utils/StringUtils");
    
    // Local modules
    var panelHTML   = require("text!panel.html");
    var marked      = require("marked");
    
    // jQuery objects
    var $icon,
        $iframe;
    
    // Menu objects
    var projectMenu     = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU),
        workingsetMenu  = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_MENU);
    
    // Menu info
    var BUILD_HTML      = "Export markdown to HTML";
    var CMD_BUILD_HTML  = "markdown-preview.exportHtml";
    
    // Other vars
    var currentDoc,
        panel,
        visible = false,
        realVisibility = false;
    
    function _convetsionToHTML(docText, option) {
        var defaultOption   = { scrollTop: null, cssEmbedded: true, removeLink: false};
        option = $.extend(defaultOption, option);
        
        if (docText) {
            var resultText    = "",
                yamlRegEx   = /^-{3}([\w\W]+?)(-{3})/,
                yamlMatch   = yamlRegEx.exec(docText);

            // If there's yaml front matter, remove it.
            if (yamlMatch) {
                docText = docText.substr(yamlMatch[0].length);
            }
            
            // Parse markdown into HTML
            resultText = marked(docText);
            
            // Remove link hrefs
            if (!!option.removeLink) {
                resultText = resultText.replace(/href=\"([^\"]*)\"/g, "title=\"$1\"");
            }
            
            var htmlSource = "<html><head>";
            htmlSource += !!option.cssEmbedded ?
                    "<style>" + require("text!markdown.css").replace(/\n/g, "") + "</style>" :
                    "<link href='" + require.toUrl("./markdown.css") + "' rel='stylesheet'></link>";
            htmlSource += "</head>";
            htmlSource += typeof option.scrollTop === "number" ?
                    "<body onload='document.body.scrollTop=" + option.scrollTop + "'>" :
                    "<body>";
            htmlSource += resultText;
            htmlSource += "</body></html>";
            
            return htmlSource;
        }
    }
    
    function _loadDoc(doc, preserveScrollPos) {
        if (doc && visible && $iframe) {
            var docText     = doc.getText(),
                scrollPos   = 0,
                htmlSource    = "";
            
            if (preserveScrollPos) {
                scrollPos = $iframe.contents()[0].body.scrollTop;
            }
            
            // Parse markdown into HTML
            htmlSource = _convetsionToHTML(docText, { scrollTop: scrollPos, cssEmbedded: false, removeLink: true});
            
            // Remove link hrefs
            $iframe.attr("srcdoc", htmlSource);
        }
    }
    
    function _buildHTML() {
        var entry = ProjectManager.getSelectedItem();
        
        if (entry !== null && entry !== undefined) {
            var dir     = FileUtils.getDirectoryPath(entry.fullPath),
                ext     = FileUtils.getFilenameExtension(entry.fullPath),
                fileName = entry.name;
            fileName = fileName.substr(0, fileName.lastIndexOf(ext)) + ".html";
            
            // conversion markdown to html
            FileUtils.readAsText(entry)
                .then(function (text) {
                    var file = new NativeFileSystem.FileEntry(dir + fileName);
                    
                    // save file
                    return FileUtils.writeText(file, _convetsionToHTML(text));
                })
                .then(function () { alert("Conversion success."); }, function () { alert("Conversion failed"); });
        }
    }
    
    function _documentChange(e) {
        _loadDoc(e.target, true);
    }
    
    function _resizeIframe() {
        if (visible && $iframe) {
            var iframeWidth = panel.$panel.innerWidth();
            $iframe.attr("width", iframeWidth + "px");
        }
    }
    
    function _setPanelVisibility(isVisible) {
        if (isVisible === realVisibility) {
            return;
        }
        
        realVisibility = isVisible;
        if (isVisible) {
            if (!panel) {
                var $panel = $(panelHTML);
                $iframe = $panel.find("#panel-markdown-preview-frame");
                
                panel = PanelManager.createBottomPanel("markdown-preview-panel", $panel);
                $panel.on("panelResizeUpdate", function (e, newSize) {
                    $iframe.attr("height", newSize);
                });
                $iframe.attr("height", $panel.height());

                window.setTimeout(_resizeIframe);
            }
            _loadDoc(DocumentManager.getCurrentDocument());
            $icon.toggleClass("active");
            panel.show();
        } else {
            $icon.toggleClass("active");
            panel.hide();
        }
    }

    function _currentDocChangedHandler() {
        var doc = DocumentManager.getCurrentDocument(),
            ext = doc ? PathUtils.filenameExtension(doc.file.fullPath).toLowerCase() : "";
        
        if (currentDoc) {
            $(currentDoc).off("change", _documentChange);
            currentDoc = null;
        }
        
        if (doc && /md|markdown|txt/.test(ext)) {
            currentDoc = doc;
            $(currentDoc).on("change", _documentChange);
            $icon.css({display: "block"});
            _setPanelVisibility(visible);
            _loadDoc(doc);
        } else {
            $icon.css({display: "none"});
            _setPanelVisibility(false);
        }
    }
    
    function _toggleVisibility() {
        visible = !visible;
        _setPanelVisibility(visible);
    }
    
    function _projectContextMenuOpenHandler(menu) {
        var entry   = ProjectManager.getSelectedItem(),
            ext     = PathUtils.filenameExtension(entry.fullPath).toLowerCase();
        
        menu.removeMenuItem(CMD_BUILD_HTML);
        
        if (entry && /md|markdown|txt/.test(ext)) {
            menu.addMenuItem(CMD_BUILD_HTML, "", Menus.LAST);
        }
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
        .appendTo($("#main-toolbar .buttons"));
    
    // Add a document change handler
    $(DocumentManager).on("currentDocumentChange", _currentDocChangedHandler);
    
    // currentDocumentChange is *not* called for the initial document. Use
    // appReady() to set initial state.
    AppInit.appReady(function () {
        _currentDocChangedHandler();
    });
    
    // Listen for resize events
    $(PanelManager).on("editorAreaResize", _resizeIframe);
    $("#sidebar").on("panelCollapsed panelExpanded panelResizeUpdate", _resizeIframe);
    
    // Add project and workingset context menu open handler
    $(projectMenu).on("beforeContextMenuOpen", function () { _projectContextMenuOpenHandler(this); });
    $(workingsetMenu).on("beforeContextMenuOpen", function () { _projectContextMenuOpenHandler(this); });
    
    // Add menu command 
    CommandManager.register(BUILD_HTML, CMD_BUILD_HTML, _buildHTML);
});
