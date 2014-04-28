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
/*global define, brackets, $, window, PathUtils, marked, _hideSettings */

define(function (require, exports, module) {
    "use strict";

    // Brackets modules
    var AppInit             = brackets.getModule("utils/AppInit"),
        NativeApp           = brackets.getModule("utils/NativeApp"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        PanelManager        = brackets.getModule("view/PanelManager"),
        PopUpManager        = brackets.getModule("widgets/PopUpManager"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Resizer             = brackets.getModule("utils/Resizer"),
        StringUtils         = brackets.getModule("utils/StringUtils");

    // Templates
    var panelHTML       = require("text!templates/panel.html"),
        settingsHTML    = require("text!templates/settings.html");
    
    // Local modules
    var marked          = require("lib/marked");
    
    // jQuery objects
    var $icon,
        $iframe,
        $panel,
        $settingsToggle,
        $settings;
    
    // Other vars
    var currentDoc,
        panel,
        previewWindow,
        visible = false,
        realVisibility = false;

    // Prefs
    var _prefs = PreferencesManager.getExtensionPrefs("markdown-preview");
    _prefs.definePreference("useGFM", "boolean", false);
    _prefs.definePreference("theme", "string", "clean");
    _prefs.definePreference("display", "string", "window");
    _prefs.definePreference("window.left", "number", 40);
    _prefs.definePreference("window.top", "number", 40);
    _prefs.definePreference("window.width", "number", 600);
    _prefs.definePreference("window.height", "number", 480);

    // Convert any old-style prefs
    PreferencesManager.convertPreferences(module, {
        "useGFM": "user markdown-preview.useGFM",
        "theme": "user markdown-preview.theme"
    });
    
    // (based on code in brackets.js)
    function _handleLinkClick(e) {
        // Check parents too, in case link has inline formatting tags
        var node = e.target, url;
        while (node) {
            if (node.tagName === "A") {
                url = node.getAttribute("href");
                if (url && !url.match(/^#/)) {
                    NativeApp.openURLInDefaultBrowser(url);
                }
                e.preventDefault();
                break;
            }
            node = node.parentElement;
        }
        
        // Close settings dropdown, if open
        _hideSettings();
    }
    
    function _loadDoc(doc, preserveScrollPos) {
        if (doc && visible && $iframe) {
            var docText     = doc.getText(),
                scrollPos   = 0,
                bodyText    = "",
                yamlRegEx   = /^-{3}([\w\W]+?)(-{3})/,
                yamlMatch   = yamlRegEx.exec(docText);

            // If there's yaml front matter, remove it.
            if (yamlMatch) {
                docText = docText.substr(yamlMatch[0].length);
            }
            
            if (preserveScrollPos) {
                scrollPos = $iframe.contents()[0].body.scrollTop;
            }
            
            // Parse markdown into HTML
            bodyText = marked(docText);
            
            // Show URL in link tooltip
            bodyText = bodyText.replace(/(href=\"([^\"]*)\")/g, "$1 title=\"$2\"");
            
            // Make <base> tag for relative URLS
            var baseUrl = window.location.protocol + "//" + FileUtils.getDirectoryPath(doc.file.fullPath);
                
            // Assemble the HTML source
            var htmlSource = "<html><head>";
            var theme = _prefs.get("theme");
            htmlSource += "<base href='" + baseUrl + "'>";
            htmlSource += "<link href='" + require.toUrl("./themes/" + theme + ".css") + "' rel='stylesheet'></link>";
            htmlSource += "</head><body onload='document.body.scrollTop=" + scrollPos + "'>";
            htmlSource += bodyText;
            htmlSource += "</body></html>";
            $iframe.attr("srcdoc", htmlSource);
            
            // Open external browser when links are clicked
            // (similar to what brackets.js does - but attached to the iframe's document)
            $iframe.load(function () {
                $iframe[0].contentDocument.body.addEventListener("click", _handleLinkClick, true);
            });
        }
    }
    
    var _timer;
    
    function _documentChange(e) {
        // "debounce" the page updates to avoid thrashing/flickering
        // Note: this should use Async.whenIdle() once brackets/pull/5528
        // is merged.
        if (_timer) {
            window.clearTimeout(_timer);
        }
        _timer = window.setTimeout(function () {
            _timer = null;
            _loadDoc(e.target, true);
        }, 300);
    }
    
    function _resizeIframePanel() {
        if (visible && panel && $iframe) {
            var iframeWidth = panel.$panel.innerWidth();
            $iframe.attr("width", iframeWidth + "px");
        }
    }
    
    function _resizeIframeWindow() {
        if (visible && previewWindow && $iframe) {
            $iframe.attr("width", previewWindow.innerWidth);
            $iframe.attr("height", previewWindow.innerHeight);
        }
    }
    
    function _updateSettings() {
        // TODO - Display
        
        // Format
        var useGFM = _prefs.get("useGFM");
        marked.setOptions({
            breaks: useGFM,
            gfm: useGFM
        });
        
        // Save preferences
        // TODO
        
        // Re-render
        _loadDoc(currentDoc, true);
    }
    
    function _documentClicked(e) {
        if (!$settings.is(e.target) &&
                !$settingsToggle.is(e.target) &&
                $settings.has(e.target).length === 0) {
            _hideSettings();
        }
    }
    
    function _hideSettings() {
        if ($settings) {
            $settings.remove();
            $settings = null;
            $(window.document).off("mousedown", _documentClicked);
        }
    }
    
    function _showSettings(e) {
        _hideSettings();
        
        $settings = $(settingsHTML)
            .css({
                right: 12,
                top: $settingsToggle.position().top + $settingsToggle.outerHeight() + 12
            })
            .appendTo($panel);
        
        $settings.find("#markdown-preview-format")
            .prop("selectedIndex", _prefs.get("useGFM") ? 1 : 0)
            .change(function (e) {
                _prefs.set("useGFM", e.target.selectedIndex === 1);
                _updateSettings();
            });
        
        $settings.find("#markdown-preview-theme")
            .val(_prefs.get("theme"))
            .change(function (e) {
                _prefs.set("theme", e.target.value);
                _updateSettings();
            });
        
        PopUpManager.addPopUp($settings, _hideSettings, true);
        $(window.document).on("mousedown", _documentClicked);
    }
    
    function _setPanelVisibility(isVisible) {
        if (isVisible === realVisibility) {
            return;
        }
        
        realVisibility = isVisible;
        
        if (_prefs.get("display") === "window") {
            if (isVisible) {
                previewWindow = window.open(ExtensionUtils.getModuleUrl(module, "templates/window.html"));
                previewWindow.moveTo(
                    _prefs.get("window.left"),
                    _prefs.get("window.top")
                );
                previewWindow.resizeTo(
                    _prefs.get("window.width"),
                    _prefs.get("window.height")
                );
                previewWindow.onload = function () {
                    $iframe = $(previewWindow.document).find("#panel-markdown-preview-frame");
                    _resizeIframeWindow();
                    _loadDoc(DocumentManager.getCurrentDocument());
                };
                previewWindow.onresize = function () {
                    _resizeIframeWindow();
                };
                previewWindow.onunload = function () {
                    //console.log("window unloaded", previewWindow.screenX, previewWindow.screenY, previewWindow.outerWidth, previewWindow.outerHeight);
                    _prefs.set("window.left", previewWindow.screenX);
                    _prefs.set("window.top", previewWindow.screenY);
                    _prefs.set("window.width", previewWindow.outerWidth);
                    _prefs.set("window.height", previewWindow.outerHeight);
                };
                $icon.toggleClass("active");
            } else {
                previewWindow.close();
                $icon.toggleClass("active");
            }
        } else {
            if (isVisible) {
                if (!panel) {
                    $panel = $(panelHTML);
                    $iframe = $panel.find("#panel-markdown-preview-frame");

                    panel = PanelManager.createBottomPanel("markdown-preview-panel", $panel);
                    $panel.on("panelResizeUpdate", function (e, newSize) {
                        $iframe.attr("height", newSize);
                    });
                    $iframe.attr("height", $panel.height());

                    window.setTimeout(_resizeIframePanel);

                    $settingsToggle = $("#markdown-settings-toggle")
                        .click(function (e) {
                            if ($settings) {
                                _hideSettings();
                            } else {
                                _showSettings(e);
                            }
                        });
                }
                _loadDoc(DocumentManager.getCurrentDocument());
                $icon.toggleClass("active");
                panel.show();
            } else {
                $icon.toggleClass("active");
                panel.hide();
            }
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
    
    // Insert CSS for this extension
    ExtensionUtils.loadStyleSheet(module, "styles/MarkdownPreview.css");
    
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
    $(PanelManager).on("editorAreaResize", _resizeIframePanel);
    $("#sidebar").on("panelCollapsed panelExpanded panelResizeUpdate", _resizeIframePanel);
});
