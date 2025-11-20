import * as vscode from 'vscode';

export interface InkStructure {
    knots: Knot[];
    choices: Choice[];
}

export interface Knot {
    name: string;
    line: number;
    stitches: Stitch[];
    content: string[];
}

export interface Stitch {
    name: string;
    line: number;
    content: string[];
}

export interface Choice {
    text: string;
    line: number;
    level: number;
    knot: string;
    stitch?: string;
}

// Ink脚本解析器
export class InkParser {
    static parse(document: vscode.TextDocument): InkStructure {
        const text = document.getText();
        const lines = text.split('\n');
        const knots: Knot[] = [];
        const choices: Choice[] = [];
        
        let currentKnot: Knot | null = null;
        let currentStitch: Stitch | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // 忽略注释和空行
            if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || !trimmedLine) {
                continue;
            }

            // 忽略自定义命令（@开头）
            if (trimmedLine.startsWith('@')) {
                continue;
            }

            // 解析 Knot
            const knotMatch = line.match(/^\s*(===?)\s+([\w_]+)\s*(===?)\s*$/);
            if (knotMatch) {
                currentKnot = {
                    name: knotMatch[2],
                    line: i,
                    stitches: [],
                    content: []
                };
                knots.push(currentKnot);
                currentStitch = null;
                continue;
            }

            // 解析 Stitch
            const stitchMatch = line.match(/^\s*=\s+([\w_]+)\s*$/);
            if (stitchMatch && currentKnot) {
                currentStitch = {
                    name: stitchMatch[1],
                    line: i,
                    content: []
                };
                currentKnot.stitches.push(currentStitch);
                continue;
            }

            // 解析选择
            const choiceMatch = line.match(/^\s*(\*+|\++)\s*(.*)$/);
            if (choiceMatch) {
                const choiceText = choiceMatch[2].replace(/\[|\]/g, '').trim();
                const choice: Choice = {
                    text: choiceText,
                    line: i,
                    level: choiceMatch[1].length,
                    knot: currentKnot?.name || '',
                    stitch: currentStitch?.name
                };
                choices.push(choice);
                
                if (currentStitch) {
                    currentStitch.content.push(`选项: ${choiceText}`);
                } else if (currentKnot) {
                    currentKnot.content.push(`选项: ${choiceText}`);
                }
                continue;
            }

            // 普通内容
            if (trimmedLine && currentKnot) {
                if (currentStitch) {
                    currentStitch.content.push(trimmedLine);
                } else {
                    currentKnot.content.push(trimmedLine);
                }
            }
        }

        return { knots, choices };
    }
}

// Ink可视化面板
export class InkVisualizerPanel {
    public static currentPanel: InkVisualizerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private static _currentDocument: vscode.TextDocument | undefined;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // 处理来自webview的消息
        this._panel.webview.onDidReceiveMessage(
            message => {
                console.log('收到WebView消息:', message);
                switch (message.command) {
                    case 'jumpToLine':
                        console.log('执行跳转到行:', message.line);
                        this._jumpToLine(message.line);
                        break;
                    case 'jumpToTarget':
                        console.log('执行跳转到目标:', message.target);
                        this._jumpToTarget(message.target);
                        break;
                }
            },
            null,
            this._disposables
        );
        
