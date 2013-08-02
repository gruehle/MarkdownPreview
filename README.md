## Markdown Preview

A [Brackets](https://github.com/adobe/brackets) extension that provides a live preview of markdown documents. 

### Installation

* Select **File > Extension Manager...** (or click the "brick" icon in the toolbar)
* Click **Install from URL...**
* Enter the url of this repo: 
 * For Brackets Sprint 27 (or earlier): https://github.com/gruehle/MarkdownPreview/archive/sprint-27.zip
 * For Brackets Sprint 28 (or later): https://github.com/gruehle/MarkdownPreview
* Click **Install**

### How To Use
When a markdown document (with extension ".md" or ".markdown") is open, a markdown icon is shown in the 
toolbar at the top of the Brackets window. Click this icon to open the preview panel. The panel can be 
resized vertically.

The preview is updated as you edit the document. You can hover over links to see the href in a tooltip.

__Export to HTML__

Open the context menu of the document from the file list at the left side of the Brackets window.
Click on it in the menu because there is "Export markdown to HTML".
HTML is generated in the same folder as the Markdown, with the same name.

### Credits
This extension uses the following open source components:

* [Marked](https://github.com/chjj/marked) - A markdown parser written in JavaScript
* [markdown-css-themes](https://github.com/jasonm23/markdown-css-themes) - This extension uses the "Swiss" theme
* [markdown-mark](https://github.com/dcurtis/markdown-mark) - The icon used in the toolbar
