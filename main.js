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
 *
 * Contributions:
 * Leandro Silva | Grafluxe, 2016
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true,  regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, _hideSettings, _confirmFile, setCustomTheme */

define(function (require, exports, module) {
    "use strict";

    // Brackets modules
    var AppInit             = brackets.getModule("utils/AppInit"),
        NativeApp           = brackets.getModule("utils/NativeApp"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        MainViewManager     = brackets.getModule("view/MainViewManager"),
        PopUpManager        = brackets.getModule("widgets/PopUpManager"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        WorkspaceManager    = brackets.getModule("view/WorkspaceManager"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Menus               = brackets.getModule("command/Menus"),
        _                   = brackets.getModule("thirdparty/lodash"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        FileSystem          = brackets.getModule("filesystem/FileSystem");

    // Templates
    var panelHTML       = require("text!templates/panel.html"),
        previewHTML     = require("text!templates/preview.html"),
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
        currentEditor,
        panel,
        viewMenu,
        toggleCmd,
        visible = false,
        realVisibility = false,
        docLoading = false;

    // Prefs
    var _prefs = PreferencesManager.getExtensionPrefs("markdown-preview");
    _prefs.definePreference("useGFM", "boolean", false);
    _prefs.definePreference("theme", "string", "clean");
    _prefs.definePreference("syncScroll", "boolean", true);
    _prefs.definePreference("customTheme", "string", "");

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

    function _calcScrollPos() {
        var scrollInfo = currentEditor._codeMirror.getScrollInfo(),
            scrollPercentage = scrollInfo.top / (scrollInfo.height - scrollInfo.clientHeight),
            scrollTop;

        if ($iframe[0].contentDocument.body) {
            scrollTop = ($iframe[0].contentDocument.body.scrollHeight - $iframe[0].clientHeight) * scrollPercentage;
        }

        return Math.round(scrollTop);
    }

    function _editorScroll() {
        if (_prefs.get("syncScroll") && $iframe) {
            var scrollTop = _calcScrollPos();

            $iframe[0].contentDocument.body.scrollTop = scrollTop;
        }
    }

    function _loadDoc(doc, isReload) {
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

            if (isReload) {
                scrollPos = $iframe.contents()[0].body.scrollTop;
            } else if (_prefs.get("syncScroll")) {
                scrollPos = _calcScrollPos();
            }

            // Parse markdown into HTML
            bodyText = marked(docText);

            // Show URL in link tooltip
            bodyText = bodyText.replace(/(href=\"([^\"]*)\")/g, "$1 title=\"$2\"");

            // Convert protocol-relative URLS
            bodyText = bodyText.replace(/src="\/\//g, "src=\"http://");

            if (isReload) {
                $iframe[0].contentDocument.body.innerHTML = bodyText;
            } else {
                // Make <base> tag for relative URLS
                var baseUrl = window.location.protocol + "//" + FileUtils.getDirectoryPath(doc.file.fullPath),
                    themeURI;

                if (docLoading) {
                    return;
                }

                docLoading = true;

                if (_prefs.get("theme") === "custom") {
                    themeURI = require.toUrl(_prefs.get("customTheme"));

                    _confirmFile(themeURI);
                } else {
                    themeURI = require.toUrl("./themes/" + _prefs.get("theme") + ".css");
                }

                // Assemble the HTML source
                var htmlSource = _.template(previewHTML)({
                    baseUrl    : baseUrl,
                    themeUrl   : themeURI,
                    scrollTop  : scrollPos,
                    bodyText   : bodyText
                });
                $iframe.attr("srcdoc", htmlSource);

                // Remove any existing load handlers
                $iframe.off("load");
                $iframe.load(function () {
                    // Open external browser when links are clicked
                    // (similar to what brackets.js does - but attached to the iframe's document)
                    $iframe[0].contentDocument.body.addEventListener("click", _handleLinkClick, true);

                    // Sync scroll position (if needed)
                    if (!isReload) {
                        _editorScroll();
                    }

                    // Make sure iframe is showing
                    $iframe.show();
                    docLoading = false;
                });
            }
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

    function _updateSettings() {
        // Format
        var useGFM = _prefs.get("useGFM");
        marked.setOptions({
            breaks: useGFM,
            gfm: useGFM
        });

        // Re-render
        _loadDoc(currentDoc);
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

    function _showSettings() {
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
                if (e.target.value === "custom" && !_prefs.get("customTheme")) {
                    setCustomTheme();
                } else {
                    _prefs.set("theme", e.target.value);
                    _updateSettings();
                }
            });

        var $syncScroll = $settings.find("#markdown-preview-sync-scroll");

        $syncScroll.change(function (e) {
            _prefs.set("syncScroll", e.target.checked);
            _editorScroll();
        });

        if (_prefs.get("syncScroll")) {
            $syncScroll.attr("checked", true);
        }

        PopUpManager.addPopUp($settings, _hideSettings, true);
        $(window.document).on("mousedown", _documentClicked);
    }

    function _setPanelVisibility(isVisible) {
        if (isVisible === realVisibility) {
            return;
        }

        realVisibility = isVisible;
        if (isVisible) {
            if (!panel) {
                $panel = $(panelHTML);
                $iframe = $panel.find("#panel-markdown-preview-frame");

                panel = WorkspaceManager.createBottomPanel("markdown-preview-panel", $panel);
                $panel.on("panelResizeUpdate", function (e, newSize) {
                    $iframe.attr("height", newSize);
                });
                $iframe.attr("height", $panel.height());

                window.setTimeout(_resizeIframe);

                $settingsToggle = $("#markdown-settings-toggle")
                    .click(function (e) {
                        if ($settings) {
                            _hideSettings();
                        } else {
                            _showSettings(e);
                        }
                    });

                $iframe.hide();
            }
            _loadDoc(DocumentManager.getCurrentDocument());
            $icon.toggleClass("active");
            panel.show();
        } else {
            $icon.toggleClass("active");
            panel.hide();
            $iframe.hide();
        }
    }

    function _currentDocChangedHandler() {
        var doc = DocumentManager.getCurrentDocument(),
            ext = doc ? FileUtils.getFileExtension(doc.file.fullPath).toLowerCase() : "";

        if (currentDoc) {
            currentDoc.off("change", _documentChange);
            currentDoc = null;
        }

        if (currentEditor) {
            currentEditor.off("scroll", _editorScroll);
            currentEditor = null;
        }

        if (doc && /md|markdown|litcoffee|txt/.test(ext)) {
            currentDoc = doc;
            currentDoc.on("change", _documentChange);
            currentEditor = EditorManager.getCurrentFullEditor();
            currentEditor.on("scroll", _editorScroll);
            $icon.css({display: "block"});
            _setPanelVisibility(visible);
            toggleCmd.setEnabled(true);
            _loadDoc(doc);
        } else {
            $icon.css({display: "none"});
            toggleCmd.setEnabled(false);
            _setPanelVisibility(false);
        }
    }

    function _toggleVisibility() {
        visible = !visible;
        _setPanelVisibility(visible);

        toggleCmd.setChecked(visible);
    }

    // Support custom theme
    function _onSelectCSS(err, fi) {
        if (err) {
            console.error(err);
            Dialogs.showModalDialog(
                "",
                "Markdown Preview",
                "There was an error with your selection."
            );
            return;
        }

        if (fi.length === 1) {
            _prefs.set("theme", "custom");
            _prefs.set("customTheme", fi[0]);
            _updateSettings();
        } else {
            _showSettings();
        }
    }

    function _onSelectModule(id) {
        if (id === "cancel") {
            _showSettings();
            return;
        }

        FileSystem.showOpenDialog(
            false,
            false,
            "Select a CSS file",
            brackets.app.getUserDocumentsDirectory(),
            ["css"],
            _onSelectCSS
        );
    }

    function setCustomTheme() {
        _hideSettings();

        Dialogs.showModalDialog(
            "",
            "Markdown Preview",
            "Select a CSS file to style your theme with.",
            [
                {
                    id: "select",
                    text: "Select A File"
                },
                {
                    id: "cancel",
                    text: "Cancel"
                }
            ]
        ).done(_onSelectModule);
    }

    function _resetCustomTheme() {
        _prefs.set("customTheme", "");
        _prefs.set("theme", "clean");

        docLoading = false;
        window.requestAnimationFrame(_updateSettings);
    }

    function _confirmFile(fi) {
        var resetMsg = "<br><br>Please reset your custom theme path by reselecting \"custom\" from the theme dropdown.";

        _hideSettings();

        if (fi.slice(-4) !== ".css") {
            Dialogs.showModalDialog(
                "",
                "Markdown Preview",
                "Your file must be of type CSS. " + resetMsg
            );

            _resetCustomTheme();

            return;
        }

        FileSystem.resolve(fi, function (err) {
            if (err) {
                console.error(err);

                Dialogs.showModalDialog(
                    "",
                    "Markdown Preview",
                    "There was an error loading your file. " + resetMsg
                );

                _resetCustomTheme();
            }
        });
    }

    // Debounce event callback to avoid excess overhead
    // Update preview 300 ms ofter document change
    // Sync scroll 1ms after document scroll (just enough to ensure
    // the document scroll isn't blocked).
    _documentChange = _.debounce(_documentChange, 300);
    _editorScroll = _.debounce(_editorScroll, 1);

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
    MainViewManager.on("currentFileChange", _currentDocChangedHandler);

    viewMenu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
    toggleCmd = CommandManager.register("Markdown Preview", "toggleMarkdownPreview", _toggleVisibility);

    viewMenu.addMenuItem(toggleCmd);

    toggleCmd.setChecked(realVisibility);
    toggleCmd.setEnabled(realVisibility);

    // currentDocumentChange is *not* called for the initial document. Use
    // appReady() to set initial state.
    AppInit.appReady(function () {
        _currentDocChangedHandler();
    });

    // Listen for resize events
    WorkspaceManager.on("workspaceUpdateLayout", _resizeIframe);
    $("#sidebar").on("panelCollapsed panelExpanded panelResizeUpdate", _resizeIframe);
});