        this._update();
    }

    private _jumpToLine(line: number) {
        console.log('_jumpToLine 被调用, 行号:', line);
        console.log('当前文档:', InkVisualizerPanel._currentDocument?.uri.toString());
        
        if (!InkVisualizerPanel._currentDocument) {
            console.error('没有当前文档！');
            return;
        }

        // 在编辑器中打开文档并跳转到指定行
        console.log('尝试打开文档并跳转到行:', line);
        vscode.window.showTextDocument(InkVisualizerPanel._currentDocument.uri, {
            selection: new vscode.Range(
                new vscode.Position(line, 0),
                new vscode.Position(line, 0)
            ),
            viewColumn: vscode.ViewColumn.One
        }).then(
            () => console.log('跳转成功'),
            (error) => console.error('跳转失败:', error)
        );
    }

    private _jumpToTarget(target: string) {
        console.log('_jumpToTarget 被调用, 目标:', target);
        
        if (!InkVisualizerPanel._currentDocument) {
            console.error('没有当前文档！');
            return;
        }

        const text = InkVisualizerPanel._currentDocument.getText();
        const lines = text.split('\n');
        
        // 分割目标为 knot 和 stitch
        const parts = target.split('.');
        const knotName = parts[0];
        const stitchName = parts.length > 1 ? parts[1] : null;

        // 查找 knot
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 匹配 === knot_name === 或 == knot_name ==
            const knotMatch = line.match(/^[\s]*(===?)\s+([\w_]+)\s*(===?)\s*$/);
            if (knotMatch && knotMatch[2] === knotName) {
                if (!stitchName) {
                    // 只找 knot
                    console.log('找到 knot:', knotName, '在行:', i);
                    this._jumpToLine(i);
                    return;
                } else {
                    // 继续在 knot 内查找 stitch
                    for (let j = i + 1; j < lines.length; j++) {
                        const stitchLine = lines[j];
                        
                        // 如果遇到下一个 knot，停止搜索
                        if (/^[\s]*(===?)/.test(stitchLine)) {
                            break;
                        }

                        // 匹配 = stitch_name
                        const stitchMatch = stitchLine.match(/^[\s]*=\s+([\w_]+)\s*$/);
                        if (stitchMatch && stitchMatch[1] === stitchName) {
                            console.log('找到 stitch:', stitchName, '在行:', j);
                            this._jumpToLine(j);
                            return;
                        }
                    }
                }
            }

            // 如果没有指定 knot，只查找 stitch（在当前 knot 中）
            if (!stitchName && parts.length === 1) {
                const stitchMatch = line.match(/^[\s]*=\s+([\w_]+)\s*$/);
                if (stitchMatch && stitchMatch[1] === target) {
                    console.log('找到 stitch:', target, '在行:', i);
                    this._jumpToLine(i);
                    return;
                }
            }
        }

        console.warn('未找到目标:', target);
        vscode.window.showWarningMessage(`未找到跳转目标: ${target}`);
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.ViewColumn.Beside;

        if (InkVisualizerPanel.currentPanel) {
            InkVisualizerPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'inkVisualizer',
            'Ink 脚本可视化',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        InkVisualizerPanel.currentPanel = new InkVisualizerPanel(panel, extensionUri);
        
        // 初始化当前文档
        if (vscode.window.activeTextEditor?.document.languageId === 'ink') {
            InkVisualizerPanel._currentDocument = vscode.window.activeTextEditor.document;
            InkVisualizerPanel.currentPanel._update();
        }
    }

    public static updateContent(document: vscode.TextDocument) {
        InkVisualizerPanel._currentDocument = document;
        if (InkVisualizerPanel.currentPanel) {
            InkVisualizerPanel.currentPanel._update();
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.title = 'Ink 脚本可视化';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        if (!InkVisualizerPanel._currentDocument) {
            return this._getEmptyHtml();
        }

        const structure = InkParser.parse(InkVisualizerPanel._currentDocument);
        return this._getStructureHtml(structure);
    }

    private _getEmptyHtml(): string {
        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ink 脚本可视化</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        .empty {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="empty">
        <h2>请打开一个 .ink 文件</h2>
        <p>打开 Ink 脚本文件后，这里将显示脚本结构和选项调试信息</p>
    </div>
</body>
</html>`;
        return html;
    }

    private _getStructureHtml(structure: InkStructure): string {
        const knotsHtml = structure.knots.map(knot => {
            const stitchesHtml = knot.stitches.map(stitch => {
                const contentHtml = stitch.content.map(c => `<div class="content-line">${this._highlightContent(c)}</div>`).join('');
                return `<div class="stitch">
    <div class="stitch-header clickable" data-line="${stitch.line}">
        <span class="icon">➤</span>
        <span class="name">${this._escapeHtml(stitch.name)}</span>
        <span class="line-number">行 ${stitch.line + 1}</span>
    </div>
    <div class="content">${contentHtml}</div>
</div>`;
            }).join('');

            const knotContentHtml = knot.content.map(c => `<div class="content-line">${this._highlightContent(c)}</div>`).join('');

            return `<div class="knot">
    <div class="knot-header clickable" data-line="${knot.line}">
        <span class="icon">◆</span>
        <span class="name">${this._escapeHtml(knot.name)}</span>
        <span class="line-number">行 ${knot.line + 1}</span>
    </div>
    <div class="knot-content">
        ${knotContentHtml ? `<div class="content">${knotContentHtml}</div>` : ''}
        ${stitchesHtml}
    </div>
</div>`;
        }).join('');

        const choicesHtml = structure.choices.map((choice, index) => {
            return `<div class="choice-item level-${choice.level} clickable" data-line="${choice.line}">
    <span class="choice-number">${index + 1}</span>
    <span class="choice-text">${this._highlightContent(choice.text)}</span>
    <span class="choice-location">${choice.knot}${choice.stitch ? '.' + choice.stitch : ''}</span>
    <span class="line-number">行 ${choice.line + 1}</span>
</div>`;
        }).join('');

        const totalStitches = structure.knots.reduce((sum, k) => sum + k.stitches.length, 0);

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ink 脚本可视化</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        h2 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-textLink-foreground);
            padding-bottom: 8px;
            margin-top: 0;
        }
        .section {
            margin-bottom: 30px;
        }
        .knot {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-left: 4px solid var(--vscode-textLink-foreground);
            margin-bottom: 15px;
            border-radius: 4px;
            overflow: hidden;
        }
        .knot-header {
            background: var(--vscode-editor-selectionBackground);
            padding: 10px 15px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .knot-content {
            padding: 10px 15px;
        }
        .stitch {
            background: var(--vscode-editor-background);
            margin: 10px 0;
            border-left: 3px solid var(--vscode-textLink-activeForeground);
            border-radius: 3px;
            padding: 8px;
        }
        .stitch-header {
            font-weight: bold;
            color: var(--vscode-textLink-activeForeground);
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 5px;
        }
        .content {
            margin-top: 8px;
        }
        .content-line {
            padding: 3px 0;
            color: #cccccc;
            font-size: 0.95em;
        }
        .choice-item {
            background: var(--vscode-list-hoverBackground);
            padding: 10px 15px;
            margin: 5px 0;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-left: 3px solid var(--vscode-charts-blue);
        }
        .choice-item.level-2 {
            margin-left: 20px;
            border-left-color: var(--vscode-charts-green);
        }
        .choice-item.level-3 {
            margin-left: 40px;
            border-left-color: var(--vscode-charts-yellow);
        }
        .choice-number {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.85em;
            font-weight: bold;
        }
        .choice-text {
            flex: 1;
            font-weight: 500;
        }
        .choice-location {
            color: var(--vscode-textLink-foreground);
            font-size: 0.9em;
            font-family: monospace;
        }
        .line-number {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
            margin-left: auto;
        }
        .icon {
            font-size: 1.2em;
        }
        .name {
            color: var(--vscode-symbolIcon-functionForeground);
            font-family: monospace;
        }
        .stats {
            background: var(--vscode-editor-selectionBackground);
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            display: flex;
            gap: 30px;
        }
        .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .stat-label {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .clickable {
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .clickable:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
            transform: translateX(2px);
        }
        .knot-header.clickable:hover,
        .stitch-header.clickable:hover {
            opacity: 0.9;
        }
        /* 语法高亮样式 */
        .hl-divert {
            color: #569cd6;
            font-weight: bold;
        }
        .hl-target {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
        }
        .hl-target:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        .hl-keyword {
            color: #c586c0;
            font-weight: bold;
        }
        .hl-operator {
            color: #d16969;
        }
        .hl-variable {
            color: #9cdcfe;
        }
        .hl-string {
            color: #ce9178;
        }
        .hl-number {
            color: #b5cea8;
        }
        .hl-brace {
            color: #ffd700;
            font-weight: bold;
        }
        .hl-choice {
            color: #c586c0;
            font-weight: bold;
            font-size: 1.1em;
        }
        .hl-gather {
            color: #dcdcaa;
            font-weight: bold;
        }
        .hl-character {
            color: #ce9178;
            font-weight: bold;
        }
        .hl-colon {
            color: #808080;
        }
        .hl-dialogue {
            color: #cccccc;
        }
    </style>
</head>
<body>
    <div class="stats">
        <div class="stat-item">
            <div class="stat-value">${structure.knots.length}</div>
            <div class="stat-label">Knots</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${totalStitches}</div>
            <div class="stat-label">Stitches</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${structure.choices.length}</div>
            <div class="stat-label">选项</div>
        </div>
    </div>

    <div class="section">
        <h2>📜 脚本结构</h2>
        ${knotsHtml || '<p style="color: var(--vscode-descriptionForeground);">暂无 Knot 定义</p>'}
    </div>

    <div class="section">
        <h2>🎯 选项调试</h2>
        ${choicesHtml || '<p style="color: var(--vscode-descriptionForeground);">暂无选项</p>'}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // 直接绑定点击事件（脚本在body末尾，DOM已加载）
        (function() {
            // 绑定可点击元素（Knot/Stitch/选项）
            const clickableElements = document.querySelectorAll('.clickable');
            console.log('找到可点击元素数量:', clickableElements.length);
            
            clickableElements.forEach(element => {
                element.addEventListener('click', function(e) {
                    const line = parseInt(this.getAttribute('data-line'));
                    console.log('点击跳转到行:', line);
                    
                    vscode.postMessage({
                        command: 'jumpToLine',
                        line: line
                    });
                });
            });

            // 绑定跳转目标点击事件（内容中的 -> xxx）
            const targetElements = document.querySelectorAll('.hl-target');
            console.log('找到跳转目标数量:', targetElements.length);
            
            targetElements.forEach(element => {
                element.addEventListener('click', function(e) {
                    e.stopPropagation(); // 阻止事件冒泡
                    const target = this.getAttribute('data-target');
                    console.log('点击跳转目标:', target);
                    
                    vscode.postMessage({
                        command: 'jumpToTarget',
                        target: target
                    });
                });
            });
        })();
    </script>
</body>
</html>`;
        return html;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private _highlightContent(text: string): string {
        let highlighted = this._escapeHtml(text);

        // 高亮对话格式 (角色: 对话内容)
        highlighted = highlighted.replace(
            /^(\s*)([\w\u4e00-\u9fa5]+)(:)\s*(.*)$/,
            '$1<span class="hl-character">$2</span><span class="hl-colon">$3</span> <span class="hl-dialogue">$4</span>'
        );

        // 高亮选择标记 (* 和 +)
        highlighted = highlighted.replace(
            /^(\s*)(\*+|\++)\s*/,
            '$1<span class="hl-choice">$2</span> '
        );

        // 高亮聚合点 (-)
        highlighted = highlighted.replace(
            /^(\s*)(-+)\s+/,
            '$1<span class="hl-gather">$2</span> '
        );

        // 高亮跳转 (-> target 或 <- target)
        highlighted = highlighted.replace(
            /(-&gt;|&lt;-)\s*([\w_.]+)/g,
            '<span class="hl-divert">$1</span> <span class="hl-target" data-target="$2">$2</span>'
        );

        // 高亮 END 和 DONE
        highlighted = highlighted.replace(
            /-&gt;\s*(END|DONE)/g,
            '<span class="hl-divert">-&gt;</span> <span class="hl-keyword">$1</span>'
        );

        // 高亮变量赋值 (~)
        highlighted = highlighted.replace(
            /(~)\s*([\w_]+)/g,
            '<span class="hl-operator">$1</span> <span class="hl-variable">$2</span>'
        );

        // 高亮逻辑表达式 ({...})
        highlighted = highlighted.replace(
            /\{([^}]+)\}/g,
            (match, content) => {
                // 高亮关键字
                let hlContent = content.replace(
                    /\b(if|else|not|and|or|true|false)\b/g,
                    '<span class="hl-keyword">$1</span>'
                );
                // 高亮操作符
                hlContent = hlContent.replace(
                    /(==|!=|&lt;=|&gt;=|&lt;|&gt;)/g,
                    '<span class="hl-operator">$1</span>'
                );
                return '<span class="hl-brace">{</span>' + hlContent + '<span class="hl-brace">}</span>';
            }
        );

        // 高亮字符串
        highlighted = highlighted.replace(
            /&quot;([^&quot;]*)&quot;/g,
            '<span class="hl-string">&quot;$1&quot;</span>'
        );

        // 高亮数字
        highlighted = highlighted.replace(
            /\b(\d+(\.\d+)?)\b/g,
            '<span class="hl-number">$1</span>'
        );

        // 高亮 VAR, CONST, temp
        highlighted = highlighted.replace(
            /\b(VAR|CONST|temp)\b/g,
            '<span class="hl-keyword">$1</span>'
        );

        return highlighted;
    }

    public dispose() {
        InkVisualizerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
