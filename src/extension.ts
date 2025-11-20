import * as vscode from 'vscode';
import { InkVisualizerPanel } from './inkVisualizer';
import { PreviewManager } from './preview/PreviewManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('Ink Command Style extension is now active');

    // 注册定义提供器
    const definitionProvider = vscode.languages.registerDefinitionProvider(
        { scheme: 'file', language: 'ink' },
        new InkDefinitionProvider()
    );

    // 注册文档符号提供器（用于大纲）
    const documentSymbolProvider = vscode.languages.registerDocumentSymbolProvider(
        { scheme: 'file', language: 'ink' },
        new InkDocumentSymbolProvider()
    );

    // 注册可视化调试命令
    const visualizeCommand = vscode.commands.registerCommand(
        'ink-command-style.visualize',
        () => {
            InkVisualizerPanel.createOrShow(context.extensionUri);
        }
    );

    // 注册故事预览命令
    const previewCommand = vscode.commands.registerCommand(
        'ink-command-style.preview',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'ink') {
                const manager = PreviewManager.getInstance(context.extensionUri);
                await manager.preview(editor.document);
            } else {
                vscode.window.showErrorMessage('请先打开一个 Ink 文件');
            }
        }
    );

    // 监听文档变化，自动更新可视化面板
    const textEditorChange = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'ink') {
            InkVisualizerPanel.updateContent(editor.document);
        }
    });

    const documentChange = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'ink' && 
            vscode.window.activeTextEditor?.document === event.document) {
            InkVisualizerPanel.updateContent(event.document);
        }
    });

    // 监听文档保存，自动更新预览面板（Live Update）
    const documentSave = vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.languageId === 'ink') {
            const manager = PreviewManager.getInstance(context.extensionUri);
            if (manager && manager.isActive()) {
                const liveUpdateEnabled = manager.isLiveUpdateEnabled();
                if (liveUpdateEnabled) {
                    console.log('[Extension] Live update triggered for:', document.uri.fsPath);
                    await manager.preview(document);
                }
            }
        }
    });

    context.subscriptions.push(definitionProvider, documentSymbolProvider, visualizeCommand, previewCommand, textEditorChange, documentChange, documentSave);
}

export function deactivate() {}

class InkDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        const wordRange = document.getWordRangeAtPosition(position, /[\w_.]+/);
        if (!wordRange) {
            return null;
        }

        const line = document.lineAt(position.line).text;
        const word = document.getText(wordRange);

        // 检测是否是跳转目标 (-> target 或 <- target)
        const divertMatch = line.match(/(->|<-)\s*([\w_.]+)/);
        if (divertMatch && divertMatch[2] === word) {
            const target = word;
            return this.findKnotOrStitch(document, target);
        }

        return null;
    }

    private findKnotOrStitch(
        document: vscode.TextDocument,
        target: string
    ): vscode.Location | null {
        const text = document.getText();
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
                    const position = new vscode.Position(i, line.indexOf(knotName));
                    return new vscode.Location(document.uri, position);
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
                            const position = new vscode.Position(j, stitchLine.indexOf(stitchName));
                            return new vscode.Location(document.uri, position);
                        }
                    }
                }
            }

            // 如果没有指定 knot，只查找 stitch（在当前 knot 中）
            if (!stitchName && parts.length === 1) {
                const stitchMatch = line.match(/^[\s]*=\s+([\w_]+)\s*$/);
                if (stitchMatch && stitchMatch[1] === target) {
                    const position = new vscode.Position(i, line.indexOf(target));
                    return new vscode.Location(document.uri, position);
                }
            }
        }

        return null;
    }
}

class InkDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        let currentKnot: vscode.DocumentSymbol | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // 忽略注释和空行
            if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || !trimmedLine) {
                continue;
            }

            // 忽略自定义命令
            if (trimmedLine.startsWith('@')) {
                continue;
            }

            // 匹配 Knot
            const knotMatch = line.match(/^\s*(===?)\s+([\w_]+)\s*(===?)\s*$/);
            if (knotMatch) {
                const knotName = knotMatch[2];
                const nameIndex = line.indexOf(knotName);
                
                // 创建 Knot 符号
                const knotSymbol = new vscode.DocumentSymbol(
                    knotName,
                    '',
                    vscode.SymbolKind.Function,
                    new vscode.Range(i, 0, i, line.length),
                    new vscode.Range(i, nameIndex, i, nameIndex + knotName.length)
                );

                symbols.push(knotSymbol);
                currentKnot = knotSymbol;
                continue;
            }

            // 匹配 Stitch
            const stitchMatch = line.match(/^\s*=\s+([\w_]+)\s*$/);
            if (stitchMatch && currentKnot) {
                const stitchName = stitchMatch[1];
                const nameIndex = line.indexOf(stitchName);
                
                // 创建 Stitch 符号
                const stitchSymbol = new vscode.DocumentSymbol(
                    stitchName,
                    '',
                    vscode.SymbolKind.Method,
                    new vscode.Range(i, 0, i, line.length),
                    new vscode.Range(i, nameIndex, i, nameIndex + stitchName.length)
                );

                // 将 Stitch 添加为 Knot 的子符号
                currentKnot.children.push(stitchSymbol);
                continue;
            }
        }

        return symbols;
    }
}
